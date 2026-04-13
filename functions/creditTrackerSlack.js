/**
 * Credit limit tracker — Slack slash commands + Block Kit (meta/creditTracker).
 */
const { FieldValue } = require('firebase-admin/firestore')

const MODAL_CREDIT_CHARGE_EDIT = 'credit_modal_charge_edit'

const CREDIT_REF = (db) => db.collection('meta').doc('creditTracker')

function escapeSlackMrkdwn(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function money(n) {
  const x = Number(n)
  if (!Number.isFinite(x)) return '$0.00'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(x)
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

async function slackViewsOpen(token, triggerId, view) {
  return slackApiPost(token, 'views.open', { trigger_id: triggerId, view })
}

function sumPendingTotals(charges) {
  if (!Array.isArray(charges)) return 0
  return charges
    .filter((c) => !c.status || c.status === 'pending')
    .reduce((s, c) => s + (Number(c.total) || 0), 0)
}

function sumRefundPipeline(refunds) {
  if (!Array.isArray(refunds)) return 0
  return refunds.reduce((s, r) => s + (Number(r.amount) || 0), 0)
}

function availableBuyingPower(data) {
  const limit = Number(data.cardLimit) || 0
  const bal = Number(data.currentBalance) || 0
  const pending = sumPendingTotals(data.pendingCharges)
  const refunds = sumRefundPipeline(data.refundPipeline)
  return limit - bal - pending + refunds
}

async function loadCredit(db) {
  const snap = await CREDIT_REF(db).get()
  if (!snap.exists) return null
  return snap.data() || {}
}

function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function encodeChargeDraft(d) {
  return JSON.stringify({
    q: d.qty,
    m: d.mspn,
    p: d.price,
    f: d.fet,
    t: d.total,
    d: String(d.description || '').slice(0, 120),
    ...(d.overrideUnit != null && Number.isFinite(d.overrideUnit) ? { u: d.overrideUnit } : {}),
  })
}

function decodeChargeDraft(raw) {
  try {
    const o = JSON.parse(String(raw || '{}'))
    const overrideUnit = o.u != null ? Number(o.u) : null
    return {
      qty: Number(o.q) || 0,
      mspn: String(o.m || '').trim(),
      price: Number(o.p) || 0,
      fet: Number(o.f) || 0,
      total: Number(o.t) || 0,
      description: String(o.d || ''),
      overrideUnit: Number.isFinite(overrideUnit) ? overrideUnit : null,
    }
  } catch {
    return null
  }
}

function buildChargeConfirmationBlocks(draft, afterAvailable) {
  const catalogPerTire = draft.price + draft.fet
  const perTire =
    draft.overrideUnit != null && Number.isFinite(draft.overrideUnit)
      ? draft.overrideUnit
      : catalogPerTire
  const totalResolved = draft.qty * perTire
  const mergeDraft = {
    ...draft,
    total: totalResolved,
    overrideUnit: Math.abs(perTire - catalogPerTire) > 0.005 ? perTire : null,
  }
  return [
    {
      type: 'header',
      text: { type: 'plain_text', text: '💳 Charge confirmation', emoji: true },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: [
          `*${draft.qty}* × ${escapeSlackMrkdwn(draft.description)} (MSPN \`${escapeSlackMrkdwn(draft.mspn)}\`)`,
          `Catalog: buy ${money(draft.price)} + FET ${money(draft.fet)} = *${money(catalogPerTire)}* / tire`,
          ...(Math.abs(perTire - catalogPerTire) > 0.005
            ? [`*Charge basis (entered):* ${money(perTire)} / tire`]
            : []),
          `*Total:* ${money(totalResolved)}`,
          `*Available after charge:* ${money(afterAvailable)}`,
        ].join('\n'),
      },
    },
    {
      type: 'actions',
      block_id: 'credit_charge_actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Confirm charge ✓', emoji: true },
          style: 'primary',
          action_id: 'credit_charge_confirm',
          value: encodeChargeDraft(mergeDraft),
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Edit', emoji: true },
          action_id: 'credit_charge_edit',
          value: encodeChargeDraft(mergeDraft),
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Cancel', emoji: true },
          action_id: 'credit_charge_cancel',
          value: '1',
        },
      ],
    },
  ]
}

function chargeEditModalView(encodedDraft) {
  const d = decodeChargeDraft(encodedDraft)
  const perTire = d
    ? d.overrideUnit != null && Number.isFinite(d.overrideUnit)
      ? d.overrideUnit
      : d.price + d.fet
    : 0
  return {
    type: 'modal',
    callback_id: MODAL_CREDIT_CHARGE_EDIT,
    private_metadata: encodedDraft,
    title: { type: 'plain_text', text: 'Edit charge' },
    submit: { type: 'plain_text', text: 'Update preview' },
    close: { type: 'plain_text', text: 'Close' },
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: d
            ? `MSPN \`${escapeSlackMrkdwn(d.mspn)}\` · ${escapeSlackMrkdwn(d.description)}`
            : '_Invalid draft_',
        },
      },
      {
        type: 'input',
        block_id: 'credit_edit_qty',
        label: { type: 'plain_text', text: 'Quantity' },
        element: {
          type: 'plain_text_input',
          action_id: 'credit_edit_qty_field',
          initial_value: d ? String(d.qty) : '1',
        },
      },
      {
        type: 'input',
        block_id: 'credit_edit_unit',
        label: { type: 'plain_text', text: 'Buy + FET per tire (USD)' },
        element: {
          type: 'plain_text_input',
          action_id: 'credit_edit_unit_field',
          initial_value: d ? perTire.toFixed(2) : '0',
        },
      },
    ],
  }
}

async function handleSlashCharge(db, text) {
  const parts = String(text || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (parts.length < 2) {
    return {
      response_type: 'ephemeral',
      text: 'Usage: `/charge [qty] [mspn]` — example: `/charge 4 03363`',
    }
  }
  const qty = Math.floor(Number(parts[0]))
  const mspn = String(parts[1] || '').trim()
  if (!Number.isFinite(qty) || qty < 1 || !mspn) {
    return { response_type: 'ephemeral', text: 'Invalid quantity or MSPN.' }
  }

  const tireSnap = await db.collection('tires').doc(mspn).get()
  if (!tireSnap.exists) {
    return { response_type: 'ephemeral', text: `No tire found for MSPN \`${mspn}\`.` }
  }
  const tire = tireSnap.data() || {}
  const price = Number(tire.price ?? tire.cost) || 0
  const fet = Number(tire.fet) || 0
  const description = String(tire.description || tire.tread || 'Tire').trim() || 'Tire'
  const total = qty * (price + fet)

  const credit = await loadCredit(db)
  if (!credit || credit.cardLimit == null) {
    return {
      response_type: 'ephemeral',
      text: 'Credit tracker is not configured. Create `meta/creditTracker` in Firestore (see repo script).',
    }
  }

  const cardLimit = Number(credit.cardLimit) || 0
  const currentBalance = Number(credit.currentBalance) || 0

  const draft = { qty, mspn, price, fet, total, description, overrideUnit: null }
  const blocks = buildChargeConfirmationBlocks(draft, cardLimit - currentBalance - total)
  return {
    response_type: 'in_channel',
    blocks,
    text: `Charge preview · ${qty}×${mspn} · ${money(total)}`,
  }
}

async function handleSlashPayment(db, token, channel, text, userName) {
  const amt = Number(String(text || '').trim().split(/\s+/)[0])
  if (!Number.isFinite(amt) || amt <= 0) {
    return { response_type: 'ephemeral', text: 'Usage: `/payment [amount]` — example: `/payment 2000`' }
  }

  const ref = CREDIT_REF(db)
  const snap = await ref.get()
  if (!snap.exists) {
    return { response_type: 'ephemeral', text: 'Credit tracker doc missing (`meta/creditTracker`).' }
  }

  const prev = Number(snap.get('currentBalance')) || 0
  const newBal = Math.max(0, prev - amt)
  const data = snap.data() || {}
  const payment = {
    id: newId('pay'),
    amount: amt,
    recordedAt: FieldValue.serverTimestamp(),
    recordedBy: String(userName || 'slack').slice(0, 64),
  }
  const payments = [...(Array.isArray(data.payments) ? data.payments : []), payment]
  await ref.update({
    currentBalance: newBal,
    payments,
    updatedAt: FieldValue.serverTimestamp(),
  })

  const avail = availableBuyingPower({
    ...data,
    currentBalance: newBal,
    payments,
  })

  await slackApiPost(token, 'chat.postMessage', {
    channel: channel || slackChannelEnv(),
    text: `Payment ${money(amt)} recorded`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `✅ Payment of ${money(amt)} recorded by *${escapeSlackMrkdwn(userName || 'user')}*.\n*New balance:* ${money(newBal)} · *Available:* ${money(avail)}`,
        },
      },
    ],
  })

  return { response_type: 'ephemeral', text: 'Payment recorded in #fleet-ops.' }
}

async function handleSlashBalance(db) {
  const data = await loadCredit(db)
  if (!data) {
    return { response_type: 'ephemeral', text: 'Credit tracker not configured.' }
  }
  const limit = Number(data.cardLimit) || 0
  const bal = Number(data.currentBalance) || 0
  const pendingArr = Array.isArray(data.pendingCharges) ? data.pendingCharges : []
  const pendingTotal = sumPendingTotals(pendingArr)
  const pendingCount = pendingArr.filter((c) => !c.status || c.status === 'pending').length
  const refundTotal = sumRefundPipeline(data.refundPipeline)
  const avail = availableBuyingPower(data)

  const text = [
    '*💳 Credit snapshot*',
    `*Limit:* ${money(limit)}`,
    `*Current balance:* ${money(bal)}`,
    `*Pending charges:* ${money(pendingTotal)} (${pendingCount} orders)`,
    `*Refund pipeline:* ${money(refundTotal)} coming back`,
    `*Available buying power:* ${money(avail)}`,
  ].join('\n')

  return {
    response_type: 'in_channel',
    blocks: [{ type: 'section', text: { type: 'mrkdwn', text } }],
    text: `Credit · available ${money(avail)}`,
  }
}

/**
 * @param {import('firebase-admin/firestore').Firestore} db
 * @param {string} token
 * @param {string} envChannel
 * @param {Record<string, string>} form — slash command body fields
 */
async function handleCreditSlashCommand(db, token, envChannel, form) {
  const command = String(form.command || '').trim()
  const text = String(form.text || '')
  const channel = String(form.channel_id || envChannel || '')
  const userName = String(form.user_name || form.user_id || 'slack')

  if (command === '/charge') {
    return handleSlashCharge(db, text)
  }
  if (command === '/payment') {
    return handleSlashPayment(db, token, channel, text, userName)
  }
  if (command === '/balance') {
    return handleSlashBalance(db)
  }
  return null
}

async function applyConfirmedCharge(db, draft, chargedBy) {
  const ref = CREDIT_REF(db)
  const id = newId('chg')
  const inc = Number(draft.total)
  if (!Number.isFinite(inc) || inc < 0) {
    throw new Error('Invalid charge total')
  }

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists) throw new Error('creditTracker missing')
    const data = snap.data() || {}
    const charge = {
      id,
      mspn: String(draft.mspn || '').trim(),
      description: String(draft.description || ''),
      qty: draft.qty,
      pricePerTire: draft.price,
      fet: draft.fet,
      total: inc,
      chargedAt: FieldValue.serverTimestamp(),
      chargedBy: String(chargedBy || 'kyle').slice(0, 64),
      status: 'pending',
    }
    const pendingCharges = [...(Array.isArray(data.pendingCharges) ? data.pendingCharges : []), charge]
    const newBal = (Number(data.currentBalance) || 0) + inc
    tx.update(ref, {
      pendingCharges,
      currentBalance: newBal,
      updatedAt: FieldValue.serverTimestamp(),
    })
  })

  return {
    id,
    mspn: draft.mspn,
    description: draft.description,
    qty: draft.qty,
    pricePerTire: draft.price,
    fet: draft.fet,
    total: inc,
    chargedBy: chargedBy || 'kyle',
    status: 'pending',
  }
}

/**
 * @returns {Promise<{ handled: boolean, kind?: string, body?: object }>}
 */
async function tryHandleCreditBlockActions(db, token, envChannel, payload) {
  if (payload.type !== 'block_actions') return { handled: false }
  const action = (payload.actions || [])[0]
  if (!action) return { handled: false }
  const actionId = action.action_id

  if (
    actionId !== 'credit_charge_confirm' &&
    actionId !== 'credit_charge_edit' &&
    actionId !== 'credit_charge_cancel'
  ) {
    return { handled: false }
  }

  const triggerId = payload.trigger_id
  const channel = payload.channel?.id || envChannel
  const ts = payload.message?.ts

  if (actionId === 'credit_charge_cancel') {
    if (channel && ts && token) {
      await slackApiPost(token, 'chat.update', {
        channel,
        ts,
        text: 'Charge cancelled.',
        blocks: [
          {
            type: 'section',
            text: { type: 'mrkdwn', text: '_Charge cancelled._' },
          },
        ],
      })
    }
    return { handled: true, kind: 'empty' }
  }

  if (actionId === 'credit_charge_edit') {
    const draft = decodeChargeDraft(action.value)
    if (!draft || !token || !triggerId) return { handled: true, kind: 'empty' }
    await slackViewsOpen(token, triggerId, chargeEditModalView(action.value))
    return { handled: true, kind: 'empty' }
  }

  if (actionId === 'credit_charge_confirm') {
    const draft = decodeChargeDraft(action.value)
    if (!draft || draft.qty < 1 || !draft.mspn) return { handled: true, kind: 'empty' }
    const user = payload.user?.username || payload.user?.name || 'kyle'
    await applyConfirmedCharge(db, draft, user)
    if (channel && ts && token) {
      await slackApiPost(token, 'chat.update', {
        channel,
        ts,
        text: `Charge confirmed · ${money(draft.total)}`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `✅ *Charge confirmed* — ${draft.qty}× \`${escapeSlackMrkdwn(draft.mspn)}\` · ${money(draft.total)} (${escapeSlackMrkdwn(user)})`,
            },
          },
        ],
      })
    }
    return { handled: true, kind: 'empty' }
  }

  return { handled: false }
}

function inputValue(view, blockId, actionId) {
  const el = view?.state?.values?.[blockId]?.[actionId]
  return String(el?.value || '').trim()
}

/**
 * @returns {Promise<{ handled: boolean, kind?: string, body?: object }>}
 */
async function tryHandleCreditViewSubmission(db, token, envChannel, payload) {
  if (payload.type !== 'view_submission') return { handled: false }
  if (payload.view?.callback_id !== MODAL_CREDIT_CHARGE_EDIT) return { handled: false }

  const view = payload.view
  let encoded = ''
  try {
    encoded = String(view.private_metadata || '')
  } catch {
    return { handled: true, kind: 'json', body: { response_action: 'clear' } }
  }
  const base = decodeChargeDraft(encoded)
  if (!base) {
    return { handled: true, kind: 'json', body: { response_action: 'clear' } }
  }

  const qty = Math.floor(Number(inputValue(view, 'credit_edit_qty', 'credit_edit_qty_field')))
  const unit = Number(inputValue(view, 'credit_edit_unit', 'credit_edit_unit_field'))
  if (!Number.isFinite(qty) || qty < 1 || !Number.isFinite(unit) || unit < 0) {
    return {
      handled: true,
      kind: 'json',
      body: {
        response_action: 'errors',
        errors: {
          credit_edit_qty: 'Enter a valid quantity.',
          credit_edit_unit: 'Enter a valid per-tire amount (buy + FET).',
        },
      },
    }
  }

  const tireSnap = await db.collection('tires').doc(base.mspn).get()
  if (!tireSnap.exists) {
    return {
      handled: true,
      kind: 'json',
      body: { response_action: 'errors', errors: { credit_edit_qty: 'Tire not found.' } },
    }
  }
  const tire = tireSnap.data() || {}
  const price = Number(tire.price ?? tire.cost) || 0
  const fet = Number(tire.fet) || 0
  const total = qty * unit
  const description = String(tire.description || tire.tread || 'Tire').trim() || 'Tire'

  const credit = await loadCredit(db)
  if (!credit) {
    return {
      handled: true,
      kind: 'json',
      body: { response_action: 'errors', errors: { credit_edit_qty: 'Credit tracker not configured.' } },
    }
  }
  const cardLimit = Number(credit.cardLimit) || 0
  const currentBalance = Number(credit.currentBalance) || 0
  const afterAvailable = cardLimit - currentBalance - total

  const draft = {
    qty,
    mspn: base.mspn,
    price,
    fet,
    total,
    description,
    overrideUnit: unit,
  }

  const blocks = buildChargeConfirmationBlocks(draft, afterAvailable)

  try {
    const ch = envChannel || slackChannelEnv()
    if (token && ch) {
      await slackApiPost(token, 'chat.postMessage', {
        channel: ch,
        text: `Updated charge preview · ${qty}×${base.mspn}`,
        blocks,
      })
    }
  } catch (e) {
    console.error('credit edit postMessage', e)
  }

  return { handled: true, kind: 'json', body: { response_action: 'clear' } }
}

function slackChannelEnv() {
  return process.env.SLACK_CHANNEL_ID || process.env.SLACK_OPS_CHANNEL_ID || ''
}

module.exports = {
  handleCreditSlashCommand,
  tryHandleCreditBlockActions,
  tryHandleCreditViewSubmission,
  MODAL_CREDIT_CHARGE_EDIT,
  availableBuyingPower,
  sumPendingTotals,
  sumRefundPipeline,
}
