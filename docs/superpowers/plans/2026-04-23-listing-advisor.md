# Listing Advisor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Dashboard Hidden Gems widget with a Listing Advisor that ranks inventory by "what to post next", explains why via on-demand LLM narrative, and surfaces per-SKU advisor detail inside ListingGenerator.

**Architecture:** Three independently testable layers. (1) Pure deterministic `ranker.js` takes enriched tires plus mode and returns a sorted list with `rankScore` and `signalBreakdown`. (2) `useAdvisorSignals` hook composes existing `useTires` data with derived `daysSincePriceChange` and per-size+LR `avgDaysToSell`. (3) `advisorNarrate` Firebase callable wraps Gemini Flash with a 24h Firestore cache. UI hangs off a new `NextToPostSurface` (dashboard) and `ListingAdvisorPanel` (inside ListingGenerator), both behind `flags.listingAdvisor`.

**Tech Stack:** React 18 + Vite + Tailwind, Firebase v2 callable functions, Firestore, Vitest, Gemini Flash (`gemini-1.5-flash`), existing `useTires` / `useDashboardSignals` hooks.

**Project conventions (from MEMORY.md, non-negotiable):**
- No em dashes anywhere in code, comments, commit messages, or PR copy. Use two hyphens `--` or rewrite.
- No AI attribution trailers in commits or PRs.
- No `claude/*` branch prefixes. Use plain topic branches.
- Impersonal commit messages (no second-person "you").
- Author: `Alex Bingham <boydabingham@gmail.com>` (canonical; MEMORY.md has a typo with an extra "lex").

**Branch:** Work on `listing-advisor` off latest `origin/main`.

---

## File structure

**New:**
- `src/utils/listingAdvisor/modeWeights.js` -- exported `MODE_WEIGHTS` constant.
- `src/utils/listingAdvisor/ranker.js` -- pure `rankTires(tires, mode)` function.
- `src/utils/listingAdvisor/ranker.test.js` -- Vitest unit tests.
- `src/hooks/useAdvisorSignals.js` -- composes `useTires` + derivations.
- `src/hooks/useAdvisorSignals.test.js` -- Vitest unit tests.
- `src/components/dashboard/NextToPostSurface.jsx` -- replaces `HiddenGemsSurface`.
- `src/components/dashboard/NextToPostSurface.test.jsx` -- component tests.
- `src/components/tires/ListingAdvisorPanel.jsx` -- panel mounted in ListingGenerator.
- `functions/advisorNarrate.js` -- callable + cache.
- `functions/test/advisorNarrate.test.mjs` -- integration test.
- `src/utils/featureFlags.js` -- if not already present; reads `import.meta.env.VITE_FLAG_LISTING_ADVISOR` and process-env equivalents.

**Modified:**
- `src/components/dashboard/Dashboard.jsx` -- swap HiddenGemsSurface for NextToPostSurface (flag-gated).
- `src/hooks/useDashboardSignals.js` -- expose advisor-ranked list via delegation to `useAdvisorSignals`.
- `src/components/tires/ListingGenerator.jsx` -- mount `<ListingAdvisorPanel>` at top.
- `src/components/tires/TiresDashboard.jsx` OR existing tire detail drawer -- add "Do not list" checkbox that writes `doNotList` to the tire doc.
- `functions/index.js` -- register `advisorNarrate` export.

**Deleted (last, after flag flips on in prod):**
- `src/components/dashboard/HiddenGemsSurface.jsx`
- `src/components/dashboard/HiddenGemsSurface.test.jsx`

---

## Task 1: Mode weights constant

**Files:**
- Create: `src/utils/listingAdvisor/modeWeights.js`

- [ ] **Step 1: Create the constants module**

```js
// src/utils/listingAdvisor/modeWeights.js
// Weights are plain numbers so signalBreakdown stays legible. Tuning is one edit.

export const MODE_WEIGHTS = Object.freeze({
  CLEARANCE: { age: 1.5, velocity: 0.5, margin: 0.0, crossPost: 0.8 },
  PROFIT:    { age: 0.4, velocity: 0.6, margin: 1.4, crossPost: 0.5 },
  VELOCITY:  { age: 0.6, velocity: 1.5, margin: 0.3, crossPost: 0.6 },
})

export const ADVISOR_MODES = Object.freeze(['CLEARANCE', 'PROFIT', 'VELOCITY'])

export const DEFAULT_ADVISOR_MODE = 'VELOCITY'
```

- [ ] **Step 2: Commit**

```bash
git checkout -b listing-advisor
git add src/utils/listingAdvisor/modeWeights.js
git commit -m "feat(advisor): mode weight constants for listing advisor"
```

---

## Task 2: Ranker -- failing tests first

**Files:**
- Create: `src/utils/listingAdvisor/ranker.test.js`

- [ ] **Step 1: Write the ranker test suite**

```js
// src/utils/listingAdvisor/ranker.test.js
import { describe, it, expect } from 'vitest'
import { rankTires } from './ranker.js'
import { MODE_WEIGHTS } from './modeWeights.js'

function tire(overrides = {}) {
  return {
    id: 't1',
    daysSincePriceChange: 30,
    avgDaysToSell: 20,
    velocitySampleSize: 5,
    marginHeadroomPct: 0.25,
    missingPlatformCount: 1,
    doNotList: false,
    kyleFrozen: false,
    ...overrides,
  }
}

describe('rankTires', () => {
  it('returns [] for empty input', () => {
    expect(rankTires([], 'VELOCITY')).toEqual([])
  })

  it('filters out doNotList tires before scoring', () => {
    const input = [tire({ id: 'keep' }), tire({ id: 'skip', doNotList: true })]
    const out = rankTires(input, 'VELOCITY')
    expect(out.map((t) => t.id)).toEqual(['keep'])
  })

  it('unknown velocity (sampleSize < 3) contributes 0, never NaN', () => {
    const t = tire({ velocitySampleSize: 0, avgDaysToSell: null })
    const [ranked] = rankTires([t], 'VELOCITY')
    expect(Number.isFinite(ranked.rankScore)).toBe(true)
    expect(ranked.signalBreakdown.velocity.raw).toBe(0)
    expect(ranked.signalBreakdown.velocity.weighted).toBe(0)
  })

  it('clamps daysSincePriceChange to [0, 180]', () => {
    const hi = rankTires([tire({ id: 'hi', daysSincePriceChange: 400 })], 'CLEARANCE')[0]
    const cap = rankTires([tire({ id: 'cap', daysSincePriceChange: 180 })], 'CLEARANCE')[0]
    expect(hi.signalBreakdown.age.raw).toBe(180)
    expect(hi.rankScore).toBeCloseTo(cap.rankScore, 6)
  })

  it('signalBreakdown weighted values sum to rankScore', () => {
    const [r] = rankTires([tire()], 'PROFIT')
    const sum =
      r.signalBreakdown.age.weighted +
      r.signalBreakdown.velocity.weighted +
      r.signalBreakdown.margin.weighted +
      r.signalBreakdown.crossPost.weighted
    expect(r.rankScore).toBeCloseTo(sum, 6)
  })

  it('Clearance mode ranks oldest-repriced tire first', () => {
    const tires = [
      tire({ id: 'fresh', daysSincePriceChange: 2 }),
      tire({ id: 'stale', daysSincePriceChange: 120 }),
      tire({ id: 'mid', daysSincePriceChange: 40 }),
    ]
    const out = rankTires(tires, 'CLEARANCE')
    expect(out[0].id).toBe('stale')
  })

  it('Profit mode prioritizes margin over age', () => {
    const tires = [
      tire({ id: 'fat', daysSincePriceChange: 10, marginHeadroomPct: 0.6 }),
      tire({ id: 'stale_thin', daysSincePriceChange: 120, marginHeadroomPct: 0.05 }),
    ]
    const out = rankTires(tires, 'PROFIT')
    expect(out[0].id).toBe('fat')
  })

  it('Velocity mode prioritizes fast-moving sizes', () => {
    const tires = [
      tire({ id: 'slow', avgDaysToSell: 90, velocitySampleSize: 8 }),
      tire({ id: 'fast', avgDaysToSell: 7, velocitySampleSize: 8 }),
    ]
    const out = rankTires(tires, 'VELOCITY')
    expect(out[0].id).toBe('fast')
  })

  it('throws for unknown mode', () => {
    expect(() => rankTires([tire()], 'BOGUS')).toThrow(/mode/i)
  })

  it('MODE_WEIGHTS is frozen', () => {
    expect(Object.isFrozen(MODE_WEIGHTS)).toBe(true)
  })
})
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run:
```
npm run test -- src/utils/listingAdvisor/ranker.test.js
```
Expected: all tests fail with "Cannot find module './ranker.js'" or similar.

- [ ] **Step 3: Commit the failing tests**

```bash
git add src/utils/listingAdvisor/ranker.test.js
git commit -m "test(advisor): ranker test suite (failing)"
```

---

## Task 3: Ranker -- implementation

**Files:**
- Create: `src/utils/listingAdvisor/ranker.js`

- [ ] **Step 1: Implement rankTires**

```js
// src/utils/listingAdvisor/ranker.js
import { MODE_WEIGHTS } from './modeWeights.js'

const AGE_CLAMP_MAX = 180
const MIN_VELOCITY_SAMPLE = 3

function clampAge(days) {
  const n = Number(days)
  if (!Number.isFinite(n) || n < 0) return 0
  return n > AGE_CLAMP_MAX ? AGE_CLAMP_MAX : n
}

function velocityUrgency(avgDaysToSell, sampleSize) {
  const n = Number(avgDaysToSell)
  const s = Number(sampleSize) || 0
  if (s < MIN_VELOCITY_SAMPLE || !Number.isFinite(n) || n <= 0) return 0
  return 100 / Math.max(n, 1)
}

function scoreTire(tire, weights) {
  const ageRaw = clampAge(tire.daysSincePriceChange)
  const velRaw = velocityUrgency(tire.avgDaysToSell, tire.velocitySampleSize)
  const marginRaw = Number.isFinite(Number(tire.marginHeadroomPct)) ? Number(tire.marginHeadroomPct) : 0
  const crossRaw = Math.max(0, Number(tire.missingPlatformCount) || 0)

  // Margin is expressed as a fraction (0.32 = 32%). Multiply by 100 so the
  // weight scale lines up with the other signals.
  const ageW = ageRaw * weights.age
  const velW = velRaw * weights.velocity
  const marginW = marginRaw * 100 * weights.margin
  const crossW = crossRaw * weights.crossPost

  return {
    rankScore: ageW + velW + marginW + crossW,
    signalBreakdown: {
      age: { raw: ageRaw, weighted: ageW },
      velocity: { raw: velRaw, weighted: velW },
      margin: { raw: marginRaw, weighted: marginW },
      crossPost: { raw: crossRaw, weighted: crossW },
    },
  }
}

/**
 * Rank tires for listing priority.
 * Pure function. No I/O. Tires with `doNotList: true` are dropped before scoring.
 *
 * @param {Array<object>} tires
 * @param {'CLEARANCE'|'PROFIT'|'VELOCITY'} mode
 * @returns {Array<object>} sorted descending by rankScore, each row augmented with
 *   `rankScore` and `signalBreakdown`.
 */
export function rankTires(tires, mode) {
  const weights = MODE_WEIGHTS[mode]
  if (!weights) throw new Error(`Unknown advisor mode: ${mode}`)
  if (!Array.isArray(tires) || tires.length === 0) return []

  const scored = []
  for (const t of tires) {
    if (t && t.doNotList === true) continue
    const { rankScore, signalBreakdown } = scoreTire(t, weights)
    scored.push({ ...t, rankScore, signalBreakdown })
  }
  scored.sort((a, b) => b.rankScore - a.rankScore)
  return scored
}
```

- [ ] **Step 2: Run tests to verify all pass**

Run:
```
npm run test -- src/utils/listingAdvisor/ranker.test.js
```
Expected: all 10 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/utils/listingAdvisor/ranker.js
git commit -m "feat(advisor): pure ranker for listing priority by mode"
```

---

## Task 4: `useAdvisorSignals` hook -- failing tests

**Files:**
- Create: `src/hooks/useAdvisorSignals.test.js`

- [ ] **Step 1: Write the hook tests**

```js
// src/hooks/useAdvisorSignals.test.js
import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import {
  computeDaysSincePriceChange,
  computeAvgDaysToSell,
  buildEnrichedTires,
} from './useAdvisorSignals.js'

function ts(iso) {
  const ms = new Date(iso).getTime()
  return { toMillis: () => ms }
}

describe('computeDaysSincePriceChange', () => {
  it('returns days since latest priceHistory entry', () => {
    const now = new Date('2026-04-22T00:00:00Z').getTime()
    const tire = {
      priceHistory: [
        { price: 300, at: ts('2026-01-01T00:00:00Z') },
        { price: 280, at: ts('2026-03-19T00:00:00Z') },
      ],
    }
    expect(computeDaysSincePriceChange(tire, now)).toBe(34)
  })

  it('returns 0 when priceHistory is missing or empty', () => {
    expect(computeDaysSincePriceChange({}, Date.now())).toBe(0)
    expect(computeDaysSincePriceChange({ priceHistory: [] }, Date.now())).toBe(0)
  })

  it('ignores entries with missing timestamps', () => {
    const now = new Date('2026-04-22T00:00:00Z').getTime()
    const tire = {
      priceHistory: [{ price: 300, at: null }, { price: 280, at: ts('2026-04-20T00:00:00Z') }],
    }
    expect(computeDaysSincePriceChange(tire, now)).toBe(2)
  })
})

describe('computeAvgDaysToSell', () => {
  it('groups by size+LR and averages completedAt - intakeAt', () => {
    const orders = [
      { status: 'completed', size: '265/70R17', lr: 'E', intakeAt: ts('2026-01-01'), completedAt: ts('2026-01-11') },
      { status: 'completed', size: '265/70R17', lr: 'E', intakeAt: ts('2026-02-01'), completedAt: ts('2026-02-21') },
      { status: 'completed', size: '235/75R15', lr: 'D', intakeAt: ts('2026-01-01'), completedAt: ts('2026-01-31') },
    ]
    const result = computeAvgDaysToSell(orders)
    expect(result['265/70R17|E']).toEqual({ avgDaysToSell: 15, sampleSize: 2 })
    expect(result['235/75R15|D']).toEqual({ avgDaysToSell: 30, sampleSize: 1 })
  })

  it('filters out non-completed orders', () => {
    const orders = [
      { status: 'pending', size: '265/70R17', lr: 'E', intakeAt: ts('2026-01-01'), completedAt: ts('2026-01-11') },
      { status: 'cancelled', size: '265/70R17', lr: 'E', intakeAt: ts('2026-01-01'), completedAt: ts('2026-01-11') },
    ]
    expect(computeAvgDaysToSell(orders)).toEqual({})
  })

  it('skips orders missing intakeAt or completedAt', () => {
    const orders = [
      { status: 'completed', size: '265/70R17', lr: 'E', intakeAt: null, completedAt: ts('2026-01-11') },
      { status: 'completed', size: '265/70R17', lr: 'E', intakeAt: ts('2026-01-01'), completedAt: null },
    ]
    expect(computeAvgDaysToSell(orders)).toEqual({})
  })
})

describe('buildEnrichedTires', () => {
  it('attaches daysSincePriceChange, velocity, margin, missingPlatformCount', () => {
    const now = new Date('2026-04-22T00:00:00Z').getTime()
    const tires = [
      {
        id: 't1',
        size: '265/70R17',
        lr: 'E',
        price: 300,
        buyPrice: 180,
        ctsTotal: 20,
        priceHistory: [{ price: 300, at: ts('2026-03-22T00:00:00Z') }],
        listedEbay: true,
        listedMarketplace: false,
        listedCraigslist: false,
      },
    ]
    const velocityBySize = { '265/70R17|E': { avgDaysToSell: 18, sampleSize: 6 } }
    const [enriched] = buildEnrichedTires(tires, velocityBySize, now)
    expect(enriched.daysSincePriceChange).toBe(31)
    expect(enriched.avgDaysToSell).toBe(18)
    expect(enriched.velocitySampleSize).toBe(6)
    expect(enriched.missingPlatformCount).toBe(2)
    // margin: (300 - 180 - 20) / 300 = 100 / 300 = 0.3333
    expect(enriched.marginHeadroomPct).toBeCloseTo(0.3333, 3)
  })

  it('defaults missing velocity to null + 0 sample size', () => {
    const tires = [{ id: 't1', size: '999', lr: 'Z', price: 100, buyPrice: 50 }]
    const [enriched] = buildEnrichedTires(tires, {}, Date.now())
    expect(enriched.avgDaysToSell).toBe(null)
    expect(enriched.velocitySampleSize).toBe(0)
  })

  it('preserves doNotList and kyleFrozen flags', () => {
    const tires = [{ id: 't1', doNotList: true, kyleFrozen: true }]
    const [enriched] = buildEnrichedTires(tires, {}, Date.now())
    expect(enriched.doNotList).toBe(true)
    expect(enriched.kyleFrozen).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests and confirm they fail**

Run:
```
npm run test -- src/hooks/useAdvisorSignals.test.js
```
Expected: module-not-found failures.

- [ ] **Step 3: Commit failing tests**

```bash
git add src/hooks/useAdvisorSignals.test.js
git commit -m "test(advisor): useAdvisorSignals derivation tests (failing)"
```

---

## Task 5: `useAdvisorSignals` hook -- implementation

**Files:**
- Create: `src/hooks/useAdvisorSignals.js`

- [ ] **Step 1: Implement pure helpers + hook**

```js
// src/hooks/useAdvisorSignals.js
import { useEffect, useMemo, useRef, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../firebase.js'
import { useTires } from './useTires.js'
import { rankTires } from '../utils/listingAdvisor/ranker.js'
import { DEFAULT_ADVISOR_MODE } from '../utils/listingAdvisor/modeWeights.js'

const MS_PER_DAY = 24 * 60 * 60 * 1000

function toMillis(maybeTs) {
  if (!maybeTs) return null
  if (typeof maybeTs.toMillis === 'function') return maybeTs.toMillis()
  if (maybeTs instanceof Date) return maybeTs.getTime()
  const n = Number(maybeTs)
  return Number.isFinite(n) ? n : null
}

export function computeDaysSincePriceChange(tire, nowMs) {
  const hist = Array.isArray(tire?.priceHistory) ? tire.priceHistory : []
  let latest = 0
  for (const entry of hist) {
    const ms = toMillis(entry?.at)
    if (ms && ms > latest) latest = ms
  }
  if (!latest) return 0
  const diffDays = Math.floor((nowMs - latest) / MS_PER_DAY)
  return diffDays < 0 ? 0 : diffDays
}

export function computeAvgDaysToSell(orders) {
  const acc = {}
  for (const o of orders || []) {
    if (!o || o.status !== 'completed') continue
    const intakeMs = toMillis(o.intakeAt)
    const completedMs = toMillis(o.completedAt)
    if (!intakeMs || !completedMs) continue
    const key = `${o.size || ''}|${o.lr || ''}`
    if (!acc[key]) acc[key] = { sumDays: 0, sampleSize: 0 }
    acc[key].sumDays += Math.max(0, (completedMs - intakeMs) / MS_PER_DAY)
    acc[key].sampleSize += 1
  }
  const out = {}
  for (const [key, { sumDays, sampleSize }] of Object.entries(acc)) {
    out[key] = { avgDaysToSell: Math.round(sumDays / sampleSize), sampleSize }
  }
  return out
}

function marginHeadroomPct(tire) {
  const price = Number(tire?.price) || 0
  if (price <= 0) return 0
  const buy = Number(tire?.buyPrice) || 0
  const cts = Number(tire?.ctsTotal) || 0
  return (price - buy - cts) / price
}

function missingPlatforms(tire) {
  let n = 0
  if (!tire?.listedEbay) n += 1
  if (!tire?.listedMarketplace) n += 1
  if (!tire?.listedCraigslist) n += 1
  return n
}

export function buildEnrichedTires(tires, velocityBySize, nowMs) {
  return (tires || []).map((t) => {
    const key = `${t?.size || ''}|${t?.lr || ''}`
    const v = velocityBySize[key] || { avgDaysToSell: null, sampleSize: 0 }
    return {
      ...t,
      daysSincePriceChange: computeDaysSincePriceChange(t, nowMs),
      avgDaysToSell: v.avgDaysToSell,
      velocitySampleSize: v.sampleSize,
      marginHeadroomPct: marginHeadroomPct(t),
      missingPlatformCount: missingPlatforms(t),
      doNotList: Boolean(t?.doNotList),
      kyleFrozen: Boolean(t?.kyleFrozen),
    }
  })
}

/**
 * Subscribes to completed orders + tires and returns a ranked list per mode.
 * Caller owns the `mode` state; the hook memoizes the ranked result on (tires,
 * completed orders, mode) so ranker re-runs only when inputs actually change.
 */
export function useAdvisorSignals(mode = DEFAULT_ADVISOR_MODE) {
  const { tires, loading: tiresLoading } = useTires()
  const [completedOrders, setCompletedOrders] = useState([])
  const [ordersLoading, setOrdersLoading] = useState(true)
  const nowRef = useRef(Date.now())

  useEffect(() => {
    const q = query(collection(db, 'orders'), where('status', '==', 'completed'))
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
        setCompletedOrders(rows)
        setOrdersLoading(false)
      },
      () => setOrdersLoading(false),
    )
    return unsub
  }, [])

  const velocityBySize = useMemo(() => computeAvgDaysToSell(completedOrders), [completedOrders])

  const ranked = useMemo(() => {
    const enriched = buildEnrichedTires(tires || [], velocityBySize, nowRef.current)
    return rankTires(enriched, mode)
  }, [tires, velocityBySize, mode])

  return {
    ranked,
    loading: tiresLoading || ordersLoading,
    mode,
  }
}
```

- [ ] **Step 2: Run tests and verify all pass**

Run:
```
npm run test -- src/hooks/useAdvisorSignals.test.js
```
Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useAdvisorSignals.js
git commit -m "feat(advisor): useAdvisorSignals hook composing tires + velocity"
```

---

## Task 6: `advisorNarrate` callable -- failing tests

**Files:**
- Create: `functions/test/advisorNarrate.test.mjs`

- [ ] **Step 1: Write the callable test**

```js
// functions/test/advisorNarrate.test.mjs
import { describe, it, expect, vi, beforeEach } from 'vitest'

const geminiMock = vi.fn()
const now = new Date('2026-04-23T12:00:00Z').getTime()

function makeFirestoreStub(initial = {}) {
  const store = { ...initial }
  return {
    store,
    collection(name) {
      return {
        doc(id) {
          const key = `${name}/${id}`
          return {
            async get() {
              return {
                exists: key in store,
                data: () => store[key],
              }
            },
            async set(value) {
              store[key] = value
            },
          }
        },
      }
    },
  }
}

async function load(firestore) {
  const mod = await import('../advisorNarrate.js')
  return mod._testonly.handle({ firestore, now, callGemini: geminiMock })
}

describe('advisorNarrate', () => {
  beforeEach(() => {
    geminiMock.mockReset()
    vi.resetModules()
  })

  it('returns cached narrative when cache entry is < 24h old', async () => {
    const firestore = makeFirestoreStub({
      'tires/t1': { brand: 'Michelin', size: 'LT265/70R17', lr: 'E', price: 287 },
      'advisorCache/t1_VELOCITY': {
        narrative: 'Cached story.',
        shadowFlag: '',
        writtenAt: now - 10 * 60 * 60 * 1000,
      },
    })
    const handle = await load(firestore)
    const result = await handle({ tireId: 't1', mode: 'VELOCITY' })
    expect(result.narrative).toBe('Cached story.')
    expect(geminiMock).not.toHaveBeenCalled()
  })

  it('calls Gemini on cache miss and writes result to cache', async () => {
    geminiMock.mockResolvedValue({
      text: 'Top signals: age and missing platforms.\n\n⚠️ Comps dropped 18% this week.',
    })
    const firestore = makeFirestoreStub({
      'tires/t1': { brand: 'Michelin', size: 'LT265/70R17', lr: 'E', price: 287 },
    })
    const handle = await load(firestore)
    const result = await handle({ tireId: 't1', mode: 'VELOCITY' })
    expect(geminiMock).toHaveBeenCalledTimes(1)
    expect(result.narrative).toMatch(/Top signals/)
    expect(result.shadowFlag).toMatch(/Comps dropped/)
    expect(firestore.store['advisorCache/t1_VELOCITY']).toBeTruthy()
    expect(firestore.store['advisorCache/t1_VELOCITY'].narrative).toMatch(/Top signals/)
  })

  it('omits shadowFlag when the model emits only narrative', async () => {
    geminiMock.mockResolvedValue({ text: 'Quick story, no warning.' })
    const firestore = makeFirestoreStub({
      'tires/t1': { brand: 'Michelin', size: 'LT265/70R17', lr: 'E', price: 287 },
    })
    const handle = await load(firestore)
    const result = await handle({ tireId: 't1', mode: 'VELOCITY' })
    expect(result.narrative).toBe('Quick story, no warning.')
    expect(result.shadowFlag).toBe('')
  })

  it('rejects unknown mode', async () => {
    const firestore = makeFirestoreStub({ 'tires/t1': {} })
    const handle = await load(firestore)
    await expect(handle({ tireId: 't1', mode: 'BOGUS' })).rejects.toThrow(/mode/i)
  })

  it('rejects missing tireId', async () => {
    const firestore = makeFirestoreStub()
    const handle = await load(firestore)
    await expect(handle({ mode: 'VELOCITY' })).rejects.toThrow(/tireId/i)
  })
})
```

- [ ] **Step 2: Confirm test fails (module not written yet)**

Run:
```
cd functions && npx vitest run test/advisorNarrate.test.mjs
```
Expected: resolve/import failure.

- [ ] **Step 3: Commit failing test**

```bash
git add functions/test/advisorNarrate.test.mjs
git commit -m "test(advisor): advisorNarrate callable tests (failing)"
```

---

## Task 7: `advisorNarrate` callable -- implementation

**Files:**
- Create: `functions/advisorNarrate.js`
- Modify: `functions/index.js`

- [ ] **Step 1: Implement the callable**

```js
// functions/advisorNarrate.js
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
  // Shadow flag is any line starting with a warning emoji. Split on it.
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
  // Minimal v1 payload. Signal hook already computed this for the UI but we
  // re-derive server-side since we cannot trust client-supplied numbers.
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
```

- [ ] **Step 2: Register export in functions/index.js**

Open `functions/index.js`. Find the block of `exports.xxx = require('./xxx').xxx` (or equivalent pattern used in this repo). Add:

```js
exports.advisorNarrate = require('./advisorNarrate').advisorNarrate
```

Place it alphabetically among the existing exports. Do not reformat the surrounding code.

- [ ] **Step 3: Run callable tests**

Run:
```
cd functions && npx vitest run test/advisorNarrate.test.mjs
```
Expected: all 5 tests pass.

- [ ] **Step 4: Commit**

```bash
git add functions/advisorNarrate.js functions/index.js
git commit -m "feat(advisor): advisorNarrate callable with 24h Firestore cache"
```

---

## Task 8: Feature flag plumbing

**Files:**
- Create or modify: `src/utils/featureFlags.js`

- [ ] **Step 1: Check whether the flag module already exists**

Run:
```
npm ls --parseable 2>/dev/null | head -1
```
Then:
```
ls src/utils/featureFlags.js 2>/dev/null || echo "MISSING"
```

If it prints `MISSING`, create it:

```js
// src/utils/featureFlags.js
// Simple build-time flags. Reads VITE_FLAG_* env vars. Values "1", "true", "on"
// are truthy; everything else is falsy. Defaults encode our rollout intent.

function readFlag(name, defaultValue) {
  try {
    const raw = import.meta.env?.[`VITE_FLAG_${name}`]
    if (raw == null) return defaultValue
    const s = String(raw).trim().toLowerCase()
    return s === '1' || s === 'true' || s === 'on'
  } catch {
    return defaultValue
  }
}

export const flags = Object.freeze({
  listingAdvisor: readFlag('LISTING_ADVISOR', import.meta.env?.DEV === true),
})
```

If the file already exists, add just the `listingAdvisor` line to the exported object, matching the existing pattern. Do not rewrite the file.

- [ ] **Step 2: Commit**

```bash
git add src/utils/featureFlags.js
git commit -m "feat(advisor): listingAdvisor build flag (on in dev, off in prod)"
```

---

## Task 9: NextToPostSurface -- failing tests

**Files:**
- Create: `src/components/dashboard/NextToPostSurface.test.jsx`

- [ ] **Step 1: Write component tests**

```jsx
// src/components/dashboard/NextToPostSurface.test.jsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { NextToPostSurface } from './NextToPostSurface.jsx'

const narrateMock = vi.fn()

vi.mock('../../hooks/useAdvisorNarrate.js', () => ({
  useAdvisorNarrate: () => narrateMock,
}))

function ranked() {
  return [
    {
      id: 't1',
      sku: 'MICH-265-70-17',
      description: 'Michelin Agilis 265/70R17 E',
      missingPlatformCount: 2,
      listedEbay: false,
      listedMarketplace: true,
      listedCraigslist: false,
      kyleFrozen: false,
      rankScore: 174,
      signalBreakdown: {
        age: { raw: 44, weighted: 66 },
        velocity: { raw: 5.5, weighted: 8.25 },
        margin: { raw: 0.32, weighted: 44.8 },
        crossPost: { raw: 2, weighted: 1.6 },
      },
    },
    {
      id: 't2',
      sku: 'GY-235-75-15',
      description: 'Goodyear Wrangler 235/75R15 D',
      missingPlatformCount: 1,
      listedEbay: true,
      listedMarketplace: false,
      listedCraigslist: true,
      kyleFrozen: true,
      rankScore: 120,
      signalBreakdown: {
        age: { raw: 10, weighted: 15 },
        velocity: { raw: 10, weighted: 15 },
        margin: { raw: 0.4, weighted: 56 },
        crossPost: { raw: 1, weighted: 0.8 },
      },
    },
  ]
}

function renderSurface(props = {}) {
  return render(
    <MemoryRouter>
      <NextToPostSurface ranked={ranked()} loading={false} onPost={vi.fn()} {...props} />
    </MemoryRouter>,
  )
}

describe('NextToPostSurface', () => {
  beforeEach(() => {
    narrateMock.mockReset()
    window.localStorage.clear()
  })

  afterEach(() => {
    window.localStorage.clear()
  })

  it('renders the top-ranked tire in the card preview', () => {
    renderSurface()
    expect(screen.getByText('MICH-265-70-17')).toBeInTheDocument()
    expect(screen.queryByText('GY-235-75-15')).not.toBeInTheDocument()
  })

  it('renders empty state when ranked is empty', () => {
    renderSurface({ ranked: [] })
    expect(screen.getByText(/nothing to post/i)).toBeInTheDocument()
  })

  it('mode toggle persists selection to localStorage', () => {
    renderSurface()
    fireEvent.click(screen.getByRole('button', { name: /clearance/i }))
    expect(window.localStorage.getItem('skedaddle-advisor-mode-v1')).toBe('CLEARANCE')
  })

  it('"Show more" opens the modal with full ranked list', () => {
    renderSurface()
    fireEvent.click(screen.getByRole('button', { name: /show more/i }))
    expect(screen.getByRole('dialog', { name: /next to post/i })).toBeInTheDocument()
    expect(screen.getByText('GY-235-75-15')).toBeInTheDocument()
  })

  it('Escape closes the modal', () => {
    renderSurface()
    fireEvent.click(screen.getByRole('button', { name: /show more/i }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('expanding a row in the modal calls advisorNarrate and renders narrative', async () => {
    narrateMock.mockResolvedValue({ narrative: 'Aging fast.', shadowFlag: '' })
    renderSurface()
    fireEvent.click(screen.getByRole('button', { name: /show more/i }))
    fireEvent.click(screen.getAllByRole('button', { name: /why/i })[0])
    await waitFor(() => expect(narrateMock).toHaveBeenCalledWith('t1', expect.any(String)))
    await waitFor(() => expect(screen.getByText('Aging fast.')).toBeInTheDocument())
  })
})
```

- [ ] **Step 2: Confirm tests fail**

Run:
```
npm run test -- src/components/dashboard/NextToPostSurface.test.jsx
```
Expected: module-not-found failures.

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/NextToPostSurface.test.jsx
git commit -m "test(advisor): NextToPostSurface component tests (failing)"
```

---

## Task 10: NextToPostSurface -- implementation

**Files:**
- Create: `src/components/dashboard/NextToPostSurface.jsx`
- Create: `src/hooks/useAdvisorNarrate.js`

- [ ] **Step 1: Create the callable-invocation hook**

```js
// src/hooks/useAdvisorNarrate.js
import { useCallback } from 'react'
import { getFunctions, httpsCallable } from 'firebase/functions'

export function useAdvisorNarrate() {
  return useCallback(async (tireId, mode) => {
    const fn = httpsCallable(getFunctions(), 'advisorNarrate')
    const res = await fn({ tireId, mode })
    return res.data || { narrative: '', shadowFlag: '' }
  }, [])
}
```

- [ ] **Step 2: Implement NextToPostSurface**

Reuse existing chrome from `HiddenGemsSurface.jsx` so the modal/card pattern matches. Start by copying that file to `NextToPostSurface.jsx`, then replace internals:

```jsx
// src/components/dashboard/NextToPostSurface.jsx
import { useCallback, useEffect, useMemo, useState } from 'react'
import { EmptyState } from '../shared/EmptyState.jsx'
import { MODAL_CENTER_BACKDROP, MODAL_CENTER_PANEL_WIDE } from '../ui/modalChrome.js'
import { ADVISOR_MODES, DEFAULT_ADVISOR_MODE } from '../../utils/listingAdvisor/modeWeights.js'
import { useAdvisorNarrate } from '../../hooks/useAdvisorNarrate.js'
import { formatPercent } from '../../utils/format.js'

const MODE_STORAGE_KEY = 'skedaddle-advisor-mode-v1'
const PLATFORM_LABELS = { ebay: 'eBay', marketplace: 'Marketplace', craigslist: 'Craigslist' }

function missingPlatforms(tire) {
  const missing = []
  if (!tire.listedEbay) missing.push('ebay')
  if (!tire.listedMarketplace) missing.push('marketplace')
  if (!tire.listedCraigslist) missing.push('craigslist')
  return missing
}

function SignalStrip({ tire }) {
  const bd = tire.signalBreakdown || {}
  return (
    <p className="text-[11px] text-zinc-500">
      Age {Math.round(bd.age?.raw || 0)}d &middot;{' '}
      Vel {bd.velocity?.raw ? `${Math.round(100 / bd.velocity.raw)}d` : 'n/a'} &middot;{' '}
      Margin {formatPercent(bd.margin?.raw || 0, 0)} &middot;{' '}
      Missing {tire.missingPlatformCount}
    </p>
  )
}

function Row({ tire, onPost, compact = false }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <p className="truncate font-mono text-[13px] text-zinc-100">{tire.sku}</p>
        <p className="truncate text-[13px] text-zinc-300">{tire.description}</p>
        {!compact ? (
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {missingPlatforms(tire).map((p) => (
              <span key={p} className="rounded-full bg-zinc-800/80 px-2 py-0.5 text-[10px] text-zinc-300">
                {PLATFORM_LABELS[p]}
              </span>
            ))}
            {tire.kyleFrozen ? (
              <span title="Kyle frozen" aria-label="Kyle frozen" className="text-[10px]">
                🔒
              </span>
            ) : null}
          </div>
        ) : null}
        <div className="mt-1">
          <SignalStrip tire={tire} />
        </div>
      </div>
      {onPost ? (
        <button
          type="button"
          onClick={() => onPost(tire.id)}
          className="shrink-0 rounded-lg bg-emerald-500/20 px-3 py-1.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/30"
        >
          Post it
        </button>
      ) : null}
    </div>
  )
}

function ModeToggle({ mode, onChange }) {
  return (
    <div role="tablist" aria-label="Advisor mode" className="inline-flex rounded-full bg-zinc-800/60 p-0.5 text-[11px]">
      {ADVISOR_MODES.map((m) => {
        const active = mode === m
        return (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(m)}
            className={`rounded-full px-2 py-0.5 ${
              active ? 'bg-amber-500/30 text-amber-100' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {m.charAt(0) + m.slice(1).toLowerCase()}
          </button>
        )
      })}
    </div>
  )
}

function ExpandableRow({ tire, mode, narrate }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)

  const toggle = useCallback(async () => {
    if (open) {
      setOpen(false)
      return
    }
    setOpen(true)
    if (result) return
    setLoading(true)
    try {
      const r = await narrate(tire.id, mode)
      setResult(r)
    } catch (e) {
      setError(String(e?.message || e))
    } finally {
      setLoading(false)
    }
  }, [open, result, narrate, tire.id, mode])

  return (
    <div>
      <Row tire={tire} />
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="mt-1 text-[11px] text-amber-300/90 hover:underline"
      >
        {open ? 'Hide why' : 'Why?'}
      </button>
      {open ? (
        <div className="mt-2 rounded-lg bg-zinc-900/60 p-2 text-[12px] text-zinc-300">
          {loading ? 'Thinking…' : null}
          {error ? <span className="text-rose-300">Narrative unavailable (retry).</span> : null}
          {result ? (
            <>
              <p>{result.narrative}</p>
              {result.shadowFlag ? <p className="mt-1 text-amber-200">{result.shadowFlag}</p> : null}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function Modal({ ranked, mode, onPost, onClose, narrate }) {
  const [selected, setSelected] = useState(() => new Set())

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  function toggleId(id) {
    setSelected((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  function openSelected() {
    for (const id of selected) onPost?.(id)
    onClose()
  }

  return (
    <div className={MODAL_CENTER_BACKDROP} onClick={onClose}>
      <div
        className={MODAL_CENTER_PANEL_WIDE}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="advisor-modal-title"
      >
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <h2 id="advisor-modal-title" className="text-sm font-semibold text-zinc-100">
            Next to Post ({ranked.length})
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200"
          >
            ✕
          </button>
        </div>
        <ul className="max-h-[60vh] divide-y divide-zinc-800/80 overflow-y-auto px-4">
          {ranked.map((tire) => (
            <li key={tire.id} className="flex items-start gap-3 py-3">
              <input
                type="checkbox"
                checked={selected.has(tire.id)}
                onChange={() => toggleId(tire.id)}
                aria-label={`Select ${tire.sku}`}
                className="mt-0.5 size-4 shrink-0 rounded border-zinc-600 accent-amber-400"
              />
              <div className="min-w-0 flex-1">
                <ExpandableRow tire={tire} mode={mode} narrate={narrate} />
              </div>
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between border-t border-zinc-800 px-4 py-3">
          <span className="text-xs text-zinc-500">{selected.size} selected</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800/60"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={selected.size === 0}
              onClick={openSelected}
              className="rounded-lg bg-amber-500/20 px-3 py-1.5 text-sm font-semibold text-amber-200 hover:bg-amber-500/30 disabled:opacity-40"
            >
              Open {selected.size} {selected.size === 1 ? 'listing' : 'listings'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function NextToPostSurface({ ranked = [], loading = false, onPost, onModeChange }) {
  const [mode, setMode] = useState(() => {
    try {
      const v = window.localStorage.getItem(MODE_STORAGE_KEY)
      return ADVISOR_MODES.includes(v) ? v : DEFAULT_ADVISOR_MODE
    } catch {
      return DEFAULT_ADVISOR_MODE
    }
  })
  const [modalOpen, setModalOpen] = useState(false)
  const narrate = useAdvisorNarrate()

  const list = Array.isArray(ranked) ? ranked : []
  const first = list[0]
  const remaining = Math.max(0, list.length - 1)

  const changeMode = useCallback(
    (next) => {
      setMode(next)
      try {
        window.localStorage.setItem(MODE_STORAGE_KEY, next)
      } catch {
        // ignore storage failures
      }
      onModeChange?.(next)
    },
    [onModeChange],
  )

  return (
    <section className="pc-card rounded-xl bg-zinc-900/60 p-[14px]">
      <div className="flex items-center justify-between">
        <h2 className="pc-eyebrow">Next to Post</h2>
        <ModeToggle mode={mode} onChange={changeMode} />
      </div>
      {loading ? (
        <div className="mt-3 h-14 animate-pulse rounded-lg bg-zinc-800/60" />
      ) : list.length === 0 ? (
        <div className="mt-3">
          <EmptyState
            variant="compact"
            title="Nothing to post. Everything cross-posted and recently priced."
          />
        </div>
      ) : (
        <>
          <div className="mt-3">
            <Row tire={first} onPost={onPost} />
          </div>
          {remaining > 0 ? (
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="mt-3 text-xs font-medium text-amber-300/90 hover:underline"
            >
              Show more ({remaining} more)
            </button>
          ) : null}
        </>
      )}
      {modalOpen ? (
        <Modal
          ranked={list}
          mode={mode}
          onPost={onPost}
          onClose={() => setModalOpen(false)}
          narrate={narrate}
        />
      ) : null}
    </section>
  )
}
```

- [ ] **Step 3: Run component tests**

```
npm run test -- src/components/dashboard/NextToPostSurface.test.jsx
```
Expected: all 6 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/NextToPostSurface.jsx src/hooks/useAdvisorNarrate.js
git commit -m "feat(advisor): NextToPostSurface widget with mode toggle and narrate"
```

---

## Task 11: Wire NextToPostSurface into Dashboard behind flag

**Files:**
- Modify: `src/components/dashboard/Dashboard.jsx`
- Modify: `src/hooks/useDashboardSignals.js`

- [ ] **Step 1: Add ranked advisor list to useDashboardSignals**

Open `src/hooks/useDashboardSignals.js`. Near the top, add the import:

```js
import { useAdvisorSignals } from './useAdvisorSignals.js'
import { DEFAULT_ADVISOR_MODE } from '../utils/listingAdvisor/modeWeights.js'
```

Inside the existing hook, after the current derivations and before the return statement, add:

```js
const advisor = useAdvisorSignals(DEFAULT_ADVISOR_MODE)
```

Expose on the returned object:

```js
  advisorRanked: advisor.ranked,
  advisorLoading: advisor.loading,
```

Leave all existing fields untouched. The mode default stays VELOCITY; the widget owns mode state going forward.

- [ ] **Step 2: Swap HiddenGemsSurface for NextToPostSurface (flag-gated)**

Open `src/components/dashboard/Dashboard.jsx`. At the top:

```js
import { NextToPostSurface } from './NextToPostSurface.jsx'
import { flags } from '../../utils/featureFlags.js'
```

Destructure the new signals from `useDashboardSignals`:

```js
const {
  needsRepostingCount,
  signalBar,
  recentActivity,
  hiddenGems,
  topSellers,
  allTimeMargin,
  rollingAverageRevenue,
  advisorRanked,
  advisorLoading,
} = useDashboardSignals()
```

Replace the line:

```jsx
<HiddenGemsSurface gems={hiddenGems || []} onPost={handleGemPost} />
```

With:

```jsx
{flags.listingAdvisor ? (
  <NextToPostSurface
    ranked={advisorRanked || []}
    loading={advisorLoading}
    onPost={handleGemPost}
  />
) : (
  <HiddenGemsSurface gems={hiddenGems || []} onPost={handleGemPost} />
)}
```

Keep the `HiddenGemsSurface` import in place for now. Deletion waits until the flag flips on in prod (Task 14).

- [ ] **Step 3: Run dashboard tests**

```
npm run test -- src/components/dashboard src/hooks/useDashboardSignals.test.js
```
Expected: existing tests remain green. If `useDashboardSignals.test.js` stubs hooks, it may need to stub `useAdvisorSignals` as well. Fix by adding:

```js
vi.mock('../../hooks/useAdvisorSignals.js', () => ({
  useAdvisorSignals: () => ({ ranked: [], loading: false, mode: 'VELOCITY' }),
}))
```

Use the correct relative path from the test file.

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/Dashboard.jsx src/hooks/useDashboardSignals.js src/hooks/useDashboardSignals.test.js
git commit -m "feat(advisor): mount NextToPostSurface on dashboard behind flag"
```

---

## Task 12: ListingAdvisorPanel inside ListingGenerator

**Files:**
- Create: `src/components/tires/ListingAdvisorPanel.jsx`
- Modify: `src/components/tires/ListingGenerator.jsx`

- [ ] **Step 1: Create the panel**

```jsx
// src/components/tires/ListingAdvisorPanel.jsx
import { useEffect, useMemo, useState } from 'react'
import { formatPercent } from '../../utils/format.js'
import { useAdvisorNarrate } from '../../hooks/useAdvisorNarrate.js'
import { DEFAULT_ADVISOR_MODE } from '../../utils/listingAdvisor/modeWeights.js'

function rankLabel(position, mode) {
  const nice = mode.charAt(0) + mode.slice(1).toLowerCase()
  return position ? `Rank #${position} in ${nice} mode` : `Unranked (${nice} mode)`
}

function reasonForMissing(tire) {
  if (!tire) return 'Not ranked (no signals yet)'
  if (tire.doNotList) return 'Not ranked (do-not-list)'
  return 'Not ranked (no signals yet)'
}

export function ListingAdvisorPanel({ tireId, ranked = [], mode = DEFAULT_ADVISOR_MODE }) {
  const narrate = useAdvisorNarrate()
  const [narration, setNarration] = useState(null)
  const [error, setError] = useState(null)

  const position = useMemo(() => {
    if (!Array.isArray(ranked)) return null
    const i = ranked.findIndex((t) => t.id === tireId)
    return i >= 0 ? i + 1 : null
  }, [ranked, tireId])

  const tire = useMemo(() => (ranked || []).find((t) => t.id === tireId) || null, [ranked, tireId])

  useEffect(() => {
    if (!tire) return
    let alive = true
    narrate(tireId, mode)
      .then((r) => {
        if (alive) setNarration(r)
      })
      .catch((e) => {
        if (alive) setError(String(e?.message || e))
      })
    return () => {
      alive = false
    }
  }, [narrate, tireId, mode, tire])

  if (!tire) {
    return (
      <section className="mb-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 text-sm text-zinc-400">
        {reasonForMissing(tire)}
      </section>
    )
  }

  const bd = tire.signalBreakdown || {}
  return (
    <section className="mb-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 text-sm">
      <div className="flex items-center justify-between">
        <p className="font-medium text-zinc-100">
          {rankLabel(position, mode)} &middot; score {Math.round(tire.rankScore || 0)}
        </p>
        {tire.kyleFrozen ? <span aria-label="Kyle frozen">🔒</span> : null}
      </div>
      <p className="mt-1 text-[12px] text-zinc-400">
        Age {Math.round(bd.age?.raw || 0)}d &middot;{' '}
        Velocity {bd.velocity?.raw ? `${Math.round(100 / bd.velocity.raw)}d avg` : 'unknown'} &middot;{' '}
        Margin {formatPercent(bd.margin?.raw || 0, 0)} &middot; Missing {tire.missingPlatformCount} platform(s)
      </p>
      {error ? <p className="mt-2 text-rose-300">Narrative unavailable (retry).</p> : null}
      {narration ? (
        <div className="mt-2 text-zinc-300">
          <p>{narration.narrative}</p>
          {narration.shadowFlag ? <p className="mt-1 text-amber-200">{narration.shadowFlag}</p> : null}
        </div>
      ) : null}
    </section>
  )
}
```

- [ ] **Step 2: Mount the panel in ListingGenerator**

Open `src/components/tires/ListingGenerator.jsx`. Identify the JSX that wraps the generated listing output (title/description/price display). Add the import at the top:

```js
import { ListingAdvisorPanel } from './ListingAdvisorPanel.jsx'
import { flags } from '../../utils/featureFlags.js'
import { useAdvisorSignals } from '../../hooks/useAdvisorSignals.js'
```

Inside the component, near the top of its render body, introduce:

```js
const { ranked } = useAdvisorSignals()
```

Then, immediately above the generated-listing section in the returned JSX, insert:

```jsx
{flags.listingAdvisor && props.tireId ? (
  <ListingAdvisorPanel tireId={props.tireId} ranked={ranked} />
) : null}
```

Replace `props.tireId` with whatever the existing prop/state name is for the currently selected tire in this component. If ListingGenerator does not destructure props as `props`, use the destructured name. If the component uses a prop like `tire` instead, pass `tire.id`.

- [ ] **Step 3: Run relevant tests**

```
npm run test -- src/components/tires/ListingGenerator
```
Expected: existing ListingGenerator tests still pass. If they fail because the new hook fires, mock `useAdvisorSignals` in the test file identical to the Dashboard pattern.

- [ ] **Step 4: Commit**

```bash
git add src/components/tires/ListingAdvisorPanel.jsx src/components/tires/ListingGenerator.jsx
git commit -m "feat(advisor): ListingAdvisorPanel inside ListingGenerator behind flag"
```

---

## Task 13: "Do not list" checkbox on tire detail

**Files:**
- Modify: the tire detail drawer (likely inside `src/components/tires/TiresDashboard.jsx` or a sub-component; grep to find)

- [ ] **Step 1: Locate the drawer**

Run:
```
```
Then use Grep for `tire detail` case-insensitive across `src/components/tires/`, and also search for usages of the tire edit form where fields like `brand`, `price`, or `ctsTotal` are edited. The drawer is where fields on a tire doc are written via `updateDoc`.

- [ ] **Step 2: Add the checkbox and writer**

Locate an `updateDoc(doc(db, 'tires', tireId), { ... })` call in the drawer save path. Add a new form field near the bottom of the edit form:

```jsx
<label className="flex items-center gap-2 text-sm text-zinc-300">
  <input
    type="checkbox"
    checked={Boolean(form.doNotList)}
    onChange={(e) => setForm((f) => ({ ...f, doNotList: e.target.checked }))}
    className="size-4 rounded border-zinc-600 accent-amber-400"
  />
  Do not list
</label>
```

Ensure the `save` / `submit` handler includes `doNotList: form.doNotList` in the `updateDoc` payload. Use the existing patterns in the drawer for field binding and saving -- do not introduce new form state management.

- [ ] **Step 3: Run tests**

```
npm run test -- src/components/tires
```
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add -u src/components/tires
git commit -m "feat(advisor): 'Do not list' checkbox on tire detail drawer"
```

---

## Task 14: Rollout (flag flip + HiddenGems deletion)

> **Do not execute this task until the user has eyeballed the ranker ordering against gut feel on ~20 tires in staging (per spec rollout step 2) and approved prod enablement.**

**Files:**
- Modify: `src/utils/featureFlags.js` (default)
- Delete: `src/components/dashboard/HiddenGemsSurface.jsx`
- Delete: `src/components/dashboard/HiddenGemsSurface.test.jsx`
- Modify: `src/components/dashboard/Dashboard.jsx` (remove conditional + old import)
- Modify: `src/hooks/useDashboardSignals.js` (drop `hiddenGems` derivation if unused)

- [ ] **Step 1: Default the flag on**

In `src/utils/featureFlags.js`, change the `listingAdvisor` default from `import.meta.env?.DEV === true` to `true`.

- [ ] **Step 2: Remove the fallback branch in Dashboard.jsx**

Replace:
```jsx
{flags.listingAdvisor ? (
  <NextToPostSurface ranked={advisorRanked || []} loading={advisorLoading} onPost={handleGemPost} />
) : (
  <HiddenGemsSurface gems={hiddenGems || []} onPost={handleGemPost} />
)}
```
With:
```jsx
<NextToPostSurface ranked={advisorRanked || []} loading={advisorLoading} onPost={handleGemPost} />
```

Remove the `HiddenGemsSurface` import.

- [ ] **Step 3: Delete the old files**

```bash
git rm src/components/dashboard/HiddenGemsSurface.jsx src/components/dashboard/HiddenGemsSurface.test.jsx
```

- [ ] **Step 4: Drop unused `hiddenGems` from useDashboardSignals**

In `src/hooks/useDashboardSignals.js`, grep for `hiddenGems`. If nothing else consumes the field, remove its derivation and return entry. If something else does, leave it.

- [ ] **Step 5: Run full suite + build**

```
npm run lint
npm run test
npm run build
```
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(advisor): enable listing advisor in prod, retire HiddenGems"
```

---

## Task 15: Open the pull request

- [ ] **Step 1: Push and open PR**

```bash
git push -u origin listing-advisor
gh pr create --title "Listing Advisor v1 (ranker, signals, narrator, UI)" --body "$(cat <<'EOF'
## Summary
- Pure ranker in `src/utils/listingAdvisor/ranker.js` with mode weights (Clearance / Profit / Velocity).
- `useAdvisorSignals` hook composes tires with derived daysSincePriceChange and size+LR avgDaysToSell.
- `advisorNarrate` Firebase callable (Gemini Flash) with 24h Firestore cache.
- Dashboard widget `NextToPostSurface` replaces HiddenGems behind `flags.listingAdvisor`.
- `ListingAdvisorPanel` inside ListingGenerator shows per-SKU rank, signal strip, narrative.
- "Do not list" checkbox on tire detail drawer.

## Test plan
- [ ] `npm run lint` clean
- [ ] `npm run test` full suite passes
- [ ] `npm run build` clean
- [ ] Manual: toggle `VITE_FLAG_LISTING_ADVISOR` in `.env.local`, verify widget swap
- [ ] Manual: expand a row in the Next to Post modal, confirm narrative renders
- [ ] Manual: mark a tire as "Do not list", confirm it disappears from ranked list
EOF
)"
```

- [ ] **Step 2: Wait for CI; merge when green**

```bash
gh pr checks --watch
gh pr merge --squash --delete-branch
```

---

## Self-review notes (post-plan)

**Spec coverage:** Ranker (§ "The Ranker") -> Tasks 1-3. Signals hook (§ "Data: what's needed") -> Tasks 4-5. Narrator callable (§ "The Narrator") -> Tasks 6-7. Dashboard UI (§ "Dashboard widget") -> Tasks 9-11. ListingGenerator panel (§ "ListingGenerator advisor panel") -> Task 12. `doNotList` checkbox (§ "Tire detail drawer") -> Task 13. Rollout (§ "Rollout") -> Tasks 8 and 14.

**Deferred to v2 (explicitly out of scope):** eBay draft write, sparklines, nightly recalc, batch listing queue, velocity bootstrap, platform-specific tone, global mode.

**Known gaps the user should know about:**
- `eBay integration seam` (§ "eBay integration seam") is documented in the spec but v1 does not write `draftListings/{tireId}`. This plan leaves it for v2 since the spec positions the seam as design-only.
- `priceIntel/{size}` read inside `buildPayload` assumes a doc ID equal to size; if the repo uses a different key shape, adjust in Task 7.
- The drawer location for the "Do not list" checkbox is unknown at plan time (Task 13 asks the implementer to grep). This is necessary context the plan author does not have, not a failure.
