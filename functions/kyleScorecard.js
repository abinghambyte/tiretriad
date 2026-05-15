/**
 * Monthly Kyle sourcing scorecard — friendly Slack digest (1st of month, 8am MT).
 */
const admin = require('firebase-admin')
const { Timestamp } = require('firebase-admin/firestore')
const { formatCurrency, formatQty } = require('./format')
const { tireCatalogBuyNumber } = require('./tireCatalogBuy')

function denverYm(ms = Date.now()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Denver',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date(ms))
  const y = parts.find((p) => p.type === 'year')?.value
  const m = parts.find((p) => p.type === 'month')?.value
  return `${y}-${m}`
}

function prevDenverYearMonth(ym) {
  const [ys, ms] = ym.split('-')
  let y = Number(ys)
  let m = Number(ms) - 1
  if (m < 1) {
    m = 12
    y -= 1
  }
  return `${y}-${String(m).padStart(2, '0')}`
}

async function slackApiPost(token, channel, text) {
  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({ channel, text }),
  })
  const json = await res.json().catch(() => ({}))
  if (!json.ok) console.error('kyleScorecard slack', json.error || res.status)
}

/**
 * @param {{ token: string, channel: string }} slackOpts
 */
async function kyleScorecardRun(slackOpts) {
  const token = String(slackOpts?.token || '').trim()
  const channel = String(slackOpts?.channel || '').trim()
  if (!token || !channel) {
    console.warn('kyleScorecard: missing token or channel')
    return
  }

  const db = admin.firestore()
  const thisYm = denverYm(Date.now())
  const targetYm = prevDenverYearMonth(thisYm)
  const [yy, mm] = targetYm.split('-').map(Number)
  const label = new Date(yy, mm - 1, 4).toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Denver',
  })

  const startLookup = Timestamp.fromMillis(Date.now() - 100 * 86400000)
  let snap
  try {
    snap = await db
      .collection('orders')
      .where('status', '==', 'completed')
      .where('completedAt', '>=', startLookup)
      .limit(2500)
      .get()
  } catch (e) {
    console.error('kyleScorecard orders', e)
    return
  }

  const rows = snap.docs.filter((d) => {
    const ts = d.get('completedAt')
    const ms = ts && typeof ts.toMillis === 'function' ? ts.toMillis() : null
    if (ms == null) return false
    return denverYm(ms) === targetYm
  })

  let tireUnits = 0
  let fetTotal = 0
  let overrideCount = 0
  let deltaSum = 0
  let sumOverride = 0
  let sumCatalog = 0
  const mspns = new Set()

  for (const d of rows) {
    const o = d.data() || {}
    const qty = Number(o.quantity) || 0
    tireUnits += qty
    const mspn = String(o.mspn || '').trim()
    if (mspn) mspns.add(mspn)
  }

  const tireSnaps = await Promise.all([...mspns].map((id) => db.collection('tires').doc(id).get()))
  const tireByMspn = new Map()
  for (const s of tireSnaps) {
    if (s.exists) tireByMspn.set(s.id, s.data() || {})
  }

  for (const d of rows) {
    const o = d.data() || {}
    const qty = Number(o.quantity) || 0
    const mspn = String(o.mspn || '').trim()
    const tire = tireByMspn.get(mspn) || {}
    const fet = Number(tire.fet) || 0
    fetTotal += fet * qty

    const ko = o.kylePriceOverride
    if (ko != null && Number.isFinite(Number(ko))) {
      overrideCount += 1
      const override = Number(ko)
      const catalog = tireCatalogBuyNumber(tire)
      sumOverride += override
      sumCatalog += catalog
      deltaSum += override - catalog
    }
  }

  const avgOverride = overrideCount > 0 ? sumOverride / overrideCount : null
  const avgCatalog = overrideCount > 0 ? sumCatalog / overrideCount : null

  const lines = [
    `📊 *Kyle scorecard — ${label}*`,
    '────────────────────────────',
    `🛞 Tires sourced (completed × qty): **${formatQty(tireUnits)}** units across **${formatQty(rows.length)}** orders`,
    `🏷 Total FET on those lines: **${formatCurrency(fetTotal)}**`,
  ]

  if (overrideCount > 0 && avgOverride != null && avgCatalog != null) {
    lines.push(
      '',
      `📎 Orders with a buy override: **${formatQty(overrideCount)}**`,
      `   Avg override buy: **${formatCurrency(avgOverride)}** · avg catalog buy: **${formatCurrency(avgCatalog)}**`,
      `   Net delta (override − catalog): **${formatCurrency(deltaSum)}**`,
      '_Numbers help us tune the catalog — not a dig at anyone._',
    )
  } else {
    lines.push('', '_No buy overrides in this window — catalog pricing matched every line._')
  }

  lines.push('────────────────────────────', '_Automated monthly summary · Tire Triad portal_')

  await slackApiPost(token, channel, lines.join('\n'))
}

module.exports = { kyleScorecardRun }
