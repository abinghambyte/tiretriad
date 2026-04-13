/**
 * Phase 5 — Dead Stock Radar + Morning Brief (scheduled).
 * @see docs/PHASE5-FEATURES-HANDOFF.md
 */
const admin = require('firebase-admin')
const { FieldValue, Timestamp } = require('firebase-admin/firestore')
const { formatCurrency } = require('./format')

function slackChannelEnv() {
  return (
    process.env.SLACK_CHANNEL_ID ||
    process.env.SLACK_NOTIFY_CHANNEL ||
    '#fleet-ops'
  )
}

/**
 * @param {string} text
 * @param {{ token?: string, channel?: string }} [slackOpts] — from Secret Manager when morningBrief passes them
 */
async function slackFleetOpsQuiet(text, slackOpts) {
  const token = slackOpts?.token ?? process.env.SLACK_BOT_TOKEN
  if (!token) return
  const channel = slackOpts?.channel ?? slackChannelEnv()
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

/**
 * Monday 13:00 UTC ≈ 6:00 AM MT — flag tires with no orders in 90 days (cost > 0).
 */
async function deadStockRadarRun() {
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

  if (newlyFlagged > 0) {
    await slackFleetOpsQuiet(
      `📦 Dead stock radar: ${newlyFlagged} tire SKU${newlyFlagged === 1 ? '' : 's'} flagged (90+ days, no movement, cost data present). Check the margin table.`,
    )
  }
}

async function fetchWttrLine() {
  const url =
    'https://wttr.in/FortCollins?format=%22%25C+%25t%22'
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'SkedaddlePortal/1.0' } })
    const t = (await res.text()).trim()
    return t.replace(/^"|"$/g, '') || '—'
  } catch (e) {
    console.error('morningBrief weather', e)
    return '—'
  }
}

/**
 * Weekdays 14:00 UTC ≈ 7:00 AM MT — digest to #fleet-ops.
 * @param {{ token?: string, channel?: string }} [slackOpts] — set by index.js morningBrief when secrets are bound
 */
async function morningBriefRun(slackOpts) {
  const db = admin.firestore()
  const token = slackOpts?.token ?? process.env.SLACK_BOT_TOKEN
  if (!token) {
    console.warn('morningBrief: SLACK_BOT_TOKEN unset')
    return
  }

  /** ~30h lookback: calendar “yesterday” in Denver when the job runs ~7am MT. */
  const yesterdayDenver = denverYmd(new Date(Date.now() - 30 * 3600000))

  const [pendingSnap, transitSnap, completedSnap, djSnap, deadSnap] = await Promise.all([
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
  const weather = await fetchWttrLine()

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
    lines.push(`🔥  DJ streak: ${djStreak} clean orders`)
  }

  lines.push(
    `🚨  Dead stock: ${deadN} tire${deadN === 1 ? '' : 's'} flagged (90+ days, no movement)`,
    `🌤  Fort Collins: ${weather}`,
    '────────────────────────────',
  )

  await slackFleetOpsQuiet(lines.join('\n'), slackOpts)
}

module.exports = {
  deadStockRadarRun,
  morningBriefRun,
}
