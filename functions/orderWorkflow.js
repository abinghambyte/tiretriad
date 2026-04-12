/**
 * Tire order Slack Block Kit + interaction handling (Phase 2 workflow).
 * @see docs/PHASE2-ORDER-WORKFLOW-HANDOFF.md
 */
const { FieldValue } = require('firebase-admin/firestore')

const MODAL_REJECT = 'order_modal_reject'
const MODAL_SCHEDULE = 'order_modal_schedule'
const MODAL_CANCEL = 'order_modal_cancel'

function escapeSlackMrkdwn(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function fmtTs(ts) {
  if (!ts || typeof ts.toDate !== 'function') return '—'
  try {
    return ts.toDate().toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' })
  } catch {
    return '—'
  }
}

function fulfillmentCustomerLabel(fulfillment) {
  const f = String(fulfillment || '').toLowerCase()
  if (f === 'pickup') return 'Customer pickup'
  if (f === 'delivery') return 'Delivery to customer'
  return escapeSlackMrkdwn(fulfillment || '—')
}

function logisticsLabel(method) {
  return method === 'dropoff' ? 'Drop-off (Kyle → DJ)' : 'Pickup (DJ → Kyle)'
}

/**
 * @param {FirebaseFirestore.DocumentSnapshot} snap
 */
function orderFromSnap(snap) {
  const d = snap.data() || {}
  return { id: snap.id, ...d }
}

function buildStage1Blocks(orderId, d) {
  const notes = [d.fulfillmentNotes, d.additionalNotes].filter(Boolean).join(' | ') || '—'
  const text = [
    '*🛞 Tire sale — action required*',
    '',
    `*SKU:* ${escapeSlackMrkdwn(d.mspn)}`,
    `*Qty:* ${d.quantity}`,
    `*Price:* $${Number(d.pricePerTire).toFixed(2)} each / $${Number(d.totalPrice).toFixed(2)} total`,
    `*Customer:* ${escapeSlackMrkdwn(d.customerName)}`,
    `*Contact:* ${escapeSlackMrkdwn(d.customerContact)}`,
    `*Fulfillment:* ${escapeSlackMrkdwn(d.fulfillment)}`,
    `*Notes:* ${escapeSlackMrkdwn(notes)}`,
  ].join('\n')

  return [
    { type: 'section', text: { type: 'mrkdwn', text } },
    {
      type: 'actions',
      block_id: 'stage1_actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Confirm availability', emoji: true },
          style: 'primary',
          action_id: 'confirm_availability',
          value: orderId,
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Reject', emoji: true },
          style: 'danger',
          action_id: 'reject_order',
          value: orderId,
        },
      ],
    },
  ]
}

function buildStage2AvailableBlocks(o) {
  const notes = [o.fulfillmentNotes, o.additionalNotes].filter(Boolean).join(' | ') || '—'
  const text = [
    '*🛞 Tire sale — available* ✅',
    '',
    `*SKU:* ${escapeSlackMrkdwn(o.mspn)}`,
    `*Qty:* ${o.quantity}`,
    `*Price:* $${Number(o.pricePerTire).toFixed(2)} each / $${Number(o.totalPrice).toFixed(2)} total`,
    `*Customer:* ${escapeSlackMrkdwn(o.customerName)}`,
    `*Contact:* ${escapeSlackMrkdwn(o.customerContact)}`,
    `*Fulfillment:* ${fulfillmentCustomerLabel(o.fulfillment)}`,
    `*Notes:* ${escapeSlackMrkdwn(notes)}`,
    '',
    `✅ Confirmed by Kyle — ${fmtTs(o.kyleConfirmedAt)}`,
  ].join('\n')

  return [
    { type: 'section', text: { type: 'mrkdwn', text } },
    {
      type: 'actions',
      block_id: 'stage2_dj_actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Schedule pickup', emoji: true },
          style: 'primary',
          action_id: 'schedule_pickup',
          value: o.id,
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Request drop-off', emoji: true },
          action_id: 'request_dropoff',
          value: o.id,
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Cancel', emoji: true },
          style: 'danger',
          action_id: 'cancel_order',
          value: o.id,
        },
      ],
    },
  ]
}

function buildStage2RejectedBlocks(o) {
  const text = [
    '*🛞 Tire sale — rejected* ❌',
    '',
    `*SKU:* ${escapeSlackMrkdwn(o.mspn)}`,
    `*Qty:* ${o.quantity}`,
    `*Price:* $${Number(o.pricePerTire).toFixed(2)} each / $${Number(o.totalPrice).toFixed(2)} total`,
    '',
    `❌ Rejected by Kyle — ${fmtTs(o.kyleRejectedAt)}`,
    `*Reason:* ${escapeSlackMrkdwn(o.rejectionReason || '—')}`,
  ].join('\n')
  return [{ type: 'section', text: { type: 'mrkdwn', text } }]
}

function buildStage3ScheduledBlocks(o) {
  const logLabel = logisticsLabel(o.logisticsMethod)
  const text = [
    '*🛞 Tire sale — scheduled* 📅',
    '',
    `*SKU:* ${escapeSlackMrkdwn(o.mspn)}`,
    `*Qty:* ${o.quantity}`,
    `*Price:* $${Number(o.pricePerTire).toFixed(2)} each / $${Number(o.totalPrice).toFixed(2)} total`,
    `*Customer:* ${escapeSlackMrkdwn(o.customerName)}`,
    `*Fulfillment:* ${fulfillmentCustomerLabel(o.fulfillment)}`,
    '',
    `✅ Confirmed by Kyle — ${fmtTs(o.kyleConfirmedAt)}`,
    `🚗 ${logLabel} scheduled — DJ, ${escapeSlackMrkdwn(o.scheduledTime || '—')}`,
  ].join('\n')

  return [
    { type: 'section', text: { type: 'mrkdwn', text } },
    {
      type: 'actions',
      block_id: 'stage3_actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Hand-off confirmed', emoji: true },
          style: 'primary',
          action_id: 'confirm_possession',
          value: o.id,
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Cancel', emoji: true },
          style: 'danger',
          action_id: 'cancel_order',
          value: o.id,
        },
      ],
    },
  ]
}

function buildStage3CancelledBlocks(o) {
  const text = [
    '*🛞 Tire sale — cancelled*',
    '',
    `*SKU:* ${escapeSlackMrkdwn(o.mspn)}`,
    `*Qty:* ${o.quantity}`,
    `*Reason:* ${escapeSlackMrkdwn(o.cancellationReason || '—')}`,
  ].join('\n')
  return [{ type: 'section', text: { type: 'mrkdwn', text } }]
}

function buildStage4InTransitBlocks(o) {
  const logLabel = logisticsLabel(o.logisticsMethod)
  const text = [
    '*🛞 Tire sale — in transit* 🚚',
    '',
    `*SKU:* ${escapeSlackMrkdwn(o.mspn)}`,
    `*Qty:* ${o.quantity}`,
    `*Price:* $${Number(o.pricePerTire).toFixed(2)} each / $${Number(o.totalPrice).toFixed(2)} total`,
    `*Customer:* ${escapeSlackMrkdwn(o.customerName)}`,
    '',
    `✅ Kyle confirmed → DJ scheduled (${escapeSlackMrkdwn(o.scheduledTime || '—')}) → DJ has tires ${fmtTs(o.djPossessionAt)}`,
    `_${logLabel}_`,
    '',
    '_Awaiting customer fulfillment — use the portal to notify the customer._',
  ].join('\n')
  return [{ type: 'section', text: { type: 'mrkdwn', text } }]
}

function fallbackTextForOrder(o) {
  return `Order ${o.id} · ${o.mspn} · ${o.status}`
}

function blocksForOrderState(o) {
  switch (o.status) {
    case 'pending':
      return buildStage1Blocks(o.id, {
        mspn: o.mspn,
        quantity: o.quantity,
        pricePerTire: o.pricePerTire,
        totalPrice: o.totalPrice,
        customerName: o.customerName,
        customerContact: o.customerContact,
        fulfillment:
          o.fulfillment === 'pickup'
            ? 'Pickup'
            : o.fulfillment === 'delivery'
              ? 'Delivery'
              : String(o.fulfillment || ''),
        fulfillmentNotes: o.fulfillmentNotes,
        additionalNotes: o.additionalNotes,
      })
    case 'available':
      return buildStage2AvailableBlocks(o)
    case 'rejected':
      return buildStage2RejectedBlocks(o)
    case 'scheduled':
      return buildStage3ScheduledBlocks(o)
    case 'cancelled':
      return buildStage3CancelledBlocks(o)
    case 'in_transit':
      return buildStage4InTransitBlocks(o)
    default:
      return [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Order ${escapeSlackMrkdwn(o.id)}*\nStatus: \`${escapeSlackMrkdwn(o.status)}\``,
          },
        },
      ]
  }
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

async function slackUpdateMessage(token, channel, ts, text, blocks) {
  return slackApiPost(token, 'chat.update', { channel, ts, text, blocks })
}

async function slackViewsOpen(token, triggerId, view) {
  return slackApiPost(token, 'views.open', { trigger_id: triggerId, view })
}

function channelForOrder(o, envChannel) {
  return o.slackChannelId || envChannel
}

async function refreshSlackMessage(db, token, envChannel, orderId) {
  const ref = db.collection('orders').doc(orderId)
  const snap = await ref.get()
  if (!snap.exists) return
  const o = orderFromSnap(snap)
  const ch = channelForOrder(o, envChannel)
  const ts = o.slackMessageTs
  if (!ch || !ts) return
  const blocks = blocksForOrderState(o)
  const text = fallbackTextForOrder(o)
  await slackUpdateMessage(token, ch, ts, text, blocks)
}

function rejectModalView(orderId) {
  return {
    type: 'modal',
    callback_id: MODAL_REJECT,
    private_metadata: JSON.stringify({ orderId }),
    title: { type: 'plain_text', text: 'Reject order' },
    submit: { type: 'plain_text', text: 'Submit' },
    close: { type: 'plain_text', text: 'Close' },
    blocks: [
      {
        type: 'input',
        block_id: 'reject_reason',
        label: { type: 'plain_text', text: 'Reason for rejection' },
        element: {
          type: 'plain_text_input',
          action_id: 'reject_reason_field',
          multiline: true,
        },
      },
    ],
  }
}

function scheduleModalView(orderId, logisticsMethod) {
  return {
    type: 'modal',
    callback_id: MODAL_SCHEDULE,
    private_metadata: JSON.stringify({ orderId, logisticsMethod }),
    title: {
      type: 'plain_text',
      text: logisticsMethod === 'dropoff' ? 'Request drop-off' : 'Schedule pickup',
    },
    submit: { type: 'plain_text', text: 'Submit' },
    close: { type: 'plain_text', text: 'Close' },
    blocks: [
      {
        type: 'input',
        block_id: 'schedule_time',
        label: {
          type: 'plain_text',
          text: 'Preferred time (e.g. Tomorrow 10am)',
        },
        element: {
          type: 'plain_text_input',
          action_id: 'schedule_time_field',
        },
      },
    ],
  }
}

function cancelModalView(orderId) {
  return {
    type: 'modal',
    callback_id: MODAL_CANCEL,
    private_metadata: JSON.stringify({ orderId }),
    title: { type: 'plain_text', text: 'Cancel order' },
    submit: { type: 'plain_text', text: 'Submit' },
    close: { type: 'plain_text', text: 'Close' },
    blocks: [
      {
        type: 'input',
        block_id: 'cancel_reason',
        label: { type: 'plain_text', text: 'Reason for cancellation' },
        element: {
          type: 'plain_text_input',
          action_id: 'cancel_reason_field',
          multiline: true,
        },
      },
    ],
  }
}

function inputValue(view, blockId, elementActionId) {
  const el = view?.state?.values?.[blockId]?.[elementActionId]
  return String(el?.value || '').trim()
}

/**
 * Handle Slack interactive payload (block_actions or view_submission).
 * @returns {{ kind: 'empty' } | { kind: 'json', body: object }}
 */
async function handleSlackPayload(db, token, envChannel, payload) {
  if (payload.type === 'view_submission') {
    return handleViewSubmission(db, token, envChannel, payload)
  }
  if (payload.type === 'block_actions') {
    return handleBlockActions(db, token, envChannel, payload)
  }
  return { kind: 'empty' }
}

async function handleViewSubmission(db, token, envChannel, payload) {
  const view = payload.view
  const cb = view?.callback_id

  let meta = {}
  try {
    meta = JSON.parse(view.private_metadata || '{}')
  } catch {
    return { kind: 'json', body: { response_action: 'clear' } }
  }
  const orderId = meta.orderId
  if (!orderId) {
    return { kind: 'json', body: { response_action: 'clear' } }
  }

  const ref = db.collection('orders').doc(orderId)
  const snap = await ref.get()
  if (!snap.exists) {
    return { kind: 'json', body: { response_action: 'clear' } }
  }

  if (cb === MODAL_REJECT) {
    if (snap.get('status') !== 'pending') {
      return { kind: 'json', body: { response_action: 'clear' } }
    }
    const reason = inputValue(view, 'reject_reason', 'reject_reason_field')
    await ref.update({
      status: 'rejected',
      rejectionReason: reason || '—',
      kyleRejectedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })
    await refreshSlackMessage(db, token, envChannel, orderId)
    return { kind: 'json', body: { response_action: 'clear' } }
  }

  if (cb === MODAL_SCHEDULE) {
    if (snap.get('status') !== 'available') {
      return { kind: 'json', body: { response_action: 'clear' } }
    }
    const scheduledTime = inputValue(view, 'schedule_time', 'schedule_time_field')
    const logisticsMethod = meta.logisticsMethod === 'dropoff' ? 'dropoff' : 'pickup'
    await ref.update({
      status: 'scheduled',
      logisticsMethod,
      scheduledTime: scheduledTime || '—',
      djAcknowledgedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })
    await refreshSlackMessage(db, token, envChannel, orderId)
    return { kind: 'json', body: { response_action: 'clear' } }
  }

  if (cb === MODAL_CANCEL) {
    const st = snap.get('status')
    if (st !== 'available' && st !== 'scheduled') {
      return { kind: 'json', body: { response_action: 'clear' } }
    }
    const reason = inputValue(view, 'cancel_reason', 'cancel_reason_field')
    await ref.update({
      status: 'cancelled',
      cancellationReason: reason || '—',
      updatedAt: FieldValue.serverTimestamp(),
    })
    await refreshSlackMessage(db, token, envChannel, orderId)
    return { kind: 'json', body: { response_action: 'clear' } }
  }

  return { kind: 'json', body: { response_action: 'clear' } }
}

async function handleBlockActions(db, token, envChannel, payload) {
  const actions = payload.actions || []
  const action = actions[0]
  if (!action) return { kind: 'empty' }

  const actionId = action.action_id
  const orderId = String(action.value || '').trim()
  if (!orderId) return { kind: 'empty' }

  const triggerId = payload.trigger_id
  const ref = db.collection('orders').doc(orderId)
  const snap = await ref.get()
  if (!snap.exists) return { kind: 'empty' }

  const o = orderFromSnap(snap)

  switch (actionId) {
    case 'reject_order': {
      if (o.status !== 'pending') return { kind: 'empty' }
      await slackViewsOpen(token, triggerId, rejectModalView(orderId))
      return { kind: 'empty' }
    }
    case 'schedule_pickup': {
      if (o.status !== 'available') return { kind: 'empty' }
      await slackViewsOpen(token, triggerId, scheduleModalView(orderId, 'pickup'))
      return { kind: 'empty' }
    }
    case 'request_dropoff': {
      if (o.status !== 'available') return { kind: 'empty' }
      await slackViewsOpen(token, triggerId, scheduleModalView(orderId, 'dropoff'))
      return { kind: 'empty' }
    }
    case 'cancel_order': {
      if (o.status !== 'available' && o.status !== 'scheduled') {
        return { kind: 'empty' }
      }
      await slackViewsOpen(token, triggerId, cancelModalView(orderId))
      return { kind: 'empty' }
    }
    case 'confirm_availability': {
      if (o.status !== 'pending') return { kind: 'empty' }
      await ref.update({
        status: 'available',
        kyleConfirmedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      })
      await refreshSlackMessage(db, token, envChannel, orderId)
      return { kind: 'empty' }
    }
    case 'confirm_possession': {
      if (o.status !== 'scheduled') return { kind: 'empty' }
      await ref.update({
        status: 'in_transit',
        djPossessionAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      })
      await refreshSlackMessage(db, token, envChannel, orderId)
      return { kind: 'empty' }
    }
    default:
      return { kind: 'empty' }
  }
}

/**
 * Post completion summary (new message) to #fleet-ops.
 */
async function postOrderCompletionSummary(token, envChannel, order, portalBaseUrl) {
  const ch = channelForOrder(order, envChannel)
  if (!ch) return

  const pay = Number(order.paymentAmount)
  const mins = Number(order.fulfillmentTimeMinutes)
  const timeStr = Number.isFinite(mins) ? formatFulfillmentMinutes(mins) : '—'
  const logistics = logisticsLabel(order.logisticsMethod)
  const custFul = fulfillmentCustomerLabel(order.fulfillment)
  const link = `${portalBaseUrl.replace(/\/$/, '')}/orders?highlight=${encodeURIComponent(order.id)}`

  const text = [
    '✅ *Order complete*',
    '────────────────────',
    `🔧 *${escapeSlackMrkdwn(order.mspn)}* × ${order.quantity}`,
    `👤 ${escapeSlackMrkdwn(order.customerName)}`,
    `📦 ${logistics} → ${custFul}`,
    `💰 $${Number.isFinite(pay) ? pay.toFixed(2) : '—'} received`,
    `⏱ Fulfilled in ${timeStr}`,
    '🤝 Kyle → DJ → Customer',
    '────────────────────',
    `<${link}|View in portal>`,
  ].join('\n')

  await slackApiPost(token, 'chat.postMessage', {
    channel: ch,
    text: `Order complete · ${order.mspn}`,
    blocks: [{ type: 'section', text: { type: 'mrkdwn', text } }],
  })
}

function formatFulfillmentMinutes(m) {
  if (!Number.isFinite(m) || m < 0) return '—'
  const h = Math.floor(m / 60)
  const min = Math.round(m % 60)
  if (h <= 0) return `${min} min`
  return `${h} hrs ${min} min`
}

module.exports = {
  buildStage1Blocks,
  blocksForOrderState,
  fallbackTextForOrder,
  handleSlackPayload,
  postOrderCompletionSummary,
  refreshSlackMessage,
  orderFromSnap,
  formatFulfillmentMinutes,
}
