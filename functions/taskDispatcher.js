'use strict'

const { onCall, HttpsError } = require('firebase-functions/v2/https')
const admin = require('firebase-admin')
const { anthropicKeyResolved, ANTHROPIC_API_KEY } = require('./slackSecrets')
const { auditFromCallable } = require('./adminAuditLog')

/** Matches Growth Lab / invite flows — Anthropic API id. */
const MODEL = 'claude-sonnet-4-6'

const ROUTING_SYSTEM_PROMPT = `You are the Tire Triad AI Task Dispatcher. You manage a named AI workforce for a northern Colorado tire resale operation. Your job is to evaluate an incoming task, run the cost-check protocol, and route it to the correct worker.

WORKFORCE ROSTER (with token costs):
- Infrastructure Lead (Opus 4.6 — $15 input / $75 output per 1M): Architecture, schema design, security review, decisions where being wrong costs a redeploy
- Portal Architect (Sonnet 4.6 — $3 input / $15 output per 1M, 1M token context): Cursor handoff writing, iteration, debugging, session architecture
- Market Intel (Gemini 3.1 Pro — $2 input / $12 output per 1M): Real-time web, eBay comps, pricing research
- Listing Advisor (Gemini 3.1 Flash-Lite — $0.25 input / $1.50 output per 1M): High-volume listing generation, sell probability, platform copy
- Listing Advisor Fallback (Haiku 4.5 — $1 input / $5 output per 1M): When Gemini Flash-Lite is unavailable
- Site Verifier (Antigravity — high cost): Autonomous end-to-end builds with live site verification, no human in the loop
- Field Executor (Cursor — subscription): All actual file writes, multi-file repo-aware builds

COST-CHECK PROTOCOL (execute before every routing decision):
1. Before routing to Opus ($15/input): Confirm Sonnet ($3/input) cannot handle this even with a full context load. Sonnet's 1M token window fits the entire Tire Triad repo plus all docs. If Sonnet with maximum context load would solve this → route to Portal Architect.
2. Before routing to Antigravity (high cost): Confirm this genuinely requires autonomous browser verification against the live site. If human QA is acceptable → route to Field Executor (Cursor).
3. Real-time web or market data needed? → Market Intel (Gemini Pro)
4. High-volume listing output? → Listing Advisor (Gemini Flash-Lite)
5. Fast one-sentence output, Slack copy? → Listing Advisor Fallback (Haiku)
6. All file writes go to Field Executor regardless of who designed the solution

TIRE TRIAD RULES (never get these wrong):
- profit = (paymentAmount - buyPrice - mountCost - deliveryCost - otherCost) × qty
- FET washes out — never subtract in margin calcs
- No salePrice field exists — always use paymentAmount
- CRM is called Rubber CRM, never Fleet CRM
- Tanner = silent partner, no portal access ever
- Deploy functions: npm run deploy:firebase — never global firebase binary
- Deploy frontend: git push (auto-deploys to Vercel)
- Stack: React 19 + Vite + Tailwind, Firebase Gen2 Node 22, firebase-functions v7.2.5

GENERATED PROMPT FORMAT — depends on the assigned worker:

- For Field Executor (Cursor), Portal Architect (Sonnet), Infrastructure Lead (Opus), Market Intel (Gemini Pro), Listing Advisor (Gemini Flash-Lite), or Listing Advisor Fallback (Haiku): write the generatedPrompt as freeform prose preloaded with Tire Triad context (paymentAmount, FET, Rubber CRM, Tanner-as-silent-partner, deploy commands).

- For Site Verifier (Antigravity): generatedPrompt MUST follow this exact section structure — Antigravity is autonomous and tightens compliance with rigid format. Do not mix freeform prose between sections.

## Goal
[One sentence — what state of the live system this brief is supposed to verify or produce.]

## Verification steps
1. [Concrete navigable action against the live URL — open page, click element, submit form, etc.]
2. [Next step — observe specific element, value, or response.]
3. [Continue until the goal is testable.]

## Success criteria
- [Binary, observable condition #1.]
- [Binary condition #2.]
- [Binary condition #3.]
A run is "passed" only when every criterion is satisfied. No partial passes.

## What NOT to touch
- [Specific routes, functions, or data the agent must not modify or write to.]
- Always include: "/orders, Slack integration, Firestore rules, slackSecrets.js, any function not named in this brief".
- If a step requires modifying anything on this list, stop and report — do not proceed.

Respond ONLY with valid JSON — no preamble, no markdown fences:
{
  "assignedWorker": "Portal Architect",
  "modelVersion": "claude-sonnet-4-6",
  "platform": "Claude.ai",
  "rationale": "one sentence why this worker owns this task",
  "costCheckResult": "passed | escalated | not applicable",
  "costCheckNote": "one sentence explaining the cost-check decision",
  "contextToLoad": ["AI-CONTEXT.md", "ROADMAP.md"],
  "generatedPrompt": "the full ready-to-paste prompt for that worker — freeform prose for most workers, the Antigravity Goal/Verification steps/Success criteria/What NOT to touch structure for Site Verifier"
}`

function stripJsonFences(text) {
  let s = String(text || '').trim()
  const full = /^```(?:json)?\s*([\s\S]*?)```\s*$/im.exec(s)
  if (full) return full[1].trim()
  const inner = /```(?:json)?\s*([\s\S]*?)```/im.exec(s)
  if (inner) return inner[1].trim()
  return s.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim()
}

/**
 * @param {import('firebase-functions/v2/https').CallableRequest} request
 */
async function taskDispatcherHandler(request) {
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
  if (!task) {
    throw new HttpsError('invalid-argument', 'task is required')
  }
  const sessionNotes = body.sessionNotes != null ? String(body.sessionNotes).trim().slice(0, 12000) : ''
  let modelHint = body.modelHint != null ? String(body.modelHint).trim() : ''
  if (!modelHint || modelHint === 'Let dispatcher decide') {
    modelHint = ''
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

  const userContent = [
    `TASK: ${task}`,
    sessionNotes ? `SESSION NOTES:\n${sessionNotes}` : null,
    modelHint ? `USER MODEL HINT: ${modelHint}` : null,
  ]
    .filter(Boolean)
    .join('\n\n')

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2000,
      temperature: 0.2,
      system: ROUTING_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userContent }],
    }),
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const msg = data?.error?.message || response.statusText || 'Anthropic request failed'
    throw new HttpsError('internal', msg)
  }

  const text = Array.isArray(data?.content)
    ? data.content.map((c) => (c && c.text ? c.text : '')).join('')
    : ''
  const stripped = stripJsonFences(text)

  let routed = null
  try {
    routed = JSON.parse(stripped)
  } catch {
    routed = { error: 'Routing failed', raw: stripped }
  }

  // Audit trail: every Growth Lab dispatch burns Anthropic tokens, so an
  // attacker with the owner's admin account could quietly run up a bill.
  // Record who dispatched, the first 300 chars of the task, and the
  // selected worker so forensics is easy.
  await auditFromCallable(db, request, {
    action: 'growth.task_dispatch',
    payload: {
      task: String(task).slice(0, 300),
      modelHint,
      resultWorker: routed?.assignedWorker || routed?.error || null,
    },
  })

  return routed
}

exports.taskDispatcher = onCall({ secrets: [ANTHROPIC_API_KEY] }, async (request) => {
  return taskDispatcherHandler(request)
})
