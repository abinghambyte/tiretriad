/**
 * Lookup + utility Slack slash commands (Batch 2).
 * Runs inside `slackActions`. Slack tokens/channels use secrets only; optional
 * Anthropic + admin IDs are read via `slackSecrets.js` helpers (backed by `process.env`).
 */
const { FieldValue, Timestamp } = require('firebase-admin/firestore')
const { formatCurrency, formatPercent, formatQty } = require('./format')
const { tireCatalogBuyNumber } = require('./tireCatalogBuy')
const {
  SLACK_SECRETS,
  SLACK_BOT_TOKEN,
  SLACK_CHANNEL_ID,
  ANTHROPIC_API_KEY,
  anthropicKeyResolved,
  slackAdminUserIdsRawFromEnv,
} = require('./slackSecrets')
const { e164DocIdFromContact } = require('./orderMetrics')
const { CREW_KEYS, CREW_SPLIT, ctsPerTire, round2 } = require('./financeStats')
const { slackViewsOpen, viewInputValue, viewStaticSelectValue, viewSubmissionErrorsBody } = require('./slackModalShared')

const MODAL_STOCK_SUBMIT = 'stock_modal_submit'
const MODAL_MARGINS_SUBMIT = 'margins_modal_submit'
const MODAL_PRICECHECK_SUBMIT = 'pricecheck_modal_submit'
const MODAL_CUSTOMER_SUBMIT = 'customer_modal_submit'
const MODAL_NOTE_SUBMIT = 'note_modal_submit'
const MODAL_SETLIMIT_SUBMIT = 'setlimit_modal_submit'
const MODAL_SETQUOTA_SUBMIT = 'setquota_modal_submit'
const MODAL_DISPATCH_SUBMIT = 'dispatch_modal_submit'

const CREDIT_REF = (db) => db.collection('meta').doc('creditTracker')
const QUOTA_TARGETS_REF = (db) => db.collection('meta').doc('quotaTargets')
const REVENUE_STATS_REF = (db) => db.collection('meta').doc('revenueStats')

const DISPATCH_NAMES = ['dj', 'tanner', 'kyle', 'alex']

const WEATHER_URL =
  'https://api.open-meteo.com/v1/forecast?latitude=40.5853&longitude=-105.0844&current_weather=true&daily=precipitation_probability_max,temperature_2m_max,temperature_2m_min&timezone=America%2FDenver&forecast_days=1&temperature_unit=fahrenheit'

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

function slackAdminIdSet() {
  const raw = slackAdminUserIdsRawFromEnv()
  const ids = raw
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  return new Set(ids)
}

function isSlackAdmin(userId) {
  return slackAdminIdSet().has(String(userId || '').trim())
}

function formatDenverDateTime(ts) {
  if (!ts) return '—'
  let d
  try {
    d = typeof ts.toDate === 'function' ? ts.toDate() : new Date(ts)
  } catch {
    return '—'
  }
  if (!Number.isFinite(d.getTime())) return '—'
  return d.toLocaleString('en-US', {
    timeZone: 'America/Denver',
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function tireQtyOnHand(tire) {
  const t = tire || {}
  const candidates = [t.qty, t.quantity, t.quantityOnHand, t.onHandQty, t.inventoryQty]
  for (const c of candidates) {
    if (c != null && c !== '' && Number.isFinite(Number(c))) return Number(c)
  }
  return 0
}

function wmoWeatherLabel(code) {
  const c = Number(code)
  const map = {
    0: 'Clear',
    1: 'Mostly clear',
    2: 'Partly cloudy',
    3: 'Overcast',
    45: 'Fog',
    48: 'Fog',
    51: 'Light drizzle',
    53: 'Drizzle',
    55: 'Dense drizzle',
    61: 'Light rain',
    63: 'Rain',
    65: 'Heavy rain',
    71: 'Snow',
    73: 'Snow',
    75: 'Heavy snow',
    80: 'Rain showers',
    81: 'Rain showers',
    82: 'Violent showers',
    95: 'Thunderstorm',
    96: 'Thunderstorm w/ hail',
    99: 'Thunderstorm w/ hail',
  }
  return map[c] || `Weather code ${c}`
}

async function postToFleet(token, fleetChannel, text, blocks) {
  const ch = String(fleetChannel || SLACK_CHANNEL_ID.value() || '').trim()
  if (!ch) throw new Error('No Slack channel (set SLACK_CHANNEL_ID or invoke from a channel).')
  await slackApiPost(token, 'chat.postMessage', {
    channel: ch,
    text,
    blocks,
  })
}

async function openLookupModal(botToken, triggerId, view, okMsg) {
  const tid = String(triggerId || '').trim()
  if (!tid) return { response_type: 'ephemeral', text: 'Missing Slack trigger — try the command again.' }
  try {
    await slackViewsOpen(botToken, tid, view)
    return { response_type: 'ephemeral', text: okMsg }
  } catch (e) {
    console.error('lookup views.open', e)
    return {
      response_type: 'ephemeral',
      text: `Could not open form: ${e instanceof Error ? e.message : String(e)}`,
    }
  }
}

function buildStockModalView() {
  return {
    type: 'modal',
    callback_id: MODAL_STOCK_SUBMIT,
    title: { type: 'plain_text', text: 'Stock lookup' },
    submit: { type: 'plain_text', text: 'Submit' },
    close: { type: 'plain_text', text: 'Cancel' },
    blocks: [
      {
        type: 'input',
        block_id: 'stock_modal_mspn',
        label: { type: 'plain_text', text: 'MSPN' },
        element: {
          type: 'plain_text_input',
          action_id: 'stock_modal_mspn_field',
          placeholder: { type: 'plain_text', text: 'e.g. 03363' },
        },
      },
    ],
  }
}

function buildMarginsModalView() {
  return {
    type: 'modal',
    callback_id: MODAL_MARGINS_SUBMIT,
    title: { type: 'plain_text', text: 'Margins' },
    submit: { type: 'plain_text', text: 'Submit' },
    close: { type: 'plain_text', text: 'Cancel' },
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: 'Leave MSPN blank for *top catalog* summary. If you enter an MSPN, we use the sale price that yields a *25%* gross margin for that tire (same CTS math as `/margins`).',
        },
      },
      {
        type: 'input',
        block_id: 'margins_modal_mspn',
        optional: true,
        label: { type: 'plain_text', text: 'MSPN (optional)' },
        element: {
          type: 'plain_text_input',
          action_id: 'margins_modal_mspn_field',
          placeholder: { type: 'plain_text', text: 'Leave blank for top margins (catalog)' },
        },
      },
    ],
  }
}

function buildPricecheckModalView() {
  return {
    type: 'modal',
    callback_id: MODAL_PRICECHECK_SUBMIT,
    title: { type: 'plain_text', text: 'Price check' },
    submit: { type: 'plain_text', text: 'Submit' },
    close: { type: 'plain_text', text: 'Cancel' },
    blocks: [
      {
        type: 'input',
        block_id: 'pricecheck_modal_mspn',
        label: { type: 'plain_text', text: 'MSPN' },
        element: {
          type: 'plain_text_input',
          action_id: 'pricecheck_modal_mspn_field',
          placeholder: { type: 'plain_text', text: 'e.g. 03363' },
        },
      },
    ],
  }
}

function buildCustomerModalView() {
  return {
    type: 'modal',
    callback_id: MODAL_CUSTOMER_SUBMIT,
    title: { type: 'plain_text', text: 'Customer lookup' },
    submit: { type: 'plain_text', text: 'Submit' },
    close: { type: 'plain_text', text: 'Cancel' },
    blocks: [
      {
        type: 'input',
        block_id: 'customer_modal_phone',
        label: { type: 'plain_text', text: 'Phone or Name' },
        element: {
          type: 'plain_text_input',
          action_id: 'customer_modal_phone_field',
          placeholder: { type: 'plain_text', text: 'Phone (any format) or exact contact name' },
        },
      },
    ],
  }
}

function buildNoteModalView() {
  return {
    type: 'modal',
    callback_id: MODAL_NOTE_SUBMIT,
    title: { type: 'plain_text', text: 'Order note' },
    submit: { type: 'plain_text', text: 'Submit' },
    close: { type: 'plain_text', text: 'Cancel' },
    blocks: [
      {
        type: 'input',
        block_id: 'note_modal_order',
        label: { type: 'plain_text', text: 'Order ID' },
        element: {
          type: 'plain_text_input',
          action_id: 'note_modal_order_field',
          placeholder: { type: 'plain_text', text: 'Firestore order doc id' },
        },
      },
      {
        type: 'input',
        block_id: 'note_modal_body',
        label: { type: 'plain_text', text: 'Note' },
        element: {
          type: 'plain_text_input',
          action_id: 'note_modal_body_field',
          multiline: true,
          placeholder: { type: 'plain_text', text: 'Debrief / context' },
        },
      },
    ],
  }
}

function buildSetlimitModalView() {
  return {
    type: 'modal',
    callback_id: MODAL_SETLIMIT_SUBMIT,
    title: { type: 'plain_text', text: 'Set card limit' },
    submit: { type: 'plain_text', text: 'Submit' },
    close: { type: 'plain_text', text: 'Cancel' },
    blocks: [
      {
        type: 'input',
        block_id: 'setlimit_modal_amt',
        label: { type: 'plain_text', text: 'New Limit' },
        element: {
          type: 'plain_text_input',
          action_id: 'setlimit_modal_amt_field',
          placeholder: { type: 'plain_text', text: 'Dollar amount, e.g. 50000' },
        },
      },
    ],
  }
}

function buildSetquotaModalView() {
  return {
    type: 'modal',
    callback_id: MODAL_SETQUOTA_SUBMIT,
    title: { type: 'plain_text', text: 'Set quota targets' },
    submit: { type: 'plain_text', text: 'Submit' },
    close: { type: 'plain_text', text: 'Cancel' },
    blocks: [
      {
        type: 'input',
        block_id: 'setquota_modal_weekly',
        label: { type: 'plain_text', text: 'Weekly Target' },
        element: {
          type: 'plain_text_input',
          action_id: 'setquota_modal_weekly_field',
          placeholder: { type: 'plain_text', text: 'e.g. 25000' },
        },
      },
      {
        type: 'input',
        block_id: 'setquota_modal_monthly',
        label: { type: 'plain_text', text: 'Monthly Target' },
        element: {
          type: 'plain_text_input',
          action_id: 'setquota_modal_monthly_field',
          placeholder: { type: 'plain_text', text: 'e.g. 100000' },
        },
      },
    ],
  }
}

function buildDispatchModalView() {
  return {
    type: 'modal',
    callback_id: MODAL_DISPATCH_SUBMIT,
    title: { type: 'plain_text', text: 'Dispatch order' },
    submit: { type: 'plain_text', text: 'Submit' },
    close: { type: 'plain_text', text: 'Cancel' },
    blocks: [
      {
        type: 'input',
        block_id: 'dispatch_modal_order',
        label: { type: 'plain_text', text: 'Order ID' },
        element: {
          type: 'plain_text_input',
          action_id: 'dispatch_modal_order_field',
          placeholder: { type: 'plain_text', text: 'Firestore order id' },
        },
      },
      {
        type: 'input',
        block_id: 'dispatch_modal_crew',
        label: { type: 'plain_text', text: 'Crew' },
        element: {
          type: 'static_select',
          action_id: 'dispatch_modal_crew_field',
          placeholder: { type: 'plain_text', text: 'Select' },
          options: DISPATCH_NAMES.map((n) => ({
            text: { type: 'plain_text', text: n },
            value: n,
          })),
        },
      },
    ],
  }
}

async function handleSlashStock(db, token, fleetChannel, text) {
  const parts = String(text || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (!parts.length) {
    return { response_type: 'ephemeral', text: 'Usage: `/stock [mspn] [optional salePrice]`' }
  }
  const mspn = String(parts[0] || '').trim()
  let salePrice = null
  if (parts.length >= 2 && Number.isFinite(Number(parts[1]))) {
    salePrice = Number(parts[1])
  }
  const snap = await db.collection('tires').doc(mspn).get()
  if (!snap.exists) {
    return { response_type: 'ephemeral', text: `No tire found for MSPN \`${escapeSlackMrkdwn(mspn)}\`.` }
  }
  const tire = snap.data() || {}
  const brand = String(tire.brand || tire.make || '—').trim() || '—'
  const description = String(tire.description || tire.tread || '—').trim() || '—'
  const buy = tireCatalogBuyNumber(tire)
  const fet = Number(tire.fet) || 0
  const cts = ctsPerTire(tire)
  const mount = Number(tire.mountCost) || 0
  const delivery = Number(tire.deliveryCost) || 0
  const other = Number(tire.otherCost) || 0
  const qtyVal = tireQtyOnHand(tire)
  const lastSold = formatDenverDateTime(tire.lastSoldAt)
  const vel = Number(tire.weeklyVelocity) || 0

  const lines = [
    `*🛞 Stock ·* \`${escapeSlackMrkdwn(mspn)}\``,
    `*Brand:* ${escapeSlackMrkdwn(brand)}`,
    `*Description:* ${escapeSlackMrkdwn(description)}`,
    `*Buy (catalog):* ${formatCurrency(buy)}`,
    `*FET:* ${formatCurrency(fet)}`,
    `*CTS:* ${formatCurrency(cts)}`,
    `*Qty on hand:* ${formatQty(qtyVal)}`,
    `*Last sold:* ${lastSold}`,
    `*Weekly velocity:* ${formatQty(vel)}`,
  ]

  if (salePrice != null && salePrice > 0) {
    const marginPct = ((salePrice - buy - mount - delivery - other) / salePrice) * 100
    const pool = round2(salePrice - buy - mount - delivery - other)
    const splitLines = CREW_KEYS.map(
      (k) =>
        `*${k}* (${formatPercent((CREW_SPLIT[k] || 0) * 100, 0)}): ${formatCurrency(round2(pool * (CREW_SPLIT[k] || 0)))}`,
    )
    lines.push(
      '',
      `*Margin @ ${formatCurrency(salePrice)} / tire:* ${formatPercent(marginPct, 2)}`,
      `*Pool (1 tire):* ${formatCurrency(pool)}`,
      '*Pool split:*',
      ...splitLines,
    )
  }

  await postToFleet(token, fleetChannel, `Stock ${mspn}`, [
    { type: 'section', text: { type: 'mrkdwn', text: lines.join('\n') } },
  ])
  return { response_type: 'ephemeral', text: 'Posted /stock to channel.' }
}

async function handleSlashMargins(db, token, fleetChannel, text) {
  const parts = String(text || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (parts.length < 2) {
    return { response_type: 'ephemeral', text: 'Usage: `/margins [mspn] [salePrice]`' }
  }
  const mspn = String(parts[0] || '').trim()
  const salePrice = Number(parts[1])
  if (!Number.isFinite(salePrice) || salePrice <= 0) {
    return { response_type: 'ephemeral', text: 'Invalid sale price.' }
  }
  const snap = await db.collection('tires').doc(mspn).get()
  if (!snap.exists) {
    return { response_type: 'ephemeral', text: `No tire found for MSPN \`${escapeSlackMrkdwn(mspn)}\`.` }
  }
  const tire = snap.data() || {}
  const buy = tireCatalogBuyNumber(tire)
  const mount = Number(tire.mountCost) || 0
  const delivery = Number(tire.deliveryCost) || 0
  const other = Number(tire.otherCost) || 0
  const qty = 1
  const paymentAmount = salePrice
  const profit = round2((paymentAmount - buy - mount - delivery - other) * qty)
  const splitLines = CREW_KEYS.map(
    (k) =>
      `*${k}* (${formatPercent((CREW_SPLIT[k] || 0) * 100, 0)}): ${formatCurrency(round2(profit * (CREW_SPLIT[k] || 0)))}`,
  )
  const lines = [
    `*📐 Margins ·* \`${escapeSlackMrkdwn(mspn)}\` @ ${formatCurrency(salePrice)} (qty ${formatQty(qty)})`,
    `_Profit = (paymentAmount − buy − mount − delivery − other) × qty_`,
    `*Profit (pool):* ${formatCurrency(profit)}`,
    '',
    '*Crew split:*',
    ...splitLines,
  ]
  await postToFleet(token, fleetChannel, `Margins ${mspn}`, [
    { type: 'section', text: { type: 'mrkdwn', text: lines.join('\n') } },
  ])
  return { response_type: 'ephemeral', text: 'Posted /margins to channel.' }
}

/** Same CTS basis as /pricecheck: sale where gross margin fraction ≈ `targetMargin`. */
function saleForTargetMarginFraction(tire, targetMargin) {
  const buy = tireCatalogBuyNumber(tire)
  const mount = Number(tire.mountCost) || 0
  const delivery = Number(tire.deliveryCost) || 0
  const other = Number(tire.otherCost) || 0
  const costBasis = round2(buy + mount + delivery + other)
  const t = Number(targetMargin)
  if (!Number.isFinite(t) || t <= 0 || t >= 1) return null
  const denom = 1 - t
  if (!(denom > 0)) return null
  const sp = round2(costBasis / denom)
  return Number.isFinite(sp) && sp > 0 ? sp : null
}

async function handleSlashMarginsCatalogTop(db, token, fleetChannel) {
  const snap = await db.collection('tires').limit(500).get()
  const rows = []
  for (const d of snap.docs) {
    const tire = d.data() || {}
    const buy = tireCatalogBuyNumber(tire)
    if (!Number.isFinite(buy) || buy <= 0) continue
    const sp = saleForTargetMarginFraction(tire, 0.25)
    if (!sp) continue
    const mount = Number(tire.mountCost) || 0
    const delivery = Number(tire.deliveryCost) || 0
    const other = Number(tire.otherCost) || 0
    const profit = round2(sp - buy - mount - delivery - other)
    if (!Number.isFinite(profit)) continue
    rows.push({ id: d.id, profit, sp })
  }
  rows.sort((a, b) => b.profit - a.profit)
  const top = rows.slice(0, 25)
  const lines = [
    '*📐 Margins · top catalog (profit pool)*',
    '_Each row uses the per-tire sale price that yields a 25% gross margin (same CTS formula as `/margins`). Ranked by profit pool at that price._',
    '',
  ]
  if (!top.length) {
    lines.push('_No tires with computable targets in this scan._')
  } else {
    for (const r of top) {
      lines.push(
        `• \`${escapeSlackMrkdwn(r.id)}\` · pool ${formatCurrency(r.profit)} · ref. sale ${formatCurrency(r.sp)}`,
      )
    }
  }
  await postToFleet(token, fleetChannel, 'Margins catalog top', [
    { type: 'section', text: { type: 'mrkdwn', text: lines.join('\n') } },
  ])
  return { response_type: 'ephemeral', text: 'Posted /margins to channel.' }
}

async function handleSlashPricecheck(db, token, fleetChannel, text) {
  const parts = String(text || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (!parts.length) {
    return { response_type: 'ephemeral', text: 'Usage: `/pricecheck [mspn]`' }
  }
  const mspn = String(parts[0] || '').trim()
  const snap = await db.collection('tires').doc(mspn).get()
  if (!snap.exists) {
    return { response_type: 'ephemeral', text: `No tire found for MSPN \`${escapeSlackMrkdwn(mspn)}\`.` }
  }
  const tire = snap.data() || {}
  const buy = tireCatalogBuyNumber(tire)
  const fet = Number(tire.fet) || 0
  const cts = ctsPerTire(tire)
  const mount = Number(tire.mountCost) || 0
  const delivery = Number(tire.deliveryCost) || 0
  const other = Number(tire.otherCost) || 0
  const costBasis = round2(buy + mount + delivery + other)
  const targets = [0.3, 0.4, 0.5]
  const priceLines = targets.map((m) => {
    const denom = 1 - m
    const sp = denom > 0 ? round2(costBasis / denom) : null
    const label = formatPercent(m * 100, 0)
    return sp != null && Number.isFinite(sp)
      ? `*${label} margin:* ${formatCurrency(sp)}`
      : `*${label} margin:* —`
  })
  const lines = [
    `*🏷 Price check ·* \`${escapeSlackMrkdwn(mspn)}\``,
    `*Buy (catalog):* ${formatCurrency(buy)}`,
    `*FET:* ${formatCurrency(fet)}`,
    `*CTS:* ${formatCurrency(cts)}`,
    `_Sale price = (buy + mount + delivery + other) ÷ (1 − target margin)_`,
    '',
    ...priceLines,
  ]
  await postToFleet(token, fleetChannel, `Pricecheck ${mspn}`, [
    { type: 'section', text: { type: 'mrkdwn', text: lines.join('\n') } },
  ])
  return { response_type: 'ephemeral', text: 'Posted /pricecheck to channel.' }
}

async function handleSlashCustomer(db, token, fleetChannel, text) {
  const raw = String(text || '').trim()
  if (!raw) {
    return { response_type: 'ephemeral', text: 'Usage: `/customer [phone or name]`' }
  }
  let phoneKey = e164DocIdFromContact(raw)
  let snap = null
  if (phoneKey) {
    snap = await db.collection('contacts').doc(phoneKey).get()
  } else {
    const nameSnap = await db.collection('contacts').where('name', '==', raw.trim()).limit(5).get()
    if (!nameSnap.empty) {
      snap = nameSnap.docs[0]
      phoneKey = snap.id
    }
  }
  if (!phoneKey) {
    return {
      response_type: 'ephemeral',
      text: 'No contact found — use a phone we can normalize to E.164, or an exact match on `contacts.name`.',
    }
  }
  if (!snap || !snap.exists) {
    return { response_type: 'ephemeral', text: `No contact doc \`${escapeSlackMrkdwn(phoneKey)}\`.` }
  }
  const c = snap.data() || {}
  const name = String(c.name || '—').trim() || '—'
  const lastMspn = String(c.lastMspn || '—').trim() || '—'
  const orders = Number(c.orderCount) || 0
  const spent = Number(c.totalSpend) || 0
  const lastAt = formatDenverDateTime(c.lastOrderAt)
  let tireLine = `*Last tire (MSPN):* \`${escapeSlackMrkdwn(lastMspn)}\``
  if (lastMspn && lastMspn !== '—') {
    const tSnap = await db.collection('tires').doc(lastMspn).get()
    if (tSnap.exists) {
      const td = tSnap.data() || {}
      const desc = String(td.description || td.tread || '').trim()
      if (desc) tireLine += `\n_${escapeSlackMrkdwn(desc)}_`
    }
  }
  const lines = [
    `*👤 Customer ·* \`${escapeSlackMrkdwn(phoneKey)}\``,
    `*Name:* ${escapeSlackMrkdwn(name)}`,
    tireLine,
    `*Total orders:* ${formatQty(orders)}`,
    `*Total spent:* ${formatCurrency(spent)}`,
    `*Last order:* ${lastAt}`,
  ]
  await postToFleet(token, fleetChannel, `Customer ${phoneKey}`, [
    { type: 'section', text: { type: 'mrkdwn', text: lines.join('\n') } },
  ])
  return { response_type: 'ephemeral', text: 'Posted /customer to channel.' }
}

async function slackDisplayName(token, userId) {
  const id = String(userId || '').trim()
  if (!id || !token) return ''
  try {
    const res = await fetch(`https://slack.com/api/users.info?user=${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const j = await res.json().catch(() => ({}))
    if (!j.ok) return id
    const u = j.user || {}
    const n = u.real_name || u.profile?.display_name || u.name || id
    return String(n).slice(0, 120)
  } catch {
    return id
  }
}

async function handleSlashNote(db, token, text, userName, userId) {
  const parts = String(text || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (parts.length < 2) {
    return { response_type: 'ephemeral', text: 'Usage: `/note [order-id] [text]`' }
  }
  const orderId = String(parts[0] || '').trim()
  const noteText = parts.slice(1).join(' ').trim()
  if (!orderId || !noteText) {
    return { response_type: 'ephemeral', text: 'Order id and note text are required.' }
  }
  const ref = db.collection('orders').doc(orderId)
  const snap = await ref.get()
  if (!snap.exists) {
    return { response_type: 'ephemeral', text: `Order \`${escapeSlackMrkdwn(orderId)}\` not found.` }
  }
  const fromSlackApi = await slackDisplayName(token, userId)
  const author = String(fromSlackApi || userName || userId || 'slack').slice(0, 120)
  const entry = {
    at: Timestamp.now(),
    author,
    authorSlackUserId: String(userId || '').slice(0, 32),
    text: noteText.slice(0, 4000),
  }
  await ref.update({
    slackDebriefLog: FieldValue.arrayUnion(entry),
    updatedAt: FieldValue.serverTimestamp(),
  })
  return { response_type: 'ephemeral', text: `Note saved on \`${escapeSlackMrkdwn(orderId)}\` · ${escapeSlackMrkdwn(author)}` }
}

async function handleSlashWeather(token, fleetChannel) {
  const res = await fetch(WEATHER_URL)
  if (!res.ok) {
    throw new Error(`Open-Meteo HTTP ${res.status}`)
  }
  const data = await res.json().catch(() => ({}))
  const cur = data.current_weather || {}
  const daily = data.daily || {}
  const hi = Array.isArray(daily.temperature_2m_max) ? daily.temperature_2m_max[0] : null
  const lo = Array.isArray(daily.temperature_2m_min) ? daily.temperature_2m_min[0] : null
  const precip = Array.isArray(daily.precipitation_probability_max)
    ? daily.precipitation_probability_max[0]
    : null
  const cond = wmoWeatherLabel(cur.weathercode)
  const lines = [
    '*🌤 Fort Collins (today)*',
    `*High / low:* ${hi != null ? `${hi}°F` : '—'} / ${lo != null ? `${lo}°F` : '—'}`,
    `*Now:* ${cur.temperature != null ? `${cur.temperature}°F` : '—'} · ${cond}`,
    `*Precip chance (max):* ${precip != null ? formatPercent(Number(precip), 0) : '—'}`,
  ]
  await postToFleet(token, fleetChannel, 'Weather Fort Collins', [
    { type: 'section', text: { type: 'mrkdwn', text: lines.join('\n') } },
  ])
  return { response_type: 'ephemeral', text: 'Posted /weather to channel.' }
}

async function handleSlashQuota(db, token, fleetChannel, text) {
  const arg = String(text || '')
    .trim()
    .split(/\s+/)[0]
    .toLowerCase()
  if (!['weekly', 'monthly'].includes(arg)) {
    return { response_type: 'ephemeral', text: 'Usage: `/quota weekly` or `/quota monthly`' }
  }
  const [revSnap, tgtSnap] = await Promise.all([
    REVENUE_STATS_REF(db).get(),
    QUOTA_TARGETS_REF(db).get(),
  ])
  const rev = revSnap.exists ? revSnap.data() || {} : {}
  const tgt = tgtSnap.exists ? tgtSnap.data() || {} : {}
  const revenue = arg === 'weekly' ? Number(rev.weeklyRevenue) || 0 : Number(rev.monthlyRevenue) || 0
  const target =
    arg === 'weekly' ? Number(tgt.weeklyTarget) || 0 : Number(tgt.monthlyTarget) || 0
  const remaining = round2(Math.max(0, target - revenue))
  const pctToGoal =
    target > 0 && Number.isFinite(revenue / target) ? (100 * revenue) / target : null
  const lines = [
    `*🎯 Quota (${arg})*`,
    `*Revenue:* ${formatCurrency(revenue)}`,
    `*Target:* ${formatCurrency(target)}`,
    `*Remaining:* ${formatCurrency(remaining)}`,
    `*Progress:* ${pctToGoal == null ? '—' : formatPercent(pctToGoal, 1)}`,
  ]
  await postToFleet(token, fleetChannel, `Quota ${arg}`, [
    { type: 'section', text: { type: 'mrkdwn', text: lines.join('\n') } },
  ])
  return { response_type: 'ephemeral', text: 'Posted /quota to channel.' }
}

async function handleSlashHype(token, fleetChannel) {
  const apiKey = anthropicKeyResolved(ANTHROPIC_API_KEY.value())
  if (!apiKey) {
    return {
      response_type: 'ephemeral',
      text: 'ANTHROPIC_API_KEY is not set (Secret Manager or functions env).',
    }
  }
  const system =
    'You are the voice of a scrappy northern Colorado tire operation. Return a single line of raw motivation — understated, slightly unhinged, never corporate. Always different. Max 12 words.'
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 80,
      system,
      messages: [{ role: 'user', content: 'Hype the crew in one line.' }],
    }),
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new Error(`Anthropic ${res.status}: ${t || res.statusText}`)
  }
  const body = await res.json().catch(() => ({}))
  const block = (body.content && body.content[0]) || {}
  const line = String(block.text || '')
    .trim()
    .split('\n')[0]
    .slice(0, 500)
  if (!line) {
    throw new Error('Empty Anthropic response')
  }
  await postToFleet(token, fleetChannel, line, [{ type: 'section', text: { type: 'mrkdwn', text: line } }])
  return { response_type: 'ephemeral', text: 'Posted /hype to channel.' }
}

async function handleSlashSetlimit(db, token, fleetChannel, text, slackUserId) {
  if (!isSlackAdmin(slackUserId)) {
    if (slackAdminIdSet().size === 0) {
      return {
        response_type: 'ephemeral',
        text: 'Admin commands are disabled until `SLACK_ADMIN_USER_IDS` is set in the Functions environment.',
      }
    }
    return { response_type: 'ephemeral', text: 'Admin only.' }
  }
  const amt = Number(String(text || '').trim().split(/\s+/)[0])
  if (!Number.isFinite(amt) || amt < 0) {
    return { response_type: 'ephemeral', text: 'Usage: `/setlimit [amount]`' }
  }
  const ref = CREDIT_REF(db)
  let prevLimit = 0
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    const data = snap.exists ? snap.data() || {} : {}
    prevLimit = Number(data.cardLimit) || 0
    tx.set(ref, { cardLimit: round2(amt), updatedAt: FieldValue.serverTimestamp() }, { merge: true })
  })
  const lines = [
    '*💳 Card limit updated*',
    `*Previous:* ${formatCurrency(prevLimit)}`,
    `*New:* ${formatCurrency(amt)}`,
  ]
  await postToFleet(token, fleetChannel, 'Card limit updated', [
    { type: 'section', text: { type: 'mrkdwn', text: lines.join('\n') } },
  ])
  return { response_type: 'ephemeral', text: 'Posted /setlimit to channel.' }
}

async function handleSlashSetquotaModal(db, token, fleetChannel, weeklyRaw, monthlyRaw, slackUserId) {
  if (!isSlackAdmin(slackUserId)) {
    if (slackAdminIdSet().size === 0) {
      return {
        response_type: 'ephemeral',
        text: 'Admin commands are disabled until `SLACK_ADMIN_USER_IDS` is set in the Functions environment.',
      }
    }
    return { response_type: 'ephemeral', text: 'Admin only.' }
  }
  const w = Number(weeklyRaw)
  const m = Number(monthlyRaw)
  if (!Number.isFinite(w) || w < 0) {
    return { response_type: 'ephemeral', text: 'Weekly target must be a valid non-negative number.' }
  }
  if (!Number.isFinite(m) || m < 0) {
    return { response_type: 'ephemeral', text: 'Monthly target must be a valid non-negative number.' }
  }
  await QUOTA_TARGETS_REF(db).set(
    {
      weeklyTarget: round2(w),
      monthlyTarget: round2(m),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  )
  const lines = [
    '*🎯 Quota targets updated*',
    `*Weekly:* ${formatCurrency(w)}`,
    `*Monthly:* ${formatCurrency(m)}`,
  ]
  await postToFleet(token, fleetChannel, 'Quota targets updated', [
    { type: 'section', text: { type: 'mrkdwn', text: lines.join('\n') } },
  ])
  return { response_type: 'ephemeral', text: 'Posted /setquota to channel.' }
}

async function handleSlashDispatch(db, token, fleetChannel, text, userId) {
  const parts = String(text || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (parts.length < 2) {
    return { response_type: 'ephemeral', text: 'Usage: `/dispatch [order-id] [name]`' }
  }
  const orderId = String(parts[0] || '').trim()
  const nameRaw = String(parts[1] || '').trim()
  const nameKey = nameRaw.toLowerCase()
  if (!DISPATCH_NAMES.includes(nameKey)) {
    return {
      response_type: 'ephemeral',
      text: `Unknown crew name \`${escapeSlackMrkdwn(nameRaw)}\`. Use one of: ${DISPATCH_NAMES.join(', ')}.`,
    }
  }
  const ref = db.collection('orders').doc(orderId)
  const snap = await ref.get()
  if (!snap.exists) {
    return { response_type: 'ephemeral', text: `Order \`${escapeSlackMrkdwn(orderId)}\` not found.` }
  }
  const o = snap.data() || {}
  const tireDesc = String(o.description || o.tireDescription || o.mspn || '—').trim() || '—'
  const cust = String(o.customerName || '—').trim() || '—'
  await ref.update({
    assignedTo: nameKey,
    updatedAt: FieldValue.serverTimestamp(),
    assignedBySlackUserId: String(userId || '').slice(0, 32),
  })
  const lines = [
    '*🚚 Dispatch*',
    `*Order:* \`${escapeSlackMrkdwn(orderId)}\``,
    `*Tire:* ${escapeSlackMrkdwn(tireDesc)}`,
    `*Customer:* ${escapeSlackMrkdwn(cust)}`,
    `*Assigned to:* ${escapeSlackMrkdwn(nameKey)}`,
  ]
  await postToFleet(token, fleetChannel, `Dispatch ${orderId}`, [
    { type: 'section', text: { type: 'mrkdwn', text: lines.join('\n') } },
  ])
  return { response_type: 'ephemeral', text: 'Posted /dispatch to channel.' }
}

/**
 * @returns {Promise<object|null>}
 */
async function tryHandleLookupUtilitySlash(db, token, fleetChannel, form) {
  if (!Array.isArray(SLACK_SECRETS) || SLACK_SECRETS.length < 1) {
    return { response_type: 'ephemeral', text: 'Slack secrets (SLACK_SECRETS) are not configured.' }
  }
  const botToken = SLACK_BOT_TOKEN.value() || String(token || '').trim()
  const ch =
    String(fleetChannel || '').trim() || String(SLACK_CHANNEL_ID.value() || '').trim()
  if (!botToken || !ch) {
    return { response_type: 'ephemeral', text: 'Slack token or channel missing.' }
  }

  const command = String(form.command || '').trim()

  try {
    const tid = String(form.trigger_id || '').trim()
    if (command === '/stock') {
      return await openLookupModal(botToken, tid, buildStockModalView(), 'Opening stock form…')
    }
    if (command === '/margins') {
      return await openLookupModal(botToken, tid, buildMarginsModalView(), 'Opening margins form…')
    }
    if (command === '/pricecheck') {
      return await openLookupModal(botToken, tid, buildPricecheckModalView(), 'Opening price check form…')
    }
    if (command === '/customer') {
      return await openLookupModal(botToken, tid, buildCustomerModalView(), 'Opening customer lookup…')
    }
    if (command === '/note') {
      return await openLookupModal(botToken, tid, buildNoteModalView(), 'Opening order note form…')
    }
    if (command === '/weather') return await handleSlashWeather(botToken, ch)
    if (command === '/quota') {
      return await handleSlashQuota(db, botToken, ch, String(form.text || '').trim())
    }
    if (command === '/hype') return await handleSlashHype(botToken, ch)
    if (command === '/setlimit') {
      return await openLookupModal(botToken, tid, buildSetlimitModalView(), 'Opening set-limit form…')
    }
    if (command === '/setquota') {
      return await openLookupModal(botToken, tid, buildSetquotaModalView(), 'Opening set-quota form…')
    }
    if (command === '/dispatch') {
      return await openLookupModal(botToken, tid, buildDispatchModalView(), 'Opening dispatch form…')
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('lookupUtilitySlash', command, e)
    return { response_type: 'ephemeral', text: `Error: ${escapeSlackMrkdwn(msg)}` }
  }
  return null
}

function lookupViewErrors(r, primaryBlock) {
  const t = String(r?.text || 'Unknown error')
  return { handled: true, kind: 'json', body: { response_action: 'errors', errors: { [primaryBlock]: t.slice(0, 250) } } }
}

function lookupViewClearIfPosted(r) {
  const t = String(r?.text || '')
  if (r?.response_type === 'ephemeral' && (t.startsWith('Posted') || t.includes('Note saved'))) {
    return { handled: true, kind: 'json', body: { response_action: 'clear' } }
  }
  return null
}

function lookupUtilityViewErrorBlockId(callbackId) {
  switch (callbackId) {
    case MODAL_STOCK_SUBMIT:
      return 'stock_modal_mspn'
    case MODAL_MARGINS_SUBMIT:
      return 'margins_modal_mspn'
    case MODAL_PRICECHECK_SUBMIT:
      return 'pricecheck_modal_mspn'
    case MODAL_CUSTOMER_SUBMIT:
      return 'customer_modal_phone'
    case MODAL_NOTE_SUBMIT:
      return 'note_modal_order'
    case MODAL_SETLIMIT_SUBMIT:
      return 'setlimit_modal_amt'
    case MODAL_SETQUOTA_SUBMIT:
      return 'setquota_modal_weekly'
    case MODAL_DISPATCH_SUBMIT:
      return 'dispatch_modal_order'
    default:
      return 'stock_modal_mspn'
  }
}

/**
 * @returns {Promise<{ handled: boolean, kind?: string, body?: object }>}
 */
async function tryHandleLookupUtilityViewSubmission(db, token, envChannel, payload) {
  if (payload.type !== 'view_submission') return { handled: false }
  const cb = payload.view?.callback_id
  const botToken = SLACK_BOT_TOKEN.value() || String(token || '').trim()
  const ch =
    String(envChannel || '').trim() || String(SLACK_CHANNEL_ID.value() || '').trim()
  const view = payload.view
  const userName = String(payload.user?.username || payload.user?.name || 'slack')
  const userId = String(payload.user?.id || '')

  const lookupCbs = new Set([
    MODAL_STOCK_SUBMIT,
    MODAL_MARGINS_SUBMIT,
    MODAL_PRICECHECK_SUBMIT,
    MODAL_CUSTOMER_SUBMIT,
    MODAL_NOTE_SUBMIT,
    MODAL_SETLIMIT_SUBMIT,
    MODAL_SETQUOTA_SUBMIT,
    MODAL_DISPATCH_SUBMIT,
  ])
  if (!lookupCbs.has(cb)) return { handled: false }

  try {
    if (cb === MODAL_STOCK_SUBMIT) {
      const mspn = viewInputValue(view, 'stock_modal_mspn', 'stock_modal_mspn_field')
      const errors = {}
      if (!mspn) errors.stock_modal_mspn = 'Enter an MSPN.'
      if (Object.keys(errors).length) {
        return { handled: true, kind: 'json', body: { response_action: 'errors', errors } }
      }
      const r = await handleSlashStock(db, botToken, ch, mspn)
      const ok = lookupViewClearIfPosted(r)
      return ok || lookupViewErrors(r, 'stock_modal_mspn')
    }
    if (cb === MODAL_MARGINS_SUBMIT) {
      const mspn = viewInputValue(view, 'margins_modal_mspn', 'margins_modal_mspn_field').trim()
      if (!mspn) {
        const r = await handleSlashMarginsCatalogTop(db, botToken, ch)
        const ok = lookupViewClearIfPosted(r)
        return ok || lookupViewErrors(r, 'margins_modal_mspn')
      }
      const tireSnap = await db.collection('tires').doc(mspn).get()
      if (!tireSnap.exists) {
        return {
          handled: true,
          kind: 'json',
          body: {
            response_action: 'errors',
            errors: { margins_modal_mspn: `No tire found for MSPN ${mspn}.` },
          },
        }
      }
      const sale = saleForTargetMarginFraction(tireSnap.data() || {}, 0.25)
      if (!sale) {
        return {
          handled: true,
          kind: 'json',
          body: { response_action: 'errors', errors: { margins_modal_mspn: 'Could not derive a sale price for margin math.' } },
        }
      }
      const r = await handleSlashMargins(db, botToken, ch, `${mspn} ${sale}`)
      const ok = lookupViewClearIfPosted(r)
      return ok || lookupViewErrors(r, 'margins_modal_mspn')
    }
    if (cb === MODAL_PRICECHECK_SUBMIT) {
      const mspn = viewInputValue(view, 'pricecheck_modal_mspn', 'pricecheck_modal_mspn_field')
      if (!mspn) {
        return {
          handled: true,
          kind: 'json',
          body: { response_action: 'errors', errors: { pricecheck_modal_mspn: 'Enter an MSPN.' } },
        }
      }
      const r = await handleSlashPricecheck(db, botToken, ch, mspn)
      const ok = lookupViewClearIfPosted(r)
      return ok || lookupViewErrors(r, 'pricecheck_modal_mspn')
    }
    if (cb === MODAL_CUSTOMER_SUBMIT) {
      const phone = viewInputValue(view, 'customer_modal_phone', 'customer_modal_phone_field')
      if (!phone) {
        return {
          handled: true,
          kind: 'json',
          body: { response_action: 'errors', errors: { customer_modal_phone: 'Enter a phone or name.' } },
        }
      }
      const r = await handleSlashCustomer(db, botToken, ch, phone)
      const ok = lookupViewClearIfPosted(r)
      return ok || lookupViewErrors(r, 'customer_modal_phone')
    }
    if (cb === MODAL_NOTE_SUBMIT) {
      const orderId = viewInputValue(view, 'note_modal_order', 'note_modal_order_field')
      const noteBody = viewInputValue(view, 'note_modal_body', 'note_modal_body_field')
      const errors = {}
      if (!orderId) errors.note_modal_order = 'Enter an order id.'
      if (!noteBody) errors.note_modal_body = 'Enter a note.'
      if (Object.keys(errors).length) {
        return { handled: true, kind: 'json', body: { response_action: 'errors', errors } }
      }
      const r = await handleSlashNote(db, botToken, `${orderId} ${noteBody}`, userName, userId)
      const ok = lookupViewClearIfPosted(r)
      return ok || lookupViewErrors(r, 'note_modal_order')
    }
    if (cb === MODAL_SETLIMIT_SUBMIT) {
      const amt = viewInputValue(view, 'setlimit_modal_amt', 'setlimit_modal_amt_field')
      const r = await handleSlashSetlimit(db, botToken, ch, amt, userId)
      const ok = lookupViewClearIfPosted(r)
      return ok || lookupViewErrors(r, 'setlimit_modal_amt')
    }
    if (cb === MODAL_SETQUOTA_SUBMIT) {
      const weeklyRaw = viewInputValue(view, 'setquota_modal_weekly', 'setquota_modal_weekly_field')
      const monthlyRaw = viewInputValue(view, 'setquota_modal_monthly', 'setquota_modal_monthly_field')
      const errors = {}
      if (!weeklyRaw) errors.setquota_modal_weekly = 'Enter weekly target.'
      if (!monthlyRaw) errors.setquota_modal_monthly = 'Enter monthly target.'
      if (Object.keys(errors).length) {
        return { handled: true, kind: 'json', body: { response_action: 'errors', errors } }
      }
      const r = await handleSlashSetquotaModal(db, botToken, ch, weeklyRaw, monthlyRaw, userId)
      const ok = lookupViewClearIfPosted(r)
      return ok || lookupViewErrors(r, 'setquota_modal_weekly')
    }
    if (cb === MODAL_DISPATCH_SUBMIT) {
      const orderId = viewInputValue(view, 'dispatch_modal_order', 'dispatch_modal_order_field')
      const crew = viewStaticSelectValue(view, 'dispatch_modal_crew', 'dispatch_modal_crew_field')
      const errors = {}
      if (!orderId) errors.dispatch_modal_order = 'Enter an order id.'
      if (!crew) errors.dispatch_modal_crew = 'Select a crew member.'
      if (Object.keys(errors).length) {
        return { handled: true, kind: 'json', body: { response_action: 'errors', errors } }
      }
      const r = await handleSlashDispatch(db, botToken, ch, `${orderId} ${crew}`, userId)
      const ok = lookupViewClearIfPosted(r)
      return ok || lookupViewErrors(r, 'dispatch_modal_order')
    }
  } catch (e) {
    console.error('lookupUtilityViewSubmission', cb, e)
    return {
      handled: true,
      kind: 'json',
      body: viewSubmissionErrorsBody(lookupUtilityViewErrorBlockId(cb), e),
    }
  }

  return { handled: false }
}

module.exports = { tryHandleLookupUtilitySlash, tryHandleLookupUtilityViewSubmission }