# Listing Advisor Dropship Pivot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the `daysInStock` signal from the Listing Advisor (dropship business — there is no physical inventory), rename the Clearance mode to Coverage (crossPost-heavy, so the catalog reaches every demand channel), and replace the unused "days in stock" UI copy.

**Architecture:** Five signals remain — `daysSincePriceChange`, `velocity`, `margin`, `crossPost`, and a new `daysSinceLastListed` (how long since *any* platform last posted this SKU; captures "price wrong or no demand"). Three modes: `COVERAGE`, `PROFIT`, `VELOCITY`. `tireIntakeMs` is kept (it still feeds `computeAvgDaysToSell`); `computeDaysInStock` is deleted. The Firestore `createdAt` backfill stays (already run, 1160/1160).

**Tech Stack:** React 18, Vite, Vitest, Firebase v9 modular SDK. Pure-function ranker; React hook layer.

---

## File Structure

Files touched:

- **`src/utils/listingAdvisor/modeWeights.js`** — remove `daysInStock`, add `daysSinceLastListed`, rename `CLEARANCE`→`COVERAGE`, retune weights.
- **`src/utils/listingAdvisor/ranker.js`** — drop `stockRaw/stockW`, add `staleListingRaw/staleListingW`, update signalBreakdown keys.
- **`src/utils/listingAdvisor/ranker.test.js`** — drop stock tests, add stale-listing + Coverage-mode tests.
- **`src/hooks/useAdvisorSignals.js`** — delete `computeDaysInStock` export + usage; add `computeDaysSinceLastListed`; keep `tireIntakeMs` (used by `computeAvgDaysToSell`).
- **`src/hooks/useAdvisorSignals.test.js`** — drop `computeDaysInStock` tests + `daysInStock` assertions; add `computeDaysSinceLastListed` tests.
- **`src/components/dashboard/NextToPostSurface.jsx`** — SignalStrip: remove "Stock Xd", add "Last posted Xd".
- **`src/components/dashboard/NextToPostSurface.test.jsx`** — update fixtures (drop `daysInStock`, add `daysSinceLastListed`), change `CLEARANCE`→`COVERAGE` in the mode-toggle test.
- **`src/components/tires/ListingAdvisorPanel.jsx`** — replace "In stock Xd" with "Last posted Xd".

No new files. No file deletions.

---

## Task 1: Ranker + modeWeights (unit-tested, pure)

**Files:**
- Modify: `src/utils/listingAdvisor/modeWeights.js`
- Modify: `src/utils/listingAdvisor/ranker.js`
- Test: `src/utils/listingAdvisor/ranker.test.js`

- [ ] **Step 1: Rewrite `ranker.test.js` to drive the new shape**

Replace the whole file with:

```js
// src/utils/listingAdvisor/ranker.test.js
import { describe, it, expect } from 'vitest'
import { rankTires } from './ranker.js'
import { MODE_WEIGHTS, ADVISOR_MODES, DEFAULT_ADVISOR_MODE } from './modeWeights.js'

function tire(overrides = {}) {
  return {
    id: 't1',
    daysSincePriceChange: 30,
    daysSinceLastListed: 10,
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
    const hi = rankTires([tire({ id: 'hi', daysSincePriceChange: 400 })], 'PROFIT')[0]
    expect(hi.signalBreakdown.daysSincePriceChange.raw).toBe(180)
  })

  it('clamps daysSinceLastListed to [0, 180]', () => {
    const hi = rankTires([tire({ id: 'hi', daysSinceLastListed: 400 })], 'COVERAGE')[0]
    expect(hi.signalBreakdown.daysSinceLastListed.raw).toBe(180)
  })

  it('signalBreakdown has no daysInStock key', () => {
    const [r] = rankTires([tire()], 'PROFIT')
    expect(r.signalBreakdown.daysInStock).toBeUndefined()
  })

  it('signalBreakdown weighted values sum to rankScore', () => {
    const [r] = rankTires([tire()], 'PROFIT')
    const sum =
      r.signalBreakdown.daysSincePriceChange.weighted +
      r.signalBreakdown.daysSinceLastListed.weighted +
      r.signalBreakdown.velocity.weighted +
      r.signalBreakdown.margin.weighted +
      r.signalBreakdown.crossPost.weighted
    expect(r.rankScore).toBeCloseTo(sum, 6)
  })

  it('Coverage mode ranks the most-missing-platforms tire first', () => {
    const tires = [
      tire({ id: 'thin_coverage', missingPlatformCount: 3 }),
      tire({ id: 'full_coverage', missingPlatformCount: 0 }),
      tire({ id: 'partial', missingPlatformCount: 1 }),
    ]
    const out = rankTires(tires, 'COVERAGE')
    expect(out[0].id).toBe('thin_coverage')
  })

  it('Profit mode prioritizes margin over staleness', () => {
    const tires = [
      tire({ id: 'fat', daysSincePriceChange: 10, daysSinceLastListed: 10, marginHeadroomPct: 0.6 }),
      tire({ id: 'stale_thin', daysSincePriceChange: 120, daysSinceLastListed: 120, marginHeadroomPct: 0.05 }),
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

  it('throws for legacy CLEARANCE mode (renamed to COVERAGE)', () => {
    expect(() => rankTires([tire()], 'CLEARANCE')).toThrow(/mode/i)
  })

  it('MODE_WEIGHTS is frozen and lists only the 3 dropship modes', () => {
    expect(Object.isFrozen(MODE_WEIGHTS)).toBe(true)
    expect(ADVISOR_MODES).toEqual(['COVERAGE', 'PROFIT', 'VELOCITY'])
    expect(DEFAULT_ADVISOR_MODE).toBe('VELOCITY')
  })
})
```

- [ ] **Step 2: Run tests; expect failure**

Run: `npm run test -- src/utils/listingAdvisor/ranker.test.js`
Expected: FAIL — `CLEARANCE` still in ADVISOR_MODES, `daysInStock` still present, `COVERAGE` unknown, `daysSinceLastListed` not wired.

- [ ] **Step 3: Rewrite `modeWeights.js`**

Replace the file with:

```js
// src/utils/listingAdvisor/modeWeights.js
// Weights are plain numbers so signalBreakdown stays legible. Tuning is one edit.
//
// Signals (dropship model — no physical inventory):
//   daysSincePriceChange   - days since the last priceIntel.sources write
//   daysSinceLastListed    - days since any platform's lastPostedAt (stale catalog SKU)
//   velocity               - 100 / avgDaysToSell for this size+LR (needs >= 3 sample)
//   margin                 - (retail - buy - cts) / retail  (0..1 fraction)
//   crossPost              - count of platforms where the SKU is not actively listed

export const MODE_WEIGHTS = Object.freeze({
  COVERAGE: { daysSincePriceChange: 0.2, daysSinceLastListed: 0.4, velocity: 0.3, margin: 0.0, crossPost: 1.8 },
  PROFIT:   { daysSincePriceChange: 0.4, daysSinceLastListed: 0.3, velocity: 0.6, margin: 1.4, crossPost: 0.5 },
  VELOCITY: { daysSincePriceChange: 0.4, daysSinceLastListed: 0.3, velocity: 1.5, margin: 0.3, crossPost: 0.8 },
})

export const ADVISOR_MODES = Object.freeze(['COVERAGE', 'PROFIT', 'VELOCITY'])

export const DEFAULT_ADVISOR_MODE = 'VELOCITY'
```

- [ ] **Step 4: Rewrite `ranker.js`**

Replace the file with:

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
  const repriceRaw = clampAge(tire.daysSincePriceChange)
  const staleListingRaw = clampAge(tire.daysSinceLastListed)
  const velRaw = velocityUrgency(tire.avgDaysToSell, tire.velocitySampleSize)
  const marginRaw = Number.isFinite(Number(tire.marginHeadroomPct)) ? Number(tire.marginHeadroomPct) : 0
  const crossRaw = Math.max(0, Number(tire.missingPlatformCount) || 0)

  // Margin is expressed as a fraction (0.32 = 32%). Multiply by 100 so the
  // weight scale lines up with the other signals.
  const repriceW = repriceRaw * weights.daysSincePriceChange
  const staleListingW = staleListingRaw * weights.daysSinceLastListed
  const velW = velRaw * weights.velocity
  const marginW = marginRaw * 100 * weights.margin
  const crossW = crossRaw * weights.crossPost

  return {
    rankScore: repriceW + staleListingW + velW + marginW + crossW,
    signalBreakdown: {
      daysSincePriceChange: { raw: repriceRaw, weighted: repriceW },
      daysSinceLastListed: { raw: staleListingRaw, weighted: staleListingW },
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
 * @param {'COVERAGE'|'PROFIT'|'VELOCITY'} mode
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

- [ ] **Step 5: Run tests; expect pass**

Run: `npm run test -- src/utils/listingAdvisor/ranker.test.js`
Expected: PASS (all tests green)

- [ ] **Step 6: Commit**

```bash
git add src/utils/listingAdvisor/modeWeights.js src/utils/listingAdvisor/ranker.js src/utils/listingAdvisor/ranker.test.js
git commit -m "refactor(advisor): drop daysInStock, add daysSinceLastListed, rename CLEARANCE to COVERAGE"
```

---

## Task 2: Hook layer — replace `computeDaysInStock` with `computeDaysSinceLastListed`

**Files:**
- Modify: `src/hooks/useAdvisorSignals.js`
- Test: `src/hooks/useAdvisorSignals.test.js`

- [ ] **Step 1: Update `useAdvisorSignals.test.js`**

Open the file and make these surgical edits:

1. **Remove** the `describe('buildEnrichedTires', ...)` test named `'defaults daysInStock to 0 when tire has no createdAt and no priceIntel'` (around line 176).
2. **Remove** the test `'falls back to earliest priceIntel source when createdAt is missing'` (around line 182) — `daysInStock` no longer exists. (Its fallback intent now only matters for `computeAvgDaysToSell`, which already has coverage via the existing `createdAt` tests — leave those alone.)
3. **In** the `'attaches daysInStock, daysSincePriceChange, velocity, margin, missingPlatformCount'` test (around line 106):
   - Rename the test to `'attaches daysSincePriceChange, daysSinceLastListed, velocity, margin, missingPlatformCount'`.
   - **Delete** the line `expect(enriched.daysInStock).toBe(90)`.
   - **Add** `expect(enriched.daysSinceLastListed).toBe(2)` (facebook's `lastPostedAt` in the fixture is `2026-04-20`, `now` is `2026-04-22`).
   - Leave other assertions untouched.
4. **Add** a new `describe('computeDaysSinceLastListed', ...)` block above `describe('buildEnrichedTires', ...)`:

```js
import {
  computeDaysSincePriceChange,
  computeAvgDaysToSell,
  buildEnrichedTires,
  computeDaysSinceLastListed,
} from './useAdvisorSignals.js'

// ... keep existing ts() helper ...

describe('computeDaysSinceLastListed', () => {
  it('returns days since the most recent platformListings.*.lastPostedAt', () => {
    const now = new Date('2026-04-22T00:00:00Z').getTime()
    const tire = {
      platformListings: {
        facebook: { lastPostedAt: ts('2026-04-12T00:00:00Z') }, // 10 days
        offerup: { lastPostedAt: ts('2026-04-20T00:00:00Z') }, // 2 days — newest
      },
    }
    expect(computeDaysSinceLastListed(tire, now)).toBe(2)
  })

  it('returns null when the SKU has never been posted', () => {
    expect(computeDaysSinceLastListed({}, Date.now())).toBe(null)
    expect(computeDaysSinceLastListed({ platformListings: {} }, Date.now())).toBe(null)
  })

  it('ignores platform entries with missing timestamps', () => {
    const now = new Date('2026-04-22T00:00:00Z').getTime()
    const tire = {
      platformListings: {
        facebook: { lastPostedAt: null },
        offerup: { lastPostedAt: ts('2026-04-15T00:00:00Z') }, // 7 days
      },
    }
    expect(computeDaysSinceLastListed(tire, now)).toBe(7)
  })
})
```

- [ ] **Step 2: Run hook tests; expect failure**

Run: `npm run test -- src/hooks/useAdvisorSignals.test.js`
Expected: FAIL — `computeDaysSinceLastListed` not exported; enriched tire lacks `daysSinceLastListed`.

- [ ] **Step 3: Edit `useAdvisorSignals.js`**

Apply these edits:

1. **Delete** the exported `computeDaysInStock` function (lines ~118–130). Keep `tireIntakeMs` — it's still used by `computeAvgDaysToSell`.
2. **Add** a new exported function (place directly above `buildEnrichedTires`):

```js
/**
 * Days since the SKU was last posted on any platform. `null` when the SKU has
 * never been posted anywhere (dropship catalog item that has never reached a
 * customer-facing listing). Used as a "stale listing" signal: a SKU that was
 * posted a long time ago and never sold suggests the price is wrong or there's
 * no demand in that market.
 */
export function computeDaysSinceLastListed(tire, nowMs) {
  const listings = tire?.platformListings || {}
  let latest = 0
  for (const p of PLATFORMS) {
    const ms = toMillis(listings[p]?.lastPostedAt)
    if (ms && ms > latest) latest = ms
  }
  if (!latest) return null
  const diffDays = Math.floor((nowMs - latest) / MS_PER_DAY)
  return diffDays < 0 ? 0 : diffDays
}
```

3. **Update** `buildEnrichedTires`:
   - Remove the `daysInStock: computeDaysInStock(t, nowMs),` line.
   - Add `daysSinceLastListed: computeDaysSinceLastListed(t, nowMs),` in its place.

- [ ] **Step 4: Run hook tests; expect pass**

Run: `npm run test -- src/hooks/useAdvisorSignals.test.js`
Expected: PASS

- [ ] **Step 5: Run full advisor suite**

Run: `npm run test -- src/utils/listingAdvisor src/hooks/useAdvisorSignals`
Expected: PASS (ranker + hook tests both green)

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useAdvisorSignals.js src/hooks/useAdvisorSignals.test.js
git commit -m "refactor(advisor): replace computeDaysInStock with computeDaysSinceLastListed"
```

---

## Task 3: UI copy — dashboard SignalStrip + ListingAdvisorPanel

**Files:**
- Modify: `src/components/dashboard/NextToPostSurface.jsx`
- Modify: `src/components/dashboard/NextToPostSurface.test.jsx`
- Modify: `src/components/tires/ListingAdvisorPanel.jsx`

- [ ] **Step 1: Update `NextToPostSurface.test.jsx` fixtures**

Open the file, find the `ranked()` fixture (lines ~17–56). In both tire fixtures:

1. **Remove** the `daysInStock: { raw: ..., weighted: ... },` entry from `signalBreakdown`.
2. **Add** `daysSinceLastListed: { raw: 12, weighted: 4.8 },` to tire `t1`.
3. **Add** `daysSinceLastListed: { raw: 3, weighted: 1.2 },` to tire `t2`.

Find the `'mode toggle persists selection to localStorage'` test (around line 88). Change:
- `fireEvent.click(screen.getByRole('tab', { name: /clearance/i }))` → `fireEvent.click(screen.getByRole('tab', { name: /coverage/i }))`
- `expect(...).toBe('CLEARANCE')` → `expect(...).toBe('COVERAGE')`

- [ ] **Step 2: Run surface tests; expect failure**

Run: `npm run test -- src/components/dashboard/NextToPostSurface.test.jsx`
Expected: FAIL — no `coverage` tab role is rendered (still labelled "Clearance").

- [ ] **Step 3: Update `NextToPostSurface.jsx` SignalStrip**

Find the `SignalStrip` component (lines ~65–74). Replace its body with:

```jsx
function SignalStrip({ tire }) {
  const bd = tire.signalBreakdown || {}
  const velDays = bd.velocity?.raw ? `${Math.round(100 / bd.velocity.raw)}d` : 'n/a'
  const listedRaw = bd.daysSinceLastListed?.raw
  const listedLabel = Number.isFinite(listedRaw) && listedRaw > 0 ? `${Math.round(listedRaw)}d` : 'never'
  return (
    <p className="text-[11px] text-zinc-500">
      Last posted {listedLabel} &middot; Repriced {Math.round(bd.daysSincePriceChange?.raw || 0)}d &middot; Vel {velDays} &middot;{' '}
      Margin {formatPercent((bd.margin?.raw || 0) * 100, 0)} &middot; Missing {tire.missingPlatformCount}
    </p>
  )
}
```

- [ ] **Step 4: Run surface tests; expect pass (mode tab now reads "Coverage")**

Since `ADVISOR_MODES` is now `['COVERAGE', 'PROFIT', 'VELOCITY']` and the `ModeToggle` already renders `m.charAt(0) + m.slice(1).toLowerCase()`, the first tab will read "Coverage" automatically. No JSX edit in `ModeToggle` is required.

Run: `npm run test -- src/components/dashboard/NextToPostSurface.test.jsx`
Expected: PASS

- [ ] **Step 5: Update `ListingAdvisorPanel.jsx`**

Find line 68 (`<p className="mt-1 text-[12px] text-zinc-400">`). Replace the paragraph body:

```jsx
<p className="mt-1 text-[12px] text-zinc-400">
  Last posted {Number.isFinite(bd.daysSinceLastListed?.raw) && bd.daysSinceLastListed.raw > 0
    ? `${Math.round(bd.daysSinceLastListed.raw)}d ago`
    : 'never'} &middot; Repriced {Math.round(bd.daysSincePriceChange?.raw || 0)}d ago &middot; Velocity {velDays} &middot;{' '}
  Margin {marginPct} &middot; Missing {tire.missingPlatformCount} platform(s)
</p>
```

- [ ] **Step 6: Run the full test suite**

Run: `npm run test`
Expected: PASS

- [ ] **Step 7: Lint + build smoke check**

Run: `npm run lint && npm run build`
Expected: both clean.

- [ ] **Step 8: Commit**

```bash
git add src/components/dashboard/NextToPostSurface.jsx src/components/dashboard/NextToPostSurface.test.jsx src/components/tires/ListingAdvisorPanel.jsx
git commit -m "refactor(advisor): UI copy — 'Last posted Xd' replaces 'In stock Xd'"
```

---

## Verification (final)

1. `npm run lint` — clean
2. `npm run test` — all vitest suites pass
3. `npm run build` — no Tailwind purge regressions
4. Manual eye-check in dev:
   - Dashboard → Next to Post: three mode tabs read **Coverage / Profit / Velocity**
   - Coverage tab should rank SKUs missing the most platforms first (not the oldest ones)
   - SignalStrip reads `Last posted Xd · Repriced Yd · Vel Zd · Margin W% · Missing N`
   - Tires → Listing Advisor panel: same "Last posted" copy, no "In stock" phrasing
5. Grep sanity: `rg -n 'daysInStock|CLEARANCE|In stock' src/` should return zero matches.

## Out of scope (leave alone)

- `functions/backfillTireCreatedAt.js` — still used; `createdAt` feeds `computeAvgDaysToSell` via `tireIntakeMs`.
- Backend `advisorNarrate` — the narrative model can still reference missing/stale signals; it reads `signalBreakdown` generically. Audit only if a test fails.
- HiddenGemsSurface rollout (Task 14 in the parent plan) — unrelated.
