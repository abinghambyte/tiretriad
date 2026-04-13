/**
 * Inventory Slack slash commands — intake, reorder queue, stock intel, bestsellers.
 */
const crypto = require('crypto')
const { FieldValue, Timestamp } = require('firebase-admin/firestore')
const { formatCurrency, formatPercent, formatQty } = require('./format')
const { SLACK_SECRETS, SLACK_BOT_TOKEN, SLACK_CHANNEL_ID, SLACK_KYLE_ID } = require('./slackSecrets')

const INVENTORY_COMMANDS = new Set([
  '/intake',
  '/reorder',
  '/lowstock',
  '/dead',
  '/slowmovers',
  '/velocity',
  '/bestsellers',
  '/forecast',
])

function escapeSlackMrkdwn(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

async function slackApiPost(token, method, body) {
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  if (!json.ok) {
    throw new Error(json.error || `${method} failed`)
  }
  return json
}

async function postToFleet(token, fleetChannel, text, blocks) {
  const ch = String(fleetChannel || SLACK_CHANNEL_ID.value() || '').trim()
  if (!ch) throw new Error('No Slack channel.')
  await slackApiPost(token, 'chat.postMessage', {
    channel: ch,
    text,
    blocks,
  })
}

function splitCommandText(text) {
  return String(text || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
}

/** Mirrors lookupUtilitySlackCommands tireQtyOnHand — canonical on-hand from tire doc. */
function tireQtyOnHand(tire) {
  const t = tire || {}
  const candidates = [t.qty, t.quantity, t.quantityOnHand, t.onHandQty, t.inventoryQty]
  for (const c of candidates) {
    if (c != null && c !== '' && Number.isFinite(Number(c))) return Number(c)
  }
  return 0
}

function tireDescription(tire) {
  const t = tire || {}
  return String(t.description || t.tread || '').trim() || '—'
}

function formatDenverDate(ts) {
  if (!ts || typeof ts.toDate !== 'function') return '—'
  try {
    return ts.toDate().toLocaleDateString('en-US', {
      timeZone: 'America/Denver',
      dateStyle: 'medium',
    })
  } catch {
    return '—'
  }
}

async function handleIntake(db, token, fleetChannel, text) {
  const parts = splitCommandText(text)
  if (parts.length < 2) {
    return { response_type: 'ephemeral', text: 'Usage: `/intake [mspn] [qty]`' }
  }
  const mspn = String(parts[0] || '').trim()
  const delta = Number(parts[1])
  if (!mspn || !Number.isFinite(delta)) {
    return { response_type: 'ephemeral', text: 'Invalid MSPN or qty.' }
  }
  const ref = db.collection('tires').doc(mspn)
  const before = await ref.get()
  if (!before.exists) {
    return { response_type: 'ephemeral', text: `No tire found for MSPN \`${escapeSlackMrkdwn(mspn)}\`.` }
  }
  await ref.set(
    {
      qty: FieldValue.increment(delta),
      lastIntakeAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  )
  const after = await ref.get()
  const newQty = tireQtyOnHand(after.data() || {})
  const lines = [
    '*📥 Intake*',
    `*MSPN:* \`${escapeSlackMrkdwn(mspn)}\``,
    `*Δ qty:* ${formatQty(delta)}`,
    `*Qty on hand:* ${formatQty(newQty)}`,
  ]
  await postToFleet(token, fleetChannel, `Intake ${mspn}`, [
    { type: 'section', text: { type: 'mrkdwn', text: lines.join('\n') } },
  ])
  return { response_type: 'ephemeral', text: 'Posted intake to channel.' }
}

async function handleReorder(db, token, fleetChannel, text, form) {
  const parts = splitCommandText(text)
  if (parts.length < 2) {
    return { response_type: 'ephemeral', text: 'Usage: `/reorder [mspn] [qty]`' }
  }
  const mspn = String(parts[0] || '').trim()
  const qty = Number(parts[1])
  if (!mspn || !Number.isFinite(qty) || qty <= 0) {
    return { response_type: 'ephemeral', text: 'Invalid MSPN or qty.' }
  }
  const ref = db.collection('meta').doc('reorderQueue')
  const entry = {
    id: crypto.randomUUID(),
    mspn,
    qty,
    requestedAt: Timestamp.now(),
    requestedBy: String(form.user_name || form.user_id || '').slice(0, 120),
    requestedBySlackId: String(form.user_id || '').slice(0, 32),
  }
  await ref.set(
    {
      entries: FieldValue.arrayUnion(entry),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  )
  const kyleId = String(SLACK_KYLE_ID.value() || '').trim()
  const tag = kyleId ? `<@${kyleId}> ` : ''
  const lines = [
    `${tag}*🛒 Reorder flagged*`,
    `*MSPN:* \`${escapeSlackMrkdwn(mspn)}\``,
    `*Qty:* ${formatQty(qty)}`,
    `*By:* ${escapeSlackMrkdwn(entry.requestedBy || '—')}`,
  ]
  await postToFleet(token, fleetChannel, `Reorder ${mspn}`, [
    { type: 'section', text: { type: 'mrkdwn', text: lines.join('\n') } },
  ])
  return { response_type: 'ephemeral', text: 'Posted reorder to channel.' }
}

async function handleLowstock(db, token, fleetChannel) {
  let docs = []
  try {
    const snap = await db.collection('tires').where('qty', '<=', 1).limit(200).get()
    docs = snap.docs
  } catch (e) {
    console.error('lowstock query', e)
    const snap = await db.collection('tires').limit(300).get()
    docs = snap.docs.filter((d) => tireQtyOnHand(d.data()) <= 1)
  }
  docs.sort((a, b) => {
    const va = Number(a.data()?.weeklyVelocity) || 0
    const vb = Number(b.data()?.weeklyVelocity) || 0
    return vb - va
  })
  const lines = docs.slice(0, 40).map((d) => {
    const t = d.data() || {}
    const q = tireQtyOnHand(t)
    const v = Number(t.weeklyVelocity) || 0
    return `• \`${escapeSlackMrkdwn(d.id)}\` · ${escapeSlackMrkdwn(tireDescription(t))} · qty ${formatQty(q)} · vel ${formatQty(v)}`
  })
  const body = [
    '*🔻 Low stock (qty ≤ 1)* — sorted by weekly velocity (fast movers first)',
    '',
    lines.length ? lines.join('\n') : '_None matched._',
  ].join('\n')
  await postToFleet(token, fleetChannel, 'Low stock', [
    { type: 'section', text: { type: 'mrkdwn', text: body } },
  ])
  return { response_type: 'ephemeral', text: 'Posted /lowstock to channel.' }
}

async function handleDead(db, token, fleetChannel) {
  const cutoffMs = Date.now() - 30 * 86400000
  const cutoffTs = Timestamp.fromMillis(cutoffMs)
  const byId = new Map()
  try {
    const oldSnap = await db.collection('tires').where('lastSoldAt', '<', cutoffTs).limit(150).get()
    for (const d of oldSnap.docs) byId.set(d.id, d)
  } catch (e) {
    console.error('dead lastSoldAt query', e)
  }
  const scan = await db.collection('tires').limit(280).get()
  for (const d of scan.docs) {
    if (byId.has(d.id)) continue
    const ls = d.get('lastSoldAt')
    if (!ls) byId.set(d.id, d)
  }
  const rows = [...byId.values()].sort(
    (a, b) => tireQtyOnHand(b.data()) - tireQtyOnHand(a.data()),
  )
  const lines = rows.slice(0, 35).map((d) => {
    const t = d.data() || {}
    const q = tireQtyOnHand(t)
    const sold = formatDenverDate(t.lastSoldAt)
    return `• \`${escapeSlackMrkdwn(d.id)}\` · ${escapeSlackMrkdwn(tireDescription(t))} · qty ${formatQty(q)} · last sold ${escapeSlackMrkdwn(sold)}`
  })
  const body = [
    '*💀 Dead / stale (no sale in 30d or never)* — sorted by qty on hand',
    '',
    lines.length ? lines.join('\n') : '_None matched._',
  ].join('\n')
  await postToFleet(token, fleetChannel, 'Dead stock candidates', [
    { type: 'section', text: { type: 'mrkdwn', text: body } },
  ])
  return { response_type: 'ephemeral', text: 'Posted /dead to channel.' }
}

async function handleSlowmovers(db, token, fleetChannel) {
  let docs = []
  try {
    const snap = await db.collection('tires').where('weeklyVelocity', '<', 0.5).limit(200).get()
    docs = snap.docs
  } catch (e) {
    console.error('slowmovers query', e)
  }
  const seen = new Set(docs.map((d) => d.id))
  const scan = await db.collection('tires').limit(250).get()
  for (const d of scan.docs) {
    if (seen.has(d.id)) continue
    const v = Number(d.data()?.weeklyVelocity)
    if (!Number.isFinite(v) || v < 0.5) {
      docs.push(d)
      seen.add(d.id)
    }
  }
  docs.sort((a, b) => tireQtyOnHand(b.data()) - tireQtyOnHand(a.data()))
  const lines = docs.slice(0, 35).map((d) => {
    const t = d.data() || {}
    const q = tireQtyOnHand(t)
    const v = Number(t.weeklyVelocity) || 0
    return `• \`${escapeSlackMrkdwn(d.id)}\` · ${escapeSlackMrkdwn(tireDescription(t))} · qty ${formatQty(q)} · vel ${formatQty(v)}`
  })
  const body = [
    '*🐢 Slow movers (weekly velocity < 0.5)* — sorted by qty',
    '',
    lines.length ? lines.join('\n') : '_None matched._',
  ].join('\n')
  await postToFleet(token, fleetChannel, 'Slow movers', [
    { type: 'section', text: { type: 'mrkdwn', text: body } },
  ])
  return { response_type: 'ephemeral', text: 'Posted /slowmovers to channel.' }
}

async function handleVelocity(db, token, fleetChannel, text) {
  const parts = splitCommandText(text)
  if (!parts[0]) {
    return { response_type: 'ephemeral', text: 'Usage: `/velocity [mspn]`' }
  }
  const mspn = String(parts[0] || '').trim()
  const snap = await db.collection('tires').doc(mspn).get()
  if (!snap.exists) {
    return { response_type: 'ephemeral', text: `No tire found for MSPN \`${escapeSlackMrkdwn(mspn)}\`.` }
  }
  const t = snap.data() || {}
  const vel = Number(t.weeklyVelocity) || 0
  const salesCount = Number(t.salesCount) || 0
  const qty = tireQtyOnHand(t)
  const lines = [
    '*📈 Velocity*',
    `*MSPN:* \`${escapeSlackMrkdwn(mspn)}\``,
    `*Description:* ${escapeSlackMrkdwn(tireDescription(t))}`,
    `*Weekly velocity:* ${formatQty(vel)}`,
    `*Sales count (tire doc):* ${formatQty(salesCount)}`,
    `*Last sold:* ${escapeSlackMrkdwn(formatDenverDate(t.lastSoldAt))}`,
    `*Qty on hand:* ${formatQty(qty)}`,
  ]
  await postToFleet(token, fleetChannel, `Velocity ${mspn}`, [
    { type: 'section', text: { type: 'mrkdwn', text: lines.join('\n') } },
  ])
  return { response_type: 'ephemeral', text: 'Posted /velocity to channel.' }
}

async function fetchCompletedOrdersSince(db, startTs) {
  const rows = []
  let last = null
  for (let guard = 0; guard < 40; guard += 1) {
    let q = db
      .collection('orders')
      .where('status', '==', 'completed')
      .where('completedAt', '>=', startTs)
      .orderBy('completedAt', 'asc')
      .limit(250)
    if (last) q = q.startAfter(last)
    const snap = await q.get()
    if (snap.empty) break
    for (const d of snap.docs) {
      const data = d.data() || {}
      const ca = data.completedAt
      if (ca && typeof ca.toMillis === 'function') {
        rows.push({ id: d.id, data })
      }
    }
    last = snap.docs[snap.docs.length - 1]
    if (snap.size < 250) break
  }
  return rows
}

async function handleBestsellers(db, token, fleetChannel, text) {
  const parts = splitCommandText(text)
  const win = String(parts[0] || 'weekly').toLowerCase()
  const days = win === 'monthly' ? 30 : 7
  if (win !== 'weekly' && win !== 'monthly') {
    return { response_type: 'ephemeral', text: 'Usage: `/bestsellers [weekly|monthly]`' }
  }
  const startTs = Timestamp.fromMillis(Date.now() - days * 86400000)
  const orderRows = await fetchCompletedOrdersSince(db, startTs)
  const byMspn = new Map()
  for (const { data } of orderRows) {
    const m = String(data.mspn || '').trim()
    if (!m) continue
    const q = Number(data.quantity) || 0
    const pay = Number(data.paymentAmount ?? data.totalPrice) || 0
    const cur = byMspn.get(m) || { units: 0, revenue: 0 }
    cur.units += q
    cur.revenue += pay
    byMspn.set(m, cur)
  }
  const sorted = [...byMspn.entries()].sort((a, b) => b[1].units - a[1].units).slice(0, 10)
  const topRev = sorted.reduce((s, [, g]) => s + g.revenue, 0)
  const descMap = new Map()
  await Promise.all(
    sorted.map(async ([mspn]) => {
      const ts = await db.collection('tires').doc(mspn).get()
      if (ts.exists) descMap.set(mspn, tireDescription(ts.data() || {}))
      else descMap.set(mspn, '—')
    }),
  )
  const label = win === 'monthly' ? 'Monthly (30d)' : 'Weekly (7d)'
  const lines = sorted.map(([mspn, agg], i) => {
    const desc = descMap.get(mspn) || '—'
    const share =
      topRev > 0 && Number.isFinite(agg.revenue) ? formatPercent((100 * agg.revenue) / topRev, 1) : '—'
    return `${i + 1}. \`${escapeSlackMrkdwn(mspn)}\` · ${escapeSlackMrkdwn(desc)} · ${formatQty(agg.units)} units · ${formatCurrency(agg.revenue)} (${share} of top-10 revenue)`
  })
  const body = [
    `*🏆 Best sellers · ${escapeSlackMrkdwn(label)}*`,
    '',
    lines.length ? lines.join('\n') : '_No completed orders in window._',
  ].join('\n')
  await postToFleet(token, fleetChannel, 'Bestsellers', [
    { type: 'section', text: { type: 'mrkdwn', text: body } },
  ])
  return { response_type: 'ephemeral', text: 'Posted /bestsellers to channel.' }
}

async function handleForecast(db, token, fleetChannel, text) {
  const parts = splitCommandText(text)
  if (!parts[0]) {
    return { response_type: 'ephemeral', text: 'Usage: `/forecast [mspn]`' }
  }
  const mspn = String(parts[0] || '').trim()
  const snap = await db.collection('tires').doc(mspn).get()
  if (!snap.exists) {
    return { response_type: 'ephemeral', text: `No tire found for MSPN \`${escapeSlackMrkdwn(mspn)}\`.` }
  }
  const t = snap.data() || {}
  const qty = tireQtyOnHand(t)
  const vel = Number(t.weeklyVelocity)
  let lines
  if (!Number.isFinite(vel) || vel === 0) {
    lines = [
      '*🔮 Forecast*',
      `*MSPN:* \`${escapeSlackMrkdwn(mspn)}\``,
      `*Qty on hand:* ${formatQty(qty)}`,
      '_No recent sales — consider eBay._',
    ]
  } else {
    const weeks = qty / vel
    lines = [
      '*🔮 Forecast*',
      `*MSPN:* \`${escapeSlackMrkdwn(mspn)}\``,
      `*Qty on hand:* ${formatQty(qty)}`,
      `*Weekly velocity:* ${formatQty(vel)}`,
      `*Est. weeks of stock:* ${(Math.round(weeks * 10) / 10).toFixed(1)} wks`,
    ]
  }
  await postToFleet(token, fleetChannel, `Forecast ${mspn}`, [
    { type: 'section', text: { type: 'mrkdwn', text: lines.join('\n') } },
  ])
  return { response_type: 'ephemeral', text: 'Posted /forecast to channel.' }
}

/**
 * @returns {Promise<object|null>}
 */
async function tryHandleInventorySlash(db, token, fleetChannel, form) {
  const command = String(form.command || '').trim()
  if (!INVENTORY_COMMANDS.has(command)) return null

  if (!Array.isArray(SLACK_SECRETS) || SLACK_SECRETS.length < 1) {
    return { response_type: 'ephemeral', text: 'Slack secrets (SLACK_SECRETS) are not configured.' }
  }
  const botToken = SLACK_BOT_TOKEN.value() || String(token || '').trim()
  const ch =
    String(fleetChannel || '').trim() || String(SLACK_CHANNEL_ID.value() || '').trim()
  if (!botToken || !ch) {
    return { response_type: 'ephemeral', text: 'Slack token or channel missing.' }
  }

  const text = String(form.text || '')

  try {
    if (command === '/intake') {
      return await handleIntake(db, botToken, ch, text)
    }
    if (command === '/reorder') {
      return await handleReorder(db, botToken, ch, text, form)
    }
    if (command === '/lowstock') {
      return await handleLowstock(db, botToken, ch)
    }
    if (command === '/dead') {
      return await handleDead(db, botToken, ch)
    }
    if (command === '/slowmovers') {
      return await handleSlowmovers(db, botToken, ch)
    }
    if (command === '/velocity') {
      return await handleVelocity(db, botToken, ch, text)
    }
    if (command === '/bestsellers') {
      return await handleBestsellers(db, botToken, ch, text)
    }
    if (command === '/forecast') {
      return await handleForecast(db, botToken, ch, text)
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('inventorySlash', command, e)
    return { response_type: 'ephemeral', text: `Error: ${escapeSlackMrkdwn(msg)}` }
  }
  return null
}

module.exports = { tryHandleInventorySlash }
