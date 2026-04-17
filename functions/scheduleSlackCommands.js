/**
 * Batch 3 — delivery / pickup / reschedule + DJ schedule Slack commands.
 */
const { FieldValue } = require('firebase-admin/firestore')
const { formatCurrency, formatQty } = require('./format')
const { SLACK_SECRETS, SLACK_BOT_TOKEN, SLACK_CHANNEL_ID } = require('./slackSecrets')
const {
  denverYmd,
  addDaysYmd,
  parseMmDdToYmd,
  operatingHours,
  parseClockToHour,
  parseWindowToHourRange,
  orderBlocksHours,
  blocksFromSlots,
  orderAppliesToCrew,
  resolveDjUid,
  fetchAvailabilityDay,
  fetchOrdersScheduledInRange,
  mondayYmdOfWeekContaining,
  OP_START,
  OP_END,
} = require('./scheduleAvailability')
const {
  slackViewsOpen,
  viewInputValue,
  viewDatepickerValue,
  viewTimepickerValue,
  viewSubmissionErrorsBody,
} = require('./slackModalShared')

const MODAL_DELIVERY_SUBMIT = 'delivery_modal_submit'
const MODAL_PICKUP_SUBMIT = 'pickup_modal_submit'
const MODAL_RESCHEDULE_SUBMIT = 'reschedule_modal_submit'
const MODAL_OPENSLOTS_SUBMIT = 'openslots_modal_submit'
const MODAL_BLOCK_SUBMIT = 'block_modal_submit'
const MODAL_UNBLOCK_SUBMIT = 'unblock_modal_submit'
const MODAL_MYAVAIL_SUBMIT = 'myavailability_modal_submit'

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

async function openScheduleModal(botToken, triggerId, view, msg) {
  const tid = String(triggerId || '').trim()
  if (!tid) return { response_type: 'ephemeral', text: 'Missing Slack trigger — try the command again.' }
  try {
    await slackViewsOpen(botToken, tid, view)
    return { response_type: 'ephemeral', text: msg }
  } catch (e) {
    return {
      response_type: 'ephemeral',
      text: `Could not open form: ${e instanceof Error ? e.message : String(e)}`,
    }
  }
}

function ymdIsoToMmDdSlash(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || '').trim())
  if (!m) return ''
  return `${Number(m[2])}/${Number(m[3])}`
}

function hourFromTimepickerHm(hm) {
  const x = /^(\d{1,2}):(\d{2})$/.exec(String(hm || '').trim())
  if (!x) return null
  let hh = Number(x[1])
  const mm = Number(x[2]) || 0
  if (!Number.isFinite(hh) || hh < 0 || hh > 23) return null
  if (mm >= 30) hh = Math.min(23, hh + 1)
  return hh
}

function buildScheduleOrderDateWindowModal(callbackId, title) {
  const today = denverYmd()
  return {
    type: 'modal',
    callback_id: callbackId,
    title: { type: 'plain_text', text: title },
    submit: { type: 'plain_text', text: 'Submit' },
    close: { type: 'plain_text', text: 'Cancel' },
    blocks: [
      {
        type: 'input',
        block_id: 'sch_ord_id',
        label: { type: 'plain_text', text: 'Order ID' },
        element: {
          type: 'plain_text_input',
          action_id: 'sch_ord_id_field',
          multiline: false,
          placeholder: { type: 'plain_text', text: 'Firestore order id' },
        },
      },
      {
        type: 'input',
        block_id: 'sch_ord_date',
        label: { type: 'plain_text', text: 'Date (Denver)' },
        element: {
          type: 'datepicker',
          action_id: 'sch_ord_date_field',
          initial_date: today,
        },
      },
      {
        type: 'input',
        block_id: 'sch_ord_window',
        label: { type: 'plain_text', text: 'Window' },
        element: {
          type: 'plain_text_input',
          action_id: 'sch_ord_window_field',
          multiline: false,
          placeholder: { type: 'plain_text', text: 'e.g. 2pm-4pm' },
        },
      },
    ],
  }
}

function buildOpenslotsModalView() {
  return {
    type: 'modal',
    callback_id: MODAL_OPENSLOTS_SUBMIT,
    title: { type: 'plain_text', text: 'Open slots' },
    submit: { type: 'plain_text', text: 'Submit' },
    close: { type: 'plain_text', text: 'Cancel' },
    blocks: [
      {
        type: 'input',
        block_id: 'sch_open_date',
        label: { type: 'plain_text', text: 'Date (Denver)' },
        element: {
          type: 'datepicker',
          action_id: 'sch_open_date_field',
          initial_date: denverYmd(),
        },
      },
    ],
  }
}

function buildMyavailabilityModalView() {
  return {
    type: 'modal',
    callback_id: MODAL_MYAVAIL_SUBMIT,
    title: { type: 'plain_text', text: 'My availability' },
    submit: { type: 'plain_text', text: 'Submit' },
    close: { type: 'plain_text', text: 'Cancel' },
    blocks: [
      {
        type: 'input',
        block_id: 'sch_avail_date',
        label: { type: 'plain_text', text: 'Date (Denver)' },
        element: {
          type: 'datepicker',
          action_id: 'sch_avail_date_field',
          initial_date: denverYmd(),
        },
      },
    ],
  }
}

function buildBlockModalView(callbackId, title) {
  const base = [
    {
      type: 'input',
      block_id: 'sch_blk_date',
      label: { type: 'plain_text', text: 'Date (Denver)' },
      element: {
        type: 'datepicker',
        action_id: 'sch_blk_date_field',
        initial_date: denverYmd(),
      },
    },
    {
      type: 'input',
      block_id: 'sch_blk_start',
      label: { type: 'plain_text', text: 'Start (local)' },
      element: {
        type: 'timepicker',
        action_id: 'sch_blk_start_field',
        initial_time: '09:00',
      },
    },
    {
      type: 'input',
      block_id: 'sch_blk_end',
      label: { type: 'plain_text', text: 'End (local)' },
      element: {
        type: 'timepicker',
        action_id: 'sch_blk_end_field',
        initial_time: '11:00',
      },
    },
  ]
  if (callbackId === MODAL_BLOCK_SUBMIT) {
    base.push({
      type: 'input',
      block_id: 'sch_blk_reason',
      optional: true,
      label: { type: 'plain_text', text: 'Reason (optional)' },
      element: {
        type: 'plain_text_input',
        action_id: 'sch_blk_reason_field',
        multiline: false,
        placeholder: { type: 'plain_text', text: 'PTO, appointment, …' },
      },
    })
  }
  return {
    type: 'modal',
    callback_id: callbackId,
    title: { type: 'plain_text', text: title },
    submit: { type: 'plain_text', text: 'Submit' },
    close: { type: 'plain_text', text: 'Cancel' },
    blocks: base,
  }
}

function formatHourAmpm(h) {
  if (h === 0) return '12am'
  if (h < 12) return `${h}am`
  if (h === 12) return '12pm'
  return `${h - 12}pm`
}

function hourBlockLabel(h) {
  return `${formatHourAmpm(h)}–${formatHourAmpm(h + 1)}`
}

async function requireDjUid(db) {
  const uid = await resolveDjUid(db)
  if (!uid) {
    throw new Error(
      'DJ calendar uid not set. Add `djUserId` to Firestore `meta/scheduleSettings` or set `DJ_SCHEDULE_UID` in the Functions environment.',
    )
  }
  return uid
}

function splitCommandText(text) {
  return String(text || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
}

/** Same hour range rules for /block and /unblock so identical start/end matches stored slots. */
function normalizeBlockRangeFromParsed(ymd, sh, eh) {
  if (!ymd || sh == null || eh == null) return null
  const start = Math.min(sh, eh)
  let end = Math.max(sh, eh)
  if (end <= start) end = Math.min(OP_END, start + 1)
  return { start, end }
}

/** Avoid `**Title**` when callers pass a title already wrapped in Slack mrkdwn bold. */
function scheduleDayTitlePlain(title) {
  const t = String(title || '').trim()
  if (t.startsWith('*') && t.endsWith('*') && t.length >= 2) return t.slice(1, -1).trim()
  return t
}

async function updateOrderSchedule(
  db,
  orderId,
  { scheduledDate, scheduledWindow, deliveryType, rescheduleOnly },
) {
  const ref = db.collection('orders').doc(orderId)
  const snap = await ref.get()
  if (!snap.exists) throw new Error('Order not found')
  const prev = snap.data() || {}
  const patch = {
    scheduledDate,
    scheduledWindow,
    updatedAt: FieldValue.serverTimestamp(),
  }
  if (deliveryType) {
    patch.deliveryType = deliveryType
    patch.fulfillment = deliveryType
  }
  const djUid = await resolveDjUid(db)
  if (djUid) patch.scheduledCrewUid = djUid

  if (!rescheduleOnly) {
    const st = String(prev.status || '')
    if (st === 'available') {
      patch.status = 'scheduled'
      patch.scheduledAt = FieldValue.serverTimestamp()
      patch.fulfillmentScheduledTime = `${scheduledDate} ${scheduledWindow}`
    }
  } else {
    patch.fulfillmentScheduledTime = `${scheduledDate} ${scheduledWindow}`
  }
  await ref.set(patch, { merge: true })
  return { prev, patch }
}

async function handleDeliveryPickup(db, token, fleetChannel, text, deliveryType) {
  const parts = splitCommandText(text)
  if (parts.length < 3) {
    const cmd = deliveryType === 'delivery' ? 'delivery' : 'pickup'
    return {
      response_type: 'ephemeral',
      text: `Usage: \`/${cmd} [order-id] [MM/DD] [window]\` — e.g. \`2pm-4pm\``,
    }
  }
  const orderId = parts[0]
  const ymd = parseMmDdToYmd(parts[1])
  const windowStr = parts.slice(2).join(' ')
  if (!ymd || !parseWindowToHourRange(windowStr)) {
    return { response_type: 'ephemeral', text: 'Invalid date (MM/DD) or window (e.g. 2pm-4pm).' }
  }
  await updateOrderSchedule(db, orderId, {
    scheduledDate: ymd,
    scheduledWindow: windowStr,
    deliveryType,
    rescheduleOnly: false,
  })
  const verb = deliveryType === 'delivery' ? 'Delivery' : 'Pickup'
  const lines = [
    `*🚐 ${verb} scheduled*`,
    `*Order:* \`${escapeSlackMrkdwn(orderId)}\``,
    `*Date:* ${escapeSlackMrkdwn(ymd)}`,
    `*Window:* ${escapeSlackMrkdwn(windowStr)}`,
  ]
  await postToFleet(token, fleetChannel, `${verb} ${orderId}`, [
    { type: 'section', text: { type: 'mrkdwn', text: lines.join('\n') } },
  ])
  return { response_type: 'ephemeral', text: `Posted /${deliveryType} to channel.` }
}

async function handleReschedule(db, token, fleetChannel, text) {
  const parts = splitCommandText(text)
  if (parts.length < 3) {
    return {
      response_type: 'ephemeral',
      text: 'Usage: `/reschedule [order-id] [MM/DD] [window]`',
    }
  }
  const orderId = parts[0]
  const ymd = parseMmDdToYmd(parts[1])
  const windowStr = parts.slice(2).join(' ')
  if (!ymd || !parseWindowToHourRange(windowStr)) {
    return { response_type: 'ephemeral', text: 'Invalid date or window.' }
  }
  await updateOrderSchedule(db, orderId, {
    scheduledDate: ymd,
    scheduledWindow: windowStr,
    rescheduleOnly: true,
  })
  const lines = [
    '*📅 Rescheduled*',
    `*Order:* \`${escapeSlackMrkdwn(orderId)}\``,
    `*Date:* ${escapeSlackMrkdwn(ymd)}`,
    `*Window:* ${escapeSlackMrkdwn(windowStr)}`,
  ]
  await postToFleet(token, fleetChannel, `Reschedule ${orderId}`, [
    { type: 'section', text: { type: 'mrkdwn', text: lines.join('\n') } },
  ])
  return { response_type: 'ephemeral', text: 'Posted /reschedule to channel.' }
}

function collectDayState(orders, blockedSlots, crewUid, djUid, ymd) {
  const booked = []
  const bookedHours = new Set()
  for (const o of orders) {
    if (String(o.scheduledDate || '') !== ymd) continue
    if (!orderAppliesToCrew(o, crewUid, djUid)) continue
    for (const h of orderBlocksHours(o)) bookedHours.add(h)
    booked.push(o)
  }
  const blocked = blocksFromSlots(blockedSlots)
  const open = []
  for (const h of operatingHours()) {
    if (!bookedHours.has(h) && !blocked.has(h)) open.push(h)
  }
  return { booked, bookedHours, blocked, open }
}

function sortOrdersChronological(rows) {
  return [...rows].sort((a, b) => {
    const ra = parseWindowToHourRange(a.scheduledWindow || a.scheduledTime || '') || {
      startH: 99,
    }
    const rb = parseWindowToHourRange(b.scheduledWindow || b.scheduledTime || '') || {
      startH: 99,
    }
    if (ra.startH !== rb.startH) return ra.startH - rb.startH
    return String(a.id).localeCompare(String(b.id))
  })
}

async function handleScheduleDay(db, token, fleetChannel, ymd, title) {
  const djUid = await requireDjUid(db)
  const [orders, av] = await Promise.all([
    fetchOrdersScheduledInRange(db, ymd, ymd),
    fetchAvailabilityDay(db, djUid, ymd),
  ])
  const { booked, open } = collectDayState(
    orders,
    av.data.blockedSlots,
    djUid,
    djUid,
    ymd,
  )
  const sorted = sortOrdersChronological(booked)
  const bookedLines = sorted.map((o) => {
    const typ = String(o.deliveryType || o.fulfillment || '—')
    const win = escapeSlackMrkdwn(o.scheduledWindow || o.scheduledTime || '—')
    return `• \`${escapeSlackMrkdwn(o.id)}\` · ${escapeSlackMrkdwn(o.customerName || '—')} · ${escapeSlackMrkdwn(typ)} · ${win}`
  })
  const openLines = open.map((h) => `• ${hourBlockLabel(h)}`)
  const titlePlain = scheduleDayTitlePlain(title)
  const lines = [
    `*${escapeSlackMrkdwn(titlePlain)}* · ${escapeSlackMrkdwn(ymd)} (Denver)`,
    '',
    `*Booked (${formatQty(booked.length)}):*`,
    bookedLines.length ? bookedLines.join('\n') : '_None_',
    '',
    `*Open (${formatQty(open.length)}):*`,
    openLines.length ? openLines.join('\n') : '_None_',
  ]
  await postToFleet(token, fleetChannel, `${titlePlain} ${ymd}`, [
    { type: 'section', text: { type: 'mrkdwn', text: lines.join('\n') } },
  ])
  return { response_type: 'ephemeral', text: 'Posted schedule to channel.' }
}

async function handleTomorrow(db, token, fleetChannel) {
  const today = denverYmd()
  const ymd = addDaysYmd(today, 1)
  return handleScheduleDay(db, token, fleetChannel, ymd, '📆 Tomorrow · DJ')
}

async function handleWeek(db, token, fleetChannel) {
  const djUid = await requireDjUid(db)
  const mon = mondayYmdOfWeekContaining()
  const sun = addDaysYmd(mon, 6)
  const [orders, ...avSnaps] = await Promise.all([
    fetchOrdersScheduledInRange(db, mon, sun),
    ...[0, 1, 2, 3, 4, 5, 6].map((i) => fetchAvailabilityDay(db, djUid, addDaysYmd(mon, i))),
  ])
  const dayLines = [0, 1, 2, 3, 4, 5, 6].map((i) => {
    const ymd = addDaysYmd(mon, i)
    const label = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Denver',
      weekday: 'short',
    }).format(new Date(`${ymd}T12:00:00Z`))
    const { booked, open } = collectDayState(
      orders,
      avSnaps[i].data.blockedSlots,
      djUid,
      djUid,
      ymd,
    )
    return `*${label}* ${ymd}: ${formatQty(booked.length)} booked · ${formatQty(open.length)} open`
  })
  const lines = ['*📆 Week · DJ (Mon–Sun)*', '', ...dayLines]
  await postToFleet(token, fleetChannel, 'Week schedule', [
    { type: 'section', text: { type: 'mrkdwn', text: lines.join('\n') } },
  ])
  return { response_type: 'ephemeral', text: 'Posted /week to channel.' }
}

async function handleUnscheduled(db, token, fleetChannel) {
  const [aSnap, cSnap] = await Promise.all([
    db.collection('orders').where('status', '==', 'available').limit(250).get(),
    db.collection('orders').where('status', '==', 'completed').limit(250).get(),
  ])
  const rows = [...aSnap.docs, ...cSnap.docs]
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((o) => !o.scheduledDate)
  const lines = rows.slice(0, 40).map(
    (o) =>
      `• \`${escapeSlackMrkdwn(o.id)}\` · ${escapeSlackMrkdwn(o.customerName || '—')} · ${escapeSlackMrkdwn(o.status)} · ${formatCurrency(Number(o.totalPrice) || 0)}`,
  )
  const more = rows.length > 40 ? `\n_…and ${formatQty(rows.length - 40)} more (trimmed)._` : ''
  const text = [
    `*📋 Unscheduled* (${formatQty(rows.length)} orders)`,
    '',
    lines.length ? lines.join('\n') : '_None found._',
    more,
  ].join('\n')
  await postToFleet(token, fleetChannel, 'Unscheduled orders', [
    { type: 'section', text: { type: 'mrkdwn', text } },
  ])
  return { response_type: 'ephemeral', text: 'Posted /unscheduled to channel.' }
}

async function handleOpenslots(db, token, fleetChannel, text) {
  const parts = splitCommandText(text)
  if (!parts.length) {
    return { response_type: 'ephemeral', text: 'Usage: `/openslots [MM/DD]`' }
  }
  const ymd = parseMmDdToYmd(parts[0])
  if (!ymd) return { response_type: 'ephemeral', text: 'Invalid MM/DD.' }
  const djUid = await requireDjUid(db)
  const [orders, av] = await Promise.all([
    fetchOrdersScheduledInRange(db, ymd, ymd),
    fetchAvailabilityDay(db, djUid, ymd),
  ])
  const { open } = collectDayState(orders, av.data.blockedSlots, djUid, djUid, ymd)
  const lines = open.map((h) => `• ${hourBlockLabel(h)}`)
  const body = [
    `*🟩 Open slots · ${escapeSlackMrkdwn(ymd)}*`,
    '',
    lines.length ? lines.join('\n') : '_No open hours in 8am–6pm._',
  ].join('\n')
  await postToFleet(token, fleetChannel, `Open slots ${ymd}`, [
    { type: 'section', text: { type: 'mrkdwn', text: body } },
  ])
  return { response_type: 'ephemeral', text: 'Posted /openslots to channel.' }
}

async function handleBlock(db, token, fleetChannel, text, slackUserId) {
  const parts = splitCommandText(text)
  if (parts.length < 3) {
    return {
      response_type: 'ephemeral',
      text: 'Usage: `/block [MM/DD] [start] [end] [optional reason]` — times like `2pm` `4pm`',
    }
  }
  const ymd = parseMmDdToYmd(parts[0])
  const sh = parseClockToHour(parts[1])
  const eh = parseClockToHour(parts[2])
  const reason = parts.slice(3).join(' ').trim() || ''
  const range = normalizeBlockRangeFromParsed(ymd, sh, eh)
  if (!range) return { response_type: 'ephemeral', text: 'Invalid date or times.' }
  const { start, end } = range
  const djUid = await requireDjUid(db)
  const { ref, data } = await fetchAvailabilityDay(db, djUid, ymd)
  const nextSlots = [...(data.blockedSlots || [])]
  nextSlots.push({
    start,
    end,
    reason: reason.slice(0, 200),
    blockedBy: String(slackUserId || '').slice(0, 64),
  })
  await ref.set(
    { blockedSlots: nextSlots, updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  )
  const lines = [
    '*🟥 Block added (DJ)*',
    `*Date:* ${escapeSlackMrkdwn(ymd)}`,
    `*Hours:* ${formatHourAmpm(start)}–${formatHourAmpm(end)}`,
    reason ? `*Reason:* ${escapeSlackMrkdwn(reason)}` : '',
  ].filter(Boolean)
  await postToFleet(token, fleetChannel, 'Availability block', [
    { type: 'section', text: { type: 'mrkdwn', text: lines.join('\n') } },
  ])
  return { response_type: 'ephemeral', text: 'Posted /block to channel.' }
}

async function handleUnblock(db, token, fleetChannel, text) {
  const parts = splitCommandText(text)
  if (parts.length < 3) {
    return { response_type: 'ephemeral', text: 'Usage: `/unblock [MM/DD] [start] [end]`' }
  }
  const ymd = parseMmDdToYmd(parts[0])
  const sh = parseClockToHour(parts[1])
  const eh = parseClockToHour(parts[2])
  const range = normalizeBlockRangeFromParsed(ymd, sh, eh)
  if (!range) return { response_type: 'ephemeral', text: 'Invalid date or times.' }
  const { start, end } = range
  const djUid = await requireDjUid(db)
  const { ref, data } = await fetchAvailabilityDay(db, djUid, ymd)
  const prev = Array.isArray(data.blockedSlots) ? data.blockedSlots : []
  const next = prev.filter((b) => !(Number(b.start) === start && Number(b.end) === end))
  if (next.length === prev.length) {
    return { response_type: 'ephemeral', text: 'No matching block found for that range.' }
  }
  await ref.set(
    { blockedSlots: next, updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  )
  const lines = [
    '*🟩 Block removed (DJ)*',
    `*Date:* ${escapeSlackMrkdwn(ymd)}`,
    `*Hours:* ${formatHourAmpm(start)}–${formatHourAmpm(end)}`,
  ]
  await postToFleet(token, fleetChannel, 'Availability unblock', [
    { type: 'section', text: { type: 'mrkdwn', text: lines.join('\n') } },
  ])
  return { response_type: 'ephemeral', text: 'Posted /unblock to channel.' }
}

async function handleMyavailability(db, token, fleetChannel, text) {
  const parts = splitCommandText(text)
  if (!parts.length) {
    return { response_type: 'ephemeral', text: 'Usage: `/myavailability [MM/DD]`' }
  }
  const ymd = parseMmDdToYmd(parts[0])
  if (!ymd) return { response_type: 'ephemeral', text: 'Invalid MM/DD.' }
  const djUid = await requireDjUid(db)
  const [orders, av] = await Promise.all([
    fetchOrdersScheduledInRange(db, ymd, ymd),
    fetchAvailabilityDay(db, djUid, ymd),
  ])
  const { booked, open } = collectDayState(
    orders,
    av.data.blockedSlots,
    djUid,
    djUid,
    ymd,
  )
  const slots = Array.isArray(av.data.blockedSlots) ? av.data.blockedSlots : []
  const blockLines = slots.map(
    (b) =>
      `• ${formatHourAmpm(Number(b.start))}–${formatHourAmpm(Number(b.end))}${b.reason ? ` — ${escapeSlackMrkdwn(b.reason)}` : ''}`,
  )
  const bookLines = sortOrdersChronological(booked).map(
    (o) =>
      `• \`${escapeSlackMrkdwn(o.id)}\` · ${escapeSlackMrkdwn(o.customerName || '—')} · ${escapeSlackMrkdwn(o.scheduledWindow || o.scheduledTime || '—')}`,
  )
  const openLines = open.map((h) => `• ${hourBlockLabel(h)}`)
  const body = [
    `*📍 My availability · DJ · ${escapeSlackMrkdwn(ymd)}*`,
    '',
    `*Booked:*`,
    bookLines.length ? bookLines.join('\n') : '_None_',
    '',
    `*Blocked:*`,
    blockLines.length ? blockLines.join('\n') : '_None_',
    '',
    `*Open:*`,
    openLines.length ? openLines.join('\n') : '_None_',
  ].join('\n')
  await postToFleet(token, fleetChannel, `Availability ${ymd}`, [
    { type: 'section', text: { type: 'mrkdwn', text: body } },
  ])
  return { response_type: 'ephemeral', text: 'Posted /myavailability to channel.' }
}

/**
 * @returns {Promise<object|null>}
 */
async function tryHandleScheduleSlash(db, token, fleetChannel, form) {
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
  const tid = String(form.trigger_id || '').trim()

  try {
    if (command === '/delivery') {
      return await openScheduleModal(
        botToken,
        tid,
        buildScheduleOrderDateWindowModal(MODAL_DELIVERY_SUBMIT, 'Schedule delivery'),
        'Opening delivery form…',
      )
    }
    if (command === '/pickup') {
      return await openScheduleModal(
        botToken,
        tid,
        buildScheduleOrderDateWindowModal(MODAL_PICKUP_SUBMIT, 'Schedule pickup'),
        'Opening pickup form…',
      )
    }
    if (command === '/reschedule') {
      return await openScheduleModal(
        botToken,
        tid,
        buildScheduleOrderDateWindowModal(MODAL_RESCHEDULE_SUBMIT, 'Reschedule'),
        'Opening reschedule form…',
      )
    }
    if (command === '/schedule') {
      const ymd = denverYmd()
      return await handleScheduleDay(db, botToken, ch, ymd, '📆 Today · DJ')
    }
    if (command === '/tomorrow') {
      return await handleTomorrow(db, botToken, ch)
    }
    if (command === '/week') {
      return await handleWeek(db, botToken, ch)
    }
    if (command === '/unscheduled') {
      return await handleUnscheduled(db, botToken, ch)
    }
    if (command === '/openslots') {
      return await openScheduleModal(botToken, tid, buildOpenslotsModalView(), 'Opening open-slots form…')
    }
    if (command === '/block') {
      return await openScheduleModal(
        botToken,
        tid,
        buildBlockModalView(MODAL_BLOCK_SUBMIT, 'Block time'),
        'Opening block form…',
      )
    }
    if (command === '/unblock') {
      return await openScheduleModal(
        botToken,
        tid,
        buildBlockModalView(MODAL_UNBLOCK_SUBMIT, 'Unblock time'),
        'Opening unblock form…',
      )
    }
    if (command === '/myavailability') {
      return await openScheduleModal(
        botToken,
        tid,
        buildMyavailabilityModalView(),
        'Opening availability form…',
      )
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('scheduleSlash', command, e)
    return { response_type: 'ephemeral', text: `Error: ${escapeSlackMrkdwn(msg)}` }
  }
  return null
}

function hourToAmPmToken(h) {
  const n = Number(h)
  if (!Number.isFinite(n) || n < 0 || n > 23) return '9am'
  if (n === 0) return '12am'
  if (n < 12) return `${n}am`
  if (n === 12) return '12pm'
  return `${n - 12}pm`
}

function schPostedOk(r) {
  const t = String(r?.text || '')
  return r?.response_type === 'ephemeral' && t.startsWith('Posted')
}

/** Input `block_id` on the modal being submitted — for uncaught errors only. */
function scheduleViewErrorBlockId(callbackId) {
  if (callbackId === MODAL_OPENSLOTS_SUBMIT) return 'sch_open_date'
  if (callbackId === MODAL_MYAVAIL_SUBMIT) return 'sch_avail_date'
  if (callbackId === MODAL_BLOCK_SUBMIT || callbackId === MODAL_UNBLOCK_SUBMIT) return 'sch_blk_date'
  return 'sch_ord_id'
}

/**
 * @returns {Promise<{ handled: boolean, kind?: string, body?: object }>}
 */
async function tryHandleScheduleViewSubmission(db, token, envChannel, payload) {
  if (payload.type !== 'view_submission') return { handled: false }
  const cb = payload.view?.callback_id
  const sched = new Set([
    MODAL_DELIVERY_SUBMIT,
    MODAL_PICKUP_SUBMIT,
    MODAL_RESCHEDULE_SUBMIT,
    MODAL_OPENSLOTS_SUBMIT,
    MODAL_BLOCK_SUBMIT,
    MODAL_UNBLOCK_SUBMIT,
    MODAL_MYAVAIL_SUBMIT,
  ])
  if (!sched.has(cb)) return { handled: false }

  const botToken = SLACK_BOT_TOKEN.value() || String(token || '').trim()
  const ch =
    String(envChannel || '').trim() || String(SLACK_CHANNEL_ID.value() || '').trim()
  const view = payload.view
  const slackUserId = String(payload.user?.id || '')

  try {
    if (cb === MODAL_DELIVERY_SUBMIT || cb === MODAL_PICKUP_SUBMIT || cb === MODAL_RESCHEDULE_SUBMIT) {
      const orderId = viewInputValue(view, 'sch_ord_id', 'sch_ord_id_field')
      const dateIso = viewDatepickerValue(view, 'sch_ord_date', 'sch_ord_date_field')
      const windowStr = viewInputValue(view, 'sch_ord_window', 'sch_ord_window_field')
      const errors = {}
      if (!orderId) errors.sch_ord_id = 'Enter an order id.'
      if (!dateIso) errors.sch_ord_date = 'Pick a date.'
      if (!windowStr) errors.sch_ord_window = 'Enter a window (e.g. 2pm-4pm).'
      if (Object.keys(errors).length) {
        return { handled: true, kind: 'json', body: { response_action: 'errors', errors } }
      }
      const mmdd = ymdIsoToMmDdSlash(dateIso)
      const slashText = `${orderId} ${mmdd} ${windowStr}`
      let r
      if (cb === MODAL_RESCHEDULE_SUBMIT) r = await handleReschedule(db, botToken, ch, slashText)
      else if (cb === MODAL_DELIVERY_SUBMIT) r = await handleDeliveryPickup(db, botToken, ch, slashText, 'delivery')
      else r = await handleDeliveryPickup(db, botToken, ch, slashText, 'pickup')
      if (schPostedOk(r)) return { handled: true, kind: 'json', body: { response_action: 'clear' } }
      return {
        handled: true,
        kind: 'json',
        body: { response_action: 'errors', errors: { sch_ord_window: String(r?.text || 'Error').slice(0, 250) } },
      }
    }
    if (cb === MODAL_OPENSLOTS_SUBMIT) {
      const dateIso = viewDatepickerValue(view, 'sch_open_date', 'sch_open_date_field')
      if (!dateIso) {
        return {
          handled: true,
          kind: 'json',
          body: { response_action: 'errors', errors: { sch_open_date: 'Pick a date.' } },
        }
      }
      const mmdd = ymdIsoToMmDdSlash(dateIso)
      const r = await handleOpenslots(db, botToken, ch, mmdd)
      if (schPostedOk(r)) return { handled: true, kind: 'json', body: { response_action: 'clear' } }
      return {
        handled: true,
        kind: 'json',
        body: { response_action: 'errors', errors: { sch_open_date: String(r?.text || 'Error').slice(0, 250) } },
      }
    }
    if (cb === MODAL_MYAVAIL_SUBMIT) {
      const dateIso = viewDatepickerValue(view, 'sch_avail_date', 'sch_avail_date_field')
      if (!dateIso) {
        return {
          handled: true,
          kind: 'json',
          body: { response_action: 'errors', errors: { sch_avail_date: 'Pick a date.' } },
        }
      }
      const mmdd = ymdIsoToMmDdSlash(dateIso)
      const r = await handleMyavailability(db, botToken, ch, mmdd)
      if (schPostedOk(r)) return { handled: true, kind: 'json', body: { response_action: 'clear' } }
      return {
        handled: true,
        kind: 'json',
        body: { response_action: 'errors', errors: { sch_avail_date: String(r?.text || 'Error').slice(0, 250) } },
      }
    }
    if (cb === MODAL_BLOCK_SUBMIT || cb === MODAL_UNBLOCK_SUBMIT) {
      const dateIso = viewDatepickerValue(view, 'sch_blk_date', 'sch_blk_date_field')
      const startHm = viewTimepickerValue(view, 'sch_blk_start', 'sch_blk_start_field')
      const endHm = viewTimepickerValue(view, 'sch_blk_end', 'sch_blk_end_field')
      const reason =
        cb === MODAL_BLOCK_SUBMIT
          ? viewInputValue(view, 'sch_blk_reason', 'sch_blk_reason_field')
          : ''
      const errors = {}
      if (!dateIso) errors.sch_blk_date = 'Pick a date.'
      if (!startHm) errors.sch_blk_start = 'Pick a start time.'
      if (!endHm) errors.sch_blk_end = 'Pick an end time.'
      if (Object.keys(errors).length) {
        return { handled: true, kind: 'json', body: { response_action: 'errors', errors } }
      }
      const mmdd = ymdIsoToMmDdSlash(dateIso)
      const sh = hourFromTimepickerHm(startHm)
      const eh = hourFromTimepickerHm(endHm)
      if (sh == null || eh == null) {
        return {
          handled: true,
          kind: 'json',
          body: { response_action: 'errors', errors: { sch_blk_start: 'Invalid time selection.' } },
        }
      }
      const slashText = [mmdd, hourToAmPmToken(sh), hourToAmPmToken(eh), reason].filter(Boolean).join(' ')
      const r =
        cb === MODAL_BLOCK_SUBMIT
          ? await handleBlock(db, botToken, ch, slashText, slackUserId)
          : await handleUnblock(db, botToken, ch, slashText)
      if (schPostedOk(r)) return { handled: true, kind: 'json', body: { response_action: 'clear' } }
      return {
        handled: true,
        kind: 'json',
        body: { response_action: 'errors', errors: { sch_blk_date: String(r?.text || 'Error').slice(0, 250) } },
      }
    }
  } catch (e) {
    console.error('scheduleViewSubmission', cb, e)
    return {
      handled: true,
      kind: 'json',
      body: viewSubmissionErrorsBody(scheduleViewErrorBlockId(cb), e),
    }
  }

  return { handled: false }
}

module.exports = { tryHandleScheduleSlash, tryHandleScheduleViewSubmission }
