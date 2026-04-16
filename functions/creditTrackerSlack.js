/**
 * Credit limit tracker — Slack slash commands + Block Kit (meta/creditTracker).
 */
const { FieldValue } = require('firebase-admin/firestore')
const { formatCurrency, formatQty } = require('./format')
const { tireCatalogBuyNumber } = require('./tireCatalogBuy')
const { SLACK_BOT_TOKEN, SLACK_CHANNEL_ID, SLACK_SECRETS } = require('./slackSecrets')
const { tryHandleFinanceSlash } = require('./financeSlackCommands')
const { tryHandleLookupUtilitySlash } = require('./lookupUtilitySlackCommands')
const { tryHandleScheduleSlash } = require('./scheduleSlackCommands')
const { tryHandleFieldSlash } = require('./fieldSlackCommands')
const { tryHandleInventorySlash } = require('./inventorySlackCommands')
const { tryHandleCrmSlash } = require('./crmSlackCommands')
const { tryHandlePriceIntelSlash } = require('./priceIntelSlack')
const { viewSubmissionErrorsBody } = require('./slackModalShared')

const MODAL_CREDIT_CHARGE_EDIT = 'credit_modal_charge_edit'
/** Initial /charge modal — submit opens same preview as `/charge [qty] [mspn]`. */
const MODAL_CHARGE_SUBMIT = 'charge_modal_submit'
const MODAL_PAYMENT_SUBMIT = 'payment_modal_submit'

const CREDIT_REF = (db) => db.collection('meta').doc('creditTracker')

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

/** Buying power per tracker rules: limit minus balance only (pendingCharges is informational). */
function availableBuyingPower(data) {
  const limit = Number(data.cardLimit) || 0
  const bal = Number(data.currentBalance) || 0
  return limit - bal
}

async function latestOrderForMspn(db, mspn) {
  const id = String(mspn || '').trim()
  if (!id) return null
  const snap = await db
    .collection('orders')
    .where('mspn', '==', id)
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get()
  if (snap.empty) return null
  return snap.docs[0].data() || {}
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
    cat: d.catalogBuy,
    pt: d.pricePerTire,
    f: d.fet,
    t: d.total,
    d: String(d.description || '').slice(0, 120),
  })
}

function decodeChargeDraft(raw) {
  try {
    const o = JSON.parse(String(raw || '{}'))
    const catalogBuy = Number(o.cat != null ? o.cat : o.p) || 0
    const pricePerTire = Number(o.pt != null ? o.pt : o.p) || 0
    return {
      qty: Number(o.q) || 0,
      mspn: String(o.m || '').trim(),
      catalogBuy,
      pricePerTire,
      fet: Number(o.f) || 0,
      total: Number(o.t) || 0,
      description: String(o.d || ''),
    }
  } catch {
    return null
  }
}

function buildChargeConfirmationBlocks(draft, afterAvailable) {
  const fet = Number(draft.fet) || 0
  const buy = Number(draft.pricePerTire) || 0
  const catalogBuy = Number(draft.catalogBuy) || 0
  const combinedCharge = buy + fet
  const totalResolved = draft.qty * combinedCharge
  const mergeDraft = {
    ...draft,
    total: totalResolved,
    pricePerTire: buy,
    catalogBuy,
    fet,
  }
  const catalogCombined = catalogBuy + fet
  const basisDiffers = Math.abs(buy - catalogBuy) > 0.005
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
          `*${formatQty(draft.qty)}* × ${escapeSlackMrkdwn(draft.description)} (MSPN \`${escapeSlackMrkdwn(draft.mspn)}\`)`,
          `*Buy basis (before FET):* ${formatCurrency(buy)} + FET ${formatCurrency(fet)} → *${formatCurrency(combinedCharge)}* / tire`,
          ...(basisDiffers
            ? [
                `_Catalog buy (before FET):_ ${formatCurrency(catalogBuy)} → buy+FET _${formatCurrency(catalogCombined)}_ / tire`,
              ]
            : []),
          `*Total:* ${formatCurrency(totalResolved)}`,
          `*Available after charge:* ${formatCurrency(afterAvailable)}`,
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

function buildPaymentModalView() {
  return {
    type: 'modal',
    callback_id: MODAL_PAYMENT_SUBMIT,
    title: { type: 'plain_text', text: 'Record payment' },
    submit: { type: 'plain_text', text: 'Submit' },
    close: { type: 'plain_text', text: 'Cancel' },
    blocks: [
      {
        type: 'input',
        block_id: 'payment_modal_amount',
        label: { type: 'plain_text', text: 'Amount (USD)' },
        element: {
          type: 'plain_text_input',
          action_id: 'payment_modal_amount_field',
          placeholder: { type: 'plain_text', text: 'e.g. 2000' },
        },
      },
    ],
  }
}

function buildChargeInitialModalView() {
  return {
    type: 'modal',
    callback_id: MODAL_CHARGE_SUBMIT,
    title: { type: 'plain_text', text: 'New charge' },
    submit: { type: 'plain_text', text: 'Preview' },
    close: { type: 'plain_text', text: 'Cancel' },
    blocks: [
      {
        type: 'input',
        block_id: 'charge_modal_mspn',
        label: { type: 'plain_text', text: 'MSPN' },
        element: {
          type: 'plain_text_input',
          action_id: 'charge_modal_mspn_field',
          placeholder: { type: 'plain_text', text: 'e.g. 03363' },
        },
      },
      {
        type: 'input',
        block_id: 'charge_modal_qty',
        label: { type: 'plain_text', text: 'Quantity' },
        element: {
          type: 'plain_text_input',
          action_id: 'charge_modal_qty_field',
          placeholder: { type: 'plain_text', text: 'e.g. 4' },
        },
      },
    ],
  }
}

function chargeEditModalView(encodedDraft) {
  const d = decodeChargeDraft(encodedDraft)
  const ppt = d ? Number(d.pricePerTire) || 0 : 0
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
        block_id: 'credit_edit_price',
        label: { type: 'plain_text', text: 'Price per tire (before FET, USD)' },
        element: {
          type: 'plain_text_input',
          action_id: 'credit_edit_price_field',
          initial_value: d ? ppt.toFixed(2) : '0',
        },
      },
    ],
  }
}

/**
 * Build charge preview + post to fleet channel. Used by `/charge` and charge modal submit.
 * @returns {Promise<{ ok: true, ephemeral: string } | { ok: false, ephemeral: string, modalErrors?: Record<string, string> }>}
 */
async function runChargePreviewFromQtyMspn(db, token, qty, mspn) {
  const id = String(mspn || '').trim()
  if (!Number.isFinite(qty) || qty < 1 || !id) {
    const modalErrors = {}
    if (!id) modalErrors.charge_modal_mspn = 'Enter an MSPN.'
    if (!Number.isFinite(qty) || qty < 1) modalErrors.charge_modal_qty = 'Enter a valid quantity (1+).'
    return {
      ok: false,
      ephemeral: 'Invalid quantity or MSPN.',
      modalErrors,
    }
  }

  const tireSnap = await db.collection('tires').doc(id).get()
  if (!tireSnap.exists) {
    const msg = `No tire found for MSPN \`${id}\`.`
    return {
      ok: false,
      ephemeral: msg,
      modalErrors: { charge_modal_mspn: `No tire found for MSPN \`${id}\`.` },
    }
  }
  const tire = tireSnap.data() || {}
  const catalogBuy = tireCatalogBuyNumber(tire)
  const fet = Number(tire.fet) || 0
  const description = String(tire.description || tire.tread || 'Tire').trim() || 'Tire'

  const lastOrder = await latestOrderForMspn(db, id)
  let pricePerTire = catalogBuy
  if (
    lastOrder &&
    lastOrder.kylePriceOverride != null &&
    Number.isFinite(Number(lastOrder.kylePriceOverride))
  ) {
    pricePerTire = Number(lastOrder.kylePriceOverride)
  }
  const total = qty * (pricePerTire + fet)

  const credit = await loadCredit(db)
  if (!credit || credit.cardLimit == null) {
    const msg =
      'Credit tracker is not configured. Create `meta/creditTracker` in Firestore (see repo script).'
    return {
      ok: false,
      ephemeral: msg,
      modalErrors: { charge_modal_mspn: msg },
    }
  }

  const availBefore = availableBuyingPower(credit)
  const afterAvail = availBefore - total

  const fleetCh = String(SLACK_CHANNEL_ID.value() || '').trim()
  if (!token || !fleetCh) {
    const msg =
      'Set Secret Manager `SLACK_BOT_TOKEN` and `SLACK_CHANNEL_ID` so charge previews can be posted.'
    return {
      ok: false,
      ephemeral: msg,
      modalErrors: { charge_modal_mspn: msg },
    }
  }

  const draft = {
    qty,
    mspn: id,
    catalogBuy,
    pricePerTire,
    fet,
    total,
    description,
  }
  const blocks = buildChargeConfirmationBlocks(draft, afterAvail)
  try {
    await slackApiPost(token, 'chat.postMessage', {
      channel: fleetCh,
      text: `Charge preview · ${formatQty(qty)}×${id} · ${formatCurrency(total)}`,
      blocks,
    })
  } catch (e) {
    console.error('credit charge postMessage', e)
    const msg = `Could not post to #fleet-ops: ${e?.message || 'Slack API error'}`
    return {
      ok: false,
      ephemeral: msg,
      modalErrors: { charge_modal_qty: msg },
    }
  }
  return { ok: true, ephemeral: 'Posted charge preview to #fleet-ops.' }
}

/**
 * @param {import('firebase-admin/firestore').Firestore} db
 * @param {string} token
 * @param {Record<string, string>} form — slash body (needs trigger_id for modal)
 */
async function handleSlashCharge(db, token, _text, form) {
  const triggerId = String(form?.trigger_id || '').trim()
  if (!triggerId) {
    return { response_type: 'ephemeral', text: 'Missing Slack trigger — try `/charge` again from Slack.' }
  }
  try {
    await slackViewsOpen(token, triggerId, buildChargeInitialModalView())
    return {
      response_type: 'ephemeral',
      text: 'Opening charge form — enter MSPN and quantity, then submit to preview.',
    }
  } catch (e) {
    console.error('charge views.open', e)
    return {
      response_type: 'ephemeral',
      text: `Could not open form: ${e instanceof Error ? e.message : String(e)}`,
    }
  }
}

/**
 * @returns {Promise<{ ok: true } | { ok: false, ephemeral: string, modalErrors?: Record<string, string> }>}
 */
async function recordPaymentAmount(db, token, channel, amt, userName) {
  if (!Number.isFinite(amt) || amt <= 0) {
    return {
      ok: false,
      ephemeral: 'Invalid amount.',
      modalErrors: { payment_modal_amount: 'Enter a valid positive amount.' },
    }
  }

  const ref = CREDIT_REF(db)
  const payment = {
    id: newId('pay'),
    amount: amt,
    recordedAt: FieldValue.serverTimestamp(),
    recordedBy: String(userName || 'slack').slice(0, 64),
  }

  const pre = await ref.get()
  if (!pre.exists) {
    const msg = 'Credit tracker doc missing (`meta/creditTracker`).'
    return { ok: false, ephemeral: msg, modalErrors: { payment_modal_amount: msg } }
  }

  let newBal = 0
  let avail = 0
  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref)
      if (!snap.exists) throw new Error('creditTracker missing')
      const data = snap.data() || {}
      const prev = Number(data.currentBalance) || 0
      newBal = Math.max(0, prev - amt)
      const payments = [...(Array.isArray(data.payments) ? data.payments : []), payment]
      const limit = Number(data.cardLimit) || 0
      avail = limit - newBal
      tx.update(ref, {
        currentBalance: newBal,
        payments,
        updatedAt: FieldValue.serverTimestamp(),
      })
    })
  } catch (e) {
    console.error('credit payment tx', e)
    const msg = 'Could not record payment — try again.'
    return { ok: false, ephemeral: msg, modalErrors: { payment_modal_amount: msg } }
  }

  const postCh = channel || String(SLACK_CHANNEL_ID.value() || '').trim()
  await slackApiPost(token, 'chat.postMessage', {
    channel: postCh,
    text: `Payment ${formatCurrency(amt)} recorded`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `✅ Payment of ${formatCurrency(amt)} recorded by *${escapeSlackMrkdwn(userName || 'user')}*.\n*New balance:* ${formatCurrency(newBal)} · *Available:* ${formatCurrency(avail)}`,
        },
      },
    ],
  })

  return { ok: true }
}

async function handleSlashPayment(db, token, channel, _text, userName, form) {
  const triggerId = String(form?.trigger_id || '').trim()
  if (!triggerId) {
    return { response_type: 'ephemeral', text: 'Missing Slack trigger — try `/payment` again from Slack.' }
  }
  try {
    await slackViewsOpen(token, triggerId, buildPaymentModalView())
    return { response_type: 'ephemeral', text: 'Opening payment form…' }
  } catch (e) {
    console.error('payment views.open', e)
    return {
      response_type: 'ephemeral',
      text: `Could not open form: ${e instanceof Error ? e.message : String(e)}`,
    }
  }
}

async function handleSlashBalance(db, token, envChannel) {
  const data = await loadCredit(db)
  if (!data) {
    return { response_type: 'ephemeral', text: 'Credit tracker not configured.' }
  }
  const limit = Number(data.cardLimit) || 0
  const bal = Number(data.currentBalance) || 0
  const pendingArr = Array.isArray(data.pendingCharges) ? data.pendingCharges : []
  const pendingTotal = sumPendingTotals(pendingArr)
  const pendingCount = pendingArr.filter((c) => !c.status || c.status === 'pending').length
  const refunds = Array.isArray(data.refundPipeline) ? data.refundPipeline : []
  const refundActive = refunds.filter((r) => r && (r.status == null || r.status === 'active'))
  const refundLines = refundActive.length
    ? refundActive
        .slice(0, 8)
        .map(
          (r) =>
            `• ${formatCurrency(Number(r.amount) || 0)}${r.label ? ` — ${escapeSlackMrkdwn(r.label)}` : ''}`,
        )
        .join('\n')
    : '_None_'
  const avail = availableBuyingPower(data)

  const text = [
    '*💳 Credit snapshot*',
    `*Limit:* ${formatCurrency(limit)}`,
    `*Current balance:* ${formatCurrency(bal)}`,
    `*Available buying power:* ${formatCurrency(avail)} _(limit − balance)_`,
    '',
    `_Pending charges (log, not subtracted from available):_ ${formatCurrency(pendingTotal)} · ${pendingCount} line(s)`,
    '',
    '*Refund pipeline (active):*',
    refundLines,
  ].join('\n')

  const ch = String(envChannel || '').trim() || String(SLACK_CHANNEL_ID.value() || '').trim()
  if (token && ch) {
    try {
      await slackApiPost(token, 'chat.postMessage', {
        channel: ch,
        text: `Credit · available ${formatCurrency(avail)}`,
        blocks: [{ type: 'section', text: { type: 'mrkdwn', text } }],
      })
    } catch (e) {
      console.error('credit balance postMessage', e)
      return {
        response_type: 'ephemeral',
        text: `Could not post snapshot: ${e?.message || 'Slack API error'}`,
      }
    }
  } else {
    return {
      response_type: 'ephemeral',
      text: 'Set `SLACK_CHANNEL_ID` (and bot token) to post balance to #fleet-ops.',
    }
  }
  return { response_type: 'ephemeral', text: 'Posted credit snapshot to #fleet-ops.' }
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

  if (!Array.isArray(SLACK_SECRETS) || SLACK_SECRETS.length < 1) {
    return { response_type: 'ephemeral', text: 'Slack secrets (SLACK_SECRETS) are not configured.' }
  }
  const botToken = SLACK_BOT_TOKEN.value() || String(token || '').trim()
  const fleetChannel =
    String(channel || envChannel || '').trim() || String(SLACK_CHANNEL_ID.value() || '').trim()

  const financeResp = await tryHandleFinanceSlash(db, botToken, fleetChannel, form)
  if (financeResp) return financeResp

  const lookupResp = await tryHandleLookupUtilitySlash(db, botToken, fleetChannel, form)
  if (lookupResp) return lookupResp

  const scheduleResp = await tryHandleScheduleSlash(db, botToken, fleetChannel, form)
  if (scheduleResp) return scheduleResp

  const fieldResp = await tryHandleFieldSlash(db, botToken, fleetChannel, form)
  if (fieldResp) return fieldResp

  const inventoryResp = await tryHandleInventorySlash(db, botToken, fleetChannel, form)
  if (inventoryResp) return inventoryResp

  const crmSlashResp = await tryHandleCrmSlash(db, botToken, fleetChannel, form)
  if (crmSlashResp) return crmSlashResp

  const priceIntelResp = await tryHandlePriceIntelSlash(db, botToken, fleetChannel, form)
  if (priceIntelResp) return priceIntelResp

  if (command === '/charge') {
    return handleSlashCharge(db, botToken, text, form)
  }
  if (command === '/payment') {
    return handleSlashPayment(db, botToken, channel, text, userName, form)
  }
  if (command === '/balance') {
    return handleSlashBalance(db, botToken, envChannel)
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
      pricePerTire: Number(draft.pricePerTire) || 0,
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
    pricePerTire: Number(draft.pricePerTire) || 0,
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
        text: `Charge confirmed · ${formatCurrency(draft.total)}`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `✅ *Charge confirmed* — ${formatQty(draft.qty)}× \`${escapeSlackMrkdwn(draft.mspn)}\` · ${formatCurrency(draft.total)} (${escapeSlackMrkdwn(user)})`,
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

/** Prefer exact callback ids — substring matching would mis-map `credit_modal_charge_edit` to charge. */
function creditViewErrorBlockId(callbackId) {
  if (callbackId === MODAL_PAYMENT_SUBMIT) return 'payment_modal_amount'
  if (callbackId === MODAL_CHARGE_SUBMIT) return 'charge_modal_qty'
  if (callbackId === MODAL_CREDIT_CHARGE_EDIT) return 'credit_edit_qty'
  return ''
}

/**
 * @returns {Promise<{ handled: boolean, kind?: string, body?: object }>}
 */
async function tryHandleCreditViewSubmission(db, token, envChannel, payload) {
  if (payload.type !== 'view_submission') return { handled: false }
  const view = payload.view
  const cb = view?.callback_id

  try {
    if (cb === MODAL_PAYMENT_SUBMIT) {
      const amt = Number(inputValue(view, 'payment_modal_amount', 'payment_modal_amount_field'))
      const userName = String(payload.user?.username || payload.user?.name || payload.user?.id || 'slack')
      const ch = String(envChannel || '').trim() || String(SLACK_CHANNEL_ID.value() || '').trim()
      const res = await recordPaymentAmount(db, token, ch, amt, userName)
      if (!res.ok) {
        if (res.modalErrors && Object.keys(res.modalErrors).length) {
          return { handled: true, kind: 'json', body: { response_action: 'errors', errors: res.modalErrors } }
        }
        return {
          handled: true,
          kind: 'json',
          body: {
            response_action: 'errors',
            errors: { payment_modal_amount: res.ephemeral || 'Could not record payment.' },
          },
        }
      }
      return { handled: true, kind: 'json', body: { response_action: 'clear' } }
    }

    if (cb === MODAL_CHARGE_SUBMIT) {
      const mspn = inputValue(view, 'charge_modal_mspn', 'charge_modal_mspn_field')
      const qtyRaw = inputValue(view, 'charge_modal_qty', 'charge_modal_qty_field')
      const qty = Math.floor(Number(qtyRaw))
      const errors = {}
      if (!String(mspn || '').trim()) {
        errors.charge_modal_mspn = 'Enter an MSPN.'
      }
      if (!Number.isFinite(qty) || qty < 1) {
        errors.charge_modal_qty = 'Enter a valid quantity (1+).'
      }
      if (Object.keys(errors).length) {
        return { handled: true, kind: 'json', body: { response_action: 'errors', errors } }
      }
      const result = await runChargePreviewFromQtyMspn(db, token, qty, mspn)
      if (!result.ok && result.modalErrors && Object.keys(result.modalErrors).length) {
        return { handled: true, kind: 'json', body: { response_action: 'errors', errors: result.modalErrors } }
      }
      if (!result.ok) {
        return {
          handled: true,
          kind: 'json',
          body: {
            response_action: 'errors',
            errors: { charge_modal_qty: result.ephemeral || 'Could not post charge preview.' },
          },
        }
      }
      return { handled: true, kind: 'json', body: { response_action: 'clear' } }
    }

    if (cb !== MODAL_CREDIT_CHARGE_EDIT) return { handled: false }

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
    const pricePerTire = Number(inputValue(view, 'credit_edit_price', 'credit_edit_price_field'))
    if (!Number.isFinite(qty) || qty < 1 || !Number.isFinite(pricePerTire) || pricePerTire < 0) {
      return {
        handled: true,
        kind: 'json',
        body: {
          response_action: 'errors',
          errors: {
            credit_edit_qty: 'Enter a valid quantity.',
            credit_edit_price: 'Enter a valid price per tire (before FET).',
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
    const catalogBuy = tireCatalogBuyNumber(tire)
    const fet = Number(tire.fet) || 0
    const total = qty * (pricePerTire + fet)
    const description = String(tire.description || tire.tread || 'Tire').trim() || 'Tire'

    const credit = await loadCredit(db)
    if (!credit) {
      return {
        handled: true,
        kind: 'json',
        body: { response_action: 'errors', errors: { credit_edit_qty: 'Credit tracker not configured.' } },
      }
    }
    const availBefore = availableBuyingPower(credit)
    const afterAvailable = availBefore - total

    const draft = {
      qty,
      mspn: base.mspn,
      catalogBuy,
      pricePerTire,
      fet,
      total,
      description,
    }

    const blocks = buildChargeConfirmationBlocks(draft, afterAvailable)

    try {
      const ch = String(envChannel || '').trim() || String(SLACK_CHANNEL_ID.value() || '').trim()
      if (token && ch) {
        await slackApiPost(token, 'chat.postMessage', {
          channel: ch,
          text: `Updated charge preview · ${formatQty(qty)}×${base.mspn}`,
          blocks,
        })
      }
    } catch (e) {
      console.error('credit edit postMessage', e)
    }

    return { handled: true, kind: 'json', body: { response_action: 'clear' } }
  } catch (e) {
    console.error('creditViewSubmission', cb, e)
    return {
      handled: true,
      kind: 'json',
      body: viewSubmissionErrorsBody(creditViewErrorBlockId(cb), e, view),
    }
  }
}

module.exports = {
  handleCreditSlashCommand,
  tryHandleCreditBlockActions,
  tryHandleCreditViewSubmission,
  MODAL_CREDIT_CHARGE_EDIT,
  MODAL_CHARGE_SUBMIT,
  MODAL_PAYMENT_SUBMIT,
  availableBuyingPower,
  sumPendingTotals,
  sumRefundPipeline,
}
