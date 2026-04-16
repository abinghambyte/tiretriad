'use strict'

const { HttpsError } = require('firebase-functions/v2/https')
const admin = require('firebase-admin')
const { anthropicKeyResolved, ANTHROPIC_API_KEY } = require('./slackSecrets')

const MODEL = 'claude-sonnet-4-6'

const SKEDADDLE_CONTEXT = `Skedaddle Portal — northern Colorado tire resale (Fort Collins area).
Stack: React + Vite frontend, Firebase (Firestore, Auth, Cloud Functions Gen2), Slack Rubber Signal app, SMS.
Crew: Alex (admin/Overwatch), Kyle (Source/supplier, Michelin), DJ (Field/mechanic, fulfillment). Tanner is a silent partner — profit share only, no ops role, no portal access.
Pricing: paymentAmount is revenue; catalog buy + CTS overhead; FET washes out of margin calcs; priceIntel.activeBuyPrice when set.
Orders: pending → available → scheduled → in_transit → completed.
Never assume salePrice field — use paymentAmount.`

const ROUTER_INSTRUCTIONS = `You are a task-routing advisor for Skedaddle engineering. Given a task description, choose exactly one target:
- "opus" — architecture, data model redesigns, high-stakes irreversible decisions
- "sonnet" — default for builds, features, refactors, handoffs (~80% of work)
- "haiku" — trivial one-off answers, tiny copy edits, single-file typos
- "gemini" — live market data, eBay comps, web-grounded pricing research
- "antigravity" — autonomous multi-file builds that need browser verification / E2E

Credit guardian: Before choosing "opus", ask whether "sonnet" plus loading the right files and a clear prompt would suffice; if yes, prefer "sonnet" and set creditWarning accordingly.

Return ONLY valid JSON (no markdown fences) with keys:
routing (one of: opus|sonnet|haiku|gemini|antigravity),
confidence (0-1 number),
rationale (string),
creditWarning (string or empty),
contextToLoad (array of strings — file paths or doc names to open),
sessionStarter (string — paste-ready prompt for the chosen model),
taskType (short string),
estimatedComplexity ("low"|"medium"|"high")`

function stripJsonFences(text) {
  let s = String(text || '').trim()
  const full = /^```(?:json)?\s*([\s\S]*?)```\s*$/im.exec(s)
  if (full) return full[1].trim()
  const inner = /```(?:json)?\s*([\s\S]*?)```/im.exec(s)
  if (inner) return inner[1].trim()
  return s.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim()
}

function normalizeDispatchPayload(raw) {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const routing = String(o.routing || '').toLowerCase()
  const allowed = new Set(['opus', 'sonnet', 'haiku', 'gemini', 'antigravity'])
  const r = allowed.has(routing) ? routing : 'sonnet'
  const conf = Number(o.confidence)
  const confidence = Number.isFinite(conf) ? Math.max(0, Math.min(1, conf)) : 0.5
  const contextToLoad = Array.isArray(o.contextToLoad)
    ? o.contextToLoad.map((x) => String(x || '').trim()).filter(Boolean).slice(0, 24)
    : []
  return {
    routing: r,
    confidence,
    rationale: String(o.rationale || '').trim().slice(0, 4000),
    creditWarning: String(o.creditWarning || '').trim().slice(0, 800),
    contextToLoad,
    sessionStarter: String(o.sessionStarter || '').trim().slice(0, 8000),
    taskType: String(o.taskType || 'general').trim().slice(0, 120),
    estimatedComplexity: ['low', 'medium', 'high'].includes(String(o.estimatedComplexity || '').toLowerCase())
      ? String(o.estimatedComplexity).toLowerCase()
      : 'medium',
  }
}

/**
 * @param {import('firebase-functions/v2/https').CallableRequest} request
 */
async function growthLabTaskDispatchHandler(request) {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.')
  }
  const db = admin.firestore()
  const uSnap = await db.collection('users').doc(request.auth.uid).get()
  const role = uSnap.exists ? String(uSnap.data()?.role || '') : ''
  if (role !== 'admin') {
    throw new HttpsError('permission-denied', 'Overwatch (admin) role required.')
  }

  const body = request.data && typeof request.data === 'object' ? request.data : {}
  const task = String(body.task || '').trim()
  const continuity = String(body.continuityNotes || '').trim().slice(0, 4000)
  if (!task) {
    throw new HttpsError('invalid-argument', 'task is required.')
  }

  let secretVal = ''
  try {
    secretVal = ANTHROPIC_API_KEY.value()
  } catch {
    secretVal = ''
  }
  const apiKey = anthropicKeyResolved(secretVal)
  if (!apiKey) {
    throw new HttpsError('failed-precondition', 'ANTHROPIC_API_KEY is not configured.')
  }

  const userBlock = [
    ROUTER_INSTRUCTIONS,
    continuity ? `\nContinuity notes (from portal):\n${continuity}` : '',
    '\nTask:\n',
    task,
  ].join('')

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2000,
      temperature: 0.2,
      system: SKEDADDLE_CONTEXT,
      messages: [{ role: 'user', content: userBlock }],
    }),
  })

  const apiBody = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = apiBody?.error?.message || res.statusText || 'Anthropic request failed'
    throw new HttpsError('internal', msg)
  }

  const text = Array.isArray(apiBody?.content)
    ? apiBody.content.map((c) => (c && c.text ? c.text : '')).join('')
    : ''
  const stripped = stripJsonFences(text)
  let parsed
  try {
    parsed = JSON.parse(stripped)
  } catch {
    throw new HttpsError('internal', 'Model output was not valid JSON.')
  }

  return {
    ok: true,
    model: MODEL,
    dispatch: normalizeDispatchPayload(parsed),
  }
}

module.exports = {
  growthLabTaskDispatchHandler,
  MODEL,
}
