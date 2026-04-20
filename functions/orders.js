/**
 * Orders lifecycle, notifications, and sale logging callables.
 * @see ../docs/SKEDADDLE-MASTER.md · ../docs/PHASE2-ORDER-WORKFLOW-HANDOFF.md
 */
const { admin, slackChannelWithSecretFallback, slackApiPost } = require('./_shared')
const { formatCurrency, formatPercent, formatQty } = require('./format')
const { tireCatalogBuyNumber } = require('./tireCatalogBuy')
const { onCall, HttpsError } = require('firebase-functions/v2/https')
const { FieldValue, Timestamp } = require('firebase-admin/firestore')
const {
  SLACK_BOT_TOKEN,
  SLACK_SECRETS,
  LISTING_ADVISOR_SECRETS,
} = require('./slackSecrets')
const { listingAdvisorHandler } = require('./listingAdvisor')
const {
  buildStage1Blocks,
  postOrderCompletionSummary,
  orderFromSnap,
  formatFulfillmentMinutes,
  cancelOrderFromPortal: runPortalOrderCancellation,
} = require('./orderWorkflow')
const {
  minutesBetweenTsAndMs,
  utcDayRangeMs,
  hourInTimeZone,
  round2,
  frictionScoreComplete,
  DEFAULT_TZ,
  e164DocIdFromContact,
} = require('./orderMetrics')
const { incrementDjStreak, applyHatTrick } = require('./orderLifecycle')
const { lastTireLabelForMspn } = require('./contactTireLabel')
const { ensureRepeatCustomerVip } = require('./contactVip')
const { buildTaxPrepCsv } = require('./taxPrepExport')
const { runCompletionTransaction } = require('./financeStats')

const THIRTY_DAYS_MS = 30 * 86_400_000
const FUTURE_SKEW_MS = 60_000
/** Omit `completedAtSource` when the chosen time is within this many ms of `now` ("same-now"). */
const SAME_NOW_MAX_MS = 120_000

/**
 * Pure completion timestamp resolution for `completeOrder` / `sendTireSaleSms`.
 *
 * @internal Exported only for unit tests (non-enumerable so it is not merged into the deployed
 * Cloud Functions entry surface). Do not import outside tests.
 * @param {{ completedAtMs?: unknown }|undefined|null} input
 * @param {number} nowMs
 * @returns {{ completedMs: number, completedAt: Timestamp | null, completedAtSource?: 'backdated' }}
 *   When `completedAt` is null, write `FieldValue.serverTimestamp()` to the order; always use
 *   `completedMs` for minute / revenue math.
 */
function resolveCompletionTimestamp(input, nowMs) {
  if (!Number.isFinite(nowMs)) {
    throw new HttpsError(
      'invalid-argument',
      'Internal clock reference invalid (rule: finite now).',
    )
  }
  const raw = input && typeof input === 'object' ? input.completedAtMs : undefined
  if (raw === undefined || raw === null) {
    return { completedMs: nowMs, completedAt: null }
  }
  const n = typeof raw === 'string' ? Number(raw) : Number(raw)
  if (!Number.isFinite(n)) {
    throw new HttpsError(
      'invalid-argument',
      'completedAtMs must be a finite number (rule: finite number).',
    )
  }
  const completedAtMs = n
  if (completedAtMs > nowMs + FUTURE_SKEW_MS) {
    throw new HttpsError(
      'invalid-argument',
      'completedAtMs must not be more than one minute in the future (rule: future skew).',
    )
  }
  if (completedAtMs < nowMs - THIRTY_DAYS_MS) {
    throw new HttpsError(
      'invalid-argument',
      'completedAtMs must be within the last 30 days (rule: minimum window).',
    )
  }
  const completedAt = Timestamp.fromMillis(completedAtMs)
  /** @type {{ completedMs: number, completedAt: Timestamp, completedAtSource?: 'backdated' }} */
  const out = { completedMs: completedAtMs, completedAt }
  if (nowMs - completedAtMs > SAME_NOW_MAX_MS) {
    out.completedAtSource = 'backdated'
  }
  return out
}

function formatSaleMessage(d) {
  const notes = [d.fulfillmentNotes, d.additionalNotes]
    .filter(Boolean)
    .join(' | ')

  return [
    '🛞 TIRE SALE - Action Required',
    '',
    `SKU: ${d.mspn}`,
    `Qty: ${formatQty(d.quantity)}`,
    `Price: ${formatCurrency(Number(d.pricePerTire))} each / ${formatCurrency(Number(d.totalPrice))} total`,
    '',
    `Customer: ${d.customerName}`,
    `Contact: ${d.customerContact}`,
    `Fulfillment: ${d.fulfillment}`,
    `Notes: ${notes || '—'}`,
    '',
    '— Skedaddle Portal',
  ].join('\n')
}

async function postWebhook(url, message, style) {
  const s = (style || 'slack').toLowerCase()
  let body
  if (s === 'slack') {
    body = JSON.stringify({ text: message })
  } else if (s === 'generic') {
    body = JSON.stringify({ message, text: message })
  } else {
    body = JSON.stringify({ content: message.slice(0, 2000) })
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  })

  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new Error(`Webhook ${res.status}: ${t || res.statusText}`)
  }
}

async function notifyTeamWebhook(message) {
  const style = process.env.NOTIFY_WEBHOOK_STYLE || 'slack'
  const urls = [
    process.env.NOTIFY_WEBHOOK_URL,
    process.env.NOTIFY_WEBHOOK_URL_2,
  ].filter(Boolean)

  if (urls.length === 0) {
    throw new HttpsError(
      'failed-precondition',
      'No NOTIFY_WEBHOOK_URL configured, and SLACK_BOT_TOKEN is not set. Configure one of them in functions/.env.',
    )
  }

  await Promise.all(urls.map((u) => postWebhook(u, message, style)))
}

/**
 * Creates `orders/{id}`, posts Stage 1 Block Kit, stores slack ts + channel on the doc.
 * @param {{ token: string, channel: string }} slack
 */
async function notifyTeamSlackBot(db, d, slack) {
  const { token, channel } = slack

  if (!token) {
    throw new HttpsError(
      'failed-precondition',
      'SLACK_BOT_TOKEN is not set. Bind Secret Manager SLACK_BOT_TOKEN to sendTireSaleSms or set legacy env.',
    )
  }

  const fulfillmentLc =
    String(d.fulfillment).toLowerCase() === 'pickup' ? 'pickup' : 'delivery'

  const orderRef = db.collection('orders').doc()
  const orderId = orderRef.id

  const initialOrder = {
    status: 'pending',
    mspn: d.mspn,
    quantity: d.quantity,
    pricePerTire: d.pricePerTire,
    totalPrice: d.totalPrice,
    customerName: d.customerName,
    customerContact: d.customerContact,
    fulfillment: fulfillmentLc,
    fulfillmentNotes: d.fulfillmentNotes || '',
    additionalNotes: d.additionalNotes || '',
    assignedTo: '',
    assignedRole: 'mechanic',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    slackMessageTs: '',
    slackChannelId: '',
  }
  if (Number.isFinite(Number(d.logSaleCompletedAtMs))) {
    initialOrder.logSaleCompletedAtMs = Number(d.logSaleCompletedAtMs)
  }
  await orderRef.set(initialOrder)

  const fallback = formatSaleMessage(d)
  const blocks = buildStage1Blocks(orderId, d)

  const post = await slackApiPost(token, 'chat.postMessage', {
    channel,
    text: fallback,
    blocks,
  })

  await orderRef.update({
    slackMessageTs: post.ts || '',
    slackChannelId: post.channel || channel,
    updatedAt: FieldValue.serverTimestamp(),
  })

  try {
    const tireSnap = await db.collection('tires').doc(d.mspn).get()
    if (tireSnap.exists) {
      const td = tireSnap.data() || {}
      const catalogBuy = tireCatalogBuyNumber(td)
      const ppt = Number(d.pricePerTire)
      if (Number.isFinite(catalogBuy) && catalogBuy > 0 && Number.isFinite(ppt)) {
        const discount = (catalogBuy - ppt) / catalogBuy
        if (discount > 0.4) {
          const pct = Math.round(discount * 100)
          await orderRef.update({
            pricingAnomaly: true,
            pricingAnomalyPct: pct,
            updatedAt: FieldValue.serverTimestamp(),
          })
          await slackApiPost(token, 'chat.postMessage', {
            channel,
            text: `⚠️ Pricing check — Order ${orderId}: ${formatCurrency(ppt)}/tire is ${formatPercent(pct, 0)} below catalog buy (${formatCurrency(catalogBuy)}). Intentional?`,
          })
        }
      }
    }
  } catch (e) {
    console.error('notifyTeamSlackBot pricing anomaly', e)
  }

  return { orderId, channel: post.channel, ts: post.ts }
}

exports.sendTireSaleSms = onCall({ secrets: SLACK_SECRETS }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.')
  }

  const data = request.data || {}
  const mspn = String(data.mspn || '').trim()
  const quantity = Number(data.quantity)
  const pricePerTire = Number(data.pricePerTire)
  const totalPrice = Number(data.totalPrice)
  const fulfillment = data.fulfillment

  if (!mspn) {
    throw new HttpsError('invalid-argument', 'mspn is required.')
  }
  if (!Number.isFinite(quantity) || quantity < 1) {
    throw new HttpsError('invalid-argument', 'quantity must be at least 1.')
  }
  if (!Number.isFinite(pricePerTire) || pricePerTire < 0) {
    throw new HttpsError('invalid-argument', 'pricePerTire is invalid.')
  }
  if (!Number.isFinite(totalPrice) || totalPrice < 0) {
    throw new HttpsError('invalid-argument', 'totalPrice is invalid.')
  }
  if (fulfillment !== 'Pickup' && fulfillment !== 'Delivery') {
    throw new HttpsError('invalid-argument', 'fulfillment must be Pickup or Delivery.')
  }

  const sale = {
    mspn,
    quantity,
    pricePerTire,
    totalPrice,
    customerName: String(data.customerName || '').trim() || '—',
    customerContact: String(data.customerContact || '').trim() || '—',
    fulfillment,
    fulfillmentNotes: String(data.fulfillmentNotes || '').trim(),
    additionalNotes: String(data.additionalNotes || '').trim(),
  }
  if (
    Object.prototype.hasOwnProperty.call(data, 'completedAtMs') &&
    data.completedAtMs != null
  ) {
    const r = resolveCompletionTimestamp({ completedAtMs: data.completedAtMs }, Date.now())
    sale.logSaleCompletedAtMs = r.completedMs
  }

  const db = admin.firestore()

  try {
    const botToken = SLACK_BOT_TOKEN.value()
    if (botToken) {
      const channel = slackChannelWithSecretFallback()
      const { orderId } = await notifyTeamSlackBot(db, sale, {
        token: botToken,
        channel,
      })
      return { ok: true, mode: 'slack_bot', orderId }
    }
    await notifyTeamWebhook(formatSaleMessage(sale))
    return { ok: true, mode: 'webhook' }
  } catch (e) {
    if (e instanceof HttpsError) throw e
    const msg = e instanceof Error ? e.message : String(e)
    throw new HttpsError('internal', `Notify failed: ${msg}`)
  }
})

/** Tire availability ping — Block Kit, no order doc (Phase 9). */
/** AI listing copy + sell probability + recommended price (Gemini or Anthropic). */
exports.listingAdvisor = onCall({ secrets: LISTING_ADVISOR_SECRETS }, async (request) => {
  return listingAdvisorHandler(request)
})

exports.notifyTeamQuick = onCall({ secrets: SLACK_SECRETS }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.')
  }
  const db = admin.firestore()
  const uSnap = await db.collection('users').doc(request.auth.uid).get()
  const tiresPerm = uSnap.exists ? String(uSnap.data()?.permissions?.tires || 'none') : 'none'
  if (!['view', 'edit'].includes(tiresPerm)) {
    throw new HttpsError('permission-denied', 'Tires catalog access required.')
  }
  const data = request.data || {}
  const mspn = String(data.mspn || '').trim()
  const quantity = Number(data.quantity) || 1
  const description = String(data.description || '').trim()
  if (!mspn) {
    throw new HttpsError('invalid-argument', 'mspn is required.')
  }
  const token = SLACK_BOT_TOKEN.value()
  if (!token) {
    throw new HttpsError('failed-precondition', 'SLACK_BOT_TOKEN is not configured.')
  }
  const channel = slackChannelWithSecretFallback()
  const portalBase = (process.env.PORTAL_BASE_URL || 'https://www.skedaddleinc.com').replace(
    /\/$/,
    '',
  )
  const tiresUrl = `${portalBase}/tires`
  const text = `Tire availability: ${mspn} × ${formatQty(quantity)}${description ? ` — ${description}` : ''}`
  const blocks = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*🔔 Tire availability*\n*MSPN:* \`${mspn}\`\n*Qty:* ${formatQty(quantity)}\n*Description:* ${description || '—'}`,
      },
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Interested?' },
          url: tiresUrl,
          action_id: 'open_portal_tires',
        },
      ],
    },
  ]
  await slackApiPost(token, 'chat.postMessage', { channel, text, blocks })
  return { ok: true }
})

/**
 * Mark order completed + post summary to Slack (#fleet-ops).
 */
exports.completeOrder = onCall({ secrets: SLACK_SECRETS }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.')
  }

  const data = request.data || {}
  const orderId = String(data.orderId || '').trim()
  const paymentReceived = Boolean(data.paymentReceived)
  // paymentAmount = total dollars the customer paid for the order (defaults to order.totalPrice = quantity × sale pricePerTire from Sale Messenger). The portal never adds tire FET on top of that total in code—so this is the whole recorded sale; infer whether FET is included only from how ops uses “Price / tire” (all-in vs pre-FET). Margin vs Kyle: subtract (buy + tire FET) × qty and CTS from this total only if your sale figure is defined the same way.
  const paymentAmount = Number(data.paymentAmount)

  if (!orderId) {
    throw new HttpsError('invalid-argument', 'orderId is required.')
  }
  if (!Number.isFinite(paymentAmount) || paymentAmount < 0) {
    throw new HttpsError('invalid-argument', 'paymentAmount is invalid.')
  }

  const token = SLACK_BOT_TOKEN.value()
  if (!token) {
    throw new HttpsError('failed-precondition', 'SLACK_BOT_TOKEN is not configured.')
  }

  const db = admin.firestore()
  const ref = db.collection('orders').doc(orderId)
  const snap = await ref.get()
  if (!snap.exists) {
    throw new HttpsError('not-found', 'Order not found.')
  }

  const before = orderFromSnap(snap)
  if (before.status !== 'in_transit') {
    throw new HttpsError('failed-precondition', 'Order must be in_transit to complete.')
  }
  if (!before.customerNotifiedAt) {
    throw new HttpsError(
      'failed-precondition',
      'Notify the customer from the portal before marking complete.',
    )
  }

  const nowMs = Date.now()
  const tsInput = {}
  if (
    Object.prototype.hasOwnProperty.call(data, 'completedAtMs') &&
    data.completedAtMs != null
  ) {
    tsInput.completedAtMs = data.completedAtMs
  } else if (
    before.logSaleCompletedAtMs != null &&
    Number.isFinite(Number(before.logSaleCompletedAtMs))
  ) {
    tsInput.completedAtMs = Number(before.logSaleCompletedAtMs)
  }
  const resolvedTs = resolveCompletionTimestamp(
    Object.keys(tsInput).length ? tsInput : undefined,
    nowMs,
  )
  const completedMs = resolvedTs.completedMs
  const createdAt = before.createdAt
  const djPossessionAt = before.djPossessionAt
  const firstNotifiedAt = before.firstNotifiedAt

  const totalFulfillmentMinutes = minutesBetweenTsAndMs(createdAt, completedMs) ?? 0
  const inTransitToCompleteMinutes =
    minutesBetweenTsAndMs(djPossessionAt, completedMs) ?? 0
  const notifyToCompleteMinutes =
    minutesBetweenTsAndMs(firstNotifiedAt, completedMs) ?? 0

  const pokeCount = Number(before.pokeCount) || 0
  const convertedAfterPoke = pokeCount >= 1

  const revenuePerMinute =
    totalFulfillmentMinutes > 0
      ? round2(paymentAmount / totalFulfillmentMinutes)
      : 0

  const createdMs = createdAt?.toMillis?.() ?? completedMs
  const h = hourInTimeZone(createdMs, DEFAULT_TZ)
  const createdAfterHours = h < 7 || h > 20

  const frictionScore = frictionScoreComplete(pokeCount, notifyToCompleteMinutes)

  let firstSaleOfDay = false
  if (createdAt) {
    const { start, end } = utcDayRangeMs(createdMs)
    const firstQ = await db
      .collection('orders')
      .where('createdAt', '>=', Timestamp.fromMillis(start))
      .where('createdAt', '<', Timestamp.fromMillis(end))
      .orderBy('createdAt', 'asc')
      .limit(1)
      .get()
    if (!firstQ.empty && firstQ.docs[0].id === orderId) {
      firstSaleOfDay = true
    }
  }

  const completedAt =
    resolvedTs.completedAt != null ? resolvedTs.completedAt : FieldValue.serverTimestamp()
  const phoneKey = e164DocIdFromContact(before.customerContact)
  const completionPatch = {
    status: 'completed',
    completedAt,
    paymentReceived,
    paymentAmount,
    fulfillmentTimeMinutes: totalFulfillmentMinutes,
    totalFulfillmentMinutes,
    inTransitToCompleteMinutes,
    notifyToCompleteMinutes,
    convertedAfterPoke,
    revenuePerMinute,
    firstSaleOfDay,
    createdAfterHours,
    frictionScore,
    handledBy: { supplier: 'Kyle', mechanic: 'DJ' },
    updatedAt: FieldValue.serverTimestamp(),
  }
  if (resolvedTs.completedAtSource === 'backdated') {
    completionPatch.completedAtSource = 'backdated'
  }
  if (phoneKey) {
    completionPatch.contactPhoneKey = phoneKey
  }
  try {
    await runCompletionTransaction(db, {
      orderRef: ref,
      completionPatch,
      paymentAmount,
      completedMs,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg === 'ORDER_NOT_IN_TRANSIT') {
      throw new HttpsError('failed-precondition', 'Order must be in_transit to complete.')
    }
    if (msg === 'Order not found.') {
      throw new HttpsError('not-found', 'Order not found.')
    }
    console.error('completeOrder transaction', e)
    throw new HttpsError('internal', `Completion failed: ${msg}`)
  }

  if (phoneKey) {
    try {
      const lastTireLabel = await lastTireLabelForMspn(db, String(before.mspn || ''))
      await db
        .collection('contacts')
        .doc(phoneKey)
        .set(
          {
            phoneNumber: phoneKey,
            name: String(before.customerName || '').trim() || '—',
            lastOrderAt: FieldValue.serverTimestamp(),
            lastMspn: String(before.mspn || ''),
            lastTireLabel,
            orderCount: FieldValue.increment(1),
            totalSpend: FieldValue.increment(paymentAmount),
          },
          { merge: true },
        )
    } catch (e) {
      console.error('completeOrder contacts upsert', e)
    }
    try {
      await ensureRepeatCustomerVip(db, phoneKey)
    } catch (e) {
      console.error('completeOrder VIP flag', e)
    }
    try {
      const { linkCompletedOrderToCrmAccounts } = require('./crmLinkOrders')
      await linkCompletedOrderToCrmAccounts(db, {
        orderId,
        customerContact: before.customerContact,
        contactPhoneKey: phoneKey,
      })
    } catch (e) {
      console.error('completeOrder crm link', e)
    }
  }

  await incrementDjStreak(db)

  try {
    await applyHatTrick(db, token, slackChannelWithSecretFallback(), completedMs)
  } catch (e) {
    console.error('completeOrder: hat trick', e)
  }

  const afterSnap = await ref.get()
  const order = orderFromSnap(afterSnap)
  const portalBase =
    process.env.PORTAL_BASE_URL || 'https://www.skedaddleinc.com'

  try {
    await postOrderCompletionSummary(
      token,
      slackChannelWithSecretFallback(),
      order,
      portalBase,
    )
  } catch (e) {
    console.error('completeOrder: Slack summary failed', e)
  }

  return {
    ok: true,
    orderId,
    fulfillmentTimeMinutes: totalFulfillmentMinutes,
    fulfillmentTimeLabel: formatFulfillmentMinutes(totalFulfillmentMinutes),
  }
})

exports.cancelOrderFromPortal = onCall({ secrets: SLACK_SECRETS }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.')
  }
  const data = request.data || {}
  const orderId = String(data.orderId || '').trim()
  const disposition = String(data.disposition || '').trim()
  const cancellationNote = String(data.cancellationNote || '').trim()
  if (!orderId) {
    throw new HttpsError('invalid-argument', 'orderId is required.')
  }
  const db = admin.firestore()
  const token = SLACK_BOT_TOKEN.value() || ''
  const channel = slackChannelWithSecretFallback()
  try {
    await runPortalOrderCancellation(
      db,
      token,
      channel,
      orderId,
      disposition,
      cancellationNote,
    )
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg === 'Order not found.') {
      throw new HttpsError('not-found', msg)
    }
    throw new HttpsError('failed-precondition', msg)
  }
})

/** Admin-only: completed orders in a Denver calendar range as tax-prep CSV (plain numbers). */
exports.exportTaxPrepCsv = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.')
  }
  const db = admin.firestore()
  const u = await db.collection('users').doc(request.auth.uid).get()
  if (!u.exists || String(u.get('role') || '') !== 'admin') {
    throw new HttpsError('permission-denied', 'Admin only.')
  }
  const data = request.data || {}
  const startYmd = String(data.startYmd || '').trim()
  const endYmd = String(data.endYmd || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startYmd) || !/^\d{4}-\d{2}-\d{2}$/.test(endYmd)) {
    throw new HttpsError('invalid-argument', 'startYmd and endYmd must be YYYY-MM-DD (Denver calendar).')
  }
  if (startYmd > endYmd) {
    throw new HttpsError('invalid-argument', 'Start date must be on or before end date.')
  }
  try {
    const csv = await buildTaxPrepCsv(db, { startYmd, endYmd })
    return {
      csv,
      fileName: `tax-prep-orders-${startYmd}_to_${endYmd}.csv`,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new HttpsError('invalid-argument', msg)
  }
})

exports.createProspectiveOrder = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.')
  }
  const data = request.data || {}
  const mspn = String(data.mspn || '').trim()
  const quantity = Number(data.quantity)
  const pricePerTire = Number(data.pricePerTire)
  const totalPrice = Number(data.totalPrice)
  if (!mspn) {
    throw new HttpsError('invalid-argument', 'mspn is required.')
  }
  if (!Number.isFinite(quantity) || quantity < 1) {
    throw new HttpsError('invalid-argument', 'quantity must be at least 1.')
  }
  if (!Number.isFinite(pricePerTire) || pricePerTire < 0) {
    throw new HttpsError('invalid-argument', 'pricePerTire is invalid.')
  }
  if (!Number.isFinite(totalPrice) || totalPrice < 0) {
    throw new HttpsError('invalid-argument', 'totalPrice is invalid.')
  }
  const db = admin.firestore()
  const orderRef = db.collection('orders').doc()
  await orderRef.set({
    status: 'prospective',
    mspn,
    quantity,
    pricePerTire,
    totalPrice,
    customerName: '',
    customerContact: '',
    fulfillment: 'pickup',
    fulfillmentNotes: 'Prospective · catalog pipeline',
    additionalNotes: '',
    assignedTo: '',
    assignedRole: 'mechanic',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    slackMessageTs: '',
    slackChannelId: '',
    createdByUid: request.auth.uid,
  })
  return { ok: true, orderId: orderRef.id }
})

Object.defineProperty(module.exports, 'resolveCompletionTimestamp', {
  enumerable: false,
  configurable: false,
  writable: false,
  value: resolveCompletionTimestamp,
})
