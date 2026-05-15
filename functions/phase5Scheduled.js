/**
 * Phase 5 — Dead Stock Radar + Morning Brief (scheduled).
 * Slack posts use caller-provided token/channel (Secret Manager) — never process.env for Slack credentials.
 * @see docs/PHASE5-FEATURES-HANDOFF.md
 */
const admin = require('firebase-admin')
const { FieldValue, Timestamp } = require('firebase-admin/firestore')
const { formatCurrency } = require('./format')
const { normalizePipelineStage, CRM_LOST_STAGE } = require('./crmPipeline')
const { resolveDjUid, fetchAvailabilityDay } = require('./scheduleAvailability')
const { e164DocIdFromContact } = require('./orderMetrics')

/**
 * @param {string} text
 * @param {{ token: string, channel: string }} slackOpts
 */
async function slackFleetOpsQuiet(text, slackOpts) {
  const token = String(slackOpts?.token || '').trim()
  const channel = String(slackOpts?.channel || '').trim()
  if (!token || !channel) return
  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({ channel, text }),
  })
  const json = await res.json().catch(() => ({}))
  if (!json.ok) console.error('slackFleetOpsQuiet', json.error || res.status)
}

function denverYmd(d = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Denver',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d)
  const y = parts.find((p) => p.type === 'year')?.value
  const m = parts.find((p) => p.type === 'month')?.value
  const day = parts.find((p) => p.type === 'day')?.value
  return `${y}-${m}-${day}`
}

function denverWeekdayShort(d = new Date()) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Denver',
    weekday: 'short',
  }).format(d)
}

/** Credit tracker buying power: limit − balance (matches creditTrackerSlack). */
function availableBuyingPower(data) {
  const limit = Number(data?.cardLimit) || 0
  const bal = Number(data?.currentBalance) || 0
  return limit - bal
}

/**
 * Monday 13:00 UTC ≈ 6:00 AM MT — flag tires with no orders in 90 days (cost > 0).
 * @param {{ token?: string, channel?: string }} [slackOpts]
 */
async function deadStockRadarRun(slackOpts) {
  const db = admin.firestore()
  const cutoff = Timestamp.fromMillis(Date.now() - 90 * 86400000)
  let recentSnap
  try {
    recentSnap = await db.collection('orders').where('createdAt', '>=', cutoff).get()
  } catch (e) {
    console.error('deadStockRadar orders query', e)
    return
  }
  const activeMspns = new Set()
  for (const d of recentSnap.docs) {
    const m = String(d.data()?.mspn || '').trim()
    if (m) activeMspns.add(m)
  }

  let tiresSnap
  try {
    tiresSnap = await db.collection('tires').where('cost', '>', 0).get()
  } catch (e) {
    console.error('deadStockRadar tires query', e)
    return
  }

  let newlyFlagged = 0
  const ops = []
  for (const doc of tiresSnap.docs) {
    const mspn = doc.id
    const wasActive = activeMspns.has(mspn)
    const data = doc.data() || {}
    const isFlagged = data.deadStockFlag === true
    if (!wasActive && !isFlagged) {
      ops.push({
        ref: doc.ref,
        patch: {
          deadStockFlag: true,
          deadStockFlaggedAt: FieldValue.serverTimestamp(),
        },
      })
      newlyFlagged += 1
    } else if (wasActive && isFlagged) {
      ops.push({
        ref: doc.ref,
        patch: { deadStockFlag: false, deadStockFlaggedAt: null },
      })
    }
  }

  if (ops.length === 0) return

  const chunk = 450
  for (let i = 0; i < ops.length; i += chunk) {
    const batch = db.batch()
    for (const o of ops.slice(i, i + chunk)) {
      batch.update(o.ref, o.patch)
    }
    await batch.commit()
  }

  if (newlyFlagged > 0 && slackOpts?.token && slackOpts?.channel) {
    await slackFleetOpsQuiet(
      `📦 Dead stock radar: ${newlyFlagged} tire SKU${newlyFlagged === 1 ? '' : 's'} flagged (90+ days, no movement, cost data present). Check the margin table.`,
      slackOpts,
    )
  }
}

const OPEN_METEO_FORT_COLLINS =
  'https://api.open-meteo.com/v1/forecast?latitude=40.5853&longitude=-105.0844&current_weather=true&temperature_unit=fahrenheit'

/** WMO Weather interpretation codes (subset) — https://open-meteo.com/en/docs */
function openMeteoConditionLabel(code) {
  const c = Number(code)
  const labels = {
    0: 'clear',
    1: 'mainly clear',
    2: 'partly cloudy',
    3: 'overcast',
    45: 'fog',
    48: 'fog',
    51: 'light drizzle',
    53: 'drizzle',
    55: 'heavy drizzle',
    61: 'light rain',
    63: 'rain',
    65: 'heavy rain',
    71: 'light snow',
    73: 'snow',
    75: 'heavy snow',
    77: 'snow grains',
    80: 'rain showers',
    81: 'rain showers',
    82: 'violent rain showers',
    85: 'snow showers',
    86: 'snow showers',
    95: 'thunderstorm',
    96: 'thunderstorm w/ hail',
    99: 'thunderstorm w/ hail',
  }
  if (Number.isFinite(c) && labels[c]) return labels[c]
  if (Number.isFinite(c)) return `code ${c}`
  return 'unknown'
}

async function fetchFortCollinsWeatherLine() {
  try {
    const res = await fetch(OPEN_METEO_FORT_COLLINS, {
      headers: { 'User-Agent': 'TireTriadPortal/1.0' },
    })
    if (!res.ok) {
      console.error('morningBrief weather http', res.status)
      return 'Weather unavailable'
    }
    const json = await res.json().catch(() => null)
    const cw = json && json.current_weather
    const temp = cw && Number(cw.temperature)
    if (!Number.isFinite(temp)) {
      console.error('morningBrief weather parse', json)
      return 'Weather unavailable'
    }
    const t = Math.round(temp)
    const cond = openMeteoConditionLabel(cw.weathercode)
    const wind = Number(cw.windspeed)
    const windBit = Number.isFinite(wind) ? `, wind ${Math.round(wind)} km/h` : ''
    return `${t}°F, ${cond}${windBit}`
  } catch (e) {
    console.error('morningBrief weather', e)
    return 'Weather unavailable'
  }
}

function formatHourAmpm(h) {
  if (h === 0) return '12am'
  if (h < 12) return `${h}am`
  if (h === 12) return '12pm'
  return `${h - 12}pm`
}

/**
 * Weekdays 14:00 UTC ≈ 7:00 AM MT — digest to #fleet-ops.
 * @param {{ token: string, channel: string }} slackOpts
 */
async function morningBriefRun(slackOpts) {
  console.log('[morningBrief] firing at', new Date().toISOString())
  const token = String(slackOpts?.token || '').trim()
  const channel = String(slackOpts?.channel || '').trim()
  if (!token || !channel) {
    console.warn('morningBrief: missing Slack token or channel')
    return
  }

  const db = admin.firestore()
  const yesterdayDenver = denverYmd(new Date(Date.now() - 30 * 3600000))
  const todayDenver = denverYmd(new Date())
  const isMondayMt = denverWeekdayShort(new Date()).toLowerCase().startsWith('mon')

  const weekAgo = Timestamp.fromMillis(Date.now() - 8 * 86400000)

  const [
    pendingSnap,
    transitSnap,
    completedSnap,
    djSnap,
    deadSnap,
    scheduledTodaySnap,
    creditSnap,
    recentDeadSnap,
    flaggedPriceSnap,
  ] = await Promise.all([
    db.collection('orders').where('status', '==', 'pending').get().catch(() => ({ docs: [] })),
    db.collection('orders').where('status', '==', 'in_transit').get().catch(() => ({ docs: [] })),
    db
      .collection('orders')
      .where('status', '==', 'completed')
      .where('completedAt', '>=', Timestamp.fromMillis(Date.now() - 60 * 86400000))
      .get()
      .catch(() => ({ docs: [] })),
    db.collection('meta').doc('djStats').get().catch(() => null),
    db.collection('tires').where('deadStockFlag', '==', true).get().catch(() => ({ docs: [] })),
    db
      .collection('orders')
      .where('scheduledDate', '==', todayDenver)
      .limit(80)
      .get()
      .catch(() => ({ docs: [] })),
    db.collection('meta').doc('creditTracker').get().catch(() => null),
    db
      .collection('tires')
      .where('deadStockFlag', '==', true)
      .where('deadStockFlaggedAt', '>=', weekAgo)
      .limit(40)
      .get()
      .catch(() => ({ docs: [] })),
    db.collection('tires').where('priceIntel.flagged', '==', true).get().catch(() => ({ docs: [] })),
  ])

  const pendingN = pendingSnap.docs?.length ?? 0
  const transitN = transitSnap.docs?.length ?? 0

  let yesterdayRevenue = 0
  let yesterdayCount = 0
  for (const d of completedSnap.docs || []) {
    const data = d.data() || {}
    const ts = data.completedAt
    const ms = ts && typeof ts.toMillis === 'function' ? ts.toMillis() : null
    if (ms == null) continue
    const ymd = denverYmd(new Date(ms))
    if (ymd !== yesterdayDenver) continue
    const amt = Number(data.paymentAmount) || 0
    yesterdayRevenue += amt
    yesterdayCount += 1
  }

  const djStreak = djSnap?.exists ? Number(djSnap.data().currentStreak) || 0 : 0
  const deadN = deadSnap.docs?.length ?? 0
  const flaggedPriceN = flaggedPriceSnap.docs?.length ?? 0
  const weather = await fetchFortCollinsWeatherLine()

  const dayHead = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Denver',
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  }).format(new Date())

  const lines = [
    `☀️  Morning brief — ${dayHead}`,
    '────────────────────────────',
    `📋  Open orders: ${pendingN} pending / ${transitN} in transit`,
  ]

  if (yesterdayRevenue <= 0 && yesterdayCount === 0) {
    lines.push('💰  Yesterday: quiet.')
  } else {
    lines.push(
      `💰  Yesterday: ${formatCurrency(yesterdayRevenue)} across ${yesterdayCount} order${yesterdayCount === 1 ? '' : 's'}`,
    )
  }

  if (djStreak > 0) {
    lines.push(`🔥  Field streak: ${djStreak} clean orders`)
  }

  if (flaggedPriceN > 0) {
    lines.push(
      `📊  Price intel: ${flaggedPriceN} tire${flaggedPriceN === 1 ? '' : 's'} flagged for review — run /flaggedprices for details`,
    )
  }

  const schedRows = (scheduledTodaySnap.docs || [])
    .map((d) => ({ id: d.id, ...(d.data() || {}) }))
    .filter((o) => ['pending', 'scheduled', 'in_transit', 'available'].includes(String(o.status || '')))
  if (schedRows.length) {
    const head = `🚚  Today’s schedule (${todayDenver}): ${schedRows.length} order${schedRows.length === 1 ? '' : 's'}`
    const body = schedRows
      .slice(0, 12)
      .map((o) => {
        const typ = String(o.deliveryType || o.fulfillment || '—')
        const win = String(o.scheduledWindow || o.scheduledTime || '—')
        return `   • \`${o.id}\` · ${String(o.customerName || '—')} · ${typ} · ${win}`
      })
      .join('\n')
    lines.push(head, body, schedRows.length > 12 ? `   _…+${schedRows.length - 12} more_` : '')
  } else {
    lines.push(`🚚  Today’s schedule (${todayDenver}): none on the calendar.`)
  }

  try {
    const djUid = await resolveDjUid(db)
    if (djUid) {
      const { data } = await fetchAvailabilityDay(db, djUid, todayDenver)
      const slots = Array.isArray(data.blockedSlots) ? data.blockedSlots : []
      if (slots.length) {
        const bits = slots.slice(0, 10).map((s) => {
          const a = Number(s.start)
          const b = Number(s.end)
          if (!Number.isFinite(a) || !Number.isFinite(b)) return null
          return `${formatHourAmpm(a)}–${formatHourAmpm(b)}`
        })
        lines.push(`🧱  DJ blocked today: ${bits.filter(Boolean).join(', ') || '—'}`)
      } else {
        lines.push('🧱  DJ blocked today: none')
      }
    } else {
      lines.push('🧱  DJ availability: (no DJ uid configured)')
    }
  } catch (e) {
    console.error('morningBrief DJ availability', e)
    lines.push('🧱  DJ availability: (could not load)')
  }

  if (creditSnap?.exists) {
    const c = creditSnap.data() || {}
    const bal = Number(c.currentBalance) || 0
    const avail = availableBuyingPower(c)
    lines.push(
      `💳  Credit: balance ${formatCurrency(bal)} · buying power ${formatCurrency(avail)}`,
    )
  } else {
    lines.push('💳  Credit tracker: not configured.')
  }

  if (isMondayMt && recentDeadSnap.docs?.length) {
    const ids = recentDeadSnap.docs.map((d) => `\`${d.id}\``).slice(0, 15)
    lines.push(
      `🪦  Newly flagged dead stock (last ~7d, Mon digest): ${recentDeadSnap.docs.length} SKU${recentDeadSnap.docs.length === 1 ? '' : 's'}`,
      ids.join(', ') + (recentDeadSnap.docs.length > 15 ? ' …' : ''),
    )
  }

  const vipKeys = new Set()
  for (const o of schedRows) {
    const k =
      String(o.contactPhoneKey || '').trim() || e164DocIdFromContact(o.customerContact) || ''
    if (k) vipKeys.add(k)
  }
  if (vipKeys.size) {
    const snaps = await Promise.all([...vipKeys].map((id) => db.collection('contacts').doc(id).get()))
    const vipNames = []
    for (let i = 0; i < snaps.length; i += 1) {
      const s = snaps[i]
      if (!s.exists) continue
      if (s.get('isVip') === true) {
        const o = schedRows.find((r) => String(r.contactPhoneKey || '').trim() === s.id)
        vipNames.push(String(o?.customerName || s.get('name') || s.id))
      }
    }
    if (vipNames.length) {
      lines.push(`⭐  VIP on the road today: ${vipNames.join(', ')}`)
    }
  }

  try {
    const crmSnap = await db.collection('crmAccounts').limit(400).get()
    const dueRows = []
    for (const d of crmSnap.docs) {
      const a = d.data() || {}
      const ns = normalizePipelineStage(a.pipelineStage, a)
      if (ns === CRM_LOST_STAGE || ns === 5) continue
      const na = a.nextAction || {}
      const due = na.dueDate
      if (!due || typeof due.toMillis !== 'function') continue
      const dueYmd = denverYmd(new Date(due.toMillis()))
      if (dueYmd <= todayDenver) {
        dueRows.push({
          name: a.companyName || d.id,
          task: String(na.task || '—'),
          owner: String(na.ownedBy || '—'),
        })
      }
    }
    if (dueRows.length) {
      lines.push(`📇  CRM — next actions due or overdue (${todayDenver}):`)
      for (const r of dueRows.slice(0, 20)) {
        lines.push(`   • *${r.name}* — ${r.task} (_${r.owner}_)`)
      }
      if (dueRows.length > 20) {
        lines.push(`   _…+${dueRows.length - 20} more_`)
      }
    } else {
      lines.push(`📇  CRM — no open-pipeline next actions due by end of today (${todayDenver}).`)
    }
  } catch (e) {
    console.error('morningBrief CRM', e)
    lines.push('📇  CRM — (could not load)')
  }

  lines.push(
    `🚨  Dead stock (90d rule, flagged): ${deadN} tire${deadN === 1 ? '' : 's'}`,
    `🌤  Fort Collins: ${weather}`,
    '────────────────────────────',
  )

  await slackFleetOpsQuiet(lines.filter(Boolean).join('\n'), { token, channel })
}

module.exports = {
  deadStockRadarRun,
  morningBriefRun,
}
