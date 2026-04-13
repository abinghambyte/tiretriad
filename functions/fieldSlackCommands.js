/**
 * Field ops Slack slash commands — on my way, done, my orders, SMS.
 */
const { FieldValue, Timestamp } = require('firebase-admin/firestore')
const { formatCurrency, formatPercent, formatQty } = require('./format')
const { SLACK_SECRETS, SLACK_BOT_TOKEN, SLACK_CHANNEL_ID } = require('./slackSecrets')
/** Lazy require breaks `orderWorkflow` → `creditTrackerSlack` → this module → `orderWorkflow`. */
function orderWorkflowMod() {
  return require('./orderWorkflow')
}
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
const { runCompletionTransaction, computePoolDollars } = require('./financeStats')
const { sendSinchSms, normalizeToE164 } = require('./sinchSms')
const { lastTireLabelForMspn } = require('./contactTireLabel')
const { denverYmd, parseWindowToHourRange } = require('./scheduleAvailability')

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

function buildOnMyWaySmsBody(order) {
  const name = String(order.customerName || 'there').trim() || 'there'
  return `Hey ${name}, we're on the way with your tires. See you soon. — Skedaddle`
}

function buildAppointmentConfirmBody(order) {
  const name = String(order.customerName || 'there').trim() || 'there'
  const when = String(
    order.scheduledWindow || order.fulfillmentScheduledTime || order.scheduledTime || 'your scheduled time',
  ).trim()
  return `Hey ${name}, confirming your tire appointment for ${when}. Reply if you need to reschedule. — Skedaddle`
}

async function appendCommsLog(db, orderRef, entry) {
  await orderRef.update({
    commsLog: FieldValue.arrayUnion(entry),
    updatedAt: FieldValue.serverTimestamp(),
  })
}

async function resolveDispatchHandleForSlack(db, slackUserId) {
  const sid = String(slackUserId || '').trim()
  if (!sid) return null
  const uSnap = await db.collection('users').where('slackUserId', '==', sid).limit(1).get()
  if (!uSnap.empty) {
    const d = uSnap.docs[0].data() || {}
    const handle = String(d.dispatchHandle || '').trim().toLowerCase()
    if (handle) {
      return {
        handle,
        label: `${String(d.firstName || '').trim()} ${String(d.lastName || '').trim()}`.trim() || handle,
      }
    }
  }
  const ss = await db.collection('meta').doc('scheduleSettings').get()
  const s = ss.exists ? ss.data() || {} : {}
  const djSid = String(s.djSlackUserId || '').trim()
  if (djSid && djSid === sid) {
    return { handle: 'dj', label: 'DJ' }
  }
  return null
}

async function handleOnMyWay(db, token, fleetChannel, text) {
  const parts = splitCommandText(text)
  if (!parts[0]) {
    return { response_type: 'ephemeral', text: 'Usage: `/onmyway [order-id]`' }
  }
  const orderId = parts[0]
  const ref = db.collection('orders').doc(orderId)
  const snap = await ref.get()
  if (!snap.exists) {
    return { response_type: 'ephemeral', text: 'Order not found.' }
  }
  const o = orderWorkflowMod().orderFromSnap(snap)
  const st = String(o.status || '').toLowerCase().replace(/\s/g, '_')
  const now = Date.now()
  if (st === 'scheduled') {
    const djAck = snap.get('djAcknowledgedAt')
    const schedToTransit = minutesBetweenTsAndMs(djAck, now)
    await ref.update({
      status: 'in_transit',
      djPossessionAt: FieldValue.serverTimestamp(),
      scheduledToInTransitMinutes: schedToTransit,
      onMyWayAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })
  } else if (st === 'in_transit') {
    await ref.update({
      onMyWayAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })
  } else {
    return {
      response_type: 'ephemeral',
      text: 'Order must be scheduled or already in transit to use /onmyway.',
    }
  }

  const after = orderWorkflowMod().orderFromSnap(await ref.get())
  const body = buildOnMyWaySmsBody(after)
  try {
    await sendSinchSms({ to: after.customerContact, body })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { response_type: 'ephemeral', text: `Could not send SMS: ${escapeSlackMrkdwn(msg)}` }
  }

  await appendCommsLog(db, ref, {
    at: Timestamp.now(),
    kind: 'on_my_way',
    text: body,
    slackChannel: 'sinch',
  })

  try {
    await orderWorkflowMod().refreshSlackMessage(db, token, fleetChannel, orderId)
  } catch (e) {
    console.error('onmyway refreshSlackMessage', e)
  }

  const addr = [after.fulfillmentNotes, after.additionalNotes].filter(Boolean).join(' · ') || '—'
  const lines = [
    '*🚐 On my way*',
    `*Order:* \`${escapeSlackMrkdwn(orderId)}\``,
    `*Customer:* ${escapeSlackMrkdwn(after.customerName || '—')}`,
    `*Address / notes:* ${escapeSlackMrkdwn(addr)}`,
    `*To:* ${escapeSlackMrkdwn(normalizeToE164(after.customerContact) || '—')}`,
  ]
  await postToFleet(token, fleetChannel, `On my way ${orderId}`, [
    { type: 'section', text: { type: 'mrkdwn', text: lines.join('\n') } },
  ])
  return { response_type: 'ephemeral', text: 'Posted /onmyway to channel and SMS sent.' }
}

async function buildCompletionPatch(db, ref, before, paymentAmount, paymentReceived, completedMs, orderId) {
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
    totalFulfillmentMinutes > 0 ? round2(paymentAmount / totalFulfillmentMinutes) : 0

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
  return { completionPatch, totalFulfillmentMinutes, phoneKey }
}

async function handleDone(db, token, fleetChannel, text) {
  const parts = splitCommandText(text)
  if (!parts[0]) {
    return { response_type: 'ephemeral', text: 'Usage: `/done [order-id]`' }
  }
  const orderId = parts[0]
  const ref = db.collection('orders').doc(orderId)
  const snap = await ref.get()
  if (!snap.exists) {
    return { response_type: 'ephemeral', text: 'Order not found.' }
  }
  const before = orderWorkflowMod().orderFromSnap(snap)
  if (String(before.status || '').toLowerCase().replace(/\s/g, '_') !== 'in_transit') {
    return { response_type: 'ephemeral', text: 'Order must be in_transit to complete.' }
  }
  if (!before.customerNotifiedAt && !before.onMyWayAt) {
    return {
      response_type: 'ephemeral',
      text: 'Customer must be notified first (portal notify or /onmyway SMS).',
    }
  }

  const paymentAmount = Number(before.paymentAmount ?? before.totalPrice)
  if (!Number.isFinite(paymentAmount) || paymentAmount < 0) {
    return { response_type: 'ephemeral', text: 'Invalid payment amount on order.' }
  }
  const paymentReceived = true
  const completedMs = Date.now()

  const mspn = String(before.mspn || '').trim()
  const tireSnap = mspn ? await db.collection('tires').doc(mspn).get() : null
  const tire = tireSnap?.exists ? tireSnap.data() || {} : {}
  const pool = computePoolDollars(paymentAmount, before, tire)
  const marginPct = paymentAmount > 0 ? round2((100 * pool) / paymentAmount) : 0

  let bell = 'tight one 🔔'
  if (marginPct > 40) bell = '🔔🔔'
  else if (marginPct >= 20) bell = '🔔'

  const { completionPatch, totalFulfillmentMinutes, phoneKey } = await buildCompletionPatch(
    db,
    ref,
    before,
    paymentAmount,
    paymentReceived,
    completedMs,
    orderId,
  )

  try {
    await runCompletionTransaction(db, {
      orderRef: ref,
      completionPatch,
      paymentAmount,
      completedMs,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { response_type: 'ephemeral', text: `Complete failed: ${escapeSlackMrkdwn(msg)}` }
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
      console.error('slash /done contacts', e)
    }
  }

  await incrementDjStreak(db)
  try {
    await applyHatTrick(db, token, fleetChannel, completedMs)
  } catch (e) {
    console.error('slash /done hat trick', e)
  }

  try {
    await orderWorkflowMod().refreshSlackMessage(db, token, fleetChannel, orderId)
  } catch (e) {
    console.error('slash /done refreshSlack', e)
  }

  const bellText = [
    `*${bell} Deal closed*`,
    `*Order:* \`${escapeSlackMrkdwn(orderId)}\``,
    `*Margin:* ${formatPercent(marginPct, 1)} · pool ${formatCurrency(pool)} on ${formatCurrency(paymentAmount)}`,
    `*Fulfilled:* ${orderWorkflowMod().formatFulfillmentMinutes(totalFulfillmentMinutes)}`,
  ].join('\n')
  await postToFleet(token, fleetChannel, `Done ${orderId}`, [
    { type: 'section', text: { type: 'mrkdwn', text: bellText } },
  ])

  return { response_type: 'ephemeral', text: 'Order completed; deal bell posted to channel.' }
}

async function handleMyorders(db, token, fleetChannel, _text, slackUserId) {
  const link = await resolveDispatchHandleForSlack(db, slackUserId)
  if (!link) {
    return {
      response_type: 'ephemeral',
      text:
        'No crew link for this Slack user. Set `slackUserId` + `dispatchHandle` on your `users/{uid}` doc, or set `djSlackUserId` on `meta/scheduleSettings`.',
    }
  }
  const today = denverYmd()
  const qSnap = await db.collection('orders').where('assignedTo', '==', link.handle).limit(80).get()
  const rows = qSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((o) => String(o.scheduledDate || '') === today)
    .sort((a, b) => {
      const ra = parseWindowToHourRange(a.scheduledWindow || a.scheduledTime || '') || { startH: 99 }
      const rb = parseWindowToHourRange(b.scheduledWindow || b.scheduledTime || '') || { startH: 99 }
      if (ra.startH !== rb.startH) return ra.startH - rb.startH
      return String(a.id).localeCompare(String(b.id))
    })

  const mspns = [...new Set(rows.map((r) => String(r.mspn || '').trim()).filter(Boolean))]
  const tireMap = new Map()
  await Promise.all(
    mspns.slice(0, 40).map(async (id) => {
      const ts = await db.collection('tires').doc(id).get()
      if (ts.exists) {
        const t = ts.data() || {}
        tireMap.set(id, String(t.description || t.tread || id).trim())
      }
    }),
  )

  const lines = rows.map((o) => {
    const desc = tireMap.get(String(o.mspn || '').trim()) || String(o.mspn || '—')
    const typ = String(o.deliveryType || o.fulfillment || '—')
    const win = escapeSlackMrkdwn(o.scheduledWindow || o.scheduledTime || '—')
    return `• \`${escapeSlackMrkdwn(o.id)}\` · ${escapeSlackMrkdwn(desc)} × ${formatQty(o.quantity)} · ${escapeSlackMrkdwn(o.customerName || '—')} · ${escapeSlackMrkdwn(typ)} · ${win}`
  })
  const body = [
    `*📋 My orders (${escapeSlackMrkdwn(link.label)}) · ${escapeSlackMrkdwn(today)}*`,
    '',
    lines.length ? lines.join('\n') : '_No orders assigned for today._',
  ].join('\n')
  return {
    response_type: 'ephemeral',
    blocks: [{ type: 'section', text: { type: 'mrkdwn', text: body } }],
  }
}

async function handleSms(db, token, fleetChannel, text, slackUserId) {
  const parts = splitCommandText(text)
  if (parts.length < 2) {
    return { response_type: 'ephemeral', text: 'Usage: `/sms [order-id] [message]`' }
  }
  const orderId = parts[0]
  const msg = parts.slice(1).join(' ').trim()
  if (!msg) {
    return { response_type: 'ephemeral', text: 'Message text is required.' }
  }
  const ref = db.collection('orders').doc(orderId)
  const snap = await ref.get()
  if (!snap.exists) {
    return { response_type: 'ephemeral', text: 'Order not found.' }
  }
  const o = orderWorkflowMod().orderFromSnap(snap)
  try {
    await sendSinchSms({ to: o.customerContact, body: msg })
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e)
    return { response_type: 'ephemeral', text: `SMS failed: ${escapeSlackMrkdwn(err)}` }
  }
  await appendCommsLog(db, ref, {
    at: Timestamp.now(),
    kind: 'sms',
    text: msg,
    slackUserId: String(slackUserId || '').slice(0, 32),
  })
  return { response_type: 'ephemeral', text: 'SMS sent and logged on the order.' }
}

async function handleConfirm(db, token, fleetChannel, text, slackUserId) {
  const parts = splitCommandText(text)
  if (!parts[0]) {
    return { response_type: 'ephemeral', text: 'Usage: `/confirm [order-id]`' }
  }
  const orderId = parts[0]
  const ref = db.collection('orders').doc(orderId)
  const snap = await ref.get()
  if (!snap.exists) {
    return { response_type: 'ephemeral', text: 'Order not found.' }
  }
  const o = orderWorkflowMod().orderFromSnap(snap)
  const body = buildAppointmentConfirmBody(o)
  try {
    await sendSinchSms({ to: o.customerContact, body })
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e)
    return { response_type: 'ephemeral', text: `SMS failed: ${escapeSlackMrkdwn(err)}` }
  }
  await appendCommsLog(db, ref, {
    at: Timestamp.now(),
    kind: 'confirm',
    text: body,
    slackUserId: String(slackUserId || '').slice(0, 32),
  })
  return { response_type: 'ephemeral', text: 'Confirmation SMS sent and logged on the order.' }
}

/**
 * @returns {Promise<object|null>}
 */
async function tryHandleFieldSlash(db, token, fleetChannel, form) {
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
  const text = String(form.text || '')
  const slackUserId = String(form.user_id || '')

  try {
    if (command === '/onmyway') {
      return await handleOnMyWay(db, botToken, ch, text)
    }
    if (command === '/done') {
      return await handleDone(db, botToken, ch, text)
    }
    if (command === '/myorders') {
      return await handleMyorders(db, botToken, ch, text, slackUserId)
    }
    if (command === '/sms') {
      return await handleSms(db, botToken, ch, text, slackUserId)
    }
    if (command === '/confirm') {
      return await handleConfirm(db, botToken, ch, text, slackUserId)
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('fieldSlash', command, e)
    return { response_type: 'ephemeral', text: `Error: ${escapeSlackMrkdwn(msg)}` }
  }
  return null
}

module.exports = { tryHandleFieldSlash }
