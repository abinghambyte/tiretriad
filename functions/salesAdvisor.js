const { onCall, HttpsError } = require('firebase-functions/v2/https')
const admin = require('firebase-admin')
const { ANTHROPIC_API_KEY, anthropicKeyResolved } = require('./slackSecrets')

const ANTHROPIC_MODELS = ['claude-haiku-4-5', 'claude-sonnet-4-6']
const MAX_INPUT_BYTES = 16 * 1024
const MAX_OUTPUT_TOKENS = 1500
const TEMPERATURE = 0.4
const RATE_LIMIT_PER_HOUR = 30
const RATE_WINDOW_MS = 60 * 60 * 1000

const rateBuckets = new Map()

const TIRES_PERSONA = `You are a sales coach and pricing advisor for Skedaddle Inc, a tire reseller in Loveland, Colorado. Your operator is on the Tires catalog page. Treat them as a working salesperson — your job is to make their next conversation, quote, listing, or follow-up better.

Lean into:
- Objection handling (price comparisons, brand familiarity, timing)
- Quote framing and pitch language
- Highest-margin moves given the catalog's current state
- Specific SKU / size advice when the operator gives you a target

Avoid generic small talk. Always tie advice to a number the operator can act on (margin %, SKU count, retail vs buy gap, etc).`

function personaForSurface(surface) {
  return TIRES_PERSONA
}

function buildSystemPrompt({ surface, context }) {
  const persona = personaForSurface(surface)
  const ctx = context || {}
  const brandJson = JSON.stringify(ctx.brandAggregates || {}, null, 2)
  const revenueText = ctx.revenueStats
    ? JSON.stringify(ctx.revenueStats, null, 2)
    : 'Not yet available.'
  const tireText = ctx.selectedTire
    ? JSON.stringify(ctx.selectedTire, null, 2)
    : 'No tire is currently selected. Operator is asking a catalog-level question.'
  return `${persona}

You have access to the operator's catalog and recent revenue snapshot.
Your job is to give specific, numbers-backed advice. Always cite the
exact data point that backs your answer (e.g. "BFGOODRICH has 12% avg
margin vs MICHELIN's 22% — pricing is the lever").

If the operator asks something the data does not cover, say so plainly.
Never guess at SKU-level details that aren't in the context. Never invent
prices.

# Catalog (brand aggregates)
${brandJson}

# Recent revenue
${revenueText}

# Selected tire (if any)
${tireText}`
}

function checkRateLimit(uid, nowFn) {
  const now = nowFn()
  const arr = rateBuckets.get(uid) || []
  const fresh = arr.filter((t) => now - t < RATE_WINDOW_MS)
  if (fresh.length >= RATE_LIMIT_PER_HOUR) {
    const oldest = fresh[0]
    const retryAfterMs = RATE_WINDOW_MS - (now - oldest)
    throw new HttpsError('resource-exhausted', 'Sales advisor rate limit reached.', { retryAfterMs })
  }
  fresh.push(now)
  rateBuckets.set(uid, fresh)
}

async function defaultCallAnthropic({ apiKey, modelId, system, messages }) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: modelId,
      max_tokens: MAX_OUTPUT_TOKENS,
      temperature: TEMPERATURE,
      system,
      messages,
    }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    const detail = body?.error?.message || res.statusText || 'Anthropic request failed'
    throw new Error(`Anthropic HTTP ${res.status} (${modelId}): ${detail}`)
  }
  const body = await res.json()
  const text = (body?.content || [])
    .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('\n')
    .trim()
  if (!text) {
    throw new Error(`Empty assistant text from ${modelId}`)
  }
  return { text, model: modelId }
}

function handle({ firestore, callAnthropic, nowFn }) {
  return async function handler({ data, auth }) {
    if (!auth || !auth.uid) {
      throw new HttpsError('unauthenticated', 'Sign in required.')
    }
    const userSnap = await firestore.collection('users').doc(auth.uid).get()
    const role = String((userSnap.exists ? userSnap.data() : {})?.role || '')
    if (role !== 'admin') {
      throw new HttpsError('permission-denied', 'Admin role required.')
    }

    const messages = Array.isArray(data?.messages) ? data.messages : []
    if (messages.length === 0) {
      throw new HttpsError('invalid-argument', 'messages must not be empty.')
    }
    const last = messages[messages.length - 1]
    if (!last || last.role !== 'user') {
      throw new HttpsError('invalid-argument', 'Last message must have role=user.')
    }
    const totalBytes = messages.reduce((acc, m) => acc + Buffer.byteLength(String(m?.content || ''), 'utf8'), 0)
    if (totalBytes > MAX_INPUT_BYTES) {
      throw new HttpsError('invalid-argument', `Total content exceeds ${MAX_INPUT_BYTES} bytes.`)
    }

    checkRateLimit(auth.uid, nowFn)

    const surface = data?.surface || 'tires'
    const system = buildSystemPrompt({ surface, context: data?.context })
    const apiMessages = messages.map((m) => ({ role: m.role, content: String(m.content || '') }))
    const apiKey = anthropicKeyResolved(ANTHROPIC_API_KEY.value())

    let lastErr = null
    for (const modelId of ANTHROPIC_MODELS) {
      try {
        const { text, model } = await callAnthropic({ apiKey, modelId, system, messages: apiMessages })
        return { reply: text, model }
      } catch (err) {
        lastErr = err
        console.warn(`[salesAdvisor] ${modelId} failed:`, err?.message || err)
      }
    }
    throw new HttpsError('internal', `Sales advisor failed: ${lastErr?.message || 'unknown'}`)
  }
}

exports.salesAdvisorChat = onCall(
  { region: 'us-central1', secrets: [ANTHROPIC_API_KEY], cors: true, timeoutSeconds: 60 },
  async (req) => {
    const firestore = admin.firestore()
    const run = handle({
      firestore,
      callAnthropic: defaultCallAnthropic,
      nowFn: () => Date.now(),
    })
    return run({ data: req.data, auth: req.auth })
  },
)

exports._testonly = {
  handle,
  buildSystemPrompt,
  RATE_LIMIT_PER_HOUR,
  __resetRateBuckets: () => rateBuckets.clear(),
}
