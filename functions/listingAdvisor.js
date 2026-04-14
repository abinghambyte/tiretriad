/**
 * AI listing advisor — Gemini (preferred) or Anthropic Haiku for JSON listing suggestions.
 * @module
 */

const { HttpsError } = require('firebase-functions/v2/https')
const admin = require('firebase-admin')
const { GEMINI_API_KEY, anthropicApiKeyFromEnv } = require('./slackSecrets')

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
    return await callGeminiOnce(apiKey, userJson, 'gemini-2.0-flash')
  } catch {
    return callGeminiOnce(apiKey, userJson, 'gemini-1.5-flash')
  }
}

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
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 1200,
      system: SYSTEM,
      messages: [{ role: 'user', content: userText }],
    }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = body?.error?.message || res.statusText || 'Anthropic request failed'
    throw new Error(msg)
  }
  const text = body?.content?.[0]?.text
  if (!text) throw new Error('Empty Anthropic response')
  return parseModelJson(text)
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
  const anthropicKey = pickSecretValue(anthropicApiKeyFromEnv())

  if (geminiKey) {
    try {
      const out = await callGemini(geminiKey, userJson)
      return { ok: true, provider: 'gemini', listing: out }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (!anthropicKey) {
        throw new HttpsError('internal', `Gemini failed and no Anthropic key: ${msg}`)
      }
    }
  }

  if (anthropicKey) {
    try {
      const out = await callAnthropic(anthropicKey, userJson)
      return { ok: true, provider: geminiKey ? 'anthropic_fallback' : 'anthropic', listing: out }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      throw new HttpsError('internal', msg)
    }
  }

  throw new HttpsError(
    'failed-precondition',
    'Set GEMINI_API_KEY in Secret Manager (use `-` to skip) and/or ANTHROPIC_API_KEY in functions/.env for the listing advisor.',
  )
}

module.exports = { listingAdvisorHandler }
