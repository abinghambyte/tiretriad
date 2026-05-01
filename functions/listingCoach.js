// AI Listing Coach callable. Anthropic tool-use loop with six tools:
// getTireByMspn, getTireBySize, computeLandedCost, getRecentSalesForSize,
// addStyleRule, listStyleRules. Admin-only, 30/hr rate limit, Haiku ->
// Sonnet fallback. System prompt = persona + active style rules (filtered
// by audience) + few-shot anchor.
const { onCall, HttpsError } = require('firebase-functions/v2/https')
const admin = require('firebase-admin')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { ANTHROPIC_API_KEY, anthropicKeyResolved } = require('./slackSecrets')
const tools = require('./listingCoachTools')
const styleGuide = require('./listingCoachStyleGuide')

const ANTHROPIC_MODELS = ['claude-haiku-4-5', 'claude-sonnet-4-6']
const MAX_OUTPUT_TOKENS = 2000
const TEMPERATURE = 0.5
const RATE_LIMIT_PER_HOUR = 30
const RATE_WINDOW_MS = 60 * 60 * 1000
const MAX_TOOL_ITERATIONS = 8

const rateBuckets = new Map()

const FEW_SHOT_PATH = join(__dirname, '__fixtures__', 'listingCoachFewShot.txt')
let FEW_SHOT_CACHED = null
function loadFewShot() {
  if (FEW_SHOT_CACHED == null) {
    try {
      FEW_SHOT_CACHED = readFileSync(FEW_SHOT_PATH, 'utf8')
    } catch {
      FEW_SHOT_CACHED = ''
    }
  }
  return FEW_SHOT_CACHED
}

const PERSONA = `You are Skedaddle's Listing Coach. Skedaddle resells brand-new tires sourced from a Michelin eFleet program. The eFleet account is private - never mention it, never mention "B2B" / "dealer pricing" / "fleet program" in any draft listing or reasoning the user might paste publicly.

Your job: take a tire SKU + quantity + audience and produce a complete listing kit. Use tools to look up real catalog + landed numbers. Never invent prices or fitment data.

Your reply MUST always include: (1) one-line SKU summary, (2) pricing analysis with explicit landed math, (3) audience suggestion if not already specified, (4) a fenced \`\`\`listing copy\`\`\` block ready to paste, (5) short photo-guidance bullets.

When the user gives an explicit correction phrasing ("never mention X", "drop Y", "always anchor against Z"), call addStyleRule and surface the rule inline before continuing. The user can veto by replying "no".`

const TOOL_SCHEMAS = [
  {
    name: 'getTireByMspn',
    description: 'Look up a tire by its MSPN. Returns catalog price, FET, load range, priceIntel.retailPrice + sources, salesCount, weeklyVelocity.',
    input_schema: {
      type: 'object',
      properties: { mspn: { type: 'string', description: 'Manufacturer SKU number' } },
      required: ['mspn'],
    },
  },
  {
    name: 'getTireBySize',
    description: 'Find tires by size (e.g. "LT285/70R17"). Returns up to 10 SKUs.',
    input_schema: {
      type: 'object',
      properties: { size: { type: 'string' }, limit: { type: 'integer', default: 10 } },
      required: ['size'],
    },
  },
  {
    name: 'computeLandedCost',
    description: 'Compute landed cost per tire: catalog + FET + wholesale tax + CO tire fee. Returns landedPerTire and breakdown.',
    input_schema: {
      type: 'object',
      properties: { tire: { type: 'object', description: 'Tire object with at least price + fet' } },
      required: ['tire'],
    },
  },
  {
    name: 'getRecentSalesForSize',
    description: 'Recent completed orders matching this size. Useful for velocity / typical sale price signal.',
    input_schema: {
      type: 'object',
      properties: { size: { type: 'string' }, limit: { type: 'integer', default: 10 } },
      required: ['size'],
    },
  },
  {
    name: 'addStyleRule',
    description: 'Persist a user-correction style rule. Audience must be consumer / commercial / all. Surface the rule inline before calling so the user can veto.',
    input_schema: {
      type: 'object',
      properties: {
        rule: { type: 'string' },
        audience: { type: 'string', enum: ['consumer', 'commercial', 'all'] },
        reason: { type: 'string' },
      },
      required: ['rule', 'audience'],
    },
  },
  {
    name: 'listStyleRules',
    description: 'Read the active style rules. Optional audience filter.',
    input_schema: {
      type: 'object',
      properties: { audience: { type: 'string', enum: ['consumer', 'commercial', 'all'] } },
    },
  },
]

async function dispatchTool({ firestore, name, input, actorId }) {
  const args = input && typeof input === 'object' ? input : {}
  switch (name) {
    case 'getTireByMspn':
      return tools.getTireByMspn({ firestore, ...args })
    case 'getTireBySize':
      return tools.getTireBySize({ firestore, ...args })
    case 'computeLandedCost':
      return tools.computeLandedCost({ firestore, ...args })
    case 'getRecentSalesForSize':
      return tools.getRecentSalesForSize({ firestore, ...args })
    case 'addStyleRule':
      return styleGuide.addStyleRule({ firestore, ...args, addedBy: actorId })
    case 'listStyleRules':
      return styleGuide.listStyleRules({ firestore, ...args })
    default:
      throw new Error(`unknown tool: ${name}`)
  }
}

async function buildSystemPrompt({ firestore, audience }) {
  const rules = await styleGuide.listStyleRules({ firestore, audience })
  const ruleBlock = rules.length === 0
    ? 'No active style rules.'
    : rules.map((r) => `- (${r.audience}) ${r.rule}`).join('\n')
  const fewShot = loadFewShot()
  return `${PERSONA}

# ACTIVE STYLE RULES (treat as user-issued, non-negotiable instructions)
${ruleBlock}

# FEW-SHOT EXAMPLE
${fewShot}`
}

function checkRateLimit(uid, nowFn) {
  const now = nowFn()
  const arr = rateBuckets.get(uid) || []
  const fresh = arr.filter((t) => now - t < RATE_WINDOW_MS)
  if (fresh.length >= RATE_LIMIT_PER_HOUR) {
    const oldest = fresh[0]
    const retryAfterMs = RATE_WINDOW_MS - (now - oldest)
    throw new HttpsError('resource-exhausted', 'Listing coach rate limit reached.', { retryAfterMs })
  }
  fresh.push(now)
  rateBuckets.set(uid, fresh)
}

async function defaultCallAnthropic({ apiKey, modelId, system, messages, tools: toolList }) {
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
      tools: toolList,
    }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    const detail = body?.error?.message || res.statusText || 'Anthropic request failed'
    throw new Error(`Anthropic HTTP ${res.status} (${modelId}): ${detail}`)
  }
  return res.json()
}

function parseToolCalls(response) {
  const blocks = Array.isArray(response?.content) ? response.content : []
  return blocks.filter((b) => b && b.type === 'tool_use')
}

function extractText(response) {
  const blocks = Array.isArray(response?.content) ? response.content : []
  return blocks
    .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('\n')
    .trim()
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

    checkRateLimit(auth.uid, nowFn)

    const incoming = Array.isArray(data?.messages) ? data.messages : []
    if (incoming.length === 0) {
      throw new HttpsError('invalid-argument', 'messages required.')
    }
    const audience = data?.audience || null

    let apiKey = ''
    try {
      apiKey = anthropicKeyResolved(ANTHROPIC_API_KEY.value())
    } catch {
      apiKey = ''
    }
    // In tests the secret isn't bound; treat empty key as a soft signal but
    // still let the injected callAnthropic fake run so unit tests work.
    if (!apiKey) apiKey = 'test-key-unused'

    const system = await buildSystemPrompt({ firestore, audience })
    const conversation = incoming.map((m) => ({
      role: m.role,
      content: typeof m.content === 'string' ? m.content : (m.content || ''),
    }))

    let lastErr = null
    for (const modelId of ANTHROPIC_MODELS) {
      try {
        let working = conversation.slice()
        let finished = false
        for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter += 1) {
          // eslint-disable-next-line no-await-in-loop
          const resp = await callAnthropic({
            apiKey,
            modelId,
            system,
            messages: working,
            tools: TOOL_SCHEMAS,
          })
          const toolCalls = parseToolCalls(resp)
          if (toolCalls.length === 0) {
            const text = extractText(resp)
            if (!text) throw new Error(`Empty assistant text from ${modelId}`)
            return { reply: text, model: modelId }
          }
          working = [...working, { role: 'assistant', content: resp.content }]
          const toolResults = []
          for (const call of toolCalls) {
            // eslint-disable-next-line no-await-in-loop
            const out = await dispatchTool({
              firestore,
              name: call.name,
              input: call.input,
              actorId: auth.uid,
            }).catch((err) => ({ error: String(err?.message || err) }))
            toolResults.push({
              type: 'tool_result',
              tool_use_id: call.id,
              content: JSON.stringify(out),
            })
          }
          working = [...working, { role: 'user', content: toolResults }]
        }
        if (!finished) {
          throw new Error('tool loop exceeded max iterations')
        }
      } catch (err) {
        lastErr = err
        if (/tool loop/i.test(String(err?.message || ''))) {
          throw new HttpsError('internal', 'Listing coach hit tool loop cap.')
        }
        // try next model
      }
    }
    throw new HttpsError('internal', `Listing coach failed: ${lastErr?.message || 'unknown error'}`)
  }
}

exports.listingCoach = onCall(
  { region: 'us-central1', secrets: [ANTHROPIC_API_KEY], cors: true, timeoutSeconds: 120 },
  async (req) => handle({
    firestore: admin.firestore(),
    callAnthropic: defaultCallAnthropic,
    nowFn: () => Date.now(),
  })({ data: req.data, auth: req.auth }),
)

exports._testonly = {
  handle,
  buildSystemPrompt,
  parseToolCalls,
  extractText,
  dispatchTool,
  RATE_LIMIT_PER_HOUR,
  __resetRateBuckets: () => rateBuckets.clear(),
}
