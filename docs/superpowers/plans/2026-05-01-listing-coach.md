# AI Listing Coach (v1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Second persona on top of `salesAdvisor` Cloud Function. Drawer tab takes a tire SKU + qty + audience and produces a complete FB / CL listing kit (price math, audience-tailored copy, photo guidance), with crew-shared style rules persisted across sessions.

**Architecture:** New `listingAdvisor` callable with Anthropic tool use loop (vs salesAdvisor's single-shot). Six server tools: catalog lookup by mspn / size, landed cost, recent sales, plus style guide read + write. Style guide is a single Firestore doc at `meta/listingCoachStyleGuide` with a `rules[]` array. New 2nd tab on the existing drawer routes to a parallel `useListingCoach` hook. Admin-only `/admin/listing-coach-rules` page for review / toggle / delete.

**Tech Stack:** Firebase Functions v2 (Node 22), Anthropic SDK via `fetch` (matches existing pattern), Firestore, React 19 + Vite + Tailwind, Vitest with plain `expect`/`fireEvent`.

**Spec:** `docs/superpowers/specs/2026-05-01-listing-coach-design.md`

**Worktree:** `.claude/worktrees/listing-coach` (branch `listing-coach`)

**Style guardrails:**
- NO em dashes anywhere (regular hyphens)
- NO AI / Co-Authored-By trailers in commits
- CommonJS in `functions/`, ESM in `src/` and `scripts/`
- Vitest plain matchers, NO jest-dom
- HEREDOC commit messages

---

## File map

| File | Change | Responsibility |
|---|---|---|
| `functions/listingCoachStyleGuide.js` | Create | Pure helpers + tools: `addStyleRule`, `listStyleRules`, `removeStyleRule`, `toggleStyleRule` |
| `functions/listingCoachStyleGuide.test.mjs` | Create | Tests |
| `functions/listingCoachTools.js` | Create | Tool registry: `getTireByMspn`, `getTireBySize`, `computeLandedCost`, `getRecentSalesForSize` + dispatch table for the Anthropic tool-use loop |
| `functions/listingCoachTools.test.mjs` | Create | Tests |
| `functions/listingAdvisor.js` | Create | Callable; persona, few-shot anchor, Anthropic tool-use loop, rate limit, Haiku/Sonnet fallback (mirrors `salesAdvisor.js`) |
| `functions/listingAdvisor.test.mjs` | Create | Tests |
| `functions/index.js` | Modify | Register `listingAdvisor` export |
| `functions/__fixtures__/listingCoachFewShot.txt` | Create | Abbreviated 2026-05-01 KO2 / NOCO walk-through transcript embedded into the system prompt |
| `src/hooks/useListingCoach.js` | Create | Mirrors `useSalesAdvisorChat`; calls `listingAdvisor` callable |
| `src/hooks/useListingCoach.test.js` | Create | Tests |
| `src/components/tires/ListingCoachTab.jsx` | Create | Tab content; chat UI with copy-button on fenced code blocks |
| `src/components/tires/ListingCoachTab.test.jsx` | Create | Tests |
| `src/components/tires/SalesAdvisorDrawer.jsx` | Modify | Two-tab strip (Sales / Listing). Each tab gets its own conversation. |
| `src/components/tires/SalesAdvisorDrawer.test.jsx` | Modify | New tab tests |
| `src/components/admin/ListingCoachRulesPanel.jsx` | Create | Admin table: list / toggle / delete style rules + "Add rule" form |
| `src/components/admin/ListingCoachRulesPanel.test.jsx` | Create | Tests |
| `src/pages/AdminListingCoachRulesPage.jsx` | Create | Page wrapper, admin gated |
| `src/App.jsx` | Modify | Mount `/admin/listing-coach-rules` route |

---

## Task 1: `listingCoachStyleGuide.js` CRUD helpers

**Files:**
- Create: `functions/listingCoachStyleGuide.js`
- Create: `functions/listingCoachStyleGuide.test.mjs`

The style guide is a single Firestore doc at `meta/listingCoachStyleGuide` with `rules[]`. Each rule: `{ id, rule, audience, addedBy, addedAt, reason, enabled }`.

- [ ] **Step 1: Failing tests**

```js
import { describe, expect, it } from 'vitest'
import { _testonly } from './listingCoachStyleGuide.js'

const { addStyleRule, listStyleRules, toggleStyleRule, removeStyleRule } = _testonly

function makeFirestore({ rules = [] } = {}) {
  const docs = new Map()
  docs.set('meta/listingCoachStyleGuide', {
    exists: rules.length > 0,
    data: () => ({ rules }),
  })
  const writes = []
  return {
    writes,
    collection: (name) => ({
      doc: (id) => ({
        get: async () => docs.get(`${name}/${id}`) || { exists: false, data: () => null },
        set: async (data, opts) => { writes.push({ path: `${name}/${id}`, data, opts }); docs.set(`${name}/${id}`, { exists: true, data: () => data }) },
        update: async (data) => { writes.push({ path: `${name}/${id}`, data, op: 'update' }); const cur = (docs.get(`${name}/${id}`) || {}).data?.() || {}; docs.set(`${name}/${id}`, { exists: true, data: () => ({ ...cur, ...data }) }) },
      }),
    }),
  }
}

describe('addStyleRule', () => {
  it('appends a new rule to the empty doc', async () => {
    const fs = makeFirestore()
    const r = await addStyleRule({ firestore: fs, rule: 'Never mention FET in consumer listings.', audience: 'consumer', addedBy: 'u1', reason: 'corr' })
    expect(r.ok).toBe(true)
    expect(typeof r.id).toBe('string')
    const w = fs.writes[fs.writes.length - 1]
    expect(w.data.rules).toHaveLength(1)
    expect(w.data.rules[0].rule).toBe('Never mention FET in consumer listings.')
    expect(w.data.rules[0].audience).toBe('consumer')
    expect(w.data.rules[0].enabled).toBe(true)
    expect(w.data.rules[0].addedBy).toBe('u1')
  })

  it('rejects audience not in [consumer, commercial, all]', async () => {
    const fs = makeFirestore()
    await expect(addStyleRule({ firestore: fs, rule: 'x', audience: 'unknown', addedBy: 'u1' })).rejects.toThrow(/audience/i)
  })

  it('rejects empty rule', async () => {
    const fs = makeFirestore()
    await expect(addStyleRule({ firestore: fs, rule: '   ', audience: 'all', addedBy: 'u1' })).rejects.toThrow(/rule/i)
  })

  it('detects exact-text duplicates and returns the existing id', async () => {
    const existing = [{ id: 'r1', rule: 'X', audience: 'all', addedBy: 'u1', enabled: true }]
    const fs = makeFirestore({ rules: existing })
    const r = await addStyleRule({ firestore: fs, rule: 'X', audience: 'all', addedBy: 'u2' })
    expect(r.id).toBe('r1')
    expect(r.duplicate).toBe(true)
    expect(fs.writes).toHaveLength(0)
  })
})

describe('listStyleRules', () => {
  it('returns empty array when doc missing', async () => {
    const fs = makeFirestore()
    const r = await listStyleRules({ firestore: fs })
    expect(r).toEqual([])
  })

  it('filters to enabled by default', async () => {
    const rules = [
      { id: 'r1', rule: 'A', audience: 'all', enabled: true },
      { id: 'r2', rule: 'B', audience: 'all', enabled: false },
    ]
    const fs = makeFirestore({ rules })
    const r = await listStyleRules({ firestore: fs })
    expect(r.map((x) => x.id)).toEqual(['r1'])
  })

  it('filters by audience matching all + the requested', async () => {
    const rules = [
      { id: 'r1', rule: 'A', audience: 'all', enabled: true },
      { id: 'r2', rule: 'B', audience: 'consumer', enabled: true },
      { id: 'r3', rule: 'C', audience: 'commercial', enabled: true },
    ]
    const fs = makeFirestore({ rules })
    const out = await listStyleRules({ firestore: fs, audience: 'consumer' })
    expect(out.map((x) => x.id).sort()).toEqual(['r1', 'r2'])
  })
})

describe('toggleStyleRule', () => {
  it('flips enabled', async () => {
    const rules = [{ id: 'r1', rule: 'A', audience: 'all', enabled: true }]
    const fs = makeFirestore({ rules })
    const r = await toggleStyleRule({ firestore: fs, id: 'r1', enabled: false })
    expect(r.ok).toBe(true)
    const w = fs.writes[fs.writes.length - 1]
    expect(w.data.rules[0].enabled).toBe(false)
  })

  it('throws when id not found', async () => {
    const fs = makeFirestore({ rules: [] })
    await expect(toggleStyleRule({ firestore: fs, id: 'rX', enabled: false })).rejects.toThrow(/not found/i)
  })
})

describe('removeStyleRule', () => {
  it('removes by id', async () => {
    const rules = [{ id: 'r1', rule: 'A', audience: 'all', enabled: true }]
    const fs = makeFirestore({ rules })
    await removeStyleRule({ firestore: fs, id: 'r1' })
    const w = fs.writes[fs.writes.length - 1]
    expect(w.data.rules).toEqual([])
  })
})
```

- [ ] **Step 2: Run, verify FAIL**

```
cd .claude/worktrees/listing-coach
npx vitest run functions/listingCoachStyleGuide.test.mjs
```

- [ ] **Step 3: Implement**

```js
// functions/listingCoachStyleGuide.js
const { randomUUID } = require('node:crypto')
const { FieldValue } = require('firebase-admin/firestore')

const STYLE_GUIDE_REF = (firestore) => firestore.collection('meta').doc('listingCoachStyleGuide')
const VALID_AUDIENCE = ['consumer', 'commercial', 'all']

async function loadDoc(firestore) {
  const snap = await STYLE_GUIDE_REF(firestore).get()
  if (!snap.exists) return { rules: [] }
  return snap.data() || { rules: [] }
}

async function saveDoc(firestore, doc) {
  await STYLE_GUIDE_REF(firestore).set(
    { ...doc, updatedAt: FieldValue.serverTimestamp() },
    { merge: false },
  )
}

async function addStyleRule({ firestore, rule, audience, addedBy, reason }) {
  const trimmed = String(rule || '').trim()
  if (!trimmed) throw new Error('rule must be non-empty')
  if (!VALID_AUDIENCE.includes(audience)) throw new Error(`audience must be one of ${VALID_AUDIENCE.join(', ')}`)
  const doc = await loadDoc(firestore)
  const rules = Array.isArray(doc.rules) ? doc.rules : []
  const existing = rules.find((r) => String(r.rule).trim() === trimmed && r.audience === audience)
  if (existing) return { ok: true, id: existing.id, duplicate: true }
  const id = `rule_${randomUUID().slice(0, 12)}`
  const next = [...rules, {
    id,
    rule: trimmed,
    audience,
    addedBy: String(addedBy || ''),
    addedAt: FieldValue.serverTimestamp(),
    reason: reason ? String(reason).slice(0, 500) : null,
    enabled: true,
  }]
  await saveDoc(firestore, { rules: next })
  return { ok: true, id, duplicate: false }
}

async function listStyleRules({ firestore, audience, includeDisabled = false }) {
  const doc = await loadDoc(firestore)
  const rules = Array.isArray(doc.rules) ? doc.rules : []
  return rules.filter((r) => {
    if (!includeDisabled && r.enabled === false) return false
    if (!audience) return true
    return r.audience === 'all' || r.audience === audience
  })
}

async function toggleStyleRule({ firestore, id, enabled }) {
  const doc = await loadDoc(firestore)
  const rules = Array.isArray(doc.rules) ? doc.rules : []
  const idx = rules.findIndex((r) => r.id === id)
  if (idx < 0) throw new Error(`rule ${id} not found`)
  const next = rules.slice()
  next[idx] = { ...next[idx], enabled: Boolean(enabled) }
  await saveDoc(firestore, { rules: next })
  return { ok: true }
}

async function removeStyleRule({ firestore, id }) {
  const doc = await loadDoc(firestore)
  const rules = Array.isArray(doc.rules) ? doc.rules : []
  const next = rules.filter((r) => r.id !== id)
  await saveDoc(firestore, { rules: next })
  return { ok: true, removed: rules.length - next.length }
}

module.exports = {
  addStyleRule,
  listStyleRules,
  toggleStyleRule,
  removeStyleRule,
}
module.exports._testonly = { addStyleRule, listStyleRules, toggleStyleRule, removeStyleRule, STYLE_GUIDE_REF }
```

- [ ] **Step 4: Run, verify PASS, commit**

```bash
cd .claude/worktrees/listing-coach
npx vitest run functions/listingCoachStyleGuide.test.mjs
git add functions/listingCoachStyleGuide.js functions/listingCoachStyleGuide.test.mjs
git commit -m "$(cat <<'EOF'
feat(listing-coach): meta/listingCoachStyleGuide CRUD helpers

addStyleRule / listStyleRules / toggleStyleRule / removeStyleRule.
Doc shape { rules: [{ id, rule, audience, addedBy, addedAt, reason,
enabled }] }. Audience must be consumer / commercial / all. Exact-text
duplicates short-circuit and return the existing id without writing.
listStyleRules filters by enabled and matches audience or all.
EOF
)"
```

---

## Task 2: Listing Coach tools (catalog + landed + recent sales)

**Files:**
- Create: `functions/listingCoachTools.js`
- Create: `functions/listingCoachTools.test.mjs`

Defines four read-only tools the model can call: `getTireByMspn`, `getTireBySize`, `computeLandedCost`, `getRecentSalesForSize`.

- [ ] **Step 1: Failing tests**

```js
import { describe, expect, it } from 'vitest'
import { _testonly } from './listingCoachTools.js'

const { getTireByMspn, getTireBySize, computeLandedCost, getRecentSalesForSize } = _testonly

function makeFirestore({ tires = [], orders = [], payoutCfg = null } = {}) {
  return {
    collection: (name) => ({
      doc: (id) => ({
        get: async () => {
          if (name === 'tires') {
            const t = tires.find((x) => x.mspn === id)
            return { exists: !!t, data: () => t, id }
          }
          if (name === 'meta' && id === 'payoutConfig') {
            return { exists: !!payoutCfg, data: () => payoutCfg }
          }
          return { exists: false, data: () => null }
        },
      }),
      where: () => ({
        limit: () => ({
          get: async () => ({ docs: tires.map((t) => ({ data: () => t, id: t.mspn })) }),
        }),
        orderBy: () => ({
          limit: () => ({
            get: async () => ({ docs: orders.map((o) => ({ data: () => o, id: o.orderId })) }),
          }),
        }),
      }),
    }),
  }
}

describe('getTireByMspn', () => {
  it('returns null when missing', async () => {
    const fs = makeFirestore()
    const r = await getTireByMspn({ firestore: fs, mspn: 'X' })
    expect(r).toBeNull()
  })

  it('returns the tire fields the model cares about', async () => {
    const tire = {
      mspn: '81501', description: 'LT285/70R17 KO2 LRC', brand: 'BFGoodrich', lr: 'C',
      price: 247, fet: 0,
      priceIntel: { retailPrice: 385, retailSources: [{ url: 'a', site: 'TireRack', price: 379 }], lastResearchedAt: { toMillis: () => 1700000000000 }, confidence: 'high' },
      salesCount: 12, weeklyVelocity: 1.5,
    }
    const fs = makeFirestore({ tires: [tire] })
    const r = await getTireByMspn({ firestore: fs, mspn: '81501' })
    expect(r.mspn).toBe('81501')
    expect(r.price).toBe(247)
    expect(r.priceIntel.retailPrice).toBe(385)
  })
})

describe('getTireBySize', () => {
  it('returns array of matching tires', async () => {
    const tires = [
      { mspn: 'A', description: 'LT285/70R17 KO2 LRC', price: 247, fet: 0 },
      { mspn: 'B', description: 'LT285/70R17 KO3 LRE', price: 250, fet: 0 },
    ]
    const fs = makeFirestore({ tires })
    const r = await getTireBySize({ firestore: fs, size: 'LT285/70R17' })
    expect(r).toHaveLength(2)
    expect(r.map((t) => t.mspn).sort()).toEqual(['A', 'B'])
  })
})

describe('computeLandedCost', () => {
  it('returns landed + breakdown', async () => {
    const fs = makeFirestore({
      payoutCfg: { taxes: { countyTaxPct: 0.0109, localTaxPct: 0.0312, stateTaxPct: 0.0302, tireFeePerTire: 2 } },
    })
    const r = await computeLandedCost({ firestore: fs, tire: { price: 247, fet: 0 } })
    expect(r.landedPerTire).toBeCloseTo(266.86, 2)
    expect(r.breakdown.catalog).toBe(247)
    expect(r.breakdown.fet).toBe(0)
    expect(r.breakdown.wholesaleTax).toBeCloseTo(17.86, 2)
    expect(r.breakdown.tireFee).toBe(2)
    expect(r.taxRate).toBeCloseTo(0.0723, 4)
  })

  it('zero buy returns 0 landed', async () => {
    const fs = makeFirestore({ payoutCfg: { taxes: { tireFeePerTire: 2 } } })
    const r = await computeLandedCost({ firestore: fs, tire: { price: 0 } })
    expect(r.landedPerTire).toBe(0)
  })
})

describe('getRecentSalesForSize', () => {
  it('returns recent completed orders', async () => {
    const orders = [
      { orderId: 'O1', completedMs: 1700000000, paymentAmount: 1540, quantity: 4, deliveredBy: 'dj', size: 'LT285/70R17' },
    ]
    const fs = makeFirestore({ orders })
    const r = await getRecentSalesForSize({ firestore: fs, size: 'LT285/70R17', limit: 5 })
    expect(r).toHaveLength(1)
    expect(r[0].orderId).toBe('O1')
  })
})
```

- [ ] **Step 2: Run FAIL, then implement**

```js
// functions/listingCoachTools.js
const { tireLandedBuyNumber } = require('./payoutConfig')

async function getTireByMspn({ firestore, mspn }) {
  const id = String(mspn || '').trim()
  if (!id) return null
  const snap = await firestore.collection('tires').doc(id).get()
  if (!snap.exists) return null
  const t = snap.data() || {}
  return {
    mspn: id,
    description: t.description || '',
    brand: t.brand || '',
    lr: t.lr || '',
    price: Number(t.price) || 0,
    fet: Number(t.fet) || 0,
    priceIntel: {
      retailPrice: Number(t?.priceIntel?.retailPrice) || null,
      retailSources: Array.isArray(t?.priceIntel?.retailSources) ? t.priceIntel.retailSources.slice(0, 5) : [],
      activeBuyPrice: Number(t?.priceIntel?.activeBuyPrice) || null,
      confidence: t?.priceIntel?.confidence || null,
      lastResearchedAt: t?.priceIntel?.lastResearchedAt?.toMillis?.() || null,
    },
    salesCount: Number(t.salesCount) || 0,
    weeklyVelocity: Number(t.weeklyVelocity) || 0,
  }
}

async function getTireBySize({ firestore, size, limit = 10 }) {
  const sizeNorm = String(size || '').trim().toUpperCase()
  if (!sizeNorm) return []
  // Catalog stores size inside the description string. Iterate up to `limit*5`
  // candidates and filter by substring match. For v1 this is acceptable;
  // tighten with an indexed `sizeNormalized` field if perf becomes an issue.
  const snap = await firestore.collection('tires')
    .where('archived', '!=', true)
    .limit(limit * 5)
    .get()
  const out = []
  for (const doc of snap.docs) {
    const t = doc.data() || {}
    const desc = String(t.description || '').toUpperCase()
    if (desc.includes(sizeNorm)) {
      out.push({
        mspn: doc.id,
        description: t.description || '',
        brand: t.brand || '',
        lr: t.lr || '',
        price: Number(t.price) || 0,
        fet: Number(t.fet) || 0,
      })
    }
    if (out.length >= limit) break
  }
  return out
}

async function computeLandedCost({ firestore, tire }) {
  const cfgSnap = await firestore.collection('meta').doc('payoutConfig').get()
  const cfg = cfgSnap.exists ? cfgSnap.data() || {} : {}
  const taxes = cfg.taxes || {}
  const landedPerTire = tireLandedBuyNumber(tire || {}, taxes)
  const buy = Number(tire?.price) || 0
  const fet = Number(tire?.fet) || 0
  const taxRate = (Number(taxes.countyTaxPct) || 0)
    + (Number(taxes.localTaxPct) || 0)
    + (Number(taxes.stateTaxPct) || 0)
  return {
    landedPerTire,
    breakdown: {
      catalog: buy,
      fet,
      wholesaleTax: buy * taxRate,
      tireFee: Number(taxes.tireFeePerTire) || 0,
    },
    taxRate,
  }
}

async function getRecentSalesForSize({ firestore, size, limit = 10 }) {
  const sizeNorm = String(size || '').trim().toUpperCase()
  if (!sizeNorm) return []
  const snap = await firestore.collection('orders')
    .where('status', '==', 'completed')
    .orderBy('completedMs', 'desc')
    .limit(limit * 3)
    .get()
  const out = []
  for (const doc of snap.docs) {
    const o = doc.data() || {}
    const sz = String(o.size || o.tireSize || '').toUpperCase()
    if (!sz.includes(sizeNorm)) continue
    out.push({
      orderId: doc.id,
      completedMs: Number(o.completedMs) || 0,
      paymentAmount: Number(o.paymentAmount) || 0,
      quantity: Number(o.quantity) || 0,
      deliveredBy: o.deliveredBy || null,
    })
    if (out.length >= limit) break
  }
  return out
}

module.exports = {
  getTireByMspn,
  getTireBySize,
  computeLandedCost,
  getRecentSalesForSize,
}
module.exports._testonly = { getTireByMspn, getTireBySize, computeLandedCost, getRecentSalesForSize }
```

- [ ] **Step 3: Verify PASS, commit**

```bash
cd .claude/worktrees/listing-coach
npx vitest run functions/listingCoachTools.test.mjs
git add functions/listingCoachTools.js functions/listingCoachTools.test.mjs
git commit -m "$(cat <<'EOF'
feat(listing-coach): catalog + landed + recent-sales tools

Four read-only tools: getTireByMspn (lookup with priceIntel
projection), getTireBySize (substring match on description, capped
at 10 results), computeLandedCost (wraps tireLandedBuyNumber +
returns the breakdown), getRecentSalesForSize (last N completed
orders matching the size). All tools return plain JSON for the
Anthropic tool-use loop in listingAdvisor.
EOF
)"
```

---

## Task 3: Few-shot anchor + listingAdvisor callable

**Files:**
- Create: `functions/__fixtures__/listingCoachFewShot.txt`
- Create: `functions/listingAdvisor.js`
- Create: `functions/listingAdvisor.test.mjs`
- Modify: `functions/index.js`

The few-shot fixture is the abbreviated 2026-05-01 LT285/70R17 KO2 walk-through (~800 tokens). Embedded into the system prompt verbatim so the model knows the depth and shape of every reply.

- [ ] **Step 1: Write the few-shot fixture**

```txt
# functions/__fixtures__/listingCoachFewShot.txt
Below is the canonical example of what your reply should look like,
reproduced from a real session on 2026-05-01. Match this depth, tone,
and structure on every reply.

---
USER: I have 4 of these LT285/70R17 KO2s I just got, MSPN 81501. Drop a listing for FB Marketplace.

COACH: SKU summary: BFGoodrich All-Terrain T/A KO2, LT285/70R17 LR-C, 116/113Q, MSPN 81501. Catalog $247, FET $0.

Pricing analysis:
- Landed per tire = 247 + 0 + (247 x 0.0723 wholesale tax) + $2 CO tire fee = $266.86
- 4-tire landed total = $1,067.44
- Recommended price: $385/tire = $1,540 set -> profit $472.56, margin 30.7%

Market comps from priceIntel.retailPrice:
- TireRack: $379.99
- Discount Tire shelf: $400-500 installed
- Online (SimpleTire): $350-390 plus shipping/install wait

This looks like a consumer listing (LT-prefix, AT tread, common Tacoma / 4Runner / Wrangler fitment). Proceed with consumer tone.

```
4 NEW BFGoodrich KO2 LT285/70R17 All-Terrain Tires - 33" Set

$385/tire | $1,540 set of 4

Four brand-new BFGoodrich All-Terrain T/A KO2 tires, never mounted, full DOT, stored indoors. The KO2 is the cult-favorite generation - proven sidewall, the compound that built BFG's reputation. Still 3PMSF severe-snow rated, still the benchmark.

Specs:
- LT285/70R17 Load Range C
- 116/113Q
- 33" tall on 17" wheel
- MSPN 81501

Fits:
- Tacoma TRD Off-Road / TRD Pro
- 4Runner TRD Off-Road / TRD Pro
- Wrangler JK / JL (no rubbing on stock)
- Tundra, F-150 (with leveling kit)

Why this set:
- Discount Tire / NTB shelf this size at $400+ before mounting.
- Online shipped runs $350-$390 plus a week of waiting.
- Local pickup, ready for Memorial Day weekend.

Set of 4 only. Cash or Zelle preferred. Free local delivery in NOCO (Loveland / Fort Collins / Greeley / Windsor). Fits 17" wheels only - verify your fitment.
```

Photo guidance:
- Tread close-up frame-filling, no other tires in view (lead photo)
- Sidewall close-up showing brand + size + LR + tread name
- Stack-of-4 proof of qty
- DOT date code in focus on at least one tire
- Optional: fitment shot - tire on the matching truck/SUV
---

End of example. Always reply in this shape: SKU summary, pricing analysis, audience suggestion (skip if specified), fenced listing copy, photo guidance bullets. If user gives a correction (e.g. "drop FET mention", "don't mention dealer programs"), call addStyleRule and surface the rule inline before the listing draft.
```

- [ ] **Step 2: Failing tests for the callable**

```js
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { _testonly } from './listingAdvisor.js'

const { handle, buildSystemPrompt, parseToolCalls } = _testonly

function fakeFirestore({ tire = null, payoutCfg = null, rules = [] } = {}) {
  return {
    collection: (name) => ({
      doc: (id) => ({
        get: async () => {
          if (name === 'users') return { exists: true, data: () => ({ role: 'admin' }) }
          if (name === 'meta' && id === 'payoutConfig') return { exists: !!payoutCfg, data: () => payoutCfg }
          if (name === 'meta' && id === 'listingCoachStyleGuide') return { exists: rules.length > 0, data: () => ({ rules }) }
          if (name === 'tires' && tire && tire.mspn === id) return { exists: true, data: () => tire, id }
          return { exists: false, data: () => null }
        },
        set: async () => {},
        update: async () => {},
      }),
      where: () => ({ limit: () => ({ get: async () => ({ docs: [] }) }), orderBy: () => ({ limit: () => ({ get: async () => ({ docs: [] }) }) }) }),
    }),
  }
}

function fakeAnthropic(replies) {
  let i = 0
  return async ({ system, messages, tools }) => {
    void system; void messages; void tools
    const r = replies[i++] || { stop_reason: 'end_turn', content: [{ type: 'text', text: '(empty)' }] }
    return r
  }
}

describe('handle (listingAdvisor)', () => {
  it('throws unauthenticated when no auth', async () => {
    const fs = fakeFirestore()
    const fn = handle({ firestore: fs, callAnthropic: fakeAnthropic([]), nowFn: () => 0 })
    await expect(fn({ data: { messages: [{ role: 'user', content: 'hi' }] }, auth: null })).rejects.toThrow(/sign in/i)
  })

  it('throws permission-denied when role is not admin', async () => {
    const fs = {
      collection: () => ({ doc: () => ({ get: async () => ({ exists: true, data: () => ({ role: 'viewer' }) }) }) }),
    }
    const fn = handle({ firestore: fs, callAnthropic: fakeAnthropic([]), nowFn: () => 0 })
    await expect(fn({ data: { messages: [{ role: 'user', content: 'hi' }] }, auth: { uid: 'u1' } })).rejects.toThrow(/admin/i)
  })

  it('end-turn reply returns text without tool loop', async () => {
    const fs = fakeFirestore()
    const replies = [{ stop_reason: 'end_turn', content: [{ type: 'text', text: 'hello world' }] }]
    const fn = handle({ firestore: fs, callAnthropic: fakeAnthropic(replies), nowFn: () => 0 })
    const r = await fn({ data: { messages: [{ role: 'user', content: 'hi' }] }, auth: { uid: 'u1' } })
    expect(r.reply).toBe('hello world')
  })

  it('tool_use loop dispatches to getTireByMspn and feeds back', async () => {
    const tire = { mspn: '81501', description: 'LT285/70R17 KO2 LRC', brand: 'BFGoodrich', lr: 'C', price: 247, fet: 0, priceIntel: { retailPrice: 385 }, salesCount: 0, weeklyVelocity: 0 }
    const fs = fakeFirestore({ tire })
    const replies = [
      { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'tu_1', name: 'getTireByMspn', input: { mspn: '81501' } }] },
      { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Found it - $247 catalog.' }] },
    ]
    const fn = handle({ firestore: fs, callAnthropic: fakeAnthropic(replies), nowFn: () => 0 })
    const r = await fn({ data: { messages: [{ role: 'user', content: 'lookup 81501' }] }, auth: { uid: 'u1' } })
    expect(r.reply).toContain('$247')
  })

  it('rate-limits at 30/hr', async () => {
    const fs = fakeFirestore()
    const replies = Array.from({ length: 35 }, () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'x' }] }))
    let now = 0
    const fn = handle({ firestore: fs, callAnthropic: fakeAnthropic(replies), nowFn: () => now })
    for (let i = 0; i < 30; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await fn({ data: { messages: [{ role: 'user', content: `q${i}` }] }, auth: { uid: 'u1' } })
      now += 1000
    }
    await expect(fn({ data: { messages: [{ role: 'user', content: 'q31' }] }, auth: { uid: 'u1' } })).rejects.toThrow(/rate limit/i)
  })

  it('caps tool loop at 8 iterations to avoid infinite calls', async () => {
    const fs = fakeFirestore()
    const looping = { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'tu_x', name: 'getTireByMspn', input: { mspn: 'X' } }] }
    const replies = Array.from({ length: 20 }, () => looping)
    const fn = handle({ firestore: fs, callAnthropic: fakeAnthropic(replies), nowFn: () => 0 })
    await expect(fn({ data: { messages: [{ role: 'user', content: 'loop' }] }, auth: { uid: 'u1' } })).rejects.toThrow(/tool loop/i)
  })
})
```

- [ ] **Step 3: Implement**

```js
// functions/listingAdvisor.js
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
    try { FEW_SHOT_CACHED = readFileSync(FEW_SHOT_PATH, 'utf8') } catch { FEW_SHOT_CACHED = '' }
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
  switch (name) {
    case 'getTireByMspn': return tools.getTireByMspn({ firestore, ...input })
    case 'getTireBySize': return tools.getTireBySize({ firestore, ...input })
    case 'computeLandedCost': return tools.computeLandedCost({ firestore, ...input })
    case 'getRecentSalesForSize': return tools.getRecentSalesForSize({ firestore, ...input })
    case 'addStyleRule': return styleGuide.addStyleRule({ firestore, ...input, addedBy: actorId })
    case 'listStyleRules': return styleGuide.listStyleRules({ firestore, ...input })
    default: throw new Error(`unknown tool: ${name}`)
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
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
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
  return blocks.filter((b) => b && b.type === 'text').map((b) => b.text).join('\n').trim()
}

function handle({ firestore, callAnthropic, nowFn }) {
  return async function handler({ data, auth }) {
    if (!auth || !auth.uid) throw new HttpsError('unauthenticated', 'Sign in required.')
    const userSnap = await firestore.collection('users').doc(auth.uid).get()
    const role = String((userSnap.exists ? userSnap.data() : {})?.role || '')
    if (role !== 'admin') throw new HttpsError('permission-denied', 'Admin role required.')

    checkRateLimit(auth.uid, nowFn)

    const incoming = Array.isArray(data?.messages) ? data.messages : []
    if (incoming.length === 0) throw new HttpsError('invalid-argument', 'messages required.')
    const audience = data?.audience || null

    const apiKey = anthropicKeyResolved ? anthropicKeyResolved() : (ANTHROPIC_API_KEY?.value?.() || '')
    if (!apiKey) throw new HttpsError('failed-precondition', 'Anthropic API key not configured.')

    const system = await buildSystemPrompt({ firestore, audience })
    const conversation = incoming.map((m) => ({ role: m.role, content: typeof m.content === 'string' ? m.content : (m.content || '') }))

    let lastErr = null
    for (const modelId of ANTHROPIC_MODELS) {
      try {
        let working = conversation.slice()
        for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter += 1) {
          // eslint-disable-next-line no-await-in-loop
          const resp = await callAnthropic({ apiKey, modelId, system, messages: working, tools: TOOL_SCHEMAS })
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
            const out = await dispatchTool({ firestore, name: call.name, input: call.input, actorId: auth.uid }).catch((err) => ({ error: String(err.message || err) }))
            toolResults.push({ type: 'tool_result', tool_use_id: call.id, content: JSON.stringify(out) })
          }
          working = [...working, { role: 'user', content: toolResults }]
        }
        throw new Error('tool loop exceeded max iterations')
      } catch (err) {
        lastErr = err
        if (/tool loop/i.test(String(err.message))) throw new HttpsError('internal', 'Listing coach hit tool loop cap.')
        // try next model
      }
    }
    throw new HttpsError('internal', `Listing coach failed: ${lastErr?.message || 'unknown error'}`)
  }
}

exports.listingAdvisor = onCall({ secrets: [ANTHROPIC_API_KEY] }, async (req) => {
  return handle({
    firestore: admin.firestore(),
    callAnthropic: defaultCallAnthropic,
    nowFn: () => Date.now(),
  })({ data: req.data, auth: req.auth })
})
exports._testonly = { handle, buildSystemPrompt, parseToolCalls, extractText, dispatchTool }
```

Register in `functions/index.js`:

```js
exports.listingAdvisor = require('./listingAdvisor').listingAdvisor
```

- [ ] **Step 4: Verify PASS, commit**

```bash
cd .claude/worktrees/listing-coach
npx vitest run functions/listingAdvisor.test.mjs
git add functions/listingAdvisor.js functions/listingAdvisor.test.mjs functions/__fixtures__/listingCoachFewShot.txt functions/index.js
git commit -m "$(cat <<'EOF'
feat(listing-coach): listingAdvisor callable with Anthropic tool-use loop

Admin-only, 30/hr rate limit, Haiku -> Sonnet fallback. Tool-use
loop capped at 8 iterations; six tools (getTireByMspn, getTireBySize,
computeLandedCost, getRecentSalesForSize, addStyleRule, listStyleRules).
System prompt = persona + active style rules (filtered by audience)
+ few-shot anchor (the 2026-05-01 LT285/70R17 KO2 NOCO walk-through).
The eFleet account is explicitly off-limits in the persona.
EOF
)"
```

---

## Task 4: `useListingCoach` hook

**Files:**
- Create: `src/hooks/useListingCoach.js`
- Create: `src/hooks/useListingCoach.test.js`

Mirrors `useSalesAdvisorChat`. Single conversation thread, calls the new `listingAdvisor` callable. Independent state from the sales advisor (different drawer tab).

- [ ] **Step 1: Failing tests**

```js
import { describe, expect, it, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useListingCoach } from './useListingCoach.js'

describe('useListingCoach', () => {
  it('starts with empty messages and not pending', () => {
    const { result } = renderHook(() => useListingCoach({ callable: vi.fn() }))
    expect(result.current.messages).toEqual([])
    expect(result.current.pending).toBe(false)
  })

  it('appends user message + assistant reply on send', async () => {
    const fn = vi.fn().mockResolvedValue({ data: { reply: 'hello back' } })
    const { result } = renderHook(() => useListingCoach({ callable: fn }))
    await act(async () => { await result.current.send('hi') })
    expect(result.current.messages).toEqual([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello back' },
    ])
  })

  it('surfaces error message when callable rejects', async () => {
    const fn = vi.fn().mockRejectedValue(Object.assign(new Error('boom'), { code: 'internal' }))
    const { result } = renderHook(() => useListingCoach({ callable: fn }))
    await act(async () => { await result.current.send('hi') })
    const last = result.current.messages.at(-1)
    expect(last.role).toBe('assistant')
    expect(last.error).toBe(true)
    expect(last.content).toContain('boom')
  })

  it('clear empties messages', async () => {
    const fn = vi.fn().mockResolvedValue({ data: { reply: 'ok' } })
    const { result } = renderHook(() => useListingCoach({ callable: fn }))
    await act(async () => { await result.current.send('hi') })
    act(() => { result.current.clear() })
    expect(result.current.messages).toEqual([])
  })
})
```

- [ ] **Step 2: Run FAIL then implement**

```js
// src/hooks/useListingCoach.js
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import { functions } from '../firebase/config'

function formatRetryAfter(ms) {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) return null
  const minutes = Math.ceil(ms / 60000)
  return minutes <= 1 ? 'less than a minute' : `${minutes} minutes`
}

export function useListingCoach({ callable } = {}) {
  const [messages, setMessages] = useState([])
  const [pending, setPending] = useState(false)
  const [audience, setAudience] = useState(null)

  const messagesRef = useRef(messages)
  useEffect(() => { messagesRef.current = messages }, [messages])
  const inFlightRef = useRef(false)

  const fn = useMemo(() => callable || httpsCallable(functions, 'listingAdvisor'), [callable])

  const send = useCallback(async (text) => {
    const userText = String(text || '').trim()
    if (!userText) return
    if (inFlightRef.current) return
    inFlightRef.current = true
    const userMsg = { role: 'user', content: userText }
    const next = [...messagesRef.current, userMsg]
    messagesRef.current = next
    setMessages(next)
    setPending(true)
    try {
      const result = await fn({ messages: next, audience })
      const reply = String(result?.data?.reply || '').trim()
      setMessages((cur) => [...cur, { role: 'assistant', content: reply || '(empty reply from coach)' }])
    } catch (err) {
      const code = err?.code || ''
      const retryAfterText = formatRetryAfter(err?.details?.retryAfterMs)
      const friendly = code === 'resource-exhausted'
        ? `Listing coach failed: rate limit reached. Try again in ${retryAfterText || 'a few minutes'}.`
        : code === 'permission-denied'
          ? 'Listing coach failed: admin role required.'
          : `Listing coach failed: ${err?.message || 'unknown error'}`
      setMessages((cur) => [...cur, { role: 'assistant', content: friendly, error: true }])
    } finally {
      setPending(false)
      inFlightRef.current = false
    }
  }, [fn, audience])

  const clear = useCallback(() => setMessages([]), [])

  return { messages, pending, audience, setAudience, send, clear }
}
```

- [ ] **Step 3: Verify + commit**

```bash
cd .claude/worktrees/listing-coach
npx vitest run src/hooks/useListingCoach.test.js
git add src/hooks/useListingCoach.js src/hooks/useListingCoach.test.js
git commit -m "feat(listing-coach): useListingCoach client hook"
```

---

## Task 5: ListingCoachTab UI + drawer integration

**Files:**
- Create: `src/components/tires/ListingCoachTab.jsx`
- Create: `src/components/tires/ListingCoachTab.test.jsx`
- Modify: `src/components/tires/SalesAdvisorDrawer.jsx`
- Modify: `src/components/tires/SalesAdvisorDrawer.test.jsx`

Drawer becomes 2-tab (Sales / Listing). Each tab has its own conversation. Listing tab adds a "Copy" button overlay on fenced ```code blocks``` in assistant messages.

- [ ] **Step 1: Failing tests for the tab**

```jsx
/** @vitest-environment jsdom */
import { describe, expect, it, vi, afterEach } from 'vitest'
import { render, fireEvent, cleanup, act } from '@testing-library/react'
import { ListingCoachTab } from './ListingCoachTab.jsx'

afterEach(cleanup)

function makeProps(overrides = {}) {
  return {
    messages: [],
    pending: false,
    onSend: vi.fn(),
    audience: null,
    onAudienceChange: vi.fn(),
    ...overrides,
  }
}

describe('ListingCoachTab', () => {
  it('renders empty state when no messages', () => {
    const { container } = render(<ListingCoachTab {...makeProps()} />)
    expect(container.textContent).toContain('Listing Coach')
  })

  it('renders user + assistant messages', () => {
    const messages = [
      { role: 'user', content: 'draft a listing for KO2s' },
      { role: 'assistant', content: 'Here is a draft.\n```\n4 NEW BFG KO2 ...\n```' },
    ]
    const { container } = render(<ListingCoachTab {...makeProps({ messages })} />)
    expect(container.textContent).toContain('draft a listing for KO2s')
    expect(container.textContent).toContain('4 NEW BFG KO2')
  })

  it('shows Copy button on fenced code blocks', () => {
    const messages = [
      { role: 'assistant', content: 'pre\n```\nlisting copy here\n```\npost' },
    ]
    const { container } = render(<ListingCoachTab {...makeProps({ messages })} />)
    const copyBtn = container.querySelector('[data-testid="copy-listing"]')
    expect(copyBtn).not.toBeNull()
  })

  it('Copy button writes the fenced content to clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    const messages = [{ role: 'assistant', content: 'pre\n```\nlisting copy\n```\npost' }]
    const { container } = render(<ListingCoachTab {...makeProps({ messages })} />)
    const btn = container.querySelector('[data-testid="copy-listing"]')
    await act(async () => { fireEvent.click(btn) })
    expect(writeText).toHaveBeenCalledWith('listing copy')
  })

  it('send button forwards trimmed input to onSend', () => {
    const onSend = vi.fn()
    const { container } = render(<ListingCoachTab {...makeProps({ onSend })} />)
    const ta = container.querySelector('textarea')
    fireEvent.change(ta, { target: { value: '  draft for 4 KO2s  ' } })
    const btn = container.querySelector('[data-testid="coach-send"]')
    fireEvent.click(btn)
    expect(onSend).toHaveBeenCalledWith('draft for 4 KO2s')
  })

  it('disables send while pending', () => {
    const { container } = render(<ListingCoachTab {...makeProps({ pending: true })} />)
    const btn = container.querySelector('[data-testid="coach-send"]')
    expect(btn.disabled).toBe(true)
  })
})
```

- [ ] **Step 2: Implement**

```jsx
// src/components/tires/ListingCoachTab.jsx
import { useState } from 'react'

function splitIntoBlocks(content) {
  // Split on triple-backtick fences; alternating segments are text/code.
  const out = []
  const re = /```([^\n]*)\n([\s\S]*?)```/g
  let lastIdx = 0
  let m
  while ((m = re.exec(content)) !== null) {
    if (m.index > lastIdx) out.push({ type: 'text', text: content.slice(lastIdx, m.index) })
    out.push({ type: 'code', text: m[2].trimEnd() })
    lastIdx = m.index + m[0].length
  }
  if (lastIdx < content.length) out.push({ type: 'text', text: content.slice(lastIdx) })
  if (out.length === 0) out.push({ type: 'text', text: content })
  return out
}

function CodeBlockWithCopy({ text }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }
  return (
    <div className="relative my-2 rounded-lg border border-zinc-800 bg-zinc-950">
      <button
        type="button"
        data-testid="copy-listing"
        onClick={copy}
        className="absolute right-2 top-2 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-[10px] uppercase tracking-wide text-zinc-300 hover:bg-zinc-800"
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
      <pre className="overflow-auto whitespace-pre-wrap p-3 pr-16 text-xs text-zinc-100">{text}</pre>
    </div>
  )
}

function MessageBlock({ message }) {
  if (message.role === 'user') {
    return (
      <div className="rounded-xl bg-amber-950/30 px-3 py-2 text-sm text-amber-100">
        {message.content}
      </div>
    )
  }
  const blocks = splitIntoBlocks(String(message.content || ''))
  return (
    <div className={`rounded-xl border px-3 py-2 text-sm ${message.error ? 'border-red-700/40 bg-red-950/30 text-red-100' : 'border-zinc-800 bg-zinc-900/60 text-zinc-200'}`}>
      {blocks.map((b, i) => b.type === 'code'
        ? <CodeBlockWithCopy key={i} text={b.text} />
        : <p key={i} className="whitespace-pre-wrap">{b.text}</p>
      )}
    </div>
  )
}

export function ListingCoachTab({ messages, pending, onSend, audience, onAudienceChange }) {
  const [draft, setDraft] = useState('')

  function submit() {
    const t = draft.trim()
    if (!t || pending) return
    onSend(t)
    setDraft('')
  }

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-zinc-800 px-4 py-3">
        <h2 className="text-sm font-semibold text-zinc-100">Listing Coach</h2>
        <p className="mt-0.5 text-xs text-zinc-400">Drafts a complete FB / CL listing kit. Tell me MSPN + qty.</p>
        <div className="mt-2 flex items-center gap-2 text-xs">
          <label className="text-zinc-400">Audience</label>
          <select
            value={audience || ''}
            onChange={(e) => onAudienceChange(e.target.value || null)}
            className="rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-xs text-zinc-200"
          >
            <option value="">Auto</option>
            <option value="consumer">Consumer</option>
            <option value="commercial">Commercial</option>
          </select>
        </div>
      </header>
      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {messages.length === 0 ? (
          <p className="text-xs text-zinc-500">Try: "draft a listing for 4 of MSPN 81501" or "what would 8 of XLGD 11R22.5 sell for?"</p>
        ) : null}
        {messages.map((m, i) => <MessageBlock key={i} message={m} />)}
        {pending ? <p className="text-xs text-zinc-500">Coach thinking...</p> : null}
      </div>
      <footer className="border-t border-zinc-800 p-3">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit() }}
          rows={2}
          placeholder="Ask the coach..."
          className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
        />
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            data-testid="coach-send"
            disabled={pending || !draft.trim()}
            onClick={submit}
            className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-amber-400 disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </footer>
    </div>
  )
}
```

- [ ] **Step 3: Wire as 2nd tab in `SalesAdvisorDrawer.jsx`**

Read the existing component first. Then refactor the drawer to a 2-tab layout. Approximate diff:

```jsx
// SalesAdvisorDrawer.jsx
import { useState } from 'react'
import { ListingCoachTab } from './ListingCoachTab.jsx'

const TAB_SALES = 'sales'
const TAB_LISTING = 'listing'

export function SalesAdvisorDrawer({
  isOpen,
  // sales tab props (unchanged):
  messages, pending, onClose, onSend,
  // listing tab props (new):
  listingMessages, listingPending, listingAudience, onListingAudienceChange, onListingSend,
}) {
  const [tab, setTab] = useState(TAB_SALES)
  if (!isOpen) return null
  // ... existing backdrop + slide-in shell
  return (
    <aside className="...">
      <div role="tablist" className="flex border-b border-zinc-800">
        <button role="tab" aria-selected={tab === TAB_SALES} onClick={() => setTab(TAB_SALES)} className={`flex-1 px-3 py-2 text-sm ${tab === TAB_SALES ? 'border-b-2 border-amber-500 text-amber-100' : 'text-zinc-400'}`}>Sales Coach</button>
        <button role="tab" aria-selected={tab === TAB_LISTING} onClick={() => setTab(TAB_LISTING)} className={`flex-1 px-3 py-2 text-sm ${tab === TAB_LISTING ? 'border-b-2 border-amber-500 text-amber-100' : 'text-zinc-400'}`}>Listing Coach</button>
      </div>
      {tab === TAB_SALES ? (
        /* existing sales coach UI here */
      ) : (
        <ListingCoachTab
          messages={listingMessages}
          pending={listingPending}
          audience={listingAudience}
          onAudienceChange={onListingAudienceChange}
          onSend={onListingSend}
        />
      )}
    </aside>
  )
}
```

Update parent (likely `TiresPage.jsx`) to instantiate `useListingCoach` and pass props.

- [ ] **Step 4: Run, commit**

```bash
cd .claude/worktrees/listing-coach
npx vitest run src/components/tires/ListingCoachTab.test.jsx src/components/tires/SalesAdvisorDrawer.test.jsx
git add src/components/tires/ListingCoachTab.jsx src/components/tires/ListingCoachTab.test.jsx src/components/tires/SalesAdvisorDrawer.jsx src/components/tires/SalesAdvisorDrawer.test.jsx src/pages/TiresPage.jsx
git commit -m "feat(listing-coach): drawer tab + ListingCoachTab UI with copy-on-fenced-block"
```

---

## Task 6: Admin rules-management page

**Files:**
- Create: `src/components/admin/ListingCoachRulesPanel.jsx`
- Create: `src/components/admin/ListingCoachRulesPanel.test.jsx`
- Create: `src/pages/AdminListingCoachRulesPage.jsx`
- Modify: `src/App.jsx`

Subscribes to `meta/listingCoachStyleGuide` via `onSnapshot`. Lists rules with audience tag, addedBy (resolved to displayName via the existing pattern in admin pages), addedAt, reason, enabled toggle, delete button. "Add rule" button opens a small inline form.

The toggle / remove operations call new admin-only callables. Add `setListingCoachRule({ id, enabled })` and `removeListingCoachRule({ id })` to `functions/listingAdvisor.js` (or a separate `functions/listingCoachRulesAdmin.js` - up to implementer; keep cohesive).

- [ ] **Step 1: Add the two admin callables**

Append to `functions/listingAdvisor.js` (or create `functions/listingCoachRulesAdmin.js`; keep one of them):

```js
exports.toggleListingCoachRule = onCall(async (req) => {
  const fs = admin.firestore()
  if (!req.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in required.')
  const userSnap = await fs.collection('users').doc(req.auth.uid).get()
  if (String((userSnap.exists ? userSnap.data() : {})?.role || '') !== 'admin') {
    throw new HttpsError('permission-denied', 'Admin role required.')
  }
  const id = String(req.data?.id || '').trim()
  const enabled = Boolean(req.data?.enabled)
  if (!id) throw new HttpsError('invalid-argument', 'id required.')
  return styleGuide.toggleStyleRule({ firestore: fs, id, enabled })
})

exports.removeListingCoachRule = onCall(async (req) => {
  const fs = admin.firestore()
  if (!req.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in required.')
  const userSnap = await fs.collection('users').doc(req.auth.uid).get()
  if (String((userSnap.exists ? userSnap.data() : {})?.role || '') !== 'admin') {
    throw new HttpsError('permission-denied', 'Admin role required.')
  }
  const id = String(req.data?.id || '').trim()
  if (!id) throw new HttpsError('invalid-argument', 'id required.')
  return styleGuide.removeStyleRule({ firestore: fs, id })
})

exports.addListingCoachRule = onCall(async (req) => {
  const fs = admin.firestore()
  if (!req.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in required.')
  const userSnap = await fs.collection('users').doc(req.auth.uid).get()
  if (String((userSnap.exists ? userSnap.data() : {})?.role || '') !== 'admin') {
    throw new HttpsError('permission-denied', 'Admin role required.')
  }
  const rule = String(req.data?.rule || '').trim()
  const audience = String(req.data?.audience || '').trim()
  const reason = String(req.data?.reason || '').trim() || null
  if (!rule) throw new HttpsError('invalid-argument', 'rule required.')
  return styleGuide.addStyleRule({ firestore: fs, rule, audience, addedBy: req.auth.uid, reason })
})
```

Register all three in `functions/index.js`. Add tests mirroring the existing admin-callable patterns from prior branches (`acknowledgeAdjustment.test.mjs` is a close shape).

- [ ] **Step 2: Implement `ListingCoachRulesPanel.jsx`**

```jsx
import { useEffect, useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import { doc, onSnapshot } from 'firebase/firestore'
import { db, functions } from '../../firebase/config'
import { useToast } from '../../context/ToastContext.jsx'

const toggleFn = httpsCallable(functions, 'toggleListingCoachRule')
const removeFn = httpsCallable(functions, 'removeListingCoachRule')
const addFn = httpsCallable(functions, 'addListingCoachRule')

export function ListingCoachRulesPanel() {
  const [rules, setRules] = useState([])
  const [draftRule, setDraftRule] = useState('')
  const [draftAudience, setDraftAudience] = useState('all')
  const [draftReason, setDraftReason] = useState('')
  const [pending, setPending] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    return onSnapshot(doc(db, 'meta', 'listingCoachStyleGuide'), (snap) => {
      const data = snap.exists() ? snap.data() : { rules: [] }
      setRules(Array.isArray(data?.rules) ? data.rules : [])
    })
  }, [])

  async function add() {
    const r = draftRule.trim()
    if (!r) return
    setPending(true)
    try {
      await addFn({ rule: r, audience: draftAudience, reason: draftReason.trim() || null })
      setDraftRule(''); setDraftReason('')
      toast('Rule added', 'success')
    } catch (err) {
      toast(String(err?.message || err), 'error')
    } finally { setPending(false) }
  }

  async function toggle(rule) {
    try {
      await toggleFn({ id: rule.id, enabled: !rule.enabled })
    } catch (err) { toast(String(err?.message || err), 'error') }
  }

  async function remove(rule) {
    if (!window.confirm(`Remove rule: "${rule.rule}"?`)) return
    try {
      await removeFn({ id: rule.id })
      toast('Rule removed', 'success')
    } catch (err) { toast(String(err?.message || err), 'error') }
  }

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 sm:p-6">
      <h2 className="text-sm font-semibold text-zinc-100">Listing Coach style rules</h2>
      <p className="mt-1 text-xs text-zinc-400">Crew-shared rules loaded into the coach at the start of every session.</p>
      <div className="mt-4 space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
        <textarea
          value={draftRule}
          onChange={(e) => setDraftRule(e.target.value)}
          rows={2}
          placeholder='e.g. "Never mention FET in consumer listings."'
          className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
        />
        <div className="flex flex-wrap gap-2 text-xs">
          <select value={draftAudience} onChange={(e) => setDraftAudience(e.target.value)} className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-zinc-200">
            <option value="all">All audiences</option>
            <option value="consumer">Consumer only</option>
            <option value="commercial">Commercial only</option>
          </select>
          <input value={draftReason} onChange={(e) => setDraftReason(e.target.value)} placeholder="Reason (optional)" className="flex-1 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-zinc-200" />
          <button type="button" onClick={() => void add()} disabled={pending || !draftRule.trim()} className="rounded-lg bg-amber-500 px-3 py-1 text-xs font-semibold text-zinc-950 disabled:opacity-50">Add rule</button>
        </div>
      </div>
      <ul className="mt-4 space-y-2">
        {rules.length === 0 ? <li className="text-sm text-zinc-500">No rules yet.</li> : null}
        {rules.map((r) => (
          <li key={r.id} className={`rounded-lg border px-3 py-2 ${r.enabled ? 'border-zinc-800' : 'border-zinc-800/50 opacity-60'}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm text-zinc-100">{r.rule}</p>
                <p className="mt-0.5 text-[11px] text-zinc-500">audience: {r.audience} · added by {r.addedBy} {r.reason ? `· ${r.reason}` : ''}</p>
              </div>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => void toggle(r)} className="rounded border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-300">{r.enabled ? 'Disable' : 'Enable'}</button>
                <button type="button" onClick={() => void remove(r)} className="rounded border border-red-900/60 px-2 py-0.5 text-[11px] text-red-200">Remove</button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
```

Tests cover: list rendering, add via form fires callable, toggle / remove fire callables, no-rule empty state, error path.

- [ ] **Step 3: Page wrapper + route**

```jsx
// src/pages/AdminListingCoachRulesPage.jsx
import { ListingCoachRulesPanel } from '../components/admin/ListingCoachRulesPanel.jsx'

export default function AdminListingCoachRulesPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
      <header>
        <h1 className="text-lg font-semibold text-zinc-100">Listing Coach rules</h1>
        <p className="mt-1 text-sm text-zinc-400">Manage the crew-shared style guide that the AI listing coach loads at session start.</p>
      </header>
      <ListingCoachRulesPanel />
    </div>
  )
}
```

In `src/App.jsx`, add a lazy import + route under the existing admin `<ProtectedRoute requireAdmin>`:

```jsx
const AdminListingCoachRulesPage = lazy(() => import('./pages/AdminListingCoachRulesPage.jsx'))
// ...
<Route path="admin/listing-coach-rules" element={<AdminListingCoachRulesPage />} />
```

Add a discoverability card on `AdminPage.jsx` linking to `/admin/listing-coach-rules`.

- [ ] **Step 4: Run, commit**

```bash
cd .claude/worktrees/listing-coach
npx vitest run src/components/admin/ListingCoachRulesPanel.test.jsx src/pages/AdminListingCoachRulesPage.test.jsx functions/listingAdvisor.test.mjs
git add -A
git commit -m "feat(listing-coach): admin rules-management page + add/toggle/remove callables"
```

---

## Task 7: Final lint + bundle + vitest + manual smoke

**Files:** none

- [ ] **Step 1: Full vitest**

```bash
cd .claude/worktrees/listing-coach
npx vitest run
```

Expected: green; existing 944 + new ~50 = ~990 tests.

- [ ] **Step 2: Lint**

```bash
npm run lint
```

Expected: 0 errors.

- [ ] **Step 3: Build**

```bash
npm run build
```

Expected: clean. Tires page chunk should not regress meaningfully (the new tab is mostly markup; the heavy logic is server-side).

- [ ] **Step 4: Manual smoke (skip if no test backend)**

1. Sign in as admin. Open Tires page. Open the salesAdvisor drawer.
2. Click "Listing Coach" tab. Send "draft a listing for 4 of MSPN 81501". The model should:
   - Call `getTireByMspn` with input `81501`
   - Call `computeLandedCost` with the returned tire
   - Reply with the 5-section structure (SKU summary, pricing analysis, audience, fenced listing copy, photo guidance)
3. Click "Copy" on the fenced block. Paste into a text editor; should be the listing-only content.
4. Reply "drop FET mentions in consumer listings". The model should call `addStyleRule` and surface the rule. Visit `/admin/listing-coach-rules`; the rule should appear.
5. Disable the rule, then re-send "draft a listing for 4 of MSPN 81501". The output should mention FET again. Re-enable; the next reply should not mention FET.
6. Verify rate limiter at 30/hr is still honored (same toast as the sales advisor).

- [ ] **Step 5: HOLD for user direction on push**

Do NOT push. Do NOT modify the roadmap.

---

## Verification checklist (final)

- All vitest green
- Lint clean
- Bundle within caps (Tires page chunk; admin chunk for rules page acceptable)
- `addStyleRule` idempotent on exact-text duplicates
- `listStyleRules` filters by audience + enabled correctly
- Tool-use loop capped at 8 iterations
- Few-shot anchor loaded into system prompt at session start
- Active rules loaded at session start, filtered by audience
- Audience suggestion / override flow works in the drawer
- Copy-button writes only the fenced listing content (not the surrounding analysis)
- Admin rules page admin-only, snapshot subscribes correctly, toggle / remove / add round-trip
- eFleet account never appears in any draft listing or reasoning text

---

## Out of scope (deferred)

- Per-user rule overrides
- Implicit edit detection (diffing user-edited drafts)
- `tire.stock` field for inventory awareness
- Side-panel artifact / multi-draft view
- FB Marketplace API direct posting
- Cross-rule conflict auto-resolution
- Per-region / per-season seasonal context library
