/**
 * Gen2 functions — env via process.env (see functions/.env.example).
 * @see docs/SKEDADDLE-MASTER.md · docs/PHASE2-ORDER-WORKFLOW-HANDOFF.md
 */
const crypto = require('crypto')
const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https')
const { onSchedule } = require('firebase-functions/v2/scheduler')
const { setGlobalOptions } = require('firebase-functions/v2')
const admin = require('firebase-admin')
const { FieldValue, Timestamp } = require('firebase-admin/firestore')
const {
  buildStage1Blocks,
  handleSlackPayload,
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
const { handleCreditSlashCommand } = require('./creditTrackerSlack')
const {
  checkAccessExpiryRun,
  processElevationRevertsRun,
} = require('./peopleScheduled')
const { deadStockRadarRun, morningBriefRun } = require('./phase5Scheduled')
const { crmStaleCheckRun } = require('./crmStaleCheck')
const { crmAccountTrigger } = require('./crmAccountTrigger')
const { crmJobTrigger } = require('./crmJobTrigger')
const { submitMechanicIntake } = require('./mechanicIntake')

admin.initializeApp()

setGlobalOptions({ region: 'us-central1' })

function formatSaleMessage(d) {
  const notes = [d.fulfillmentNotes, d.additionalNotes]
    .filter(Boolean)
    .join(' | ')

  return [
    '🛞 TIRE SALE - Action Required',
    '',
    `SKU: ${d.mspn}`,
    `Qty: ${d.quantity}`,
    `Price: $${Number(d.pricePerTire).toFixed(2)} each / $${Number(d.totalPrice).toFixed(2)} total`,
    '',
    `Customer: ${d.customerName}`,
    `Contact: ${d.customerContact}`,
    `Fulfillment: ${d.fulfillment}`,
    `Notes: ${notes || '—'}`,
    '',
    '— Skedaddle Portal',
  ].join('\n')
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
    throw new Error(json.error || `Slack API ${method} failed`)
  }
  return json
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

function slackChannelEnv() {
  return (
    process.env.SLACK_CHANNEL_ID ||
    process.env.SLACK_NOTIFY_CHANNEL ||
    '#fleet-ops'
  )
}

/**
 * Creates `orders/{id}`, posts Stage 1 Block Kit, stores slack ts + channel on the doc.
 */
async function notifyTeamSlackBot(db, d) {
  const token = process.env.SLACK_BOT_TOKEN
  const channel = slackChannelEnv()

  if (!token) {
    throw new HttpsError(
      'failed-precondition',
      'SLACK_BOT_TOKEN is not set. Add it to functions/.env for Block Kit + workflow.',
    )
  }

  const fulfillmentLc =
    String(d.fulfillment).toLowerCase() === 'pickup' ? 'pickup' : 'delivery'

  const orderRef = db.collection('orders').doc()
  const orderId = orderRef.id

  await orderRef.set({
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
  })

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
      const catalogBuy = Number(td.price ?? td.cost ?? td.retailPrice)
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
            text: `⚠️ Pricing check — Order ${orderId}: $${ppt.toFixed(2)}/tire is ${pct}% below catalog buy ($${catalogBuy.toFixed(2)}). Intentional?`,
          })
        }
      }
    }
  } catch (e) {
    console.error('notifyTeamSlackBot pricing anomaly', e)
  }

  return { orderId, channel: post.channel, ts: post.ts }
}

function verifySlackSignature(signingSecret, rawBody, slackSignature, slackRequestTimestamp) {
  if (!signingSecret || !slackSignature || !slackRequestTimestamp) return false
  const ts = Number(slackRequestTimestamp)
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 60 * 5) {
    return false
  }
  const sigBasestring = `v0:${slackRequestTimestamp}:${rawBody}`
  const hmac = crypto.createHmac('sha256', signingSecret)
  hmac.update(sigBasestring, 'utf8')
  const mySig = `v0=${hmac.digest('hex')}`
  try {
    return crypto.timingSafeEqual(Buffer.from(mySig, 'utf8'), Buffer.from(slackSignature, 'utf8'))
  } catch {
    return false
  }
}

/** Kept name for existing clients; Slack notify (Block Kit + bot, or webhook fallback). */
exports.sendTireSaleSms = onCall(async (request) => {
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

  const db = admin.firestore()

  try {
    if (process.env.SLACK_BOT_TOKEN) {
      const { orderId } = await notifyTeamSlackBot(db, sale)
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
exports.notifyTeamQuick = onCall(async (request) => {
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
  const token = process.env.SLACK_BOT_TOKEN
  if (!token) {
    throw new HttpsError('failed-precondition', 'SLACK_BOT_TOKEN is not configured.')
  }
  const channel = slackChannelEnv()
  const portalBase = (process.env.PORTAL_BASE_URL || 'https://www.skedaddleinc.com').replace(
    /\/$/,
    '',
  )
  const tiresUrl = `${portalBase}/tires`
  const text = `Tire availability: ${mspn} × ${quantity}${description ? ` — ${description}` : ''}`
  const blocks = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*🔔 Tire availability*\n*MSPN:* \`${mspn}\`\n*Qty:* ${quantity}\n*Description:* ${description || '—'}`,
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
exports.completeOrder = onCall(async (request) => {
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

  const token = process.env.SLACK_BOT_TOKEN
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

  const completedMs = Date.now()
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

  const completedAt = FieldValue.serverTimestamp()
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
  if (phoneKey) {
    completionPatch.contactPhoneKey = phoneKey
  }
  await ref.update(completionPatch)

  if (phoneKey) {
    try {
      await db
        .collection('contacts')
        .doc(phoneKey)
        .set(
          {
            phoneNumber: phoneKey,
            name: String(before.customerName || '').trim() || '—',
            lastOrderAt: FieldValue.serverTimestamp(),
            lastMspn: String(before.mspn || ''),
            orderCount: FieldValue.increment(1),
            totalSpend: FieldValue.increment(paymentAmount),
          },
          { merge: true },
        )
    } catch (e) {
      console.error('completeOrder contacts upsert', e)
    }
  }

  await incrementDjStreak(db)

  try {
    await applyHatTrick(db, token, slackChannelEnv(), completedMs)
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
      slackChannelEnv(),
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

exports.cancelOrderFromPortal = onCall(async (request) => {
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
  const token = process.env.SLACK_BOT_TOKEN || ''
  const channel = slackChannelEnv()
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

const {
  ensureUserDocument,
  createPortalUser,
  updatePortalUser,
  scheduleElevationRevert,
} = require('./peopleCallables')

exports.ensureUserDocument = ensureUserDocument
exports.createPortalUser = createPortalUser
exports.updatePortalUser = updatePortalUser
exports.scheduleElevationRevert = scheduleElevationRevert

const inviteFlow = require('./inviteFlow')
exports.resolveInvite = inviteFlow.resolveInvite
exports.getInviteGreeting = inviteFlow.getInviteGreeting
exports.previewInviteGreeting = inviteFlow.previewInviteGreeting
exports.sendInviteRegistrationCode = inviteFlow.sendInviteRegistrationCode
exports.completeInviteRegistration = inviteFlow.completeInviteRegistration
exports.recordLogin = inviteFlow.recordLogin

/** Midnight Mountain Standard Time ≈ 07:00 UTC — lock users past accessExpiry. */
exports.checkAccessExpiry = onSchedule(
  {
    schedule: '0 7 * * *',
    timeZone: 'Etc/UTC',
    region: 'us-central1',
  },
  async () => {
    await checkAccessExpiryRun()
  },
)

/** Revert timed permission elevations after expiresAt. */
exports.processElevationReverts = onSchedule(
  {
    schedule: '0 * * * *',
    timeZone: 'Etc/UTC',
    region: 'us-central1',
  },
  async () => {
    await processElevationRevertsRun()
  },
)

/** Monday 13:00 UTC ≈ 6:00 AM MT — dead stock flags on tires (90-day order activity). */
exports.deadStockRadar = onSchedule(
  {
    schedule: '0 13 * * 1',
    timeZone: 'Etc/UTC',
    region: 'us-central1',
  },
  async () => {
    await deadStockRadarRun()
  },
)

/** Weekdays 14:00 UTC ≈ 7:00 AM MT — morning digest to #fleet-ops. */
exports.morningBrief = onSchedule(
  {
    schedule: '0 14 * * 1-5',
    timeZone: 'Etc/UTC',
    region: 'us-central1',
  },
  async () => {
    await morningBriefRun()
  },
)

/** Daily 14:00 UTC ≈ 8:00 AM MT — stale CRM accounts. */
exports.crmStaleCheck = onSchedule(
  {
    schedule: '0 14 * * *',
    timeZone: 'Etc/UTC',
    region: 'us-central1',
  },
  async () => {
    await crmStaleCheckRun()
  },
)

exports.crmAccountTrigger = crmAccountTrigger
exports.crmJobTrigger = crmJobTrigger
exports.submitMechanicIntake = submitMechanicIntake

/**
 * Slack Interactivity — block_actions + view_submission.
 * https://us-central1-skedaddle-inventory.cloudfunctions.net/slackActions
 */
exports.slackActions = onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed')
    return
  }

  const signingSecret = process.env.SLACK_SIGNING_SECRET
  if (!signingSecret) {
    console.error('slackActions: SLACK_SIGNING_SECRET not configured')
    res.status(500).send('Server misconfiguration')
    return
  }

  const rawBody =
    req.rawBody != null
      ? req.rawBody.toString('utf8')
      : typeof req.body === 'string'
        ? req.body
        : ''

  if (!rawBody) {
    res.status(400).send('Empty body')
    return
  }

  const slackSig = req.get('X-Slack-Signature')
  const slackTs = req.get('X-Slack-Request-Timestamp')
  if (!verifySlackSignature(signingSecret, rawBody, slackSig, slackTs)) {
    res.status(401).send('Invalid signature')
    return
  }

  let payload
  const params = new URLSearchParams(rawBody)
  const payloadStr = params.get('payload')

  const token = process.env.SLACK_BOT_TOKEN
  if (!token) {
    res.status(500).send('SLACK_BOT_TOKEN not configured')
    return
  }

  const db = admin.firestore()
  const envChannel = slackChannelEnv()

  if (!payloadStr) {
    const cmd = params.get('command')
    if (cmd) {
      try {
        const form = Object.fromEntries(params.entries())
        const slashBody = await handleCreditSlashCommand(db, token, envChannel, form)
        if (slashBody) {
          res.setHeader('Content-Type', 'application/json')
          res.status(200).send(JSON.stringify(slashBody))
          return
        }
      } catch (e) {
        console.error('slackActions slash', e)
      }
      res.status(200).send('')
      return
    }
    res.status(400).send('Missing payload')
    return
  }

  try {
    payload = JSON.parse(payloadStr)
  } catch (e) {
    console.error('slackActions: bad payload', e)
    res.status(400).send('Bad payload')
    return
  }

  try {
    const result = await handleSlackPayload(db, token, envChannel, payload)
    if (result.kind === 'json') {
      res.setHeader('Content-Type', 'application/json')
      res.status(200).send(JSON.stringify(result.body))
      return
    }
    res.status(200).send('')
  } catch (e) {
    console.error('slackActions:', e)
    if (payload?.type === 'view_submission') {
      res.setHeader('Content-Type', 'application/json')
      res.status(200).send(JSON.stringify({ response_action: 'clear' }))
      return
    }
    res.status(200).send('')
  }
})
