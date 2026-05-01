# Sales advisor drawer (v1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Right-side chat drawer on the Tires page with sales-expert persona, single conversation, session-only, buffered (no streaming) responses from Anthropic. Persona parameterized so future Dashboard / CRM / Analytics surfaces can swap their own without re-architecting.

**Architecture:** New callable `salesAdvisorChat` (Anthropic, Haiku → Sonnet fallback). New pure builder `buildAdvisorContext`. New hook `useSalesAdvisorChat` manages messages + dispatch. New `SalesAdvisorDrawer` + `SalesAdvisorTrigger` components mount on TiresDashboard.

**Tech Stack:** React 19, Tailwind v4, Vitest + `@testing-library/react`, Firebase Functions onCall (Node 22), Anthropic Messages API.

**Spec:** `docs/superpowers/specs/2026-05-01-sales-advisor-drawer-design.md`

**Worktree:** `.claude/worktrees/sales-advisor-drawer` (branch `sales-advisor-drawer`)

---

## File map

| File | Change | Responsibility |
|---|---|---|
| `functions/salesAdvisor.js` | Create | Cloud Function (onCall) |
| `functions/salesAdvisor.test.mjs` | Create | Handler + persona/rate-limit tests |
| `functions/index.js` | Modify | Register `salesAdvisorChat` export |
| `src/utils/buildAdvisorContext.js` | Create | Pure context builder |
| `src/utils/buildAdvisorContext.test.js` | Create | Builder tests |
| `src/hooks/useSalesAdvisorChat.js` | Create | Client hook (state + dispatch) |
| `src/hooks/useSalesAdvisorChat.test.js` | Create | Hook tests with mocked callable |
| `src/components/tires/SalesAdvisorDrawer.jsx` | Create | Drawer + chat UI |
| `src/components/tires/SalesAdvisorDrawer.test.jsx` | Create | Component tests |
| `src/components/tires/SalesAdvisorTrigger.jsx` | Create | Floating action button |
| `src/components/tires/SalesAdvisorTrigger.test.jsx` | Create | Component tests |
| `src/components/tires/TiresDashboard.jsx` | Modify | Mount drawer + `?` keyboard listener |

---

## Task 1: `salesAdvisorChat` Cloud Function

**Files:**
- Create: `functions/salesAdvisor.js`
- Create: `functions/salesAdvisor.test.mjs`
- Modify: `functions/index.js`

- [ ] **Step 1: Write the failing tests**

Create `functions/salesAdvisor.test.mjs`:

```js
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { _testonly } from './salesAdvisor.js'

const { handle, buildSystemPrompt, RATE_LIMIT_PER_HOUR } = _testonly

const mkCtx = (overrides) => ({
  brandAggregates: { total: 100, brands: [{ brand: 'MICHELIN', count: 60, avgListingMarginPct: 22, avgResearchedRetail: 200, offProgramCount: 0 }], missingBrands: [] },
  revenueStats: null,
  selectedTire: null,
  ...overrides,
})

describe('salesAdvisor handler', () => {
  let firestore
  let callAnthropic
  let now

  beforeEach(() => {
    firestore = {
      collection: vi.fn(() => ({
        doc: vi.fn(() => ({
          get: vi.fn(async () => ({ exists: true, data: () => ({ role: 'admin' }) })),
        })),
      })),
    }
    callAnthropic = vi.fn(async () => ({ text: 'Sample reply.', model: 'claude-haiku-4-5' }))
    now = 1714560000000
  })

  it('throws unauthenticated when request.auth missing', async () => {
    const run = handle({ firestore, callAnthropic, nowFn: () => now })
    await expect(
      run({ data: { messages: [{ role: 'user', content: 'hi' }], context: mkCtx() }, auth: null }),
    ).rejects.toMatchObject({ code: 'unauthenticated' })
  })

  it('throws permission-denied when role !== admin', async () => {
    firestore.collection().doc().get = vi.fn(async () => ({ exists: true, data: () => ({ role: 'viewer' }) }))
    const run = handle({ firestore, callAnthropic, nowFn: () => now })
    await expect(
      run({ data: { messages: [{ role: 'user', content: 'hi' }], context: mkCtx() }, auth: { uid: 'U1' } }),
    ).rejects.toMatchObject({ code: 'permission-denied' })
  })

  it('throws invalid-argument when messages is empty', async () => {
    const run = handle({ firestore, callAnthropic, nowFn: () => now })
    await expect(
      run({ data: { messages: [], context: mkCtx() }, auth: { uid: 'U1' } }),
    ).rejects.toMatchObject({ code: 'invalid-argument' })
  })

  it('throws invalid-argument when last message role is not user', async () => {
    const run = handle({ firestore, callAnthropic, nowFn: () => now })
    await expect(
      run({
        data: { messages: [{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }], context: mkCtx() },
        auth: { uid: 'U1' },
      }),
    ).rejects.toMatchObject({ code: 'invalid-argument' })
  })

  it('throws invalid-argument when total content exceeds 16 KB', async () => {
    const big = 'x'.repeat(17 * 1024)
    const run = handle({ firestore, callAnthropic, nowFn: () => now })
    await expect(
      run({ data: { messages: [{ role: 'user', content: big }], context: mkCtx() }, auth: { uid: 'U1' } }),
    ).rejects.toMatchObject({ code: 'invalid-argument' })
  })

  it('returns reply + model on happy path', async () => {
    const run = handle({ firestore, callAnthropic, nowFn: () => now })
    const out = await run({
      data: { messages: [{ role: 'user', content: 'help' }], context: mkCtx() },
      auth: { uid: 'U1' },
    })
    expect(out).toEqual({ reply: 'Sample reply.', model: 'claude-haiku-4-5' })
    expect(callAnthropic).toHaveBeenCalledTimes(1)
  })

  it('falls back to sonnet when haiku errors', async () => {
    callAnthropic = vi.fn()
      .mockRejectedValueOnce(new Error('haiku boom'))
      .mockResolvedValueOnce({ text: 'sonnet reply', model: 'claude-sonnet-4-6' })
    const run = handle({ firestore, callAnthropic, nowFn: () => now })
    const out = await run({
      data: { messages: [{ role: 'user', content: 'help' }], context: mkCtx() },
      auth: { uid: 'U1' },
    })
    expect(out).toEqual({ reply: 'sonnet reply', model: 'claude-sonnet-4-6' })
    expect(callAnthropic).toHaveBeenCalledTimes(2)
  })

  it('throws internal when both models fail', async () => {
    callAnthropic = vi.fn().mockRejectedValue(new Error('both boom'))
    const run = handle({ firestore, callAnthropic, nowFn: () => now })
    await expect(
      run({ data: { messages: [{ role: 'user', content: 'help' }], context: mkCtx() }, auth: { uid: 'U1' } }),
    ).rejects.toMatchObject({ code: 'internal' })
  })

  it('rate-limits after 30 requests in 60min', async () => {
    const run = handle({ firestore, callAnthropic, nowFn: () => now })
    for (let i = 0; i < RATE_LIMIT_PER_HOUR; i += 1) {
      await run({
        data: { messages: [{ role: 'user', content: `q${i}` }], context: mkCtx() },
        auth: { uid: 'U1' },
      })
    }
    await expect(
      run({ data: { messages: [{ role: 'user', content: 'over' }], context: mkCtx() }, auth: { uid: 'U1' } }),
    ).rejects.toMatchObject({ code: 'resource-exhausted' })
  })

  it('rate-limit window slides — old timestamps drop off', async () => {
    let nowVal = now
    const run = handle({ firestore, callAnthropic, nowFn: () => nowVal })
    for (let i = 0; i < RATE_LIMIT_PER_HOUR; i += 1) {
      await run({
        data: { messages: [{ role: 'user', content: `q${i}` }], context: mkCtx() },
        auth: { uid: 'U1' },
      })
    }
    nowVal = now + 61 * 60 * 1000 // 61 minutes later
    const out = await run({
      data: { messages: [{ role: 'user', content: 'after window' }], context: mkCtx() },
      auth: { uid: 'U1' },
    })
    expect(out.reply).toBe('Sample reply.')
  })
})

describe('buildSystemPrompt', () => {
  it('uses tires persona block by default', () => {
    const prompt = buildSystemPrompt({ surface: 'tires', context: mkCtx() })
    expect(prompt).toMatch(/sales coach/i)
    expect(prompt).toMatch(/Skedaddle/i)
    expect(prompt).toMatch(/MICHELIN/)
  })

  it('falls back to tires persona when surface is unknown', () => {
    const prompt = buildSystemPrompt({ surface: 'bogus', context: mkCtx() })
    expect(prompt).toMatch(/sales coach/i)
  })

  it('renders revenueStats when provided', () => {
    const prompt = buildSystemPrompt({
      surface: 'tires',
      context: mkCtx({ revenueStats: { mtdRevenue: 12345, ytdRevenue: 99999, completedCount30d: 8, completedCount90d: 22 } }),
    })
    expect(prompt).toMatch(/12345/)
  })

  it('marks no-tire-selected explicitly', () => {
    const prompt = buildSystemPrompt({ surface: 'tires', context: mkCtx() })
    expect(prompt).toMatch(/No tire is currently selected/i)
  })

  it('renders selectedTire when provided', () => {
    const prompt = buildSystemPrompt({
      surface: 'tires',
      context: mkCtx({ selectedTire: { mspn: '12345', brand: 'MICHELIN', description: 'P255/55R18', category: 'passenger', price: 100, retailPrice: 200, listingMarginPct: 50 } }),
    })
    expect(prompt).toMatch(/12345/)
    expect(prompt).toMatch(/MICHELIN/)
  })
})
```

- [ ] **Step 2: Implement the handler**

Create `functions/salesAdvisor.js`:

```js
const { onCall, HttpsError } = require('firebase-functions/v2/https')
const admin = require('firebase-admin')
const { ANTHROPIC_API_KEY, anthropicKeyResolved } = require('./slackSecrets')

const ANTHROPIC_MODELS = ['claude-haiku-4-5', 'claude-sonnet-4-6']
const MAX_INPUT_BYTES = 16 * 1024
const MAX_OUTPUT_TOKENS = 1500
const TEMPERATURE = 0.4
const RATE_LIMIT_PER_HOUR = 30
const RATE_WINDOW_MS = 60 * 60 * 1000

// Per-instance, per-uid timestamp counter. Best-effort: resets on instance
// restart, doesn't share state across horizontally-scaled instances. Move to
// Firestore-backed if needed.
const rateBuckets = new Map()

const TIRES_PERSONA = `You are a sales coach and pricing advisor for Skedaddle Inc, a tire reseller in Loveland, Colorado. Your operator is on the Tires catalog page. Treat them as a working salesperson — your job is to make their next conversation, quote, listing, or follow-up better.

Lean into:
- Objection handling (price comparisons, brand familiarity, timing)
- Quote framing and pitch language
- Highest-margin moves given the catalog's current state
- Specific SKU / size advice when the operator gives you a target

Avoid generic small talk. Always tie advice to a number the operator can act on (margin %, SKU count, retail vs buy gap, etc).`

function personaForSurface(surface) {
  // v1 only ships 'tires'. Future: dashboard, crm, analytics. Unknown
  // surfaces fall through to the tires persona.
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
  // expose for tests that need to reset between runs
  __resetRateBuckets: () => rateBuckets.clear(),
}
```

- [ ] **Step 3: Register in `functions/index.js`**

Add a single export line near the existing `advisorNarrate` export:

```js
exports.salesAdvisorChat = require('./salesAdvisor').salesAdvisorChat
```

- [ ] **Step 4: Reset rate buckets between tests**

In the test file's top-level `beforeEach`, after the existing setup, add:

```js
import { _testonly } from './salesAdvisor.js'
beforeEach(() => {
  _testonly.__resetRateBuckets()
})
```

(Or call it inside each test that hits the rate-limit. The plan's rate-limit tests already share the same `uid: 'U1'` so without reset the second test's count starts at the previous test's tail.)

- [ ] **Step 5: Run tests**

`cd .claude/worktrees/sales-advisor-drawer && cd functions && npx vitest run salesAdvisor.test.mjs`

(Or use the project-wide runner if `functions/` is included.)

- [ ] **Step 6: Commit**

```bash
cd .claude/worktrees/sales-advisor-drawer
git add functions/salesAdvisor.js functions/salesAdvisor.test.mjs functions/index.js
git commit -m "feat(functions): salesAdvisorChat callable

New onCall function for the Tires-page sales advisor drawer. Auth-
gated (admin only), 30 msg/hour rate limit per UID via in-memory
buckets, Haiku -> Sonnet model fallback, 1500 max output tokens at
temperature 0.4. System prompt parameterized by 'surface' field on
input so future Dashboard / CRM / Analytics surfaces can swap their
own persona block without re-architecting.

Spec: docs/superpowers/specs/2026-05-01-sales-advisor-drawer-design.md"
```

---

## Task 2: `buildAdvisorContext` builder

**Files:**
- Create: `src/utils/buildAdvisorContext.js`
- Create: `src/utils/buildAdvisorContext.test.js`

- [ ] **Step 1: Write the failing tests**

Create `src/utils/buildAdvisorContext.test.js`:

```js
import { describe, expect, it } from 'vitest'
import { buildAdvisorContext } from './buildAdvisorContext.js'

const mkAggregates = () => ({
  total: 100,
  brands: [
    { brand: 'MICHELIN', count: 60, avgListingMarginPct: 22, avgResearchedRetail: 200, offProgramCount: 0, missingRetailResearchCount: 5 },
  ],
  missingBrands: [],
})

describe('buildAdvisorContext', () => {
  it('returns a stable empty-ish shape with no inputs', () => {
    const out = buildAdvisorContext({ brandAggregates: null, revenueStats: null, selectedTire: null })
    expect(out).toEqual({
      brandAggregates: { total: 0, brands: [], missingBrands: [] },
      revenueStats: null,
      selectedTire: null,
    })
  })

  it('passes brandAggregates through', () => {
    const out = buildAdvisorContext({ brandAggregates: mkAggregates(), revenueStats: null, selectedTire: null })
    expect(out.brandAggregates.total).toBe(100)
    expect(out.brandAggregates.brands[0].brand).toBe('MICHELIN')
  })

  it('serializes revenueStats keys we care about', () => {
    const out = buildAdvisorContext({
      brandAggregates: mkAggregates(),
      revenueStats: { mtdRevenue: 1, ytdRevenue: 2, completedCount30d: 3, completedCount90d: 4, extraField: 'noise' },
      selectedTire: null,
    })
    expect(out.revenueStats).toEqual({ mtdRevenue: 1, ytdRevenue: 2, completedCount30d: 3, completedCount90d: 4 })
  })

  it('serializes selectedTire to a tight shape', () => {
    const tire = {
      mspn: '12345',
      brand: 'MICHELIN',
      description: 'P255/55R18 109V',
      category: 'passenger',
      price: 100,
      priceIntel: { retailPrice: 200, sources: [{ source: 'gemini_retail_search' }] },
      listingMargin: 50,
      randomNoise: 'ignored',
    }
    const out = buildAdvisorContext({ brandAggregates: mkAggregates(), revenueStats: null, selectedTire: tire })
    expect(out.selectedTire).toEqual({
      mspn: '12345',
      brand: 'MICHELIN',
      description: 'P255/55R18 109V',
      category: 'passenger',
      price: 100,
      retailPrice: 200,
      listingMarginPct: 50,
    })
  })

  it('selectedTire retailPrice is null when no priceIntel.retailPrice', () => {
    const tire = { mspn: '1', brand: 'MICHELIN', description: '...', category: 'passenger', price: 100, priceIntel: {} }
    const out = buildAdvisorContext({ brandAggregates: mkAggregates(), revenueStats: null, selectedTire: tire })
    expect(out.selectedTire.retailPrice).toBeNull()
  })
})
```

- [ ] **Step 2: Implement**

Create `src/utils/buildAdvisorContext.js`:

```js
/**
 * Pure builder for the salesAdvisorChat context payload. Inputs are objects
 * the calling page already has loaded; output is the trimmed shape the
 * Cloud Function expects.
 *
 * @param {{
 *   brandAggregates: { total: number, brands: Array, missingBrands: string[] } | null,
 *   revenueStats: { mtdRevenue, ytdRevenue, completedCount30d, completedCount90d } | null,
 *   selectedTire: Record<string, unknown> | null,
 * }} input
 */
export function buildAdvisorContext({ brandAggregates, revenueStats, selectedTire }) {
  const out = {
    brandAggregates: brandAggregates && typeof brandAggregates === 'object'
      ? {
          total: Number(brandAggregates.total) || 0,
          brands: Array.isArray(brandAggregates.brands) ? brandAggregates.brands : [],
          missingBrands: Array.isArray(brandAggregates.missingBrands) ? brandAggregates.missingBrands : [],
        }
      : { total: 0, brands: [], missingBrands: [] },
    revenueStats: null,
    selectedTire: null,
  }

  if (revenueStats && typeof revenueStats === 'object') {
    out.revenueStats = {
      mtdRevenue: Number(revenueStats.mtdRevenue) || 0,
      ytdRevenue: Number(revenueStats.ytdRevenue) || 0,
      completedCount30d: Number(revenueStats.completedCount30d) || 0,
      completedCount90d: Number(revenueStats.completedCount90d) || 0,
    }
  }

  if (selectedTire && typeof selectedTire === 'object') {
    const retailPriceRaw = selectedTire?.priceIntel?.retailPrice
    const retailPrice = Number.isFinite(Number(retailPriceRaw)) ? Number(retailPriceRaw) : null
    const marginRaw = selectedTire?.listingMargin
    const listingMarginPct = Number.isFinite(Number(marginRaw)) ? Number(marginRaw) : null
    out.selectedTire = {
      mspn: String(selectedTire.mspn ?? ''),
      brand: String(selectedTire.brand ?? ''),
      description: String(selectedTire.description ?? ''),
      category: selectedTire.category ?? null,
      price: Number(selectedTire.price) || 0,
      retailPrice,
      listingMarginPct,
    }
  }

  return out
}
```

- [ ] **Step 3: Run tests + commit**

```bash
cd .claude/worktrees/sales-advisor-drawer
npx vitest run src/utils/buildAdvisorContext.test.js
git add src/utils/buildAdvisorContext.js src/utils/buildAdvisorContext.test.js
git commit -m "feat(utils): buildAdvisorContext payload builder

Pure builder that trims the page's loaded data (brandAggregates +
revenueStats + selectedTire) into the tight shape salesAdvisorChat
expects. No side effects, no Firestore reads."
```

---

## Task 3: `useSalesAdvisorChat` hook

**Files:**
- Create: `src/hooks/useSalesAdvisorChat.js`
- Create: `src/hooks/useSalesAdvisorChat.test.js`

- [ ] **Step 1: Write the failing tests**

Create `src/hooks/useSalesAdvisorChat.test.js`:

```jsx
// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn(),
}))
vi.mock('../firebase/config', () => ({ functions: {} }))

import { httpsCallable } from 'firebase/functions'
import { useSalesAdvisorChat } from './useSalesAdvisorChat.js'

beforeEach(() => {
  httpsCallable.mockReset()
})

describe('useSalesAdvisorChat', () => {
  it('initial state: closed, empty messages, not pending', () => {
    httpsCallable.mockReturnValue(() => Promise.resolve({ data: { reply: 'ok', model: 'm' } }))
    const { result } = renderHook(() => useSalesAdvisorChat({ buildContext: () => ({}) }))
    expect(result.current.isOpen).toBe(false)
    expect(result.current.messages).toEqual([])
    expect(result.current.pending).toBe(false)
  })

  it('open / close / toggle flip isOpen', () => {
    httpsCallable.mockReturnValue(() => Promise.resolve({ data: {} }))
    const { result } = renderHook(() => useSalesAdvisorChat({ buildContext: () => ({}) }))
    act(() => result.current.open())
    expect(result.current.isOpen).toBe(true)
    act(() => result.current.close())
    expect(result.current.isOpen).toBe(false)
    act(() => result.current.toggle())
    expect(result.current.isOpen).toBe(true)
  })

  it('send appends user + assistant, calls callable, clears pending', async () => {
    const fn = vi.fn(async () => ({ data: { reply: 'great pitch idea', model: 'claude-haiku-4-5' } }))
    httpsCallable.mockReturnValue(fn)
    const { result } = renderHook(() => useSalesAdvisorChat({ buildContext: () => ({ test: 1 }) }))
    await act(async () => { await result.current.send('how do I sell more?') })
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn.mock.calls[0][0]).toMatchObject({
      surface: 'tires',
      messages: [{ role: 'user', content: 'how do I sell more?' }],
      context: { test: 1 },
    })
    expect(result.current.messages).toEqual([
      { role: 'user', content: 'how do I sell more?' },
      { role: 'assistant', content: 'great pitch idea' },
    ])
    expect(result.current.pending).toBe(false)
  })

  it('send with empty / whitespace text is a no-op', async () => {
    httpsCallable.mockReturnValue(vi.fn())
    const { result } = renderHook(() => useSalesAdvisorChat({ buildContext: () => ({}) }))
    await act(async () => { await result.current.send('') })
    await act(async () => { await result.current.send('   ') })
    expect(result.current.messages).toEqual([])
  })

  it('callable rejection appends a system-error bubble; pending cleared', async () => {
    const fn = vi.fn(async () => { throw new Error('boom') })
    httpsCallable.mockReturnValue(fn)
    const { result } = renderHook(() => useSalesAdvisorChat({ buildContext: () => ({}) }))
    await act(async () => { await result.current.send('hi') })
    expect(result.current.messages).toEqual([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: expect.stringMatching(/Advisor failed/), error: true },
    ])
    expect(result.current.pending).toBe(false)
  })

  it('clear empties messages without changing isOpen', async () => {
    httpsCallable.mockReturnValue(async () => ({ data: { reply: 'ok' } }))
    const { result } = renderHook(() => useSalesAdvisorChat({ buildContext: () => ({}) }))
    act(() => result.current.open())
    await act(async () => { await result.current.send('hi') })
    expect(result.current.messages.length).toBe(2)
    act(() => result.current.clear())
    expect(result.current.messages).toEqual([])
    expect(result.current.isOpen).toBe(true)
  })
})
```

- [ ] **Step 2: Implement**

Create `src/hooks/useSalesAdvisorChat.js`:

```jsx
import { useCallback, useMemo, useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import { functions } from '../firebase/config'

const SURFACE = 'tires'

/**
 * Client-side state + dispatch for the sales advisor drawer.
 *
 * @param {{ buildContext: () => object, callable?: unknown, surface?: string }} params
 *   buildContext: pure builder called on each send to gather catalog state.
 *   callable: optional override for testing / non-Firebase environments.
 *   surface: defaults to 'tires'; future surfaces can pass their own key.
 */
export function useSalesAdvisorChat({ buildContext, callable, surface = SURFACE }) {
  const [isOpen, setOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [pending, setPending] = useState(false)

  const fn = useMemo(() => {
    if (callable) return callable
    return httpsCallable(functions, 'salesAdvisorChat')
  }, [callable])

  const open = useCallback(() => setOpen(true), [])
  const close = useCallback(() => setOpen(false), [])
  const toggle = useCallback(() => setOpen((v) => !v), [])
  const clear = useCallback(() => setMessages([]), [])

  const send = useCallback(async (text) => {
    const userText = String(text || '').trim()
    if (!userText) return
    const next = [...messages, { role: 'user', content: userText }]
    setMessages(next)
    setPending(true)
    try {
      const result = await fn({
        surface,
        messages: next,
        context: buildContext(),
      })
      const reply = String(result?.data?.reply || '').trim()
      setMessages((cur) => [
        ...cur,
        { role: 'assistant', content: reply || '(empty reply from advisor)' },
      ])
    } catch (err) {
      const code = err?.code || ''
      const friendly = code === 'resource-exhausted'
        ? 'Advisor failed: rate limit reached. Try again in a few minutes.'
        : code === 'permission-denied'
          ? 'Advisor failed: admin role required.'
          : `Advisor failed: ${err?.message || 'unknown error'}`
      setMessages((cur) => [
        ...cur,
        { role: 'assistant', content: friendly, error: true },
      ])
    } finally {
      setPending(false)
    }
  }, [fn, messages, buildContext, surface])

  return { isOpen, open, close, toggle, messages, pending, send, clear }
}
```

- [ ] **Step 3: Run tests + commit**

```bash
cd .claude/worktrees/sales-advisor-drawer
npx vitest run src/hooks/useSalesAdvisorChat.test.js
git add src/hooks/useSalesAdvisorChat.js src/hooks/useSalesAdvisorChat.test.js
git commit -m "feat(hooks): useSalesAdvisorChat client-side state and dispatch

Manages open/close/toggle, the messages array, pending state, and the
async send flow. send() is a no-op for empty/whitespace input.
Callable errors are caught and surfaced as system-error bubbles
(distinct error codes get distinct friendly copy)."
```

---

## Task 4: `SalesAdvisorTrigger` + `SalesAdvisorDrawer` components

**Files:**
- Create: `src/components/tires/SalesAdvisorTrigger.jsx`
- Create: `src/components/tires/SalesAdvisorTrigger.test.jsx`
- Create: `src/components/tires/SalesAdvisorDrawer.jsx`
- Create: `src/components/tires/SalesAdvisorDrawer.test.jsx`

- [ ] **Step 1: Trigger tests + impl**

Create `src/components/tires/SalesAdvisorTrigger.test.jsx`:

```jsx
/** @vitest-environment jsdom */
import { describe, expect, it, vi, afterEach } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import { SalesAdvisorTrigger } from './SalesAdvisorTrigger.jsx'

afterEach(cleanup)

describe('SalesAdvisorTrigger', () => {
  it('renders a button with accessible label', () => {
    const { container } = render(<SalesAdvisorTrigger onClick={() => {}} />)
    const btn = container.querySelector('button')
    expect(btn).not.toBeNull()
    expect(btn.getAttribute('aria-label')).toMatch(/sales advisor/i)
  })

  it('clicking fires onClick', () => {
    const spy = vi.fn()
    const { container } = render(<SalesAdvisorTrigger onClick={spy} />)
    fireEvent.click(container.querySelector('button'))
    expect(spy).toHaveBeenCalledTimes(1)
  })
})
```

Create `src/components/tires/SalesAdvisorTrigger.jsx`:

```jsx
/**
 * Floating action button bottom-right of the Tires page. Hidden when the
 * drawer is open (parent gates rendering, not this component).
 */
export function SalesAdvisorTrigger({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Open sales advisor"
      className="fixed bottom-6 right-6 z-30 inline-flex h-14 w-14 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 text-zinc-100 shadow-lg transition-transform hover:-translate-y-0.5 hover:border-amber-600/40 hover:bg-zinc-800"
    >
      <span aria-hidden className="text-2xl">💬</span>
    </button>
  )
}
```

- [ ] **Step 2: Drawer tests + impl**

Create `src/components/tires/SalesAdvisorDrawer.test.jsx`:

```jsx
/** @vitest-environment jsdom */
import { describe, expect, it, vi, afterEach } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import { SalesAdvisorDrawer } from './SalesAdvisorDrawer.jsx'

afterEach(cleanup)

const baseProps = {
  isOpen: true,
  messages: [],
  pending: false,
  onClose: () => {},
  onSend: () => {},
}

describe('SalesAdvisorDrawer', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<SalesAdvisorDrawer {...baseProps} isOpen={false} />)
    expect(container.querySelector('[role="dialog"]')).toBeNull()
  })

  it('renders header, message list, textarea, send button when open', () => {
    const { container } = render(<SalesAdvisorDrawer {...baseProps} />)
    expect(container.querySelector('[role="dialog"]')).not.toBeNull()
    expect(container.querySelector('textarea')).not.toBeNull()
    expect(container.querySelector('button[type="submit"]')).not.toBeNull()
  })

  it('shows empty-state suggestion buttons when messages is empty', () => {
    const { container } = render(<SalesAdvisorDrawer {...baseProps} />)
    const suggestionButtons = container.querySelectorAll('[data-suggestion]')
    expect(suggestionButtons.length).toBe(4)
  })

  it('clicking a suggestion populates the textarea', () => {
    const { container } = render(<SalesAdvisorDrawer {...baseProps} />)
    const first = container.querySelector('[data-suggestion]')
    fireEvent.click(first)
    const ta = container.querySelector('textarea')
    expect(ta.value.length).toBeGreaterThan(20)
  })

  it('submitting fires onSend with trimmed text', () => {
    const spy = vi.fn()
    const { container } = render(<SalesAdvisorDrawer {...baseProps} onSend={spy} />)
    const ta = container.querySelector('textarea')
    fireEvent.change(ta, { target: { value: '  hi there  ' } })
    fireEvent.submit(ta.closest('form'))
    expect(spy).toHaveBeenCalledWith('hi there')
  })

  it('submitting empty text does not fire onSend', () => {
    const spy = vi.fn()
    const { container } = render(<SalesAdvisorDrawer {...baseProps} onSend={spy} />)
    const ta = container.querySelector('textarea')
    fireEvent.submit(ta.closest('form'))
    expect(spy).not.toHaveBeenCalled()
  })

  it('disables send while pending', () => {
    const { container } = render(<SalesAdvisorDrawer {...baseProps} pending={true} />)
    const btn = container.querySelector('button[type="submit"]')
    expect(btn.disabled).toBe(true)
  })

  it('renders error message bubbles with red styling', () => {
    const messages = [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'Advisor failed: boom', error: true },
    ]
    const { container } = render(<SalesAdvisorDrawer {...baseProps} messages={messages} />)
    const errBubble = container.querySelector('[data-error="true"]')
    expect(errBubble).not.toBeNull()
    expect(errBubble.textContent).toContain('Advisor failed')
  })

  it('clicking close fires onClose', () => {
    const spy = vi.fn()
    const { container } = render(<SalesAdvisorDrawer {...baseProps} onClose={spy} />)
    fireEvent.click(container.querySelector('[aria-label="Close advisor"]'))
    expect(spy).toHaveBeenCalledTimes(1)
  })
})
```

Create `src/components/tires/SalesAdvisorDrawer.jsx`:

```jsx
import { useEffect, useRef, useState } from 'react'

const SUGGESTIONS = [
  "Help me handle 'I can get them cheaper online' — what's the strongest objection-handling line?",
  'Draft a pitch for our highest-margin Michelin sizes that a fleet customer would care about.',
  'Customer wants 4 LR-E commercials for a moving fleet — what should I lead with and why?',
  "What's a good 7-day follow-up message after a quote went cold?",
]

export function SalesAdvisorDrawer({ isOpen, messages, pending, onClose, onSend }) {
  const [draft, setDraft] = useState('')
  const taRef = useRef(null)
  const listRef = useRef(null)

  useEffect(() => {
    if (!isOpen) return
    queueMicrotask(() => taRef.current?.focus())
  }, [isOpen])

  useEffect(() => {
    if (!listRef.current) return
    listRef.current.scrollTop = listRef.current.scrollHeight
  }, [messages, pending])

  if (!isOpen) return null

  const trimmed = draft.trim()
  function submit(e) {
    e.preventDefault()
    if (!trimmed || pending) return
    onSend(trimmed)
    setDraft('')
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit(e)
    }
  }

  return (
    <aside
      role="dialog"
      aria-label="Sales advisor"
      className="fixed inset-y-0 right-0 z-40 flex w-full max-w-[480px] flex-col border-l border-zinc-800 bg-zinc-950 shadow-2xl sm:w-[480px]"
    >
      <header className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-zinc-100">Sales advisor</h2>
          <p className="text-[11px] text-zinc-500">Tires page · Claude</p>
        </div>
        <button
          type="button"
          aria-label="Close advisor"
          onClick={onClose}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
        >
          <span aria-hidden className="text-lg">✕</span>
        </button>
      </header>

      <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-3">
        {messages.length === 0 ? (
          <div>
            <p className="mb-3 text-sm text-zinc-300">
              Ask me about quotes, objection handling, high-margin moves, or follow-ups.
            </p>
            <div className="grid gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  data-suggestion
                  onClick={() => setDraft(s)}
                  className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-left text-xs text-zinc-300 transition-colors hover:border-amber-600/40 hover:text-zinc-100"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {messages.map((m, i) => (
              <li
                key={i}
                data-role={m.role}
                data-error={m.error ? 'true' : 'false'}
                className={`max-w-[88%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${
                  m.role === 'user'
                    ? 'self-end bg-amber-700/30 text-amber-100'
                    : m.error
                      ? 'self-start border border-red-700 bg-red-950/40 text-red-200'
                      : 'self-start bg-zinc-900 text-zinc-100'
                }`}
              >
                {m.content}
              </li>
            ))}
            {pending ? (
              <li className="self-start rounded-2xl bg-zinc-900 px-3 py-2 text-sm text-zinc-400">Thinking…</li>
            ) : null}
          </ul>
        )}
      </div>

      <form onSubmit={submit} className="border-t border-zinc-800 p-3">
        <textarea
          ref={taRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about quotes, pitches, follow-ups…"
          rows={3}
          className="block w-full resize-none rounded-lg border border-zinc-800 bg-zinc-900 p-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-amber-600/40 focus:outline-none"
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[10px] text-zinc-600">Enter to send · Shift+Enter for newline</span>
          <button
            type="submit"
            disabled={!trimmed || pending}
            className="inline-flex items-center rounded-lg border border-zinc-600 px-3 py-1.5 text-sm font-medium text-zinc-100 hover:border-amber-600/40 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {pending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </form>
    </aside>
  )
}
```

- [ ] **Step 3: Run tests + commit**

```bash
cd .claude/worktrees/sales-advisor-drawer
npx vitest run src/components/tires/SalesAdvisorTrigger.test.jsx src/components/tires/SalesAdvisorDrawer.test.jsx
git add src/components/tires/SalesAdvisorTrigger.jsx src/components/tires/SalesAdvisorTrigger.test.jsx src/components/tires/SalesAdvisorDrawer.jsx src/components/tires/SalesAdvisorDrawer.test.jsx
git commit -m "feat(tires): SalesAdvisorDrawer + Trigger components

Drawer slides in from the right at fixed 480px width (full-width on
mobile). Empty state lists four sales-expert suggestion prompts.
User bubbles right-aligned amber, assistant left-aligned zinc, error
bubbles red-bordered. Enter submits, Shift+Enter newlines. Trigger
is a floating circular button bottom-right. Both render-only — state
lives in useSalesAdvisorChat at the parent."
```

---

## Task 5: Mount in TiresDashboard + keyboard listener

**Files:**
- Modify: `src/components/tires/TiresDashboard.jsx`

- [ ] **Step 1: Imports + hook**

Near the existing `useBrandAggregates` import in `TiresDashboard.jsx`, add:

```jsx
import { useSalesAdvisorChat } from '../../hooks/useSalesAdvisorChat.js'
import { buildAdvisorContext } from '../../utils/buildAdvisorContext.js'
import { SalesAdvisorDrawer } from './SalesAdvisorDrawer.jsx'
import { SalesAdvisorTrigger } from './SalesAdvisorTrigger.jsx'
```

Inside the `TiresDashboard` function, after the existing `brandAggregates` line, add:

```jsx
  const advisorBuildContext = useCallback(() => {
    const selectedTire = selectedIds.size === 1
      ? enriched.find((t) => t.id === [...selectedIds][0]) || null
      : null
    return buildAdvisorContext({
      brandAggregates,
      revenueStats: null,  // TiresDashboard doesn't load this; future enhancement is to read meta/revenueStats once on drawer-open
      selectedTire,
    })
  }, [brandAggregates, selectedIds, enriched])

  const advisor = useSalesAdvisorChat({ buildContext: advisorBuildContext })
```

(Verify `useCallback` is already imported from React; if not, add it.)

- [ ] **Step 2: Keyboard listener**

After the advisor hook setup, add a `useEffect` that wires the global `?` listener:

```jsx
  useEffect(() => {
    function onKey(e) {
      if (e.key !== '?') return
      const tag = String(document.activeElement?.tagName || '').toLowerCase()
      if (tag === 'input' || tag === 'textarea' || document.activeElement?.isContentEditable) return
      e.preventDefault()
      advisor.toggle()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [advisor])
```

- [ ] **Step 3: Render drawer + trigger**

In the JSX returned by `TiresDashboard`, find a sensible mount near the top of the rendered tree (after the `<ModuleSubheader>` or before the closing fragment). Add:

```jsx
{!advisor.isOpen ? <SalesAdvisorTrigger onClick={advisor.open} /> : null}
<SalesAdvisorDrawer
  isOpen={advisor.isOpen}
  messages={advisor.messages}
  pending={advisor.pending}
  onClose={advisor.close}
  onSend={advisor.send}
/>
```

- [ ] **Step 4: Run vitest**

`cd .claude/worktrees/sales-advisor-drawer && npx vitest run src/`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
cd .claude/worktrees/sales-advisor-drawer
git add src/components/tires/TiresDashboard.jsx
git commit -m "feat(tires): mount SalesAdvisorDrawer + Trigger on TiresDashboard

Wires useSalesAdvisorChat with buildAdvisorContext over the page's
existing brandAggregates + selectedIds + enriched. Adds the global
'?' keyboard listener that toggles the drawer (ignored when focus is
in an input/textarea/contenteditable). Trigger renders only when the
drawer is closed."
```

---

## Task 6: Lint, bundle, full vitest, manual eye-check

**Files:** none

- [ ] **Step 1: Lint**

`cd .claude/worktrees/sales-advisor-drawer && npm run lint`

Expected: 0 errors.

- [ ] **Step 2: Bundle**

`cd .claude/worktrees/sales-advisor-drawer && npm run build && npx size-limit`

Expected: tires page chunk under 42 KB. New code adds ~5 KB gzipped (drawer + trigger + hook + builder).

If it breaches: bump cap by 5 KB to 47 KB in `.size-limit.cjs` with a one-line comment explaining the advisor drawer.

- [ ] **Step 3: Full vitest**

`cd .claude/worktrees/sales-advisor-drawer && npx vitest run src/ functions/`

Expected: green.

- [ ] **Step 4: Manual eye-check (skip if no dev backend access)**

`npm run dev`. Sign in as admin. Navigate to `/tires`.

- Press `?` → drawer opens. Press `?` again → drawer closes.
- Open drawer → click a suggestion → textarea populates → click Send → reply appears.
- Type a question that mentions a SKU not in the catalog (e.g., MSPN 99999999) → advisor declines to invent a price.
- Open drawer with one tire selected → ask "tell me about this tire" → reply references the selected tire's brand and size.
- Send 31 questions in quick succession → 31st returns rate-limit error bubble.
- Sign in as viewer (non-admin) → trigger button still renders but Send returns "admin role required" error.

- [ ] **Step 5: Hold for user direction on push**

Do NOT push without user confirmation. Stop and report status.

---

## Verification checklist

- All vitest tests green (`npx vitest run src/ functions/`)
- Lint clean
- Bundle within caps (or cap bumped with rationale)
- Drawer opens/closes via trigger and `?` key
- `?` ignored when focus is in an input
- Suggestions populate textarea
- Send disabled while pending
- Error bubbles render red
- Rate limit returns a friendly bubble
- Non-admin gets "admin role required" bubble
- Selected-tire context flows when exactly 1 tire is selected
- No catalog-state numbers hallucinated (manual check)

---

## Out of scope

- Streaming
- Persistence
- Multi-thread
- Tool use
- Markdown rendering
- Drawer on non-Tires routes
- Per-message edit / regenerate
