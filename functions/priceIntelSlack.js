'use strict'

const { FieldValue, Timestamp } = require('firebase-admin/firestore')
const { formatCurrency, formatQty } = require('./format')
const { slackAdminUserIdsRawFromEnv, GEMINI_API_KEY } = require('./slackSecrets')
const { refreshSingleTirePrice, slackApiPost, escapeSlackMrkdwn } = require('./tirePriceResearch')

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

/**
 * @param {import('firebase-admin/firestore').Firestore} db
 * @param {string} token
 * @param {string} fleetChannel
 * @param {Record<string, string>} form
 */
async function tryHandlePriceIntelSlash(db, token, fleetChannel, form) {
  const command = String(form.command || '').trim()
  const text = String(form.text || '').trim()
  const userId = String(form.user_id || '')
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

  const botToken = String(token || '').trim()

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
    const mspn = text.split(/\s+/)[0]
    if (!mspn) {
      return { response_type: 'ephemeral', text: 'Usage: `/refreshprice MSPN`' }
    }
    const geminiKey = GEMINI_API_KEY.value()
    if (!geminiKey || geminiKey === '-') {
      return { response_type: 'ephemeral', text: 'GEMINI_API_KEY is not configured.' }
    }
    ;(async () => {
      try {
        await refreshSingleTirePrice(db, geminiKey, { token: botToken, channel: postChannel }, mspn)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        await slackApiPost(botToken, 'chat.postMessage', {
          channel: postChannel,
          text: `❌ /refreshprice failed for \`${escapeSlackMrkdwn(mspn)}\`: ${escapeSlackMrkdwn(msg)}`,
        }).catch(() => {})
      }
    })()
    return { response_type: 'ephemeral', text: `Running price research for \`${mspn}\` — watch #fleet-ops.` }
  }

  if (command === '/pricehistory') {
    const mspn = text.split(/\s+/)[0]
    if (!mspn) {
      return { response_type: 'ephemeral', text: 'Usage: `/pricehistory MSPN`' }
    }
    const doc = await db.collection('tires').doc(mspn).get()
    if (!doc.exists) {
      return { response_type: 'ephemeral', text: 'Tire not found.' }
    }
    const tire = doc.data() || {}
    const pi = tire.priceIntel && typeof tire.priceIntel === 'object' ? tire.priceIntel : {}
    const sources = Array.isArray(pi.sources) ? pi.sources : []
    const blocks = []
    blocks.push({
      type: 'header',
      text: { type: 'plain_text', text: `Price history · ${mspn}`, emoji: true },
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
        text: `Price history for ${mspn}`,
        blocks,
      })
    }
    return { response_type: 'ephemeral', text: 'Posted price history to #fleet-ops.' }
  }

  if (command === '/confirmpricing') {
    const parts = text.split(/\s+/).filter(Boolean)
    const mspn = parts[0]
    const priceRaw = parts[1]
    if (!mspn || priceRaw == null) {
      return { response_type: 'ephemeral', text: 'Usage: `/confirmpricing MSPN price`' }
    }
    const gate = await resolveSlackUserAdminOrSupplier(db, userId)
    if (!gate.allowed) {
      return { response_type: 'ephemeral', text: 'Admin or Source (supplier) role required.' }
    }
    const price = Number(priceRaw)
    if (!Number.isFinite(price) || price <= 0) {
      return { response_type: 'ephemeral', text: 'Enter a valid positive price.' }
    }
    const ref = db.collection('tires').doc(mspn)
    const snap = await ref.get()
    if (!snap.exists) {
      return { response_type: 'ephemeral', text: 'Tire not found.' }
    }
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
        text: `✅ Kyle confirmed pricing: \`${escapeSlackMrkdwn(mspn)}\` → ${formatCurrency(price)}`,
      })
    }
    return { response_type: 'ephemeral', text: `Confirmed ${formatCurrency(price)} for ${mspn}.` }
  }

  if (command === '/unconfirmpricing') {
    const mspn = text.split(/\s+/)[0]
    if (!mspn) {
      return { response_type: 'ephemeral', text: 'Usage: `/unconfirmpricing MSPN`' }
    }
    if (!isSlackAdmin(userId)) {
      return { response_type: 'ephemeral', text: 'Admin only.' }
    }
    const ref = db.collection('tires').doc(mspn)
    const snap = await ref.get()
    if (!snap.exists) {
      return { response_type: 'ephemeral', text: 'Tire not found.' }
    }
    await ref.update({
      'priceIntel.kyleConfirmed': false,
      'priceIntel.kyleConfirmedAt': null,
    })
    if (botToken && postChannel) {
      await slackApiPost(botToken, 'chat.postMessage', {
        channel: postChannel,
        text: `🔓 Kyle confirmation cleared for \`${escapeSlackMrkdwn(mspn)}\` — automated research may update buy price again.`,
      })
    }
    return { response_type: 'ephemeral', text: `Unfroze pricing for ${mspn}.` }
  }

  return null
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
}
