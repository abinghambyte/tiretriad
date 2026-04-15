'use strict'

const admin = require('firebase-admin')
const { FieldValue, Timestamp } = require('firebase-admin/firestore')
const { parseDescription } = require('./parseTireDescription')
const { formatCurrency, formatPercent, formatQty } = require('./format')

/** @typedef {'updated'|'flagged_delta'|'not_found'|'skipped_kyle'} ResearchOutcome */

function stripJsonFences(text) {
  let s = String(text || '').trim()
  const full = /^```(?:json)?\s*([\s\S]*?)```\s*$/im.exec(s)
  if (full) return full[1].trim()
  const inner = /```(?:json)?\s*([\s\S]*?)```/im.exec(s)
  if (inner) return inner[1].trim()
  return s
    .replace(/^```(?:json)?\s*\n?/i, '')
    .replace(/\n?```\s*$/i, '')
    .trim()
}

function normalizeConfidence(c) {
  const x = String(c || '').toLowerCase()
  if (x === 'high' || x === 'medium' || x === 'low') return x
  return 'low'
}

function tryParsePriceJson(text) {
  const trimmed = stripJsonFences(text)
  if (!trimmed) return { ok: false, price: null, confidence: 'low', notes: 'empty' }
  try {
    const obj = JSON.parse(trimmed)
    if (!obj || typeof obj !== 'object') return { ok: false, price: null, confidence: 'low', notes: 'not object' }
    const price = Number(obj.price)
    const confidence = normalizeConfidence(obj.confidence)
    const notes = String(obj.notes || '').trim().slice(0, 500)
    const okPrice = Number.isFinite(price) && price > 0
    return { ok: okPrice, price: okPrice ? price : null, confidence, notes }
  } catch {
    const start = trimmed.indexOf('{')
    const end = trimmed.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try {
        const obj = JSON.parse(trimmed.slice(start, end + 1))
        const price = Number(obj.price)
        const confidence = normalizeConfidence(obj.confidence)
        const notes = String(obj.notes || '').trim().slice(0, 500)
        const okPrice = Number.isFinite(price) && price > 0
        return { ok: okPrice, price: okPrice ? price : null, confidence, notes }
      } catch {
        return { ok: false, price: null, confidence: 'low', notes: 'parse error' }
      }
    }
    return { ok: false, price: null, confidence: 'low', notes: 'parse error' }
  }
}

/**
 * @param {string} geminiKey
 * @param {string} userPrompt
 */
async function geminiDealerBuyWithSearch(geminiKey, userPrompt) {
  const keyTrim = String(geminiKey || '').trim()
  if (!keyTrim || keyTrim === '-') {
    return {
      rawText: '',
      parsed: { ok: false, price: null, confidence: 'low', notes: 'no api key' },
      modelUsed: null,
    }
  }
  const models = ['gemini-1.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash']
  let lastErr = ''
  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(keyTrim)}`
    const body = {
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      tools: [{ google_search: {} }],
      generationConfig: { temperature: 0.25, maxOutputTokens: 1024 },
    }
    let res
    let json = {}
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      json = await res.json().catch(() => ({}))
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
      continue
    }
    if (!res.ok) {
      lastErr = json?.error?.message || `${res.status}`
      continue
    }
    const parts = json?.candidates?.[0]?.content?.parts
    const text = Array.isArray(parts) ? parts.map((p) => p.text || '').join('').trim() : ''
    if (!text) {
      lastErr = 'empty candidates text'
      continue
    }
    const parsed = tryParsePriceJson(text)
    return { rawText: text, parsed, modelUsed: model }
  }
  return {
    rawText: '',
    parsed: { ok: false, price: null, confidence: 'low', notes: lastErr || 'gemini failed' },
    modelUsed: null,
  }
}

function buildSizeSpec(_tire, d) {
  const parts = []
  if (d.parseKind === 'metric' && d.width != null && d.aspectRatio != null && d.construction && d.rimDiameter != null) {
    const lt = d.ltPrefixedMetric ? 'LT' : ''
    parts.push(`${lt}${d.width}/${d.aspectRatio}${d.construction}${d.rimDiameter}`)
  } else if (d.parseKind === 'flotation' && d.width != null && d.flotationMid && d.rimDiameter != null) {
    const lt = d.trailingLt ? 'LT' : ''
    parts.push(`${d.width}X${d.flotationMid}R${d.rimDiameter}${lt}`)
  }
  const ls = []
  if (d.loadIndex != null) ls.push(String(d.loadIndex))
  if (d.speedRating) ls.push(d.speedRating)
  if (d.extraLoad) ls.push('XL')
  if (ls.length) parts.push(ls.join('/'))
  return parts.join(' ').trim()
}

/**
 * @param {Record<string, unknown>} tire
 * @param {string} mspn
 */
function buildResearchUserPrompt(tire, mspn) {
  const brand = String(tire.brand || '').trim()
  const tread = String(tire.tread || '').trim()
  const desc = String(tire.description || '').trim()
  const d = parseDescription(desc)
  const treadLine = tread || d.treadName || ''
  const size = buildSizeSpec(tire, d)
  const bits = [
    brand && `brand: ${brand}`,
    treadLine && `tread: ${treadLine}`,
    d.width != null && `width: ${d.width}`,
    d.aspectRatio != null && `aspectRatio: ${d.aspectRatio}`,
    d.construction && `construction: ${d.construction}`,
    d.rimDiameter != null && `rimDiameter: ${d.rimDiameter}`,
    d.loadIndex != null && `loadIndex: ${d.loadIndex}`,
    d.speedRating && `speedRating: ${d.speedRating}`,
    d.extraLoad ? 'extraLoad: true' : '',
    size && `size: ${size}`,
  ]
    .filter(Boolean)
    .join('\n')

  return [
    `You are researching US wholesale / dealer FLOOR (dealer cost, not MSRP or retail) for one catalog tire.`,
    `Catalog MSPN: ${mspn}.`,
    bits ? `Parsed / catalog fields:\n${bits}` : `Raw catalog description: ${desc || '—'}`,
    '',
    `What is the current US dealer or wholesale BUY price (dealer cost per tire) for this SKU?`,
    `Return ONLY a JSON object (no markdown fences): { "price": number, "confidence": "high"|"medium"|"low", "notes": string }.`,
    `If you cannot find a defensible dealer wholesale figure, set price to null and confidence to "low".`,
    `Do not include retail or consumer prices — dealer cost only.`,
  ].join('\n')
}

function tireDisplayLine(tire) {
  const brand = String(tire.brand || '').trim()
  const desc = String(tire.description || '').trim()
  return [brand, desc].filter(Boolean).join(' ').trim() || 'Tire'
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

function escapeSlackMrkdwn(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function sourceEntry(price, source) {
  return {
    price: price == null ? null : Number(price),
    source: String(source || '').slice(0, 64),
    recordedAt: Timestamp.now(),
  }
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

/**
 * @param {import('firebase-admin/firestore').Firestore} db
 * @param {number} limit
 */
async function pickTiresForResearch(db, limit) {
  const cutoff = Timestamp.fromMillis(Date.now() - 6 * 86400000)
  const picked = new Map()

  const nullSnap = await db
    .collection('tires')
    .where('priceIntel.lastResearched', '==', null)
    .limit(limit)
    .get()
    .catch(() => ({ docs: [] }))
  for (const d of nullSnap.docs || []) picked.set(d.id, d)

  const need = limit - picked.size
  if (need > 0) {
    const staleSnap = await db
      .collection('tires')
      .where('priceIntel.lastResearched', '<', cutoff)
      .orderBy('priceIntel.lastResearched', 'asc')
      .limit(need)
      .get()
      .catch(() => ({ docs: [] }))
    for (const d of staleSnap.docs || []) {
      if (!picked.has(d.id)) picked.set(d.id, d)
    }
  }
  return [...picked.values()]
}

/**
 * @param {import('firebase-admin/firestore').Firestore} db
 * @param {string} geminiKey
 * @param {{ token: string, channel: string }} slack
 * @param {FirebaseFirestore.QueryDocumentSnapshot} docSnap
 * @param {{ slackMode?: 'batch' | 'single' }} [opts]
 * @returns {Promise<ResearchOutcome>}
 */
async function processTireResearchDoc(db, geminiKey, slack, docSnap, opts = {}) {
  const slackMode = opts.slackMode === 'single' ? 'single' : 'batch'
  const mspn = docSnap.id
  const tire = docSnap.data() || {}
  const ref = docSnap.ref
  const token = String(slack?.token || '').trim()
  const channel = String(slack?.channel || '').trim()

  const piPre = tire.priceIntel && typeof tire.priceIntel === 'object' ? tire.priceIntel : {}
  const curActivePre = Number(piPre.activeBuyPrice)

  const userPrompt = buildResearchUserPrompt(tire, mspn)
  const { parsed } = await geminiDealerBuyWithSearch(geminiKey, userPrompt)

  const foundPrice = parsed.ok && parsed.price != null ? Number(parsed.price) : null
  const gemConf = normalizeConfidence(parsed.confidence)

  let outcome = /** @type {ResearchOutcome} */ ('updated')
  let curActiveForSlack = curActivePre

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists) return
    const t = snap.data() || {}
    const pi = t.priceIntel && typeof t.priceIntel === 'object' ? { ...t.priceIntel } : {}
    const sources = Array.isArray(pi.sources) ? [...pi.sources] : []
    const kyleFrozen = pi.kyleConfirmed === true
    const curActive = Number(pi.activeBuyPrice)
    curActiveForSlack =
      Number.isFinite(curActive) && curActive > 0
        ? curActive
        : Number.isFinite(curActivePre) && curActivePre > 0
          ? curActivePre
          : 0

    if (foundPrice == null || !Number.isFinite(foundPrice) || foundPrice <= 0) {
      sources.push(sourceEntry(null, 'gemini_not_found'))
      tx.update(ref, {
        priceIntel: {
          ...pi,
          flagged: true,
          flagReason: 'not_found',
          sources,
          lastResearched: FieldValue.serverTimestamp(),
        },
      })
      outcome = 'not_found'
      return
    }

    sources.push(sourceEntry(foundPrice, 'gemini_search'))

    if (kyleFrozen) {
      tx.update(ref, {
        priceIntel: {
          ...pi,
          sources,
          lastResearched: FieldValue.serverTimestamp(),
        },
      })
      outcome = 'skipped_kyle'
      return
    }

    const hasCur = Number.isFinite(curActive) && curActive > 0
    const deltaPct = hasCur ? Math.abs(foundPrice - curActive) / curActive : 0

    if (hasCur && deltaPct > 0.15) {
      tx.update(ref, {
        priceIntel: {
          ...pi,
          flagged: true,
          flagReason: 'large_delta',
          sources,
          lastResearched: FieldValue.serverTimestamp(),
        },
      })
      outcome = 'flagged_delta'
      return
    }

    const runningAverage = runningAverageFromSources(sources)
    const activeBuyPrice = foundPrice
    const historicLow = historicLowFromSources(sources, activeBuyPrice)

    tx.update(ref, {
      priceIntel: {
        ...pi,
        activeBuyPrice,
        runningAverage,
        historicLow,
        lastResearched: FieldValue.serverTimestamp(),
        lastUpdated: FieldValue.serverTimestamp(),
        confidence: gemConf,
        flagged: false,
        flagReason: null,
        sources,
      },
    })
    outcome = 'updated'
  })

  if (outcome === 'not_found') {
    if (token && channel) {
      const line = tireDisplayLine(tire)
      await slackApiPost(token, 'chat.postMessage', {
        channel,
        text: `⚠️ Price not found for ${escapeSlackMrkdwn(line)} (MSPN ${escapeSlackMrkdwn(mspn)})`,
      })
    }
    return 'not_found'
  }

  if (outcome === 'skipped_kyle') {
    if (token && channel) {
      await slackApiPost(token, 'chat.postMessage', {
        channel,
        text: `🔒 Research recorded for \`${escapeSlackMrkdwn(mspn)}\` — Kyle-confirmed price unchanged (${formatCurrency(Number(curActiveForSlack) || 0)}).`,
      })
    }
    return 'skipped_kyle'
  }

  if (outcome === 'flagged_delta') {
    const cur = Number.isFinite(Number(curActiveForSlack)) && Number(curActiveForSlack) > 0 ? Number(curActiveForSlack) : 0
    const found = Number(foundPrice)
    if (token && channel && cur > 0) {
      const line = tireDisplayLine(tire)
      const sign = found >= cur ? '+' : ''
      const pctDisp = formatPercent(((found - cur) / cur) * 100, 1)
      await slackApiPost(token, 'chat.postMessage', {
        channel,
        text: `🔔 Price alert: ${escapeSlackMrkdwn(line)} — current ${formatCurrency(cur)}, found ${formatCurrency(found)} (${sign}${pctDisp}). Review before accepting. MSPN ${escapeSlackMrkdwn(mspn)}`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `🔔 *Price alert* — ${escapeSlackMrkdwn(line)}\n• Current: ${formatCurrency(cur)}\n• Found: ${formatCurrency(found)} (${sign}${pctDisp})\n• MSPN: \`${escapeSlackMrkdwn(mspn)}\``,
            },
          },
          {
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: { type: 'plain_text', text: 'Accept new price', emoji: true },
                style: 'primary',
                action_id: 'price_intel_accept',
                value: JSON.stringify({ m: mspn, p: found }),
              },
              {
                type: 'button',
                text: { type: 'plain_text', text: 'Keep current', emoji: true },
                action_id: 'price_intel_keep',
                value: JSON.stringify({ m: mspn }),
              },
            ],
          },
        ],
      })
    }
    return 'flagged_delta'
  }

  if (slackMode === 'single' && token && channel && foundPrice != null && Number.isFinite(foundPrice) && foundPrice > 0) {
    await slackApiPost(token, 'chat.postMessage', {
      channel,
      text: `✅ Price research \`${escapeSlackMrkdwn(mspn)}\` → ${formatCurrency(foundPrice)} (_${escapeSlackMrkdwn(gemConf)}_ confidence)`,
    })
  }

  return 'updated'
}

/**
 * @param {{ token: string, channel: string, geminiKey: string }} opts
 */
async function tirePriceResearchRun(opts) {
  const db = admin.firestore()
  const token = String(opts?.token || '').trim()
  const channel = String(opts?.channel || '').trim()
  const geminiKey = String(opts?.geminiKey || '').trim()
  const docs = await pickTiresForResearch(db, 100)
  let updated = 0
  let flagged = 0
  let notFound = 0
  let skippedKyle = 0
  const slack = { token, channel }
  for (const d of docs) {
    try {
      const out = await processTireResearchDoc(db, geminiKey, slack, d)
      if (out === 'updated') updated += 1
      else if (out === 'flagged_delta') flagged += 1
      else if (out === 'not_found') notFound += 1
      else if (out === 'skipped_kyle') skippedKyle += 1
    } catch (e) {
      console.error('tirePriceResearch tire', d.id, e)
    }
  }
  if (token && channel && docs.length > 0) {
    await slackApiPost(token, 'chat.postMessage', {
      channel,
      text: `🔍 Nightly price research complete — ${formatQty(updated)} updated, ${formatQty(flagged)} flagged, ${formatQty(notFound)} not found, ${formatQty(skippedKyle)} skipped (Kyle confirmed)`,
    })
  }
}

/**
 * @param {import('firebase-admin/firestore').Firestore} db
 * @param {string} geminiKey
 * @param {{ token: string, channel: string }} slack
 * @param {string} mspnRaw
 */
async function refreshSingleTirePrice(db, geminiKey, slack, mspnRaw) {
  const mspn = String(mspnRaw || '').trim()
  if (!mspn) throw new Error('Missing MSPN')
  const snap = await db.collection('tires').doc(mspn).get()
  if (!snap.exists) throw new Error('Tire not found')
  return processTireResearchDoc(db, geminiKey, slack, snap, { slackMode: 'single' })
}

module.exports = {
  tirePriceResearchRun,
  processTireResearchDoc,
  pickTiresForResearch,
  buildResearchUserPrompt,
  geminiDealerBuyWithSearch,
  refreshSingleTirePrice,
  slackApiPost,
  escapeSlackMrkdwn,
}
