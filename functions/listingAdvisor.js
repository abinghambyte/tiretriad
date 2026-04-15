/**
 * AI listing advisor — Gemini (1.5-pro → 1.0-pro fallback) or Anthropic Haiku for JSON listing suggestions.
 * @module
 */

const { HttpsError } = require('firebase-functions/v2/https')
const admin = require('firebase-admin')
const { GEMINI_API_KEY, ANTHROPIC_API_KEY, anthropicKeyResolved } = require('./slackSecrets')

const SYSTEM = `You are a wholesale tire resale copywriter for Skedaddle Tires in northern Colorado.
Return ONLY valid JSON (no markdown fences, no commentary) with exactly these keys:
- title: string, under 80 characters, specific and searchable for local resale
- description: string, 3-4 sentences, highlight key specs, mention fitment for Fort Collins / Loveland / Greeley area (HVAC fleets, pickups, SUVs, mountain and highway driving) where natural
- sellProbability: integer 0-100, estimated sell-through likelihood in that regional market for this SKU
- recommendedPrice: number, suggested USD sale price PER TIRE (not set total), grounded in regional comps and healthy margin over buy price and overhead
- platformNotes: short string naming which resale channel fits best among: eBay, Facebook Marketplace, OfferUp, fleet direct (pick one primary + optional secondary in one short phrase)`

function pickSecretValue(secretValue) {
  const s = String(secretValue || '').trim()
  if (!s || s === '-' || /^none$/i.test(s)) return ''
  return s
}

function buildUserPayload(input) {
  const mspn = String(input.mspn || '').trim()
  const brand = String(input.brand || '').trim()
  const description = String(input.description || '').trim()
  const buyPrice = Number(input.buyPrice)
  const ctsTotal = Number(input.ctsTotal)
  const parsed = input.parsed && typeof input.parsed === 'object' ? input.parsed : {}

  return {
    mspn,
    brand,
    catalogDescription: description,
    buyPricePerTire: Number.isFinite(buyPrice) ? buyPrice : null,
    ctsOverheadPerTire: Number.isFinite(ctsTotal) ? ctsTotal : null,
    parsedTireFields: {
      width: parsed.width ?? null,
      aspectRatio: parsed.aspectRatio ?? null,
      construction: parsed.construction ?? null,
      rimDiameter: parsed.rimDiameter ?? null,
      loadIndex: parsed.loadIndex ?? null,
      speedRating: parsed.speedRating ?? null,
      extraLoad: Boolean(parsed.extraLoad),
      treadName: parsed.treadName ?? '',
    },
    regionalContext:
      'Northern Colorado: Fort Collins, Loveland, Greeley. Mix of commercial HVAC/service fleets, pickup trucks, SUVs, commuters, and mountain/highway driving toward the foothills.',
  }
}

const ANTHROPIC_LISTING_MODEL = 'claude-3-5-haiku-20241022'

function parseModelJson(text) {
  let s = String(text || '').trim()
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/im.exec(s)
  if (fence) s = fence[1].trim()
  let obj
  try {
    obj = JSON.parse(s)
  } catch {
    throw new Error('Model did not return valid JSON')
  }
  if (!obj || typeof obj !== 'object') throw new Error('Model JSON was not an object')
  return normalizeListingJson(obj)
}

/** Strip ``` / ```json fences (including embedded blocks) before JSON.parse. */
function stripAssistantJsonFences(text) {
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

function tryParseListingJsonObject(s) {
  const trimmed = String(s || '').trim()
  if (!trimmed) return { ok: false, error: 'Empty text after fence strip' }
  try {
    const obj = JSON.parse(trimmed)
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
      return { ok: false, error: 'JSON root was not an object' }
    }
    return { ok: true, listing: normalizeListingJson(obj) }
  } catch {
    const start = trimmed.indexOf('{')
    const end = trimmed.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try {
        const obj = JSON.parse(trimmed.slice(start, end + 1))
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
          return { ok: false, error: 'Extracted JSON was not an object' }
        }
        return { ok: true, listing: normalizeListingJson(obj) }
      } catch (e2) {
        return {
          ok: false,
          error: e2 instanceof Error ? e2.message : 'JSON.parse failed on extracted object',
        }
      }
    }
    return { ok: false, error: 'Model did not return valid JSON' }
  }
}

/** Concatenate all assistant `text` blocks (Anthropic returns `content` as an array). */
function extractAnthropicAssistantText(body) {
  const content = body?.content
  if (typeof content === 'string') return content.trim()
  if (!Array.isArray(content)) return ''
  const chunks = []
  for (const block of content) {
    if (!block || typeof block !== 'object') continue
    if (typeof block.text === 'string' && block.text) {
      chunks.push(block.text)
    }
  }
  return chunks.join('\n').trim()
}

/**
 * After a successful Anthropic HTTP response, never throw — return success or parse-failure payload.
 * @returns {Promise<
 *   | { success: true, model: string, listing: object }
 *   | { success: false, model: string, parseError: string, rawAssistantText?: string, contentSummary?: string }
 * >}
 */
async function callAnthropic(apiKey, userJson) {
  const userText = `Use this tire context (JSON):\n${JSON.stringify(userJson, null, 2)}\n\nRespond with the required JSON object only (no markdown).`
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: ANTHROPIC_LISTING_MODEL,
      max_tokens: 1200,
      system: SYSTEM,
      messages: [{ role: 'user', content: userText }],
    }),
  })
  const body = await res.json().catch(() => ({}))

  const logPayload = JSON.stringify(body, null, 2)
  console.log(
    '[listingAdvisor] Anthropic raw API response (pre-parse)',
    logPayload.length > 20000 ? `${logPayload.slice(0, 20000)}\n…[truncated ${logPayload.length} chars]` : logPayload,
  )

  if (!res.ok) {
    const msg = body?.error?.message || res.statusText || 'Anthropic request failed'
    throw new Error(msg)
  }

  try {
    const assistantText = extractAnthropicAssistantText(body)
    if (!assistantText) {
      return {
        success: false,
        model: ANTHROPIC_LISTING_MODEL,
        parseError: 'Empty assistant text (check content[].text blocks in raw response above)',
        contentSummary: JSON.stringify(body?.content ?? []).slice(0, 4000),
      }
    }

    const forJson = stripAssistantJsonFences(assistantText)
    const parsed = tryParseListingJsonObject(forJson)
    if (!parsed.ok) {
      return {
        success: false,
        model: ANTHROPIC_LISTING_MODEL,
        parseError: parsed.error || 'Parse failed',
        rawAssistantText: assistantText.slice(0, 8000),
      }
    }

    return { success: true, model: ANTHROPIC_LISTING_MODEL, listing: parsed.listing }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return {
      success: false,
      model: ANTHROPIC_LISTING_MODEL,
      parseError: `Unexpected error while parsing Anthropic response: ${msg}`,
      contentSummary: JSON.stringify(body?.content ?? body).slice(0, 4000),
    }
  }
}

function normalizeListingJson(raw) {
  const title = String(raw.title || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
  const description = String(raw.description || '').trim()
  let sellProbability = Math.round(Number(raw.sellProbability))
  if (!Number.isFinite(sellProbability)) sellProbability = 50
  sellProbability = Math.max(0, Math.min(100, sellProbability))
  let recommendedPrice = Number(raw.recommendedPrice)
  if (!Number.isFinite(recommendedPrice) || recommendedPrice < 0) recommendedPrice = 0
  const platformNotes = String(raw.platformNotes || '').trim().slice(0, 280)
  return { title, description, sellProbability, recommendedPrice, platformNotes }
}

async function callGeminiOnce(apiKey, userJson, model) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`
  const userText = `Use this tire context (JSON):\n${JSON.stringify(userJson, null, 2)}\n\nRespond with the required JSON object only.`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: 'user', parts: [{ text: userText }] }],
      generationConfig: {
        temperature: 0.35,
        responseMimeType: 'application/json',
      },
    }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = body?.error?.message || res.statusText || 'Gemini request failed'
    throw new Error(msg)
  }
  const parts = body?.candidates?.[0]?.content?.parts
  const text = Array.isArray(parts) ? parts.map((p) => p.text || '').join('') : ''
  if (!text) throw new Error('Empty Gemini response')
  return parseModelJson(text)
}

async function callGemini(apiKey, userJson) {
  try {
    const listing = await callGeminiOnce(apiKey, userJson, 'gemini-1.5-pro')
    return { listing, model: 'gemini-1.5-pro' }
  } catch {
    const listing = await callGeminiOnce(apiKey, userJson, 'gemini-1.0-pro')
    return { listing, model: 'gemini-1.0-pro' }
  }
}

/**
 * @param {import('firebase-functions/v2/https').CallableRequest} request
 */
async function listingAdvisorHandler(request) {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.')
  }

  const db = admin.firestore()
  const uSnap = await db.collection('users').doc(request.auth.uid).get()
  const tiresPerm = uSnap.exists ? String(uSnap.data()?.permissions?.tires || 'none') : 'none'
  if (!['view', 'edit'].includes(tiresPerm)) {
    throw new HttpsError('permission-denied', 'Tires catalog access required.')
  }

  const data = request.data || {}
  const input = data.input && typeof data.input === 'object' ? data.input : null
  if (!input) {
    throw new HttpsError('invalid-argument', 'input object is required.')
  }

  const mspn = String(input.mspn || '').trim()
  if (!mspn) {
    throw new HttpsError('invalid-argument', 'input.mspn is required.')
  }

  const userJson = buildUserPayload(input)

  const geminiKey = pickSecretValue(GEMINI_API_KEY.value())
  const anthropicKey = anthropicKeyResolved(ANTHROPIC_API_KEY.value())

  if (geminiKey) {
    try {
      const { listing, model } = await callGemini(geminiKey, userJson)
      return { ok: true, provider: 'gemini', model, listing }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (!anthropicKey) {
        throw new HttpsError('internal', `Gemini failed and no Anthropic key: ${msg}`)
      }
    }
  }

  if (anthropicKey) {
    try {
      const ar = await callAnthropic(anthropicKey, userJson)
      const provider = geminiKey ? 'anthropic_fallback' : 'anthropic'
      if (ar.success) {
        return { ok: true, provider, model: ar.model, listing: ar.listing }
      }
      return {
        ok: false,
        provider,
        model: ar.model,
        listing: null,
        parseError: ar.parseError,
        rawAssistantText: ar.rawAssistantText ?? null,
        contentSummary: ar.contentSummary ?? null,
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      throw new HttpsError('internal', msg)
    }
  }

  throw new HttpsError(
    'failed-precondition',
    'Set GEMINI_API_KEY and ANTHROPIC_API_KEY in Secret Manager for listing advisor (use `-` to skip Gemini or Anthropic). For local only, ANTHROPIC may still be read from env if the secret is unset.',
  )
}

module.exports = { listingAdvisorHandler }
