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

/**
 * Gemini free-tier burst limits are extremely low. Even on paid plans, the
 * `google_search` grounded models prefer small fan-outs. 3 keeps us under
 * typical per-minute limits while still clearing a 500-tire batch in a few
 * minutes once prices are coming back cleanly.
 */
const CONCURRENCY = 3
const DEFAULT_BATCH_SIZE = 500
const SANITY_MIN = 10
const SANITY_MAX = 2000
const REFRESH_STALENESS_MS = 6 * 86400000
const BULK_RESEARCH_MS = 30 * 86400000
/** Cap retries for tires that Gemini keeps coming back empty on, so obscure SKUs don't spin forever. */
const MAX_FAILED_ATTEMPTS = 3
/**
 * Retail prices more than 50% below or above Kyle's base cost are almost
 * always a wrong match (wrong size, 4-pack total, hallucination). Reject
 * them the same way we reject not-found so the retry cycle keeps trying.
 */
const SUSPICIOUS_RATIO_LOW = 0.5
const SUSPICIOUS_RATIO_HIGH = 1.5
/**
 * Looser envelope when we're anchoring to the legacy CSV retail instead of a
 * confirmed base cost. The CSV retail may be years stale; we only want to
 * reject clearly-wrong matches (wrong size, 4-pack total, hallucination),
 * not price drift within a reasonable factor of the printed retail.
 */
const CSV_RETAIL_RATIO_LOW = 0.4
const CSV_RETAIL_RATIO_HIGH = 2.5

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

/**
 * Extract the first plausible JSON object from a chunk of text. Handles
 * responses where Gemini prepends grounded-search preamble ("Based on my
 * search, I found: { ... }") or wraps the object in markdown fences. Returns
 * null when no balanced {...} block is found.
 */
function extractFirstJsonObject(text) {
  const raw = stripJsonFences(text).trim()
  if (!raw) return null
  if (raw.startsWith('{')) return raw
  const start = raw.indexOf('{')
  if (start < 0) return null
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < raw.length; i += 1) {
    const ch = raw[i]
    if (escaped) {
      escaped = false
      continue
    }
    if (inString) {
      if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth === 0) return raw.slice(start, i + 1)
    }
  }
  return null
}

function tryParsePriceJson(text) {
  const candidate = extractFirstJsonObject(text)
  if (!candidate) {
    return { ok: false, price: null, confidence: 'low', notes: 'no_json_block' }
  }
  try {
    const o = JSON.parse(candidate)
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

/**
 * Last-ditch rescue for Gemini responses whose JSON got truncated mid-string
 * (usually inside a long `notes` value when the model runs out of output
 * tokens). Pulls `price` and `confidence` out with loose regexes so we don't
 * throw away a perfectly good price just because the notes never closed.
 */
function tryRegexRescuePrice(text) {
  const s = stripJsonFences(String(text || ''))
  const priceMatch = s.match(/"price"\s*:\s*(null|-?\d+(?:\.\d+)?)/i)
  if (!priceMatch) return null
  const rawP = priceMatch[1].toLowerCase()
  const price = rawP === 'null' ? null : Number(rawP)
  const confMatch = s.match(/"confidence"\s*:\s*"(high|medium|low)"/i)
  const confidence = confMatch ? confMatch[1].toLowerCase() : 'low'
  return {
    ok: true,
    price: Number.isFinite(price) ? price : null,
    confidence,
    notes: 'rescued_from_truncated_json',
  }
}

function isRateLimitedError(status, message) {
  if (status === 429) return true
  const m = String(message || '').toLowerCase()
  return m.includes('quota') || m.includes('rate limit') || m.includes('resource_exhausted')
}

async function geminiRetailPriceWithSearch(geminiKey, userPrompt) {
  const keyTrim = String(geminiKey || '').trim()
  if (!keyTrim || keyTrim === '-') {
    return {
      rawText: '',
      parsed: { ok: false, price: null, confidence: 'low', notes: 'no api key' },
      modelUsed: null,
      rateLimited: false,
    }
  }
  // `gemini-1.5-pro` is no longer served on `v1beta` (returns
  // `models/gemini-1.5-pro is not found...`), so skipping it saves one
  // round-trip per failure.
  const models = ['gemini-2.5-flash', 'gemini-2.0-flash']
  let lastErr = ''
  let lastStatus = 0
  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(keyTrim)}`
    const body = {
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      tools: [{ google_search: {} }],
      // 1024 tokens wasn't enough headroom: Gemini kept running out of
      // space mid-notes-string, leaving the JSON unclosed and unparseable.
      // 4096 leaves plenty of room even when the model lists several
      // retailers in the notes field.
      generationConfig: { temperature: 0.25, maxOutputTokens: 4096 },
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
      lastStatus = res.status
      lastErr = json?.error?.message || `${res.status}`
      // If this model hit a quota error, every other Gemini model on the same
      // key is almost certainly also out of quota. Bail fast instead of pounding
      // each fallback model with another 429.
      if (isRateLimitedError(res.status, lastErr)) {
        return {
          rawText: '',
          parsed: { ok: false, price: null, confidence: 'low', notes: lastErr },
          modelUsed: null,
          rateLimited: true,
        }
      }
      continue
    }
    const parts = json?.candidates?.[0]?.content?.parts
    const text = Array.isArray(parts) ? parts.map((p) => p.text || '').join('').trim() : ''
    if (!text) {
      lastErr = 'empty candidates text'
      continue
    }
    let parsed = tryParsePriceJson(text)
    if (!parsed.ok) {
      const rescued = tryRegexRescuePrice(text)
      if (rescued) parsed = rescued
    }
    return { rawText: text, parsed, modelUsed: model, rateLimited: false }
  }
  return {
    rawText: '',
    parsed: { ok: false, price: null, confidence: 'low', notes: lastErr || 'gemini failed' },
    modelUsed: null,
    rateLimited: isRateLimitedError(lastStatus, lastErr),
  }
}

/**
 * Pull the tire size out of a printed description. Handles both flotation
 * (`37X13.50R20`) and metric (`P265/70R17`) formats. Retailers index on size
 * far more than on MSPN or tread code, so extracting the size lets us use it
 * as a clean search key even when the CSV description jams everything into
 * one unspaced string like `37X13.50R20LT128QLRF HDTAKT`.
 * @param {string} desc
 * @returns {string | null} upper-case size string, or null if no size found
 */
function extractTireSize(desc) {
  const raw = String(desc || '')
  if (!raw) return null
  const flotation = raw.match(/(\d{2,3}(?:\.\d{1,2})?X\d{1,2}(?:\.\d{1,2})?R\d{2}(?:\.\d{1,2})?)/i)
  if (flotation) return flotation[1].toUpperCase()
  const metric = raw.match(/((?:LT|ST|P)?\d{3}\/\d{2,3}(?:\.\d{1,2})?R\d{2}(?:\.\d{1,2})?)/i)
  if (metric) return metric[1].toUpperCase()
  return null
}

/**
 * Insert spaces at known boundaries in a concatenated printed description so
 * Google-search-grounded queries match retailer product pages instead of
 * dead-ending. `37X13.50R20LT128QLRF HDTAKT` becomes
 * `37X13.50R20 LT 128Q LRF HDTAKT`.
 * @param {string} desc
 */
function formatTireDescriptionForSearch(desc) {
  let s = String(desc || '').trim()
  if (!s) return ''
  // Space after the size block if the next char isn't already whitespace.
  s = s.replace(/(\d{2,3}(?:\.\d{1,2})?X\d{1,2}(?:\.\d{1,2})?R\d{2}(?:\.\d{1,2})?)(?!\s|$)/gi, '$1 ')
  s = s.replace(/((?:LT|ST|P)?\d{3}\/\d{2,3}(?:\.\d{1,2})?R\d{2}(?:\.\d{1,2})?)(?!\s|$)/gi, '$1 ')
  // Split the LT/ST vehicle-type prefix off the load index that follows it.
  s = s.replace(/\b(LT|ST)(\d)/gi, '$1 $2')
  // Split the LR[A-J] load-range suffix off whatever precedes it.
  s = s.replace(/(\w)(LR[A-J])\b/gi, '$1 $2')
  return s.replace(/\s+/g, ' ').trim()
}

/**
 * @param {Record<string, unknown>} tire
 */
function buildResearchUserPrompt(tire) {
  const brand = String(tire.brand || '').trim()
  const desc = String(tire.description || '').trim()
  const tread = String(tire.tread || '').trim()
  const lr = String(tire.lr || '').trim()
  const mspn = String(tire.mspn || '').trim()
  const size = extractTireSize(desc) || ''
  const formattedDesc = formatTireDescriptionForSearch(desc)

  // MSPN is the strongest search signal: Autoplicity, THMotorsports, and
  // other aggregators index product pages on the manufacturer part number
  // (`Michelin 64542 Mi 11r22.5/g ...`, `Michelin 15701ASSYSTL ...`). Brand +
  // size + MSPN + load range pulls up the exact SKU. Marketing name in the
  // concatenated description is left out of the search string; suffixes like
  // `TLLRG VB MI` / `VG` are internal codes that just add noise to the query.
  // Gemini still sees the full description in the structured context below
  // and can verify tread matches.
  const searchTarget = [
    brand,
    size,
    mspn,
    lr ? `Load Range ${lr}` : '',
  ]
    .filter(Boolean)
    .join(' ')
    .trim()

  return [
    `Find the typical current US retail price per single tire, using Google Search.`,
    '',
    `Search for: ${searchTarget || formattedDesc || brand}`,
    '',
    `Tire:`,
    brand ? `- Brand: ${brand}` : '',
    size ? `- Size: ${size}` : '',
    mspn ? `- Manufacturer part number (MSPN): ${mspn}` : '',
    formattedDesc && formattedDesc !== size ? `- Printed description: ${formattedDesc}` : '',
    tread && tread !== desc ? `- Tread model: ${tread}` : '',
    lr ? `- Load range: ${lr}` : '',
    '',
    `Use consumer retail sellers that display an exact MSPN match in their product title. Examples of sellers that list by MSPN: Autoplicity, THMotorsports, Tire Agent, SimpleTire, PriorityTire, TireRack, DiscountTire, BB Wheels, Budget Truck Tires, Walmart, Amazon, Costco. Any of these are acceptable; do not skip a tire just because the only matches are on sellers outside a preferred list.`,
    '',
    `When three or more sellers list the same MSPN, compute the median of the LOWEST THREE prices. This reflects real street price rather than artificially-inflated "buy N get N% off" stickers that some truck-supply sellers advertise. With one or two sellers, use the single lowest price. Price is for one (1) tire, not a set of four.`,
    '',
    `If a manufacturer retail/commercial store (michelintruck.com, michelinman.com, bfgoodrichtires.com, etc.) also lists the MSPN, include it in the pool like any other seller.`,
    '',
    `Respond with a JSON object only, no prose before or after:`,
    `{"price": <number or null>, "confidence": "high"|"medium"|"low", "notes": "<short source summary>"}`,
    '',
    `- Keep "notes" under 160 characters. Name the two cheapest sellers used, nothing more.`,
    `- "high" confidence: three or more sellers listed the exact MSPN and their lowest-three median is tight.`,
    `- "medium": one or two sellers, or prices varied noticeably.`,
    `- "low": very uncertain or extrapolated.`,
    `- Only set price to null if NO seller anywhere lists this MSPN or brand + size + tread combination.`,
  ]
    .filter(Boolean)
    .join('\n')
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

/**
 * Pick an anchor value for ratio-checking Gemini retail suggestions. Returns
 * `null` when the tire has no usable reference price. Two tiers:
 *
 *   1. Kyle's confirmed buy cost (`priceIntel.activeBuyPrice`, then legacy
 *      `price` / `cost` fields). Tight `[0.5x, 1.5x]` envelope per the
 *      "retail should stay within 50% of base cost" heuristic.
 *   2. CSV-sourced legacy retail (`retailPrice`). Wider `[0.4x, 2.5x]`
 *      envelope since that number may be stale and the whole point of the
 *      research run is to replace it with something current; we only want
 *      to catch clearly-wrong matches (wrong size, 4-pack totals,
 *      hallucinations).
 *
 * `kind` is recorded on the failure log + Slack message so we can tell at a
 * glance which anchor triggered the rejection.
 * @param {Record<string, unknown>} tire
 * @returns {{ value: number, kind: 'base_cost' | 'csv_retail', low: number, high: number } | null}
 */
function tireRatioAnchor(tire) {
  if (tire == null || typeof tire !== 'object') return null
  const pi = tire.priceIntel && typeof tire.priceIntel === 'object' ? tire.priceIntel : {}
  const active = Number(pi.activeBuyPrice)
  if (Number.isFinite(active) && active > 0) {
    return { value: active, kind: 'base_cost', low: SUSPICIOUS_RATIO_LOW, high: SUSPICIOUS_RATIO_HIGH }
  }
  const price = Number(tire.price)
  if (Number.isFinite(price) && price > 0) {
    return { value: price, kind: 'base_cost', low: SUSPICIOUS_RATIO_LOW, high: SUSPICIOUS_RATIO_HIGH }
  }
  const cost = Number(tire.cost)
  if (Number.isFinite(cost) && cost > 0) {
    return { value: cost, kind: 'base_cost', low: SUSPICIOUS_RATIO_LOW, high: SUSPICIOUS_RATIO_HIGH }
  }
  const retail = Number(tire.retailPrice)
  if (Number.isFinite(retail) && retail > 0) {
    return { value: retail, kind: 'csv_retail', low: CSV_RETAIL_RATIO_LOW, high: CSV_RETAIL_RATIO_HIGH }
  }
  return null
}

function tireNeedsFirstResearch(data) {
  const pi = data && data.priceIntel
  if (!pi || typeof pi !== 'object') return true
  const lr = pi.lastResearched
  if (lr == null) return true
  // Retry tires that were "researched" but produced no usable price, up to
  // MAX_FAILED_ATTEMPTS times. Counts both `gemini_not_found` (price was null
  // or out of sanity range) and `gemini_suspicious_delta` (price came back
  // but was more than 50% off from Kyle's base cost). Once a tire has that
  // many combined failures we stop picking it via the first-research path
  // and fall back to the regular 6-day staleness refresh cycle.
  const retail = Number(pi.retailPrice)
  if (!Number.isFinite(retail) || retail <= 0) {
    const sources = Array.isArray(pi.sources) ? pi.sources : []
    const failedAttempts = sources.filter(
      (s) => s && (s.source === 'gemini_not_found' || s.source === 'gemini_suspicious_delta'),
    ).length
    if (failedAttempts < MAX_FAILED_ATTEMPTS) return true
  }
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

  // MSPN === Firestore doc ID by construction, but belt-and-suspenders: older
  // tire docs may pre-date the importer's `mspn` field, so fall back to the
  // doc ID when building the prompt so the search always includes it.
  const userPrompt = buildResearchUserPrompt({ ...tire, mspn: tire.mspn || mspn })
  const { parsed, rawText, modelUsed, rateLimited } = await geminiRetailPriceWithSearch(geminiKey, userPrompt)

  // Rate-limited is not the tire's fault. Skip the Firestore write entirely so
  // we don't burn the retry counter or move `lastResearched` forward. The
  // tire will be picked up again on the next run.
  if (rateLimited) {
    return 'rate_limited'
  }

  const rawPrice = parsed.ok && parsed.price != null ? Number(parsed.price) : null
  const foundPrice =
    rawPrice != null && Number.isFinite(rawPrice) && rawPrice >= SANITY_MIN && rawPrice <= SANITY_MAX
      ? rawPrice
      : null
  const gemConf = normalizeConfidence(parsed.confidence)

  // Ratio check against whatever reference price we have for this tire. See
  // `tireRatioAnchor` for the tier logic (confirmed buy cost vs CSV retail).
  // Skipped when the tire has no usable reference (new SKU, CSV gaps).
  const anchor = tireRatioAnchor(tire)
  const suspiciousDelta =
    foundPrice != null &&
    anchor != null &&
    (foundPrice < anchor.value * anchor.low || foundPrice > anchor.value * anchor.high)

  if (suspiciousDelta) {
    console.warn('[tirePriceResearch] suspicious_delta', {
      mspn,
      modelUsed,
      anchorKind: anchor.kind,
      anchorValue: anchor.value,
      foundPrice,
      ratio: Number((foundPrice / anchor.value).toFixed(2)),
    })
  } else if (foundPrice == null) {
    // Log the first few hundred chars of the raw response so we can tell
    // whether Gemini actually returned nothing, returned unparseable text, or
    // returned a number we clamped away.
    console.warn('[tirePriceResearch] not_found detail', {
      mspn,
      modelUsed,
      parsedOk: parsed.ok,
      parsedPrice: parsed.price,
      parsedNotes: String(parsed.notes || '').slice(0, 200),
      rawTextHead: String(rawText || '').slice(0, 500),
    })
  }

  let outcome = 'updated'

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists) return
    const t = snap.data() || {}
    const pi = t.priceIntel && typeof t.priceIntel === 'object' ? { ...t.priceIntel } : {}
    const sources = Array.isArray(pi.sources) ? [...pi.sources] : []
    const kyleFrozen = pi.kyleConfirmed === true

    if (foundPrice == null || suspiciousDelta) {
      const tag = suspiciousDelta ? 'gemini_suspicious_delta' : 'gemini_not_found'
      sources.push(sourceEntry(suspiciousDelta ? foundPrice : null, tag))
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
    const anchorLabel = anchor?.kind === 'base_cost' ? 'base cost' : 'CSV retail'
    const text = suspiciousDelta
      ? `⚠️ Retail price for ${escapeSlackMrkdwn(line)} (MSPN ${escapeSlackMrkdwn(mspn)}) came back ${formatCurrency(foundPrice)} vs ${anchorLabel} ${formatCurrency(anchor.value)}, rejected as suspicious (ratio ${Number((foundPrice / anchor.value).toFixed(2))}x).`
      : `⚠️ Retail price not found for ${escapeSlackMrkdwn(line)} (MSPN ${escapeSlackMrkdwn(mspn)})`
    await slackApiPost(token, 'chat.postMessage', { channel, text })
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
 * @param {{ token: string, channel: string, geminiKey: string, batchSize?: number, silentIfEmpty?: boolean }} opts
 */
async function tirePriceResearchRun(opts) {
  const db = admin.firestore()
  const token = String(opts?.token || '').trim()
  const channel = String(opts?.channel || '').trim()
  const geminiKey = String(opts?.geminiKey || '').trim()
  const batchSize = Math.max(1, Number(opts?.batchSize) || DEFAULT_BATCH_SIZE)
  const silentIfEmpty = opts?.silentIfEmpty === true

  // Pick first. If there's no work, bail without the Slack start message so
  // the hourly catch-up schedule doesn't fire 24 "starting — 0 never researched"
  // posts once the backlog is clear.
  const docs = await pickTiresForResearch(db, batchSize)
  if (docs.length === 0) {
    console.log('[tirePriceResearch] nothing to do', { batchSize })
    if (!silentIfEmpty && token && channel) {
      await slackApiPost(token, 'chat.postMessage', {
        channel,
        text: `🔍 Retail price research — backlog is clear. No tires need research right now.`,
      })
    }
    return
  }

  const { neverN, staleN, kyleN } = await countPriceIntelPreflight(db)
  console.log('[tirePriceResearch] preflight', {
    neverResearched: neverN,
    dueForRefresh: staleN,
    kyleConfirmed: kyleN,
    batchSize,
    picked: docs.length,
  })
  if (token && channel) {
    const fmt = (n) => (typeof n === 'number' && n >= 0 ? formatQty(n) : '—')
    await slackApiPost(token, 'chat.postMessage', {
      channel,
      text: `🔍 Retail price research starting — ${fmt(neverN)} need research (no retail price yet, under ${MAX_FAILED_ATTEMPTS} attempts), ${fmt(staleN)} due for refresh (6+ days), ${fmt(kyleN)} Kyle-confirmed (skipped). Researching ${formatQty(docs.length)} tires this run…`,
    })
  }

  const slack = { token, channel }
  const results = await processInParallel(
    docs,
    (d) => processTireResearchDoc(db, geminiKey, slack, d),
    CONCURRENCY,
  )

  let updated = 0
  let notFound = 0
  let skippedKyle = 0
  let rateLimited = 0
  let errored = 0
  for (const r of results) {
    if (r === 'updated') updated += 1
    else if (r === 'not_found') notFound += 1
    else if (r === 'skipped_kyle') skippedKyle += 1
    else if (r === 'rate_limited') rateLimited += 1
    else errored += 1
  }

  console.log('[tirePriceResearch] done', {
    processed: docs.length,
    updated,
    notFound,
    skippedKyle,
    rateLimited,
    errored,
  })

  if (token && channel) {
    const errorNote = errored > 0 ? `, ${formatQty(errored)} errored` : ''
    const rateNote =
      rateLimited > 0
        ? `\n:warning: ${formatQty(rateLimited)} tires hit Gemini rate limits and will retry on the next run. If this number stays high, enable billing on the Gemini API key (https://aistudio.google.com/app/apikey).`
        : ''
    await slackApiPost(token, 'chat.postMessage', {
      channel,
      text: `🔍 Retail price research complete — ${formatQty(updated)} updated, ${formatQty(notFound)} not found, ${formatQty(skippedKyle)} skipped (Kyle confirmed)${errorNote}${rateNote}`,
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
  let rateLimited = 0
  let errored = 0
  for (const r of results) {
    if (r === 'updated') updated += 1
    else if (r === 'not_found') notFound += 1
    else if (r === 'skipped_kyle') skippedKyle += 1
    else if (r === 'rate_limited') rateLimited += 1
    else errored += 1
  }

  if (token && channel) {
    const errorNote = errored > 0 ? `, ${formatQty(errored)} errored` : ''
    const rateNote = rateLimited > 0 ? `, ${formatQty(rateLimited)} rate-limited (will retry)` : ''
    await slackApiPost(token, 'chat.postMessage', {
      channel,
      text: `🔍 Bulk refresh complete — ${formatQty(updated)} updated, ${formatQty(notFound)} not found, ${formatQty(skippedKyle)} skipped${rateNote}${errorNote}`,
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
