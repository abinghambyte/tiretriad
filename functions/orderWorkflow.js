/**
 * Tire order Slack Block Kit + interaction handling (Phase 2 workflow).
 * @see docs/PHASE2-ORDER-WORKFLOW-HANDOFF.md
 */
const { FieldValue } = require('firebase-admin/firestore')
const {
  minutesBetweenTsAndMs,
  frictionScoreCancelled,
} = require('./orderMetrics')
const { resetDjStreak, upsertGhostForOrder } = require('./orderLifecycle')
const {
  tryHandleCreditBlockActions,
  tryHandleCreditViewSubmission,
} = require('./creditTrackerSlack')

const MODAL_REJECT = 'order_modal_reject'
const MODAL_SCHEDULE = 'order_modal_schedule'
const MODAL_CANCEL = 'order_modal_cancel'
const MODAL_KYLE_PRICE = 'order_modal_kyle_price'

const CANCEL_DISPOSITIONS = [
  { value: 'ghost', label: 'Customer ghosted', icon: '👻' },
  { value: 'pricing', label: 'Pricing issue', icon: '💸' },
  { value: 'found_elsewhere', label: 'Found tires elsewhere', icon: '🔍' },
  { value: 'wrong_size', label: 'Wrong size / fitment', icon: '📐' },
  { value: 'timing', label: "Timing didn't work out", icon: '⏰' },
  { value: 'changed_mind', label: 'Changed their mind', icon: '🔄' },
  { value: 'no_payment', label: 'Payment fell through', icon: '🚫' },
  { value: 'weather', label: 'Weather / road conditions', icon: '🌧️' },
  { value: 'other', label: 'Other', icon: '✏️' },
]

/** Orders that can still be cancelled from Slack or the portal (not completed / rejected / cancelled). */
const CANCELLABLE_STATUSES = new Set([
  'pending',
  'available',
  'scheduled',
  'in_transit',
  'prospective',
])

function dispositionLine(o) {
  const v = o.cancellationDisposition
  const row = CANCEL_DISPOSITIONS.find((d) => d.value === v)
  const label = row ? `${row.icon} ${row.label}` : escapeSlackMrkdwn(v || '—')
  const note = o.cancellationNote ? `\n*Note:* ${escapeSlackMrkdwn(o.cancellationNote)}` : ''
  return `${label}${note}`
}

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

function orderFromSnap(snap) {
  const d = snap.data() || {}
  return { id: snap.id, ...d }
}

function buildPendingPriceCheckBlocks(orderId, d) {
  const px = d.priceCheckSnapshot || {}
  const sysPrice = Number(px.sysPrice) || 0
  const fet = Number(px.fet) || 0
  const combined = Number(px.systemCombined) || sysPrice + fet
  const desc = escapeSlackMrkdwn(px.description || '—')
  const mspn = escapeSlackMrkdwn(px.mspn || d.mspn || '—')
  const text = [
    '*🔍 Price check*',
    '',
    `${desc} (MSPN \`${mspn}\`)`,
    '',
    `*Our system shows:* $${sysPrice.toFixed(2)}/tire + $${fet.toFixed(2)} FET`,
    `*Combined:* $${combined.toFixed(2)}/tire (buy + FET)`,
  ].join('\n')
  return [
    { type: 'section', text: { type: 'mrkdwn', text } },
    {
      type: 'actions',
      block_id: 'price_check_actions',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: `Matches system ✓  $${combined.toFixed(2)}/tire`,
            emoji: true,
          },
          style: 'primary',
          action_id: 'price_check_match',
          value: orderId,
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Different — enter price ↗', emoji: true },
          action_id: 'price_check_different',
          value: orderId,
        },
      ],
    },
  ]
}

function kylePriceOverrideModalView(orderId, d) {
  const px = d.priceCheckSnapshot || {}
  const sysPrice = Number(px.sysPrice) || 0
  return {
    type: 'modal',
    callback_id: MODAL_KYLE_PRICE,
    private_metadata: JSON.stringify({ orderId }),
    title: { type: 'plain_text', text: 'Kyle price' },
    submit: { type: 'plain_text', text: 'Submit' },
    close: { type: 'plain_text', text: 'Close' },
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `System buy (before FET): *$${sysPrice.toFixed(2)}* / tire\nEnter *your* current price per tire *before FET*.`,
        },
      },
      {
        type: 'input',
        block_id: 'kyle_price_block',
        label: { type: 'plain_text', text: 'Your current price per tire (before FET)' },
        element: {
          type: 'plain_text_input',
          action_id: 'kyle_price_field',
          multiline: false,
        },
      },
    ],
  }
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
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Cancel', emoji: true },
          style: 'danger',
          action_id: 'cancel_order',
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
  const timeStr = escapeSlackMrkdwn(
    o.fulfillmentScheduledTime || o.scheduledTime || '—',
  )
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
    `🚗 ${logLabel} scheduled — DJ, ${timeStr}`,
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
    `*Disposition:* ${dispositionLine(o)}`,
    `*When:* ${fmtTs(o.cancelledAt)}`,
  ].join('\n')
  return [{ type: 'section', text: { type: 'mrkdwn', text } }]
}

function buildStage4InTransitBlocks(o) {
  const timeStr = escapeSlackMrkdwn(
    o.fulfillmentScheduledTime || o.scheduledTime || '—',
  )
  const logLabel = logisticsLabel(o.logisticsMethod)
  const text = [
    '*🛞 Tire sale — in transit* 🚚',
    '',
    `*SKU:* ${escapeSlackMrkdwn(o.mspn)}`,
    `*Qty:* ${o.quantity}`,
    `*Price:* $${Number(o.pricePerTire).toFixed(2)} each / $${Number(o.totalPrice).toFixed(2)} total`,
    `*Customer:* ${escapeSlackMrkdwn(o.customerName)}`,
    '',
    `✅ Kyle confirmed → DJ scheduled (${timeStr}) → DJ has tires ${fmtTs(o.djPossessionAt)}`,
    `_${logLabel}_`,
    '',
    '_Awaiting customer fulfillment — use the portal to notify the customer._',
  ].join('\n')
  return [
    { type: 'section', text: { type: 'mrkdwn', text } },
    {
      type: 'actions',
      block_id: 'stage4_actions',
      elements: [
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

function buildProspectivePipelineBlocks(o) {
  const notes = [o.fulfillmentNotes, o.additionalNotes].filter(Boolean).join(' | ') || '—'
  const text = [
    '*🛞 Prospective order* · pipeline',
    '',
    `*SKU:* ${escapeSlackMrkdwn(o.mspn)}`,
    `*Qty:* ${o.quantity}`,
    `*Price:* $${Number(o.pricePerTire).toFixed(2)} each / $${Number(o.totalPrice).toFixed(2)} total`,
    `*Notes:* ${escapeSlackMrkdwn(notes)}`,
    '',
    '_Created from the portal tire catalog._',
  ].join('\n')
  return [{ type: 'section', text: { type: 'mrkdwn', text } }]
}

function fallbackTextForOrder(o) {
  return `Order ${o.id} · ${o.mspn} · ${o.status}`
}

function blocksForOrderState(o) {
  switch (o.status) {
    case 'prospective':
      return buildProspectivePipelineBlocks(o)
    case 'pending':
      if (o.pendingKylePriceCheck && o.priceCheckSnapshot) {
        return buildPendingPriceCheckBlocks(o.id, o)
      }
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
  if (!token) return
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
          multiline: false,
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
          multiline: false,
        },
      },
    ],
  }
}

/**
 * @param {string} orderId
 * @param {{ preselected?: string | null, showNoteField?: boolean }} [opts]
 */
function cancelModalView(orderId, opts = {}) {
  const preselected = opts.preselected || null
  const showNoteField = Boolean(opts.showNoteField)
  const dispositionOptions = CANCEL_DISPOSITIONS.map((d) => ({
    text: { type: 'plain_text', text: `${d.icon} ${d.label}`.slice(0, 75) },
    value: d.value,
  }))
  const initialDisposition =
    preselected && CANCEL_DISPOSITIONS.some((d) => d.value === preselected)
      ? dispositionOptions.find((o) => o.value === preselected)
      : undefined

  const blocks = [
    {
      type: 'input',
      dispatch_action: true,
      block_id: 'cancel_disp_block',
      label: { type: 'plain_text', text: 'Why cancel?' },
      element: {
        type: 'static_select',
        action_id: 'cancel_disp_select',
        placeholder: { type: 'plain_text', text: 'Choose…' },
        ...(initialDisposition ? { initial_option: initialDisposition } : {}),
        options: dispositionOptions,
      },
    },
  ]
  if (showNoteField) {
    blocks.push({
      type: 'input',
      block_id: 'cancel_note_block',
      optional: false,
      label: { type: 'plain_text', text: 'Details (required for Other)' },
      element: {
        type: 'plain_text_input',
        action_id: 'cancel_note_field',
        multiline: false,
      },
    })
  }
  return {
    type: 'modal',
    callback_id: MODAL_CANCEL,
    private_metadata: JSON.stringify({ orderId }),
    title: { type: 'plain_text', text: 'Cancel order' },
    submit: { type: 'plain_text', text: 'Submit' },
    close: { type: 'plain_text', text: 'Close' },
    blocks,
  }
}

async function executeOrderCancellation(db, token, envChannel, snap, disposition, noteForOther) {
  const orderId = snap.id
  const ref = snap.ref
  const st = snap.get('status')
  const note = disposition === 'other' ? String(noteForOther || '').trim() : ''

  const pokeCount = Number(snap.get('pokeCount')) || 0
  const notifyFrom = snap.get('firstNotifiedAt') || snap.get('customerNotifiedAt')
  const notifyToCancelMinutes = minutesBetweenTsAndMs(notifyFrom, Date.now()) ?? 0
  const frictionScore = frictionScoreCancelled(
    pokeCount,
    notifyToCancelMinutes,
    disposition,
  )

  let repeatGhost = false
  if (disposition === 'ghost') {
    const { repeatGhost: rg } = await upsertGhostForOrder(
      db,
      orderId,
      snap.get('customerContact'),
    )
    repeatGhost = rg
  }

  await resetDjStreak(db)

  const patch = {
    status: 'cancelled',
    cancellationDisposition: disposition,
    cancellationNote: note,
    cancelledAt: FieldValue.serverTimestamp(),
    stageAtCancellation: st,
    frictionScore,
    pendingKylePriceCheck: FieldValue.delete(),
    priceCheckSnapshot: FieldValue.delete(),
    updatedAt: FieldValue.serverTimestamp(),
  }
  if (repeatGhost) patch.repeatGhost = true

  await ref.update(patch)
  await refreshSlackMessage(db, token, envChannel, orderId)
}

/**
 * Portal-initiated cancellation (callable). Same outcome as Slack cancel modal.
 */
async function cancelOrderFromPortal(db, token, envChannel, orderId, disposition, noteRaw) {
  const ref = db.collection('orders').doc(orderId)
  const snap = await ref.get()
  if (!snap.exists) {
    throw new Error('Order not found.')
  }
  const st = snap.get('status')
  if (!CANCELLABLE_STATUSES.has(st)) {
    throw new Error('This order cannot be cancelled.')
  }
  const allowed = new Set(CANCEL_DISPOSITIONS.map((d) => d.value))
  if (!disposition || !allowed.has(disposition)) {
    throw new Error('Pick a valid cancellation reason.')
  }
  const note = String(noteRaw || '').trim()
  if (disposition === 'other' && !note) {
    throw new Error('Add a short note when Other is selected.')
  }
  await executeOrderCancellation(db, token, envChannel, snap, disposition, note)
}

function inputValue(view, blockId, elementActionId) {
  const el = view?.state?.values?.[blockId]?.[elementActionId]
  return String(el?.value || '').trim()
}

function staticSelectValue(view, blockId, elementActionId) {
  const el = view?.state?.values?.[blockId]?.[elementActionId]
  return String(el?.selected_option?.value || '').trim()
}

async function handleSlackPayload(db, token, envChannel, payload) {
  if (payload.type === 'view_submission') {
    const cr = await tryHandleCreditViewSubmission(db, token, envChannel, payload)
    if (cr.handled) return cr
    return handleViewSubmission(db, token, envChannel, payload)
  }
  if (payload.type === 'block_actions') {
    const cr = await tryHandleCreditBlockActions(db, token, envChannel, payload)
    if (cr.handled) return cr
    return handleBlockActions(db, token, envChannel, payload)
  }
  return { kind: 'empty' }
}

async function handleViewSubmission(db, token, envChannel, payload) {
  const view = payload.view
  const cb = view?.callback_id

  if (cb === MODAL_KYLE_PRICE) {
    let meta = {}
    try {
      meta = JSON.parse(view.private_metadata || '{}')
    } catch {
      return { kind: 'json', body: { response_action: 'clear' } }
    }
    const orderId = meta.orderId
    if (!orderId) return { kind: 'json', body: { response_action: 'clear' } }

    const ref = db.collection('orders').doc(orderId)
    const snap = await ref.get()
    if (!snap.exists) {
      return { kind: 'json', body: { response_action: 'clear' } }
    }
    if (snap.get('status') !== 'pending' || !snap.get('pendingKylePriceCheck')) {
      return { kind: 'json', body: { response_action: 'clear' } }
    }

    const px = snap.get('priceCheckSnapshot') || {}
    const systemPrice = Number(px.sysPrice) || 0
    const qty = Number(snap.get('quantity')) || 0
    const kylePriceRaw = inputValue(view, 'kyle_price_block', 'kyle_price_field')
    const kylePrice = Number(kylePriceRaw)
    if (!Number.isFinite(kylePrice) || kylePrice < 0) {
      return {
        kind: 'json',
        body: {
          response_action: 'errors',
          errors: { kyle_price_block: 'Enter a valid price per tire (before FET).' },
        },
      }
    }

    const delta = kylePrice - systemPrice
    const totalDelta = delta * qty
    const now = Date.now()
    const createdAt = snap.get('createdAt')
    const saleToAvailableMinutes = minutesBetweenTsAndMs(createdAt, now)

    const patch = {
      status: 'available',
      kyleConfirmedAt: FieldValue.serverTimestamp(),
      saleToAvailableMinutes,
      kyleConfirmMinutes: saleToAvailableMinutes,
      pendingKylePriceCheck: FieldValue.delete(),
      priceCheckSnapshot: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    }
    if (Math.abs(delta) > 0.005) {
      patch.kylePriceOverride = kylePrice
      patch.priceDiscrepancy = delta
    }
    await ref.update(patch)

    if (Math.abs(delta) > 0.005 && token && envChannel) {
      const sign = delta > 0 ? '+' : ''
      const sysComb = Number(px.systemCombined) || systemPrice + (Number(px.fet) || 0)
      await slackApiPost(token, 'chat.postMessage', {
        channel: envChannel,
        text: `Price discrepancy on order ${orderId}`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: [
                `⚠️ *Price discrepancy* on order \`#${escapeSlackMrkdwn(orderId)}\``,
                `*System buy (before FET):* $${systemPrice.toFixed(2)} | *Combined w/ FET:* $${sysComb.toFixed(2)}/tire`,
                `*Kyle's actual (before FET):* $${kylePrice.toFixed(2)}`,
                `*Delta:* ${sign}$${Math.abs(delta).toFixed(2)} per tire × ${qty} = ${sign}$${Math.abs(totalDelta).toFixed(2)} total`,
                '_Order advanced to Available — review before charging._',
              ].join('\n'),
            },
          },
        ],
      })
    }

    await refreshSlackMessage(db, token, envChannel, orderId)
    return { kind: 'json', body: { response_action: 'clear' } }
  }

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
    await resetDjStreak(db)
    await ref.update({
      status: 'rejected',
      rejectionReason: reason || '—',
      kyleRejectedAt: FieldValue.serverTimestamp(),
      pendingKylePriceCheck: FieldValue.delete(),
      priceCheckSnapshot: FieldValue.delete(),
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
    const now = Date.now()
    const kyleAt = snap.get('kyleConfirmedAt')
    const availToSched = minutesBetweenTsAndMs(kyleAt, now)
    const ft = scheduledTime || '—'
    await ref.update({
      status: 'scheduled',
      logisticsMethod,
      scheduledTime: ft,
      fulfillmentScheduledTime: ft,
      scheduledAt: FieldValue.serverTimestamp(),
      djAcknowledgedAt: FieldValue.serverTimestamp(),
      availableToScheduledMinutes: availToSched,
      djResponseMinutes: availToSched,
      updatedAt: FieldValue.serverTimestamp(),
    })
    await refreshSlackMessage(db, token, envChannel, orderId)
    return { kind: 'json', body: { response_action: 'clear' } }
  }

  if (cb === MODAL_CANCEL) {
    const st = snap.get('status')
    if (!CANCELLABLE_STATUSES.has(st)) {
      return { kind: 'json', body: { response_action: 'clear' } }
    }
    const disp = staticSelectValue(view, 'cancel_disp_block', 'cancel_disp_select')
    if (!disp) {
      return {
        kind: 'json',
        body: {
          response_action: 'errors',
          errors: { cancel_disp_block: 'Pick a disposition.' },
        },
      }
    }
    const note = inputValue(view, 'cancel_note_block', 'cancel_note_field')
    if (disp === 'other' && !note) {
      return {
        kind: 'json',
        body: {
          response_action: 'errors',
          errors: { cancel_note_block: 'Add a short note when Other is selected.' },
        },
      }
    }

    await executeOrderCancellation(db, token, envChannel, snap, disp, note)
    return { kind: 'json', body: { response_action: 'clear' } }
  }

  return { kind: 'json', body: { response_action: 'clear' } }
}

async function handleBlockActions(db, token, envChannel, payload) {
  const actions = payload.actions || []
  const action = actions[0]
  if (!action) return { kind: 'empty' }

  const actionId = action.action_id

  /** Cancel modal: show/hide “Other” note field via `dispatch_action` + synchronous view update. */
  if (payload.view?.callback_id === MODAL_CANCEL && actionId === 'cancel_disp_select') {
    let orderId = ''
    try {
      orderId = String(JSON.parse(payload.view.private_metadata || '{}').orderId || '').trim()
    } catch {
      return { kind: 'empty' }
    }
    if (!orderId) return { kind: 'empty' }
    const selected = String(action.selected_option?.value || '').trim()
    const showNoteField = selected === 'other'
    const view = cancelModalView(orderId, {
      preselected: selected || null,
      showNoteField,
    })
    if (payload.view.hash) {
      view.hash = payload.view.hash
    }
    return { kind: 'json', body: { response_action: 'update', view } }
  }

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
      if (!CANCELLABLE_STATUSES.has(o.status)) {
        return { kind: 'empty' }
      }
      await slackViewsOpen(token, triggerId, cancelModalView(orderId))
      return { kind: 'empty' }
    }
    case 'confirm_availability': {
      if (o.status !== 'pending' || o.pendingKylePriceCheck) return { kind: 'empty' }
      const mspn = String(o.mspn || '').trim()
      const tireSnap = await db.collection('tires').doc(mspn).get()
      const tire = tireSnap.exists ? tireSnap.data() : {}
      const sysPrice = Number(tire.price ?? tire.cost) || 0
      const fet = Number(tire.fet) || 0
      const description =
        String(tire.description || tire.tread || o.mspn || '').trim() || '—'
      const systemCombined = sysPrice + fet
      await ref.update({
        pendingKylePriceCheck: true,
        priceCheckSnapshot: {
          description,
          mspn,
          sysPrice,
          fet,
          systemCombined,
        },
        updatedAt: FieldValue.serverTimestamp(),
      })
      await refreshSlackMessage(db, token, envChannel, orderId)
      return { kind: 'empty' }
    }
    case 'price_check_match': {
      if (o.status !== 'pending' || !o.pendingKylePriceCheck) return { kind: 'empty' }
      const now = Date.now()
      const createdAt = snap.get('createdAt')
      const saleToAvailableMinutes = minutesBetweenTsAndMs(createdAt, now)
      await ref.update({
        status: 'available',
        kyleConfirmedAt: FieldValue.serverTimestamp(),
        saleToAvailableMinutes,
        kyleConfirmMinutes: saleToAvailableMinutes,
        pendingKylePriceCheck: FieldValue.delete(),
        priceCheckSnapshot: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      })
      await refreshSlackMessage(db, token, envChannel, orderId)
      return { kind: 'empty' }
    }
    case 'price_check_different': {
      if (o.status !== 'pending' || !o.pendingKylePriceCheck) return { kind: 'empty' }
      await slackViewsOpen(token, triggerId, kylePriceOverrideModalView(orderId, o))
      return { kind: 'empty' }
    }
    case 'confirm_possession': {
      if (o.status !== 'scheduled') return { kind: 'empty' }
      const now = Date.now()
      const djAck = snap.get('djAcknowledgedAt')
      const schedToTransit = minutesBetweenTsAndMs(djAck, now)
      await ref.update({
        status: 'in_transit',
        djPossessionAt: FieldValue.serverTimestamp(),
        scheduledToInTransitMinutes: schedToTransit,
        updatedAt: FieldValue.serverTimestamp(),
      })
      await refreshSlackMessage(db, token, envChannel, orderId)
      return { kind: 'empty' }
    }
    default:
      return { kind: 'empty' }
  }
}

async function postOrderCompletionSummary(token, envChannel, order, portalBaseUrl) {
  const ch = channelForOrder(order, envChannel)
  if (!ch) return

  const pay = Number(order.paymentAmount)
  const mins = Number(order.totalFulfillmentMinutes ?? order.fulfillmentTimeMinutes)
  const timeStr = Number.isFinite(mins) ? formatFulfillmentMinutes(mins) : '—'
  const logistics = logisticsLabel(order.logisticsMethod)
  const custFul = fulfillmentCustomerLabel(order.fulfillment)
  const link = `${portalBaseUrl.replace(/\/$/, '')}/tires?tab=orders&highlight=${encodeURIComponent(order.id)}`
  const hat = order.hatTrickDay ? '\n🎩 *Hat trick day*' : ''

  const text = [
    '✅ *Order complete*',
    '────────────────────',
    `🔧 *${escapeSlackMrkdwn(order.mspn)}* × ${order.quantity}`,
    `👤 ${escapeSlackMrkdwn(order.customerName)}`,
    `📦 ${logistics} → ${custFul}`,
    `💰 $${Number.isFinite(pay) ? pay.toFixed(2) : '—'} received`,
    `⏱ Fulfilled in ${timeStr}`,
    '🤝 Kyle → DJ → Customer',
    hat,
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
  cancelOrderFromPortal,
}
