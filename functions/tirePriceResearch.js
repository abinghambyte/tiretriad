/**
 * Nightly retail-price research.
 *
 * Looks up the typical US retail price per tire using Gemini with Google search
 * grounding, and writes the result to `priceIntel.retailPrice`. Source of truth
 * for Kyle's buy cost stays on the CSV-sourced `price` field; this layer is a
 * retail reference only, used for listing decisions and margin comparisons.
 *
 * Fields written to each tire (all under `priceIntel`):
 *   retailPrice   number  | typical per-tire retail seen across major sellers
 *   confidence    string  | 'high' | 'medium' | 'low' (from Gemini)
 *   lastResearched Timestamp
 *   lastUpdated   Timestamp
 *   sources       Array   | append-only audit trail of price lookups
 *   kyleConfirmed bool    | when true, we skip this tire on future runs (freeze)
 */

const admin = require('firebase-admin')
const { FieldValue, FieldPath, Timestamp } = require('firebase-admin/firestore')
const { formatCurrency, formatQty } = require('./format')
const { parseDescription } = require('./parseTireDescription')

const CONCURRENCY = 10
const DEFAULT_BATCH_SIZE = 500
const SANITY_MIN = 10
const SANITY_MAX = 2000
const REFRESH_STALENESS_MS = 6 * 86400000
const BULK_RESEARCH_MS = 30 * 86400000

function stripJsonFences(text) {
  const t = String(text || '').trim()
  if (!t.startsWith('```')) return t
  return t.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
}

function normalizeConfidence(c) {
  const s = String(c || '').toLowerCase().trim()
  if (s === 'high' || s === 'medium' || s === 'low') return s
  return 'low'
}

function tryParsePriceJson(text) {
  const t = stripJsonFences(text)
  try {
    const o = JSON.parse(t)
    const price = o?.price == null ? null : Number(o.price)
    const confidence = normalizeConfidence(o?.confidence)
    const notes = String(o?.notes || '').slice(0, 400)
    return {
      ok: true,
      price: Number.isFinite(price) ? price : null,
      confidence,
      notes,
    }
  } catch {
    return { ok: false, price: null, confidence: 'low', notes: 'parse_failed' }
  }
}

async function geminiRetailPriceWithSearch(geminiKey, userPrompt) {
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
    `Find the typical current US retail price, per single tire, for this catalog SKU.`,
    `MSPN: ${mspn}.`,
    bits ? `Parsed / catalog fields:\n${bits}` : `Raw catalog description: ${desc || '—'}`,
    '',
    `Look at consumer-facing retail sellers: TireRack, DiscountTire, SimpleTire, Walmart, Amazon, PriorityTire.`,
    `Return the typical median retail price you see across those sources. Price is per single tire, not a set of four.`,
    '',
    `Return ONLY a JSON object (no markdown fences): { "price": number, "confidence": "high"|"medium"|"low", "notes": string }.`,
    `confidence "high" = you saw consistent retail prices across two or more sellers.`,
    `confidence "medium" = only one seller, or prices varied noticeably.`,
    `confidence "low" = very uncertain or extrapolated.`,
    `If you cannot find any retail price signal at all, set price to null and confidence to "low".`,
  ].join('\n')
}

function tireDisplayLine(tire) {
  const brand = String(tire.brand || '').trim()
  const desc = String(tire.description || '').trim()
  if (brand && desc) return `${brand} · ${desc}`
  return brand || desc || '(tire)'
}

async function slackApiPost(token, method, body) {
  if (!token) return null
  try {
    const res = await fetch(`https://slack.com/api/${method}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    })
    return res.json().catch(() => null)
  } catch (e) {
    console.error(`slackApiPost ${method}`, e)
    return null
  }
}

function escapeSlackMrkdwn(s) {
  return String(s || '').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c] || c)
}

function sourceEntry(price, source) {
  return {
    price: price == null || !Number.isFinite(Number(price)) ? null : Number(price),
    source: String(source || '').slice(0, 40),
    at: Timestamp.now(),
  }
}

function tireNeedsFirstResearch(data) {
  const pi = data && data.priceIntel
  if (!pi || typeof pi !== 'object') return true
  const lr = pi.lastResearched
  if (lr == null) return true
  return false
}

/**
 * Tires never researched, or last researched 30+ days ago (bulk `/refreshprice all`).
 * @param {Record<string, unknown>} data
 */
function tireNeedsBulkRefresh(data) {
  if (tireNeedsFirstResearch(data)) return true
  const pi = data?.priceIntel
  if (!pi || typeof pi !== 'object') return true
  const lr = pi.lastResearched
  if (lr == null) return true
  try {
    const ms = typeof lr.toMillis === 'function' ? lr.toMillis() : new Date(lr).getTime()
    if (!Number.isFinite(ms) || ms <= 0) return true
    return ms < Date.now() - BULK_RESEARCH_MS
  } catch {
    return true
  }
}

/**
 * Full-catalog count of tires that need first research (for preflight / Slack).
 * @param {import('firebase-admin/firestore').Firestore} db
 */
async function countNeverResearchedTires(db) {
  const PAGE = 400
  let last = null
  let total = 0
  while (true) {
    let q = db.collection('tires').select('priceIntel').orderBy(FieldPath.documentId()).limit(PAGE)
    if (last) q = q.startAfter(last)
    const snap = await q.get()
    if (snap.empty) break
    for (const d of snap.docs) {
      if (tireNeedsFirstResearch(d.data() || {})) total += 1
    }
    if (snap.docs.length < PAGE) break
    last = snap.docs[snap.docs.length - 1]
  }
  return total
}

/**
 * Pre-flight counts for logs + Slack (does not change selection logic).
 * @param {import('firebase-admin/firestore').Firestore} db
 */
async function countPriceIntelPreflight(db) {
  const cutoff = Timestamp.fromMillis(Date.now() - REFRESH_STALENESS_MS)
  const safeCount = async (label, q) => {
    try {
      const snap = await q.count().get()
      return snap.data().count
    } catch (e) {
      console.error(`tirePriceResearch preflight count ${label}`, e)
      return -1
    }
  }
  let neverN = -1
  try {
    neverN = await countNeverResearchedTires(db)
  } catch (e) {
    console.error('tirePriceResearch preflight count never (full scan)', e)
  }
  const staleN = await safeCount(
    'stale',
    db.collection('tires').where('priceIntel.lastResearched', '<', cutoff),
  )
  const kyleN = await safeCount(
    'kyle',
    db.collection('tires').where('priceIntel.kyleConfirmed', '==', true),
  )
  return { neverN, staleN, kyleN }
}

async function pickTiresForResearch(db, limit) {
  const cutoff = Timestamp.fromMillis(Date.now() - REFRESH_STALENESS_MS)
  const picked = new Map()

  // Page through tires that have never been researched (priceIntel missing / null / no lastResearched).
  let last = null
  while (picked.size < limit) {
    let q = db.collection('tires').orderBy(FieldPath.documentId()).limit(400)
    if (last) q = q.startAfter(last)
    const snap = await q.get().catch(() => ({ docs: [], empty: true, size: 0 }))
    if (!snap.docs || snap.docs.length === 0) break
    for (const d of snap.docs) {
      if (picked.size >= limit) break
      if (!tireNeedsFirstResearch(d.data() || {})) continue
      picked.set(d.id, d)
    }
    if (snap.docs.length < 400) break
    last = snap.docs[snap.docs.length - 1]
  }

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
 * @param {{ slackMode?: 'batch' | 'single', silent?: boolean }} [opts]
 * @returns {Promise<'updated' | 'not_found' | 'skipped_kyle'>}
 */
async function processTireResearchDoc(db, geminiKey, slack, docSnap, opts = {}) {
  const slackMode = opts.slackMode === 'single' ? 'single' : 'batch'
  const silent = opts.silent === true
  const mspn = docSnap.id
  const tire = docSnap.data() || {}
  const ref = docSnap.ref
  const token = String(slack?.token || '').trim()
  const channel = String(slack?.channel || '').trim()

  const userPrompt = buildResearchUserPrompt(tire, mspn)
  const { parsed } = await geminiRetailPriceWithSearch(geminiKey, userPrompt)

  const rawPrice = parsed.ok && parsed.price != null ? Number(parsed.price) : null
  const foundPrice =
    rawPrice != null && Number.isFinite(rawPrice) && rawPrice >= SANITY_MIN && rawPrice <= SANITY_MAX
      ? rawPrice
      : null
  const gemConf = normalizeConfidence(parsed.confidence)

  let outcome = 'updated'

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists) return
    const t = snap.data() || {}
    const pi = t.priceIntel && typeof t.priceIntel === 'object' ? { ...t.priceIntel } : {}
    const sources = Array.isArray(pi.sources) ? [...pi.sources] : []
    const kyleFrozen = pi.kyleConfirmed === true

    if (foundPrice == null) {
      sources.push(sourceEntry(null, 'gemini_not_found'))
      tx.update(ref, {
        priceIntel: {
          ...pi,
          sources,
          lastResearched: FieldValue.serverTimestamp(),
        },
      })
      outcome = 'not_found'
      return
    }

    sources.push(sourceEntry(foundPrice, 'gemini_retail_search'))

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

    tx.update(ref, {
      priceIntel: {
        ...pi,
        retailPrice: foundPrice,
        confidence: gemConf,
        sources,
        // Old delta-flag review state is obsolete under the retail model.
        flagged: false,
        flagReason: null,
        lastResearched: FieldValue.serverTimestamp(),
        lastUpdated: FieldValue.serverTimestamp(),
      },
    })
    outcome = 'updated'
  })

  if (outcome === 'not_found' && slackMode === 'single' && !silent && token && channel) {
    const line = tireDisplayLine(tire)
    await slackApiPost(token, 'chat.postMessage', {
      channel,
      text: `⚠️ Retail price not found for ${escapeSlackMrkdwn(line)} (MSPN ${escapeSlackMrkdwn(mspn)})`,
    })
  }

  if (outcome === 'updated' && slackMode === 'single' && !silent && token && channel) {
    await slackApiPost(token, 'chat.postMessage', {
      channel,
      text: `✅ Retail price \`${escapeSlackMrkdwn(mspn)}\` → ${formatCurrency(foundPrice)} (_${escapeSlackMrkdwn(gemConf)}_ confidence)`,
    })
  }

  return outcome
}

/**
 * Run `fn` across `items` with a max of `concurrency` in flight at once. Errors
 * are caught per item so a bad tire doesn't sink the batch.
 */
async function processInParallel(items, fn, concurrency) {
  const state = { i: 0 }
  const results = new Array(items.length)
  await Promise.all(
    Array.from({ length: Math.max(1, concurrency) }, async () => {
      while (state.i < items.length) {
        const idx = state.i++
        try {
          results[idx] = await fn(items[idx])
        } catch (e) {
          console.error('tirePriceResearch tire', items[idx]?.id, e)
          results[idx] = null
        }
      }
    }),
  )
  return results
}

/**
 * @param {{ token: string, channel: string, geminiKey: string, batchSize?: number }} opts
 */
async function tirePriceResearchRun(opts) {
  const db = admin.firestore()
  const token = String(opts?.token || '').trim()
  const channel = String(opts?.channel || '').trim()
  const geminiKey = String(opts?.geminiKey || '').trim()
  const batchSize = Math.max(1, Number(opts?.batchSize) || DEFAULT_BATCH_SIZE)

  const { neverN, staleN, kyleN } = await countPriceIntelPreflight(db)
  console.log('[tirePriceResearch] preflight', {
    neverResearched: neverN,
    dueForRefresh: staleN,
    kyleConfirmed: kyleN,
    batchSize,
  })
  if (token && channel) {
    const fmt = (n) => (typeof n === 'number' && n >= 0 ? formatQty(n) : '—')
    await slackApiPost(token, 'chat.postMessage', {
      channel,
      text: `🔍 Retail price research starting — ${fmt(neverN)} never researched, ${fmt(staleN)} due for refresh (6+ days), ${fmt(kyleN)} Kyle-confirmed (skipped). Researching up to ${formatQty(batchSize)} tires this run…`,
    })
  }

  const docs = await pickTiresForResearch(db, batchSize)
  const slack = { token, channel }
  const results = await processInParallel(
    docs,
    (d) => processTireResearchDoc(db, geminiKey, slack, d),
    CONCURRENCY,
  )

  let updated = 0
  let notFound = 0
  let skippedKyle = 0
  let errored = 0
  for (const r of results) {
    if (r === 'updated') updated += 1
    else if (r === 'not_found') notFound += 1
    else if (r === 'skipped_kyle') skippedKyle += 1
    else errored += 1
  }

  console.log('[tirePriceResearch] done', { processed: docs.length, updated, notFound, skippedKyle, errored })

  if (token && channel && docs.length > 0) {
    const errorNote = errored > 0 ? `, ${formatQty(errored)} errored` : ''
    await slackApiPost(token, 'chat.postMessage', {
      channel,
      text: `🔍 Retail price research complete — ${formatQty(updated)} updated, ${formatQty(notFound)} not found, ${formatQty(skippedKyle)} skipped (Kyle confirmed)${errorNote}`,
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

/**
 * Bulk refresh helper used by Slack `/priceintel all`. Processes every tire that
 * needs bulk refresh (30+ days old or never researched). Parallelized.
 * @param {import('firebase-admin/firestore').Firestore} db
 * @param {string} geminiKey
 * @param {{ token: string, channel: string }} slack
 */
async function runBulkPriceRefresh(db, geminiKey, slack) {
  const token = String(slack?.token || '').trim()
  const channel = String(slack?.channel || '').trim()
  const PAGE = 400
  const targets = []
  let last = null
  while (true) {
    let q = db.collection('tires').orderBy(FieldPath.documentId()).limit(PAGE)
    if (last) q = q.startAfter(last)
    const snap = await q.get().catch(() => ({ docs: [], empty: true }))
    if (!snap.docs || snap.docs.length === 0) break
    for (const d of snap.docs) {
      if (tireNeedsBulkRefresh(d.data() || {})) targets.push(d)
    }
    if (snap.docs.length < PAGE) break
    last = snap.docs[snap.docs.length - 1]
  }

  if (token && channel) {
    await slackApiPost(token, 'chat.postMessage', {
      channel,
      text: `🔍 Bulk retail price refresh starting — ${formatQty(targets.length)} tires to process…`,
    })
  }

  const results = await processInParallel(
    targets,
    (d) => processTireResearchDoc(db, geminiKey, { token, channel }, d, { slackMode: 'batch' }),
    CONCURRENCY,
  )

  let updated = 0
  let notFound = 0
  let skippedKyle = 0
  let errored = 0
  for (const r of results) {
    if (r === 'updated') updated += 1
    else if (r === 'not_found') notFound += 1
    else if (r === 'skipped_kyle') skippedKyle += 1
    else errored += 1
  }

  if (token && channel) {
    const errorNote = errored > 0 ? `, ${formatQty(errored)} errored` : ''
    await slackApiPost(token, 'chat.postMessage', {
      channel,
      text: `🔍 Bulk refresh complete — ${formatQty(updated)} updated, ${formatQty(notFound)} not found, ${formatQty(skippedKyle)} skipped${errorNote}`,
    })
  }
}

module.exports = {
  tirePriceResearchRun,
  refreshSingleTirePrice,
  runBulkPriceRefresh,
  slackApiPost,
  escapeSlackMrkdwn,
  tireNeedsFirstResearch,
  tireNeedsBulkRefresh,
}
