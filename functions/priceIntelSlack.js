'use strict'

const { FieldValue, Timestamp } = require('firebase-admin/firestore')
const { formatCurrency, formatQty } = require('./format')
const { slackAdminUserIdsRawFromEnv, GEMINI_API_KEY, SLACK_BOT_TOKEN, SLACK_CHANNEL_ID } = require('./slackSecrets')
const { refreshSingleTirePrice, slackApiPost, escapeSlackMrkdwn } = require('./tirePriceResearch')
const { slackViewsOpen, viewInputValue, viewSubmissionErrorsBody } = require('./slackModalShared')

const MODAL_REFRESH_PRICE_SUBMIT = 'refreshprice_modal_submit'
const MODAL_PRICE_HISTORY_SUBMIT = 'pricehistory_modal_submit'
const MODAL_CONFIRM_PRICING_SUBMIT = 'confirmpricing_modal_submit'
const MODAL_UNCONFIRM_PRICING_SUBMIT = 'unconfirmpricing_modal_submit'

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

function formatTsDenver(ts) {
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

async function resolveSlackUserAdminOrSupplier(db, slackUserId) {
  const sid = String(slackUserId || '').trim()
  if (isSlackAdmin(sid)) return { allowed: true, as: 'admin' }
  const q = await db.collection('users').where('slackUserId', '==', sid).limit(1).get()
  if (q.empty) return { allowed: false }
  const role = String(q.docs[0].data()?.role || '').toLowerCase()
  if (role === 'supplier') return { allowed: true, as: 'supplier' }
  return { allowed: false }
}

function numericPricesFromSources(sources) {
  if (!Array.isArray(sources)) return []
  return sources.map((s) => Number(s?.price)).filter((n) => Number.isFinite(n) && n > 0)
}

function runningAverageFromSources(sources) {
  const nums = numericPricesFromSources(sources)
  if (!nums.length) return 0
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

function historicLowFromSources(sources, activeBuy) {
  const nums = [...numericPricesFromSources(sources)]
  const a = Number(activeBuy)
  if (Number.isFinite(a) && a > 0) nums.push(a)
  if (!nums.length) return 0
  return Math.min(...nums)
}

function sourceEntry(price, source) {
  return {
    price: price == null ? null : Number(price),
    source: String(source || '').slice(0, 64),
    recordedAt: Timestamp.now(),
  }
}

async function openPiModal(botToken, triggerId, view, ackMsg) {
  const tid = String(triggerId || '').trim()
  if (!tid) return { response_type: 'ephemeral', text: 'Missing Slack trigger — try the command again.' }
  try {
    await slackViewsOpen(botToken, tid, view)
    return { response_type: 'ephemeral', text: ackMsg }
  } catch (e) {
    return {
      response_type: 'ephemeral',
      text: `Could not open form: ${e instanceof Error ? e.message : String(e)}`,
    }
  }
}

function buildPiMspnModal(callbackId, title) {
  const t = String(title || 'MSPN').slice(0, 24)
  return {
    type: 'modal',
    callback_id: callbackId,
    title: { type: 'plain_text', text: t },
    submit: { type: 'plain_text', text: 'Submit' },
    close: { type: 'plain_text', text: 'Cancel' },
    blocks: [
      {
        type: 'input',
        block_id: 'pi_mspn',
        label: { type: 'plain_text', text: 'MSPN' },
        element: {
          type: 'plain_text_input',
          action_id: 'pi_mspn_field',
          placeholder: { type: 'plain_text', text: 'Tire MSPN' },
        },
      },
    ],
  }
}

function buildConfirmPricingModalView() {
  return {
    type: 'modal',
    callback_id: MODAL_CONFIRM_PRICING_SUBMIT,
    title: { type: 'plain_text', text: 'Confirm tire price' },
    submit: { type: 'plain_text', text: 'Submit' },
    close: { type: 'plain_text', text: 'Cancel' },
    blocks: [
      {
        type: 'input',
        block_id: 'pi_conf_mspn',
        label: { type: 'plain_text', text: 'MSPN' },
        element: {
          type: 'plain_text_input',
          action_id: 'pi_conf_mspn_field',
          placeholder: { type: 'plain_text', text: 'Tire MSPN' },
        },
      },
      {
        type: 'input',
        block_id: 'pi_conf_price',
        label: { type: 'plain_text', text: 'Buy price (per tire)' },
        element: {
          type: 'plain_text_input',
          action_id: 'pi_conf_price_field',
          placeholder: { type: 'plain_text', text: 'e.g. 142.50' },
        },
      },
    ],
  }
}

/** @returns {string | null} error message, or null if started */
function validateAndStartRefreshPrice(db, botToken, postChannel, mspn) {
  const trimmed = String(mspn || '').trim()
  if (!trimmed) return 'MSPN required.'
  const geminiKey = GEMINI_API_KEY.value()
  if (!geminiKey || geminiKey === '-') {
    return 'GEMINI_API_KEY is not configured.'
  }
  ;(async () => {
    try {
      await refreshSingleTirePrice(db, geminiKey, { token: botToken, channel: postChannel }, trimmed)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      await slackApiPost(botToken, 'chat.postMessage', {
        channel: postChannel,
        text: `❌ /refreshprice failed for \`${escapeSlackMrkdwn(trimmed)}\`: ${escapeSlackMrkdwn(msg)}`,
      }).catch(() => {})
    }
  })()
  return null
}

/** @returns {Promise<string | null>} error message, or null on success */
async function executePriceHistoryPost(db, botToken, postChannel, mspn) {
  const trimmed = String(mspn || '').trim()
  if (!trimmed) return 'MSPN required.'
  const doc = await db.collection('tires').doc(trimmed).get()
  if (!doc.exists) return 'Tire not found.'
  const tire = doc.data() || {}
  const pi = tire.priceIntel && typeof tire.priceIntel === 'object' ? tire.priceIntel : {}
  const sources = Array.isArray(pi.sources) ? pi.sources : []
  const blocks = []
  blocks.push({
    type: 'header',
    text: { type: 'plain_text', text: `Price history · ${trimmed}`, emoji: true },
  })
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: [
        `*Active buy:* ${formatCurrency(Number(pi.activeBuyPrice) || 0)}`,
        `*Rolling avg:* ${formatCurrency(Number(pi.runningAverage) || 0)}`,
        `*Historic low:* ${formatCurrency(Number(pi.historicLow) || 0)}`,
        `*Confidence:* ${escapeSlackMrkdwn(String(pi.confidence || '—'))}`,
        `*Kyle confirmed:* ${pi.kyleConfirmed === true ? 'yes' : 'no'}`,
      ].join('\n'),
    },
  })
  if (!sources.length) {
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: '_No source rows yet._' } })
  } else {
    for (const s of sources.slice(-30)) {
      const p = Number(s.price)
      const px = Number.isFinite(p) && p > 0 ? formatCurrency(p) : '—'
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `• ${px} · _${escapeSlackMrkdwn(String(s.source || '—'))}_ · ${formatTsDenver(s.recordedAt)}`,
        },
      })
    }
  }
  if (botToken && postChannel) {
    await slackApiPost(botToken, 'chat.postMessage', {
      channel: postChannel,
      text: `Price history for ${trimmed}`,
      blocks,
    })
  }
  return null
}

/** @returns {Promise<string | null>} error message, or null on success */
async function executeConfirmPricing(db, botToken, postChannel, userId, mspn, priceRaw) {
  const gate = await resolveSlackUserAdminOrSupplier(db, userId)
  if (!gate.allowed) return 'Admin or Source (supplier) role required.'
  const trimmed = String(mspn || '').trim()
  if (!trimmed) return 'MSPN required.'
  const price = Number(priceRaw)
  if (!Number.isFinite(price) || price <= 0) return 'Enter a valid positive price.'
  const ref = db.collection('tires').doc(trimmed)
  const snap = await ref.get()
  if (!snap.exists) return 'Tire not found.'
  await db.runTransaction(async (tx) => {
    const s = await tx.get(ref)
    const t = s.data() || {}
    const pi = t.priceIntel && typeof t.priceIntel === 'object' ? { ...t.priceIntel } : {}
    const sources = Array.isArray(pi.sources) ? [...pi.sources] : []
    sources.push(sourceEntry(price, 'kyle_confirmed'))
    const runningAverage = runningAverageFromSources(sources)
    const historicLow = historicLowFromSources(sources, price)
    tx.update(ref, {
      priceIntel: {
        ...pi,
        activeBuyPrice: price,
        runningAverage,
        historicLow,
        kyleConfirmed: true,
        kyleConfirmedAt: FieldValue.serverTimestamp(),
        sources,
        flagged: false,
        flagReason: null,
        lastUpdated: FieldValue.serverTimestamp(),
        lastResearched: FieldValue.serverTimestamp(),
      },
    })
  })
  if (botToken && postChannel) {
    await slackApiPost(botToken, 'chat.postMessage', {
      channel: postChannel,
      text: `✅ Kyle confirmed pricing: \`${escapeSlackMrkdwn(trimmed)}\` → ${formatCurrency(price)}`,
    })
  }
  return null
}

/** @returns {Promise<string | null>} error message, or null on success */
async function executeUnconfirmPricing(db, botToken, postChannel, userId, mspn) {
  if (!isSlackAdmin(userId)) return 'Admin only.'
  const trimmed = String(mspn || '').trim()
  if (!trimmed) return 'MSPN required.'
  const ref = db.collection('tires').doc(trimmed)
  const snap = await ref.get()
  if (!snap.exists) return 'Tire not found.'
  await ref.update({
    'priceIntel.kyleConfirmed': false,
    'priceIntel.kyleConfirmedAt': null,
  })
  if (botToken && postChannel) {
    await slackApiPost(botToken, 'chat.postMessage', {
      channel: postChannel,
      text: `🔓 Kyle confirmation cleared for \`${escapeSlackMrkdwn(trimmed)}\` — automated research may update buy price again.`,
    })
  }
  return null
}

/**
 * @param {import('firebase-admin/firestore').Firestore} db
 * @param {string} token
 * @param {string} fleetChannel
 * @param {Record<string, string>} form
 */
async function tryHandlePriceIntelSlash(db, token, fleetChannel, form) {
  const command = String(form.command || '').trim()
  const postChannel = String(fleetChannel || '').trim() || String(form.channel_id || '').trim()

  if (
    command !== '/flaggedprices' &&
    command !== '/refreshprice' &&
    command !== '/pricehistory' &&
    command !== '/confirmpricing' &&
    command !== '/unconfirmpricing'
  ) {
    return null
  }

  const botToken = SLACK_BOT_TOKEN.value() || String(token || '').trim()
  const tid = String(form.trigger_id || '').trim()

  if (command === '/flaggedprices') {
    const snap = await db.collection('tires').where('priceIntel.flagged', '==', true).limit(200).get().catch(() => ({
      docs: [],
    }))
    const rows = (snap.docs || []).map((d) => ({ id: d.id, ...(d.data() || {}) }))
    const groups = new Map()
    for (const r of rows) {
      const pi = r.priceIntel && typeof r.priceIntel === 'object' ? r.priceIntel : {}
      const reason = String(pi.flagReason || 'unknown')
      if (!groups.has(reason)) groups.set(reason, [])
      groups.get(reason).push({ r, pi })
    }
    const blocks = []
    blocks.push({ type: 'header', text: { type: 'plain_text', text: 'Flagged tire prices', emoji: true } })
    if (!rows.length) {
      blocks.push({ type: 'section', text: { type: 'mrkdwn', text: '_No flagged tires._' } })
    } else {
      for (const [reason, list] of groups) {
        blocks.push({
          type: 'section',
          text: { type: 'mrkdwn', text: `*${escapeSlackMrkdwn(reason)}* (${formatQty(list.length)})` },
        })
        for (const { r, pi } of list.slice(0, 25)) {
          const desc = String(r.description || r.brand || '—').trim().slice(0, 120)
          const ab = Number(pi.activeBuyPrice)
          const buyTxt = Number.isFinite(ab) && ab > 0 ? formatCurrency(ab) : '—'
          const lr = formatTsDenver(pi.lastResearched)
          blocks.push({
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `• *\`${escapeSlackMrkdwn(r.id)}\`* ${escapeSlackMrkdwn(String(r.brand || ''))} — ${escapeSlackMrkdwn(desc)}\n  _Buy:_ ${buyTxt} · _Last researched:_ ${lr}`,
            },
          })
        }
        if (list.length > 25) {
          blocks.push({
            type: 'context',
            elements: [{ type: 'mrkdwn', text: `_…+${formatQty(list.length - 25)} more in this group_` }],
          })
        }
      }
    }
    if (botToken && postChannel) {
      await slackApiPost(botToken, 'chat.postMessage', {
        channel: postChannel,
        text: `Flagged prices: ${formatQty(rows.length)} tire(s)`,
        blocks,
      })
    }
    return {
      response_type: 'ephemeral',
      text: `Posted ${formatQty(rows.length)} flagged tire(s) to the fleet Slack channel.`,
    }
  }

  if (command === '/refreshprice') {
    return await openPiModal(
      botToken,
      tid,
      buildPiMspnModal(MODAL_REFRESH_PRICE_SUBMIT, 'Refresh tire price'),
      'Opening refresh-price form…',
    )
  }

  if (command === '/pricehistory') {
    return await openPiModal(
      botToken,
      tid,
      buildPiMspnModal(MODAL_PRICE_HISTORY_SUBMIT, 'Price history'),
      'Opening price history form…',
    )
  }

  if (command === '/confirmpricing') {
    return await openPiModal(
      botToken,
      tid,
      buildConfirmPricingModalView(),
      'Opening confirm-pricing form…',
    )
  }

  if (command === '/unconfirmpricing') {
    return await openPiModal(
      botToken,
      tid,
      buildPiMspnModal(MODAL_UNCONFIRM_PRICING_SUBMIT, 'Unconfirm pricing'),
      'Opening unconfirm form…',
    )
  }

  return null
}

/**
 * @returns {Promise<{ handled: boolean, kind?: string, body?: object }>}
 */
function priceIntelViewErrorBlockId(callbackId) {
  if (callbackId === MODAL_CONFIRM_PRICING_SUBMIT) return 'pi_conf_mspn'
  return 'pi_mspn'
}

async function tryHandlePriceIntelViewSubmission(db, token, envChannel, payload) {
  if (payload.type !== 'view_submission') return { handled: false }
  const cb = payload.view?.callback_id
  const cbs = new Set([
    MODAL_REFRESH_PRICE_SUBMIT,
    MODAL_PRICE_HISTORY_SUBMIT,
    MODAL_CONFIRM_PRICING_SUBMIT,
    MODAL_UNCONFIRM_PRICING_SUBMIT,
  ])
  if (!cbs.has(cb)) return { handled: false }

  const botToken = SLACK_BOT_TOKEN.value() || String(token || '').trim()
  const postChannel =
    String(envChannel || '').trim() || String(SLACK_CHANNEL_ID.value() || '').trim()
  const view = payload.view
  const userId = String(payload.user?.id || '')

  try {
    if (cb === MODAL_REFRESH_PRICE_SUBMIT) {
      const mspn = viewInputValue(view, 'pi_mspn', 'pi_mspn_field')
      if (!mspn) {
        return {
          handled: true,
          kind: 'json',
          body: { response_action: 'errors', errors: { pi_mspn: 'Enter MSPN.' } },
        }
      }
      const err = validateAndStartRefreshPrice(db, botToken, postChannel, mspn)
      if (err) {
        return {
          handled: true,
          kind: 'json',
          body: { response_action: 'errors', errors: { pi_mspn: err.slice(0, 250) } },
        }
      }
      return { handled: true, kind: 'json', body: { response_action: 'clear' } }
    }
    if (cb === MODAL_PRICE_HISTORY_SUBMIT) {
      const mspn = viewInputValue(view, 'pi_mspn', 'pi_mspn_field')
      if (!mspn) {
        return {
          handled: true,
          kind: 'json',
          body: { response_action: 'errors', errors: { pi_mspn: 'Enter MSPN.' } },
        }
      }
      const err = await executePriceHistoryPost(db, botToken, postChannel, mspn)
      if (err) {
        return {
          handled: true,
          kind: 'json',
          body: { response_action: 'errors', errors: { pi_mspn: err.slice(0, 250) } },
        }
      }
      return { handled: true, kind: 'json', body: { response_action: 'clear' } }
    }
    if (cb === MODAL_CONFIRM_PRICING_SUBMIT) {
      const mspn = viewInputValue(view, 'pi_conf_mspn', 'pi_conf_mspn_field')
      const priceRaw = viewInputValue(view, 'pi_conf_price', 'pi_conf_price_field')
      const errors = {}
      if (!mspn) errors.pi_conf_mspn = 'Enter MSPN.'
      if (!priceRaw) errors.pi_conf_price = 'Enter price.'
      if (Object.keys(errors).length) {
        return { handled: true, kind: 'json', body: { response_action: 'errors', errors } }
      }
      const err = await executeConfirmPricing(db, botToken, postChannel, userId, mspn, priceRaw)
      if (err) {
        const key = /price|positive/i.test(err) ? 'pi_conf_price' : 'pi_conf_mspn'
        return {
          handled: true,
          kind: 'json',
          body: { response_action: 'errors', errors: { [key]: err.slice(0, 250) } },
        }
      }
      return { handled: true, kind: 'json', body: { response_action: 'clear' } }
    }
    if (cb === MODAL_UNCONFIRM_PRICING_SUBMIT) {
      const mspn = viewInputValue(view, 'pi_mspn', 'pi_mspn_field')
      if (!mspn) {
        return {
          handled: true,
          kind: 'json',
          body: { response_action: 'errors', errors: { pi_mspn: 'Enter MSPN.' } },
        }
      }
      const err = await executeUnconfirmPricing(db, botToken, postChannel, userId, mspn)
      if (err) {
        return {
          handled: true,
          kind: 'json',
          body: { response_action: 'errors', errors: { pi_mspn: err.slice(0, 250) } },
        }
      }
      return { handled: true, kind: 'json', body: { response_action: 'clear' } }
    }
  } catch (e) {
    console.error('priceIntelViewSubmission', cb, e)
    return {
      handled: true,
      kind: 'json',
      body: viewSubmissionErrorsBody(priceIntelViewErrorBlockId(cb), e),
    }
  }

  return { handled: false }
}

/**
 * @returns {Promise<{ handled: boolean, kind?: string, body?: object }>}
 */
async function tryHandlePriceIntelBlockActions(db, token, envChannel, payload) {
  if (payload.type !== 'block_actions') return { handled: false }
  const action = (payload.actions || [])[0]
  if (!action) return { handled: false }
  const actionId = action.action_id
  if (actionId !== 'price_intel_accept' && actionId !== 'price_intel_keep') {
    return { handled: false }
  }

  const channel = payload.channel?.id || envChannel
  const ts = payload.message?.ts
  let meta = {}
  try {
    meta = JSON.parse(String(action.value || '{}'))
  } catch {
    return { handled: true, kind: 'empty' }
  }
  const mspn = String(meta.m || '').trim()
  if (!mspn) return { handled: true, kind: 'empty' }

  const ref = db.collection('tires').doc(mspn)

  if (actionId === 'price_intel_keep') {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref)
      if (!snap.exists) return
      const t = snap.data() || {}
      const pi = t.priceIntel && typeof t.priceIntel === 'object' ? { ...t.priceIntel } : {}
      tx.update(ref, {
        priceIntel: {
          ...pi,
          flagged: false,
          flagReason: null,
        },
      })
    })
    if (channel && ts && token) {
      await slackApiPost(token, 'chat.update', {
        channel,
        ts,
        text: `Kept current price for \`${escapeSlackMrkdwn(mspn)}\`.`,
        blocks: [
          {
            type: 'section',
            text: { type: 'mrkdwn', text: `_Kept current price for_ \`${escapeSlackMrkdwn(mspn)}\`_.` },
          },
        ],
      })
    }
    return { handled: true, kind: 'empty' }
  }

  const proposed = Number(meta.p)
  if (!Number.isFinite(proposed) || proposed <= 0) return { handled: true, kind: 'empty' }

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists) return
    const t = snap.data() || {}
    const pi = t.priceIntel && typeof t.priceIntel === 'object' ? { ...t.priceIntel } : {}
    const sources = Array.isArray(pi.sources) ? [...pi.sources] : []
    sources.push(sourceEntry(proposed, 'slack_accept'))
    const runningAverage = runningAverageFromSources(sources)
    const historicLow = historicLowFromSources(sources, proposed)
    tx.update(ref, {
      priceIntel: {
        ...pi,
        activeBuyPrice: proposed,
        runningAverage,
        historicLow,
        sources,
        flagged: false,
        flagReason: null,
        lastUpdated: FieldValue.serverTimestamp(),
      },
    })
  })

  if (channel && ts && token) {
    await slackApiPost(token, 'chat.update', {
      channel,
      ts,
      text: `Accepted new price for \`${escapeSlackMrkdwn(mspn)}\`: ${formatCurrency(proposed)}`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `✅ *Accepted new price* for \`${escapeSlackMrkdwn(mspn)}\` — ${formatCurrency(proposed)}`,
          },
        },
      ],
    })
  }
  return { handled: true, kind: 'empty' }
}

module.exports = {
  tryHandlePriceIntelSlash,
  tryHandlePriceIntelBlockActions,
  tryHandlePriceIntelViewSubmission,
}
