/**
 * Listing Advisor narrator. Wraps Gemini Flash with a Firestore cache at
 * advisorCache/{tireId}_{mode}. 24h TTL.
 */
const { onCall, HttpsError } = require('firebase-functions/v2/https')
const admin = require('firebase-admin')
const { GEMINI_API_KEY } = require('./slackSecrets')

const CACHE_TTL_MS = 24 * 60 * 60 * 1000
const VALID_MODES = new Set(['CLEARANCE', 'PROFIT', 'VELOCITY'])

const SYSTEM_PROMPT = `You are a tire listing advisor for a northern Colorado commercial tire reseller.
Your job is to explain why a specific tire is ranked for listing right now, and flag any contradictions the ranking math might have missed.

Your output must be exactly two parts:

NARRATIVE (2-3 sentences max): Explain the top 2 signals driving this tire's rank in plain English. Reference the active business mode. Be specific -- name the brand, size, and actual numbers.

SHADOW FLAG (conditional): Only emit this if ONE of these is true:
  1. Any comp price dropped more than 15% in the last 7 days for this size/brand
  2. Zero comps found (no market data = do not interpret as opportunity)
  If neither condition is true, output nothing for this section.
  Format: warning emoji then one sentence, specific number, no speculation.

Do not suggest pricing changes. Do not recommend holding. Do not editorialize.
Output only NARRATIVE and SHADOW FLAG (if triggered). No headers, no bullets.`

function parseModelOutput(text) {
  const raw = String(text || '').trim()
  if (!raw) return { narrative: '', shadowFlag: '' }
  const match = raw.match(/^([\s\S]*?)(\n\s*)(\u26A0\uFE0F?[\s\S]*)$/)
  if (match) {
    return {
      narrative: match[1].trim(),
      shadowFlag: match[3].trim(),
    }
  }
  return { narrative: raw, shadowFlag: '' }
}

async function defaultCallGemini(payload) {
  const key = String(GEMINI_API_KEY?.value?.() || GEMINI_API_KEY || '').trim()
  if (!key) throw new HttpsError('failed-precondition', 'GEMINI_API_KEY not configured')
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(key)}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: JSON.stringify(payload) }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 300 },
    }),
  })
  if (!res.ok) throw new HttpsError('internal', `Gemini HTTP ${res.status}`)
  const body = await res.json()
  const text = body?.candidates?.[0]?.content?.parts?.[0]?.text || ''
  return { text }
}

async function buildPayload(firestore, tireId, mode) {
  const tireSnap = await firestore.collection('tires').doc(tireId).get()
  if (!tireSnap.exists) throw new HttpsError('not-found', `tire ${tireId} not found`)
  const tire = tireSnap.data() || {}
  const size = String(tire.size || '')
  let comps = null
  try {
    const compsSnap = await firestore.collection('priceIntel').doc(size).get()
    if (compsSnap.exists) comps = compsSnap.data()
  } catch {
    // priceIntel is optional.
  }
  return {
    tire: {
      brand: tire.brand,
      tread: tire.treadName || tire.description,
      size,
      lr: tire.lr,
      mspn: tire.mspn,
      price: tire.price,
    },
    kyleFrozen: Boolean(tire.kyleFrozen),
    mode,
    comps,
  }
}

async function handle({ firestore, now, callGemini }) {
  return async function (data) {
    const tireId = String(data?.tireId || '').trim()
    const mode = String(data?.mode || '').trim()
    if (!tireId) throw new HttpsError('invalid-argument', 'tireId required')
    if (!VALID_MODES.has(mode)) throw new HttpsError('invalid-argument', `unknown mode: ${mode}`)

    const cacheKey = `${tireId}_${mode}`
    const cacheDoc = firestore.collection('advisorCache').doc(cacheKey)
    const cacheSnap = await cacheDoc.get()
    if (cacheSnap.exists) {
      const c = cacheSnap.data() || {}
      if (c.writtenAt && now - c.writtenAt < CACHE_TTL_MS) {
        return { narrative: c.narrative || '', shadowFlag: c.shadowFlag || '' }
      }
    }

    const payload = await buildPayload(firestore, tireId, mode)
    const { text } = await callGemini(payload)
    const parsed = parseModelOutput(text)
    await cacheDoc.set({ ...parsed, writtenAt: now })
    return parsed
  }
}

exports.advisorNarrate = onCall(
  { region: 'us-central1', secrets: [GEMINI_API_KEY], cors: true },
  async (req) => {
    const firestore = admin.firestore()
    const run = await handle({ firestore, now: Date.now(), callGemini: defaultCallGemini })
    return run(req.data || {})
  },
)

exports._testonly = { handle, parseModelOutput }
