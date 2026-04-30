# Brand stats card + Dashboard hero strip — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship per-brand portfolio aggregates as two surfaces sharing a single selector — a tab-style pill row above `MarginTable` (replacing the existing `<select>` brand chip in `MarginFilters`), and a hero strip on the Dashboard. Bundle three small tech-debt extractions in the same PR.

**Architecture:** New module `src/constants/tireCategory.js` for the `'passenger' | 'lightTruck' | 'truck'` triple + labels. New `useCategoryMap` hook for the slim `meta/categoryMap` reader. New `useBrandAggregates` selector that returns `{ total, brands[], missingBrands[] }`. Two new components consume the selector. `MarginFilters` drops the brand `<select>`.

**Tech Stack:** React 19, Tailwind v4, Vitest + `@testing-library/react`, Firestore Web SDK on client.

**Spec:** `docs/superpowers/specs/2026-04-30-brand-aggregates-design.md`

**Worktree:** `.claude/worktrees/brand-aggregates` (branch `brand-aggregates`)

---

## File map

| File | Change | Responsibility |
|---|---|---|
| `src/constants/tireCategory.js` | Create | Export `TIRE_CATEGORY_KEYS` + `CATEGORY_LABELS` + `EXPECTED_BRANDS` |
| `src/constants/tireCategory.test.js` | Create | Sanity unit test |
| `src/hooks/useCategoryMap.js` | Create | Slim reader for `meta/categoryMap` doc |
| `src/hooks/useCategoryMap.test.js` | Create | Hook unit test (no live Firestore — mocked snapshot) |
| `src/hooks/useBrandAggregates.js` | Create | Per-brand aggregate selector |
| `src/hooks/useBrandAggregates.test.js` | Create | Selector unit tests |
| `src/components/tires/BrandStatsRow.jsx` | Create | Pill-row component above `MarginTable` |
| `src/components/tires/BrandStatsRow.test.jsx` | Create | Component tests |
| `src/components/dashboard/BrandTierStrip.jsx` | Create | Dashboard hero strip widget |
| `src/components/dashboard/BrandTierStrip.test.jsx` | Create | Component tests |
| `src/components/tires/MarginFilters.jsx` | Modify | Drop `<InlineBrand>` + the `brands`/`brand`/`onBrand` props |
| `src/components/tires/TiresDashboard.jsx` | Modify | Mount `<BrandStatsRow>`; thread aggregates; switch to `TIRE_CATEGORY_KEYS` |
| `src/components/dashboard/Dashboard.jsx` | Modify | Mount `<BrandTierStrip>` near top |
| `src/components/tires/CategoryTabs.jsx` | Modify | Use `TIRE_CATEGORY_KEYS` instead of inline triple |
| `src/hooks/useDashboardSignals.js` | Modify | Delegate `categoryMap` read to `useCategoryMap`; use `TIRE_CATEGORY_KEYS` |
| `src/components/tires/MarginTable.jsx` | Modify | Drop `TireDescriptionCellForTest` export |
| `src/components/tires/MarginTable.test.jsx` | Modify | Switch test import to `vi.importActual` |

---

## Task 1: Extract `TIRE_CATEGORY_KEYS` constant module

**Files:**
- Create: `src/constants/tireCategory.js`
- Create: `src/constants/tireCategory.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/constants/tireCategory.test.js`:

```js
import { describe, expect, it } from 'vitest'
import {
  TIRE_CATEGORY_KEYS,
  CATEGORY_LABELS,
  EXPECTED_BRANDS,
} from './tireCategory.js'

describe('tireCategory constants', () => {
  it('exposes the three keys in stable order', () => {
    expect(TIRE_CATEGORY_KEYS).toEqual(['passenger', 'lightTruck', 'truck'])
  })

  it('every key has a label', () => {
    for (const k of TIRE_CATEGORY_KEYS) {
      expect(typeof CATEGORY_LABELS[k]).toBe('string')
      expect(CATEGORY_LABELS[k].length).toBeGreaterThan(0)
    }
  })

  it('exposes the three Loveland-account brands', () => {
    expect(EXPECTED_BRANDS).toEqual(['MICHELIN', 'BFGOODRICH', 'UNIROYAL'])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd .claude/worktrees/brand-aggregates && npx vitest run src/constants/tireCategory.test.js`

Expected: failures because the module does not exist.

- [ ] **Step 3: Create the module**

Create `src/constants/tireCategory.js`:

```js
/**
 * Canonical tire category keys + display labels. Source of truth for the
 * 'passenger' | 'lightTruck' | 'truck' triple that previously lived inline
 * across CategoryTabs.jsx, TiresDashboard.jsx, and useDashboardSignals.js.
 *
 * Adding a new category (e.g. OTR):
 *   1. Append to TIRE_CATEGORY_KEYS in the order it should appear in tabs.
 *   2. Add the human label to CATEGORY_LABELS.
 *   3. Update the meta/categoryMap importer (scripts/import-efleet.mjs) to
 *      emit the new category for matching MSPNs.
 */

/** @type {ReadonlyArray<'passenger' | 'lightTruck' | 'truck'>} */
export const TIRE_CATEGORY_KEYS = ['passenger', 'lightTruck', 'truck']

/** @type {Record<string, string>} */
export const CATEGORY_LABELS = {
  passenger: 'Passenger',
  lightTruck: 'Light Truck',
  truck: 'Truck',
}

/**
 * Brands the Skedaddle Loveland account stocks (per Michelin eFleet). Used
 * by `useBrandAggregates` to surface a NOT STOCKED warning when one of these
 * drops to zero in the catalog.
 */
export const EXPECTED_BRANDS = ['MICHELIN', 'BFGOODRICH', 'UNIROYAL']
```

- [ ] **Step 4: Run tests**

Run: `cd .claude/worktrees/brand-aggregates && npx vitest run src/constants/tireCategory.test.js`

Expected: 3/3 pass.

- [ ] **Step 5: Commit**

```bash
cd .claude/worktrees/brand-aggregates
git add src/constants/tireCategory.js src/constants/tireCategory.test.js
git commit -m "feat(constants): tireCategory module + EXPECTED_BRANDS

Pulls the 'passenger' | 'lightTruck' | 'truck' triple and the three
Loveland-account brand strings into a single source of truth.
Consumers swap their inline literals in subsequent tasks."
```

---

## Task 2: Replace inline `'passenger' | 'lightTruck' | 'truck'` references

**Files:**
- Modify: `src/components/tires/CategoryTabs.jsx`
- Modify: `src/components/tires/TiresDashboard.jsx:242`
- Modify: `src/hooks/useDashboardSignals.js`

- [ ] **Step 1: CategoryTabs**

In `src/components/tires/CategoryTabs.jsx` near the top of the file, find:

```jsx
const CATEGORY_TABS = [
  { key: 'all',         label: 'All' },
  { key: 'passenger',   label: 'Passenger' },
  { key: 'lightTruck',  label: 'Light Truck' },
  { key: 'truck',       label: 'Truck' },
]
```

Replace with:

```jsx
import { TIRE_CATEGORY_KEYS, CATEGORY_LABELS } from '../../constants/tireCategory.js'

const CATEGORY_TABS = [
  { key: 'all', label: 'All' },
  ...TIRE_CATEGORY_KEYS.map((key) => ({ key, label: CATEGORY_LABELS[key] })),
]
```

- [ ] **Step 2: TiresDashboard line 242**

Open `src/components/tires/TiresDashboard.jsx`. At the top with the other imports, add:

```jsx
import { TIRE_CATEGORY_KEYS } from '../../constants/tireCategory.js'
```

Find line ~242:

```jsx
    return ['passenger', 'lightTruck', 'truck'].includes(fromUrl) ? fromUrl : 'all'
```

Replace with:

```jsx
    return TIRE_CATEGORY_KEYS.includes(fromUrl) ? fromUrl : 'all'
```

- [ ] **Step 3: useDashboardSignals**

In `src/hooks/useDashboardSignals.js`, find both branches that test `=== 'passenger' || === 'lightTruck' || === 'truck'` (around lines 63 and 67). Add at the top of the file:

```jsx
import { TIRE_CATEGORY_KEYS } from '../constants/tireCategory.js'
```

Replace each `(v === 'passenger' || v === 'lightTruck' || v === 'truck')` form with `TIRE_CATEGORY_KEYS.includes(v)`. Note: the `selectCategoryForTire` JSDoc strings (lines 33, 57-58) reference the literal triple — leave the JSDoc strings alone (purely documentation; if they drift it's harmless, and JSDoc tooling can't import the constant).

- [ ] **Step 4: Run vitest**

Run: `cd .claude/worktrees/brand-aggregates && npx vitest run src/`

Expected: all tests pass with no churn from these refactors.

- [ ] **Step 5: Commit**

```bash
cd .claude/worktrees/brand-aggregates
git add src/components/tires/CategoryTabs.jsx src/components/tires/TiresDashboard.jsx src/hooks/useDashboardSignals.js
git commit -m "refactor(tires): consume TIRE_CATEGORY_KEYS instead of inline triple

CategoryTabs, TiresDashboard, and useDashboardSignals now share the
constant module. Adding a new category becomes a one-file change."
```

---

## Task 3: Slim `useCategoryMap` hook

**Files:**
- Create: `src/hooks/useCategoryMap.js`
- Create: `src/hooks/useCategoryMap.test.js`
- Modify: `src/hooks/useDashboardSignals.js` (delegate to the new hook)

- [ ] **Step 1: Write the failing test**

Create `src/hooks/useCategoryMap.test.js`:

```jsx
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

vi.mock('../firebase/config', () => ({ db: {} }))

const onSnapshotMock = vi.fn()
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({})),
  onSnapshot: (...args) => onSnapshotMock(...args),
}))

import { useCategoryMap } from './useCategoryMap.js'

beforeEach(() => {
  onSnapshotMock.mockReset()
})

describe('useCategoryMap', () => {
  it('starts with null map and loading=true', () => {
    onSnapshotMock.mockImplementation(() => () => {}) // never fires
    const { result } = renderHook(() => useCategoryMap())
    expect(result.current.categoryMap).toBeNull()
    expect(result.current.loading).toBe(true)
  })

  it('emits the snapshot data when Firestore fires', async () => {
    let cb
    onSnapshotMock.mockImplementation((_ref, next) => {
      cb = next
      return () => {}
    })
    const { result } = renderHook(() => useCategoryMap())
    cb({
      exists: () => true,
      data: () => ({ mspns: { '54802': 'lightTruck' }, importedAt: 123 }),
    })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.categoryMap).toEqual({
      mspns: { '54802': 'lightTruck' },
      importedAt: 123,
    })
  })

  it('handles missing doc gracefully', async () => {
    let cb
    onSnapshotMock.mockImplementation((_ref, next) => {
      cb = next
      return () => {}
    })
    const { result } = renderHook(() => useCategoryMap())
    cb({ exists: () => false })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.categoryMap).toBeNull()
  })
})
```

- [ ] **Step 2: Verify failure**

Run: `cd .claude/worktrees/brand-aggregates && npx vitest run src/hooks/useCategoryMap.test.js`

Expected: failures (module missing).

- [ ] **Step 3: Implement the hook**

Create `src/hooks/useCategoryMap.js`:

```jsx
import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase/config'

/**
 * Live reader for `meta/categoryMap`. Returns `{ categoryMap, loading }`.
 *
 * `categoryMap` is `null` when the doc is missing or before the first
 * snapshot lands. Otherwise it's the doc's `data()` shape:
 * `{ mspns: Record<string, 'passenger' | 'lightTruck' | 'truck'>, importedAt, ... }`.
 *
 * Extracted from `useDashboardSignals` so consumers that only need this slice
 * do not pay for the rest of the dashboard data load.
 */
export function useCategoryMap() {
  const [categoryMap, setCategoryMap] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const ref = doc(db, 'meta', 'categoryMap')
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setCategoryMap(snap.exists() ? snap.data() || null : null)
        setLoading(false)
      },
      (err) => {
        console.error('useCategoryMap snapshot error', err)
        setLoading(false)
      },
    )
    return () => unsub()
  }, [])

  return { categoryMap, loading }
}
```

- [ ] **Step 4: Re-run test**

Run: `cd .claude/worktrees/brand-aggregates && npx vitest run src/hooks/useCategoryMap.test.js`

Expected: 3/3 pass.

- [ ] **Step 5: Delegate from useDashboardSignals**

Open `src/hooks/useDashboardSignals.js`. Locate the `categoryMap` state + the `useEffect` that calls `getDoc(doc(db, 'meta', 'categoryMap'))` (around line 596). Replace the existing one-shot read + state pair with a `useCategoryMap()` call. Concretely:

Add to imports near the top:

```jsx
import { useCategoryMap } from './useCategoryMap'
```

Find:

```jsx
  const [categoryMap, setCategoryMap] = useState(/* initial */)
```

Replace with:

```jsx
  const { categoryMap } = useCategoryMap()
```

Find the `useEffect` block that runs `getDoc(doc(db, 'meta', 'categoryMap'))` and writes to `setCategoryMap`. Delete it entirely. Also remove the now-unused `getDoc` and `doc` imports IF (and only if) no other code in the file uses them. Run `grep -n "getDoc\|doc(db" src/hooks/useDashboardSignals.js` to verify before deleting any imports.

- [ ] **Step 6: Run vitest**

Run: `cd .claude/worktrees/brand-aggregates && npx vitest run src/`

Expected: all tests pass. The `useDashboardSignals` test (if any) should still pass because the public return shape stays the same.

- [ ] **Step 7: Commit**

```bash
cd .claude/worktrees/brand-aggregates
git add src/hooks/useCategoryMap.js src/hooks/useCategoryMap.test.js src/hooks/useDashboardSignals.js
git commit -m "refactor(hooks): extract useCategoryMap from useDashboardSignals

Slim live-reader hook for meta/categoryMap. useDashboardSignals
delegates instead of doing its own getDoc; consumers that only need
the category map (TiresDashboard via brand aggregates in a follow-up
task) can import useCategoryMap directly without paying for the rest
of the dashboard data load."
```

---

## Task 4: `useBrandAggregates` selector

**Files:**
- Create: `src/hooks/useBrandAggregates.js`
- Create: `src/hooks/useBrandAggregates.test.js`

- [ ] **Step 1: Write the failing tests**

Create `src/hooks/useBrandAggregates.test.js`:

```jsx
import { describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useBrandAggregates } from './useBrandAggregates.js'

const mkTire = (overrides) => ({
  id: 'T1',
  brand: 'MICHELIN',
  category: 'passenger',
  priceIntel: { retailPrice: 200, retailSource: 'gemini' },
  price: 100,
  offProgramAt: null,
  ...overrides,
})

describe('useBrandAggregates', () => {
  it('returns empty shape for empty input', () => {
    const { result } = renderHook(() => useBrandAggregates([], null))
    expect(result.current.total).toBe(0)
    expect(result.current.brands).toEqual([])
    expect(result.current.missingBrands).toEqual([
      'MICHELIN', 'BFGOODRICH', 'UNIROYAL',
    ])
  })

  it('counts tires per brand and sorts by count descending', () => {
    const tires = [
      mkTire({ id: '1', brand: 'MICHELIN' }),
      mkTire({ id: '2', brand: 'MICHELIN' }),
      mkTire({ id: '3', brand: 'BFGOODRICH' }),
    ]
    const { result } = renderHook(() => useBrandAggregates(tires, null))
    expect(result.current.total).toBe(3)
    expect(result.current.brands.map((b) => b.brand)).toEqual([
      'MICHELIN', 'BFGOODRICH',
    ])
    expect(result.current.brands[0].count).toBe(2)
    expect(result.current.brands[1].count).toBe(1)
    expect(result.current.missingBrands).toEqual(['UNIROYAL'])
  })

  it('normalizes brand strings (uppercase + trim, BFG -> BFGOODRICH)', () => {
    const tires = [
      mkTire({ id: '1', brand: 'bfg' }),
      mkTire({ id: '2', brand: '  Michelin  ' }),
      mkTire({ id: '3', brand: 'BFGoodrich' }),
    ]
    const { result } = renderHook(() => useBrandAggregates(tires, null))
    const buckets = Object.fromEntries(result.current.brands.map((b) => [b.brand, b.count]))
    expect(buckets.MICHELIN).toBe(1)
    expect(buckets.BFGOODRICH).toBe(2)
  })

  it('avg listing margin uses researched-only retails', () => {
    const tires = [
      // Researched retail $200, buy $100 -> listing margin 50%
      mkTire({ id: '1', brand: 'MICHELIN', price: 100, priceIntel: { retailPrice: 200, retailSource: 'gemini' } }),
      // Estimated retail -- excluded from margin avg
      mkTire({ id: '2', brand: 'MICHELIN', price: 100, priceIntel: { retailPrice: 150, retailSource: 'estimate' } }),
      // Researched retail $300, buy $100 -> margin 66.67%
      mkTire({ id: '3', brand: 'MICHELIN', price: 100, priceIntel: { retailPrice: 300, retailSource: 'gemini' } }),
    ]
    const { result } = renderHook(() => useBrandAggregates(tires, null))
    const m = result.current.brands[0]
    expect(m.count).toBe(3)
    // (50 + 66.666...) / 2 ~= 58.33
    expect(m.avgListingMarginPct).toBeCloseTo(58.33, 1)
    expect(m.avgResearchedRetail).toBe(250)
  })

  it('reports null avgs when brand has zero researched retails', () => {
    const tires = [
      mkTire({ id: '1', brand: 'UNIROYAL', priceIntel: { retailPrice: null } }),
      mkTire({ id: '2', brand: 'UNIROYAL', priceIntel: {} }),
    ]
    const { result } = renderHook(() => useBrandAggregates(tires, null))
    const u = result.current.brands.find((b) => b.brand === 'UNIROYAL')
    expect(u.count).toBe(2)
    expect(u.avgListingMarginPct).toBeNull()
    expect(u.avgResearchedRetail).toBeNull()
  })

  it('counts off-program and missing-research per brand', () => {
    const tires = [
      mkTire({ id: '1', brand: 'MICHELIN', offProgramAt: 'ts', priceIntel: { retailPrice: 100, retailSource: 'gemini' } }),
      mkTire({ id: '2', brand: 'MICHELIN', priceIntel: { retailPrice: null } }),
      mkTire({ id: '3', brand: 'MICHELIN', priceIntel: { retailPrice: 100, retailSource: 'gemini' } }),
    ]
    const { result } = renderHook(() => useBrandAggregates(tires, null))
    const m = result.current.brands[0]
    expect(m.offProgramCount).toBe(1)
    expect(m.missingRetailResearchCount).toBe(1)
  })

  it('scopes by category when provided', () => {
    const tires = [
      mkTire({ id: '1', brand: 'MICHELIN', category: 'passenger' }),
      mkTire({ id: '2', brand: 'MICHELIN', category: 'truck' }),
      mkTire({ id: '3', brand: 'BFGOODRICH', category: 'passenger' }),
    ]
    const { result } = renderHook(() =>
      useBrandAggregates(tires, 'passenger'),
    )
    expect(result.current.total).toBe(2)
    expect(result.current.brands.find((b) => b.brand === 'MICHELIN').count).toBe(1)
    expect(result.current.brands.find((b) => b.brand === 'BFGOODRICH').count).toBe(1)
    expect(result.current.missingBrands).toEqual(['UNIROYAL'])
  })

  it('groups untyped/empty brand under (unknown) but only emits when count > 0', () => {
    const tires = [
      mkTire({ id: '1', brand: 'MICHELIN' }),
      mkTire({ id: '2', brand: '' }),
      mkTire({ id: '3', brand: null }),
    ]
    const { result } = renderHook(() => useBrandAggregates(tires, null))
    const unknown = result.current.brands.find((b) => b.brand === '(unknown)')
    expect(unknown.count).toBe(2)
  })
})
```

- [ ] **Step 2: Verify failure**

Run: `cd .claude/worktrees/brand-aggregates && npx vitest run src/hooks/useBrandAggregates.test.js`

- [ ] **Step 3: Implement the selector**

Create `src/hooks/useBrandAggregates.js`:

```jsx
import { useMemo } from 'react'
import { EXPECTED_BRANDS } from '../constants/tireCategory.js'
import { tireRetailIsResearched } from '../utils/tireCatalogRetail.js'
import { computeListingMargin } from '../utils/marginCalc.js'

/**
 * Normalize brand strings: trim, uppercase, alias BFG -> BFGOODRICH.
 * Empty / null / undefined collapse to '(unknown)' so they bucket together.
 *
 * @param {unknown} raw
 * @returns {string}
 */
function normalizeBrand(raw) {
  const s = String(raw ?? '').trim().toUpperCase()
  if (!s) return '(unknown)'
  if (s === 'BFG') return 'BFGOODRICH'
  if (s === 'BFGOODRICH') return 'BFGOODRICH'
  return s
}

/**
 * @typedef {Object} BrandAggregate
 * @property {string} brand
 * @property {number} count
 * @property {number | null} avgListingMarginPct
 * @property {number | null} avgResearchedRetail
 * @property {number} offProgramCount
 * @property {number} missingRetailResearchCount
 */

/**
 * Per-brand portfolio aggregates, optionally scoped to a tire category.
 *
 * @param {Array<Record<string, unknown>>} tires    Enriched tire docs
 * @param {string | null}                  category 'passenger' | 'lightTruck' | 'truck' | null (all)
 * @returns {{
 *   total: number,
 *   brands: Array<BrandAggregate>,
 *   missingBrands: Array<string>,
 * }}
 */
export function useBrandAggregates(tires, category) {
  return useMemo(() => {
    const accum = new Map()
    let total = 0

    for (const tire of Array.isArray(tires) ? tires : []) {
      if (category && tire?.category !== category) continue
      total += 1
      const brand = normalizeBrand(tire?.brand)
      let bucket = accum.get(brand)
      if (!bucket) {
        bucket = {
          brand,
          count: 0,
          marginSum: 0,
          marginN: 0,
          retailSum: 0,
          retailN: 0,
          offProgramCount: 0,
          missingRetailResearchCount: 0,
        }
        accum.set(brand, bucket)
      }
      bucket.count += 1
      if (tire?.offProgramAt) bucket.offProgramCount += 1
      if (tireRetailIsResearched(tire)) {
        const retail = Number(tire?.priceIntel?.retailPrice)
        if (Number.isFinite(retail) && retail > 0) {
          bucket.retailSum += retail
          bucket.retailN += 1
        }
        const margin = computeListingMargin(tire)
        if (Number.isFinite(margin)) {
          bucket.marginSum += margin
          bucket.marginN += 1
        }
      } else {
        bucket.missingRetailResearchCount += 1
      }
    }

    const brands = [...accum.values()]
      .map((b) => ({
        brand: b.brand,
        count: b.count,
        avgListingMarginPct: b.marginN > 0 ? b.marginSum / b.marginN : null,
        avgResearchedRetail: b.retailN > 0 ? b.retailSum / b.retailN : null,
        offProgramCount: b.offProgramCount,
        missingRetailResearchCount: b.missingRetailResearchCount,
      }))
      .sort((a, b) => b.count - a.count || a.brand.localeCompare(b.brand))

    const stockedBrandSet = new Set(brands.filter((b) => b.count > 0).map((b) => b.brand))
    const missingBrands = EXPECTED_BRANDS.filter((b) => !stockedBrandSet.has(b))

    return { total, brands, missingBrands }
  }, [tires, category])
}
```

- [ ] **Step 4: Re-run tests**

Run: `cd .claude/worktrees/brand-aggregates && npx vitest run src/hooks/useBrandAggregates.test.js`

Expected: 8/8 pass.

- [ ] **Step 5: Commit**

```bash
cd .claude/worktrees/brand-aggregates
git add src/hooks/useBrandAggregates.js src/hooks/useBrandAggregates.test.js
git commit -m "feat(hooks): useBrandAggregates per-brand selector

Single-pass O(n) selector returning {total, brands[], missingBrands[]}.
Brand strings are normalized (BFG -> BFGOODRICH, uppercase, trim;
empty -> '(unknown)'). Avg margin and avg retail count only researched-
retail tires; estimated retails are excluded so noise from catalog-
median estimates does not skew the brand-level numbers.

Off-program and missing-retail-research counts surface inventory and
sourcing health per brand."
```

---

## Task 5: `BrandStatsRow` component

**Files:**
- Create: `src/components/tires/BrandStatsRow.jsx`
- Create: `src/components/tires/BrandStatsRow.test.jsx`

- [ ] **Step 1: Write the failing tests**

Create `src/components/tires/BrandStatsRow.test.jsx`:

```jsx
/** @vitest-environment jsdom */
import { describe, expect, it, vi, afterEach } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import { BrandStatsRow } from './BrandStatsRow.jsx'

afterEach(cleanup)

const sample = {
  total: 1228,
  brands: [
    { brand: 'MICHELIN', count: 627, avgListingMarginPct: 22.6, avgResearchedRetail: 280, offProgramCount: 0, missingRetailResearchCount: 12 },
    { brand: 'BFGOODRICH', count: 390, avgListingMarginPct: 19.4, avgResearchedRetail: 230, offProgramCount: 0, missingRetailResearchCount: 8 },
    { brand: 'UNIROYAL', count: 211, avgListingMarginPct: 17.1, avgResearchedRetail: 110, offProgramCount: 0, missingRetailResearchCount: 5 },
  ],
}

describe('BrandStatsRow', () => {
  it('renders the All pill plus a pill per brand', () => {
    const { container } = render(
      <BrandStatsRow brands={sample.brands} total={sample.total} selectedBrand={null} onBrandChange={() => {}} />
    )
    const pills = container.querySelectorAll('[role="tab"]')
    expect(pills).toHaveLength(4)
    expect(pills[0].textContent).toContain('All')
    expect(pills[0].textContent).toContain('1228')
  })

  it('marks the All pill aria-selected when selectedBrand is null', () => {
    const { container } = render(
      <BrandStatsRow brands={sample.brands} total={sample.total} selectedBrand={null} onBrandChange={() => {}} />
    )
    const pills = container.querySelectorAll('[role="tab"]')
    expect(pills[0].getAttribute('aria-selected')).toBe('true')
    expect(pills[1].getAttribute('aria-selected')).toBe('false')
  })

  it('marks the matching brand pill aria-selected when selectedBrand is set', () => {
    const { container } = render(
      <BrandStatsRow brands={sample.brands} total={sample.total} selectedBrand="BFGOODRICH" onBrandChange={() => {}} />
    )
    const pills = container.querySelectorAll('[role="tab"]')
    expect(pills[0].getAttribute('aria-selected')).toBe('false')
    const bfg = [...pills].find((p) => p.textContent.includes('BFGOODRICH'))
    expect(bfg.getAttribute('aria-selected')).toBe('true')
  })

  it('clicking a brand pill calls onBrandChange with the brand name', () => {
    const spy = vi.fn()
    const { container } = render(
      <BrandStatsRow brands={sample.brands} total={sample.total} selectedBrand={null} onBrandChange={spy} />
    )
    const michelin = [...container.querySelectorAll('[role="tab"]')]
      .find((p) => p.textContent.includes('MICHELIN'))
    fireEvent.click(michelin)
    expect(spy).toHaveBeenCalledWith('MICHELIN')
  })

  it('clicking the All pill calls onBrandChange(null)', () => {
    const spy = vi.fn()
    const { container } = render(
      <BrandStatsRow brands={sample.brands} total={sample.total} selectedBrand="MICHELIN" onBrandChange={spy} />
    )
    const all = container.querySelector('[role="tab"]')
    fireEvent.click(all)
    expect(spy).toHaveBeenCalledWith(null)
  })

  it('clicking the already-selected pill does NOT call onBrandChange', () => {
    const spy = vi.fn()
    const { container } = render(
      <BrandStatsRow brands={sample.brands} total={sample.total} selectedBrand="MICHELIN" onBrandChange={spy} />
    )
    const michelin = [...container.querySelectorAll('[role="tab"]')]
      .find((p) => p.textContent.includes('MICHELIN'))
    fireEvent.click(michelin)
    expect(spy).not.toHaveBeenCalled()
  })

  it('uses role=tablist on the container', () => {
    const { container } = render(
      <BrandStatsRow brands={sample.brands} total={sample.total} selectedBrand={null} onBrandChange={() => {}} />
    )
    expect(container.querySelector('[role="tablist"]')).not.toBeNull()
  })
})
```

- [ ] **Step 2: Verify failure**

Run: `cd .claude/worktrees/brand-aggregates && npx vitest run src/components/tires/BrandStatsRow.test.jsx`

- [ ] **Step 3: Implement the component**

Create `src/components/tires/BrandStatsRow.jsx`:

```jsx
import { brandColorCssVar } from '../../utils/brandColor.js'

/**
 * Tab-style pill row of brand aggregates above the catalog table. Clicking
 * a pill sets the brand filter; clicking the leading All pill clears it.
 * Click on the already-selected pill is a no-op (matches CategoryTabs).
 */
export function BrandStatsRow({
  brands,
  total,
  selectedBrand,
  onBrandChange,
}) {
  const items = [
    { brand: null, label: 'All', count: total, color: 'var(--color-zinc-300)' },
    ...brands.map((b) => ({
      brand: b.brand,
      label: b.brand,
      count: b.count,
      avgListingMarginPct: b.avgListingMarginPct,
      color: brandColorCssVar(b.brand),
    })),
  ]
  return (
    <div
      role="tablist"
      aria-label="Brand filter"
      className="flex flex-nowrap gap-2 overflow-x-auto scroll-smooth py-2 [scroll-snap-type:x_mandatory] sm:flex-wrap sm:overflow-visible"
    >
      {items.map((it) => {
        const selected = it.brand === selectedBrand
        const handleClick = () => {
          if (selected) return
          onBrandChange(it.brand)
        }
        const activeStyle = selected
          ? {
              borderColor: it.color,
              color: it.color,
              backgroundColor: `color-mix(in oklab, ${it.color} 18%, transparent)`,
            }
          : { borderColor: it.color, color: it.color }
        return (
          <button
            key={it.label}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={handleClick}
            style={activeStyle}
            className={`inline-flex shrink-0 [scroll-snap-align:start] flex-col gap-0.5 rounded-lg border px-3 py-1.5 text-left transition-transform hover:-translate-y-px ${
              selected ? 'font-semibold shadow-sm' : 'font-medium'
            }`}
          >
            <span className="text-[11px] uppercase tracking-wide leading-none">{it.label}</span>
            <span className="font-mono text-base leading-none tabular-nums">{it.count}</span>
            {it.avgListingMarginPct != null ? (
              <span className="hidden text-[10px] font-normal opacity-80 leading-none sm:block">
                {it.avgListingMarginPct.toFixed(1)}% avg margin
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 4: Re-run tests**

Run: `cd .claude/worktrees/brand-aggregates && npx vitest run src/components/tires/BrandStatsRow.test.jsx`

Expected: 7/7 pass.

- [ ] **Step 5: Commit**

```bash
cd .claude/worktrees/brand-aggregates
git add src/components/tires/BrandStatsRow.jsx src/components/tires/BrandStatsRow.test.jsx
git commit -m "feat(tires): BrandStatsRow tab-pill row

Renders an All pill plus one pill per brand from useBrandAggregates.
Active pill highlights via color-mix(in oklab, brand-color, 18%) and
brand-color text. Mobile (<sm) drops the secondary margin line and
horizontally scroll-snaps. Click contract matches CategoryTabs:
clicking the active pill does nothing; All clears the filter."
```

---

## Task 6: Mount `BrandStatsRow` in `TiresDashboard`; drop `<InlineBrand>` from `MarginFilters`

**Files:**
- Modify: `src/components/tires/MarginFilters.jsx`
- Modify: `src/components/tires/TiresDashboard.jsx`

- [ ] **Step 1: Drop `<InlineBrand>` from MarginFilters**

In `src/components/tires/MarginFilters.jsx`:

1. Remove `brands`, `brand`, `onBrand` from the destructured `MarginFilters` props.
2. Delete the `<InlineBrand value={brand} onChange={onBrand} options={brands} />` JSX.
3. Delete the `InlineBrand` function definition (it's only used by this file).

Verify the row 1 markup still parses cleanly with one fewer flex item; if the spacing looks off, adjust the wrapper's flex utilities. Existing test snapshots in `MarginFilters.test.jsx` (if any) will need regen via `npx vitest run -u`.

- [ ] **Step 2: Wire BrandStatsRow into TiresDashboard**

In `src/components/tires/TiresDashboard.jsx`:

Add to imports near the top:

```jsx
import { useBrandAggregates } from '../../hooks/useBrandAggregates.js'
import { BrandStatsRow } from './BrandStatsRow.jsx'
```

Just below the line that builds `enriched` (search for the closing of the `enriched` `useMemo`), add:

```jsx
  const brandAggregates = useBrandAggregates(enriched, selectedCategory === 'all' ? null : selectedCategory)
```

Find the `<MarginFilters ... />` JSX. Above it (still inside the same flex column), insert:

```jsx
  <BrandStatsRow
    brands={brandAggregates.brands}
    total={brandAggregates.total}
    selectedBrand={brand}
    onBrandChange={onBrand}
  />
```

In the `<MarginFilters ... />` props, remove:
- `brands={brands}` (or whatever the current variable name is)
- `brand={brand}`
- `onBrand={onBrand}`

Keep all other props.

- [ ] **Step 3: Run vitest**

Run: `cd .claude/worktrees/brand-aggregates && npx vitest run src/`

Expected: tests pass. If snapshots need updating because `<MarginFilters>` markup changed, run `npx vitest run -u src/components/tires/` and inspect the diff. The expected change is the disappearance of the `<select>` brand chip from row 1; nothing else should differ.

- [ ] **Step 4: Manual smoke test**

Run: `cd .claude/worktrees/brand-aggregates && npm run dev`

On the Tires page:
- The brand `<select>` chip is gone from MarginFilters.
- A row of pills sits above MarginFilters: `[All]  [MICHELIN]  [BFGOODRICH]  [UNIROYAL]`.
- Clicking a brand pill filters the table (assert by row count or first row's brand).
- Clicking `All` clears.
- Clicking the active pill does nothing.
- Switching category tabs (Passenger / Light Truck / Truck) updates the pill counts to match in-category counts.

- [ ] **Step 5: Commit**

```bash
cd .claude/worktrees/brand-aggregates
git add src/components/tires/MarginFilters.jsx src/components/tires/TiresDashboard.jsx
git commit -m "feat(tires): mount BrandStatsRow above catalog; drop brand select

BrandStatsRow takes over the brand-filter responsibility from the
<select> chip in MarginFilters row 1. The pill row sits above the
filter card so brand mix is visible without opening filters. Counts
react to the selected category tab (Passenger / LT / Truck)."
```

---

## Task 7: `BrandTierStrip` component (Dashboard hero strip)

**Files:**
- Create: `src/components/dashboard/BrandTierStrip.jsx`
- Create: `src/components/dashboard/BrandTierStrip.test.jsx`
- Modify: `src/components/dashboard/Dashboard.jsx`

- [ ] **Step 1: Write the failing tests**

Create `src/components/dashboard/BrandTierStrip.test.jsx`:

```jsx
/** @vitest-environment jsdom */
import { describe, expect, it, vi, afterEach } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import { BrandTierStrip } from './BrandTierStrip.jsx'

afterEach(cleanup)

const aggregates = {
  total: 1228,
  brands: [
    { brand: 'MICHELIN', count: 627, avgListingMarginPct: 22.6, avgResearchedRetail: 280, offProgramCount: 0, missingRetailResearchCount: 12 },
    { brand: 'BFGOODRICH', count: 390, avgListingMarginPct: 19.4, avgResearchedRetail: 230, offProgramCount: 0, missingRetailResearchCount: 8 },
    { brand: 'UNIROYAL', count: 211, avgListingMarginPct: 17.1, avgResearchedRetail: 110, offProgramCount: 0, missingRetailResearchCount: 5 },
  ],
  missingBrands: [],
}

describe('BrandTierStrip', () => {
  it('renders one card per EXPECTED_BRAND', () => {
    const { container } = render(
      <BrandTierStrip aggregates={aggregates} navigate={() => {}} />
    )
    const cards = container.querySelectorAll('[data-brand-card]')
    expect(cards).toHaveLength(3)
  })

  it('renders a NOT STOCKED badge + zero-state styling on missing brands', () => {
    const empty = {
      total: 627,
      brands: [aggregates.brands[0]],
      missingBrands: ['BFGOODRICH', 'UNIROYAL'],
    }
    const { container } = render(
      <BrandTierStrip aggregates={empty} navigate={() => {}} />
    )
    const badges = container.querySelectorAll('[data-not-stocked]')
    expect(badges).toHaveLength(2)
    badges.forEach((b) => expect(b.textContent).toContain('NOT STOCKED'))
  })

  it('clicking a stocked card calls navigate with /tires?brand=<X>', () => {
    const spy = vi.fn()
    const { container } = render(
      <BrandTierStrip aggregates={aggregates} navigate={spy} />
    )
    const michelin = [...container.querySelectorAll('[data-brand-card]')]
      .find((c) => c.textContent.includes('MICHELIN'))
    fireEvent.click(michelin)
    expect(spy).toHaveBeenCalledWith('/tires?brand=MICHELIN')
  })
})
```

- [ ] **Step 2: Verify failure**

Run: `cd .claude/worktrees/brand-aggregates && npx vitest run src/components/dashboard/BrandTierStrip.test.jsx`

- [ ] **Step 3: Implement the component**

Create `src/components/dashboard/BrandTierStrip.jsx`:

```jsx
import { EXPECTED_BRANDS } from '../../constants/tireCategory.js'
import { brandColorCssVar } from '../../utils/brandColor.js'

/**
 * Dashboard hero strip showing brand portfolio at-a-glance.
 *
 * Renders all EXPECTED_BRANDS (not just stocked) so a 0-SKU brand surfaces
 * with a NOT STOCKED badge. Clicking a stocked card jumps to the catalog
 * pre-filtered to that brand.
 */
export function BrandTierStrip({ aggregates, navigate }) {
  const byBrand = new Map(aggregates.brands.map((b) => [b.brand, b]))
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
      {EXPECTED_BRANDS.map((brand) => {
        const b = byBrand.get(brand)
        const stocked = !!(b && b.count > 0)
        const color = brandColorCssVar(brand)
        const onClick = stocked ? () => navigate(`/tires?brand=${brand}`) : undefined
        return (
          <button
            key={brand}
            type="button"
            data-brand-card
            data-stocked={stocked ? 'true' : 'false'}
            onClick={onClick}
            disabled={!stocked}
            style={
              stocked
                ? { borderColor: color, color }
                : undefined
            }
            className={`flex flex-col items-start gap-1 rounded-xl border-2 px-4 py-3 text-left transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:hover:translate-y-0 ${
              stocked ? 'shadow-sm' : 'border-red-500 text-red-500'
            }`}
          >
            <span className="text-[11px] font-semibold uppercase tracking-wide">{brand}</span>
            <span className="font-mono text-2xl font-bold tabular-nums">
              {stocked ? b.count : 0}
              <span className="ml-1 text-xs font-normal opacity-70">SKUs</span>
            </span>
            {stocked && b.avgListingMarginPct != null ? (
              <span className="text-xs opacity-80">{b.avgListingMarginPct.toFixed(1)}% avg margin</span>
            ) : null}
            {!stocked ? (
              <span
                data-not-stocked
                className="rounded bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-700"
              >
                Not stocked ⚠
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 4: Re-run tests**

Run: `cd .claude/worktrees/brand-aggregates && npx vitest run src/components/dashboard/BrandTierStrip.test.jsx`

Expected: 3/3 pass.

- [ ] **Step 5: Mount in Dashboard**

In `src/components/dashboard/Dashboard.jsx`, add to imports:

```jsx
import { BrandTierStrip } from './BrandTierStrip'
import { useTires } from '../../hooks/useTires'
import { useBrandAggregates } from '../../hooks/useBrandAggregates'
```

Inside the `Dashboard` function (after the existing `useDashboardSignals()` call), add:

```jsx
  const { tires } = useTires()
  const brandAggregates = useBrandAggregates(tires, null)
```

In the JSX `return`, find a sensible mount location near the top of the dashboard (e.g., just below the page header / above the existing widget grid). Place:

```jsx
  <section className="mb-4">
    <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
      Brand portfolio
    </h2>
    <BrandTierStrip aggregates={brandAggregates} navigate={navigate} />
  </section>
```

The exact mount location depends on the existing JSX structure — pick one that surfaces the strip prominently without crowding the existing widgets. If unsure, place it just before the first `<HiddenGemsSurface>` mount.

- [ ] **Step 6: Run vitest**

Run: `cd .claude/worktrees/brand-aggregates && npx vitest run src/`

Expected: pass.

- [ ] **Step 7: Manual smoke test**

`npm run dev` → Dashboard route. Confirm the strip renders three cards (MICHELIN, BFGOODRICH, UNIROYAL), counts are non-zero, clicking navigates to `/tires?brand=<X>`, and the table arrives pre-filtered.

- [ ] **Step 8: Commit**

```bash
cd .claude/worktrees/brand-aggregates
git add src/components/dashboard/BrandTierStrip.jsx src/components/dashboard/BrandTierStrip.test.jsx src/components/dashboard/Dashboard.jsx
git commit -m "feat(dashboard): BrandTierStrip portfolio hero widget

Renders all EXPECTED_BRANDS as cards (one per Loveland-account brand)
with count + avg researched-retail margin. Zero-stock brands carry a
NOT STOCKED red badge. Clicking a stocked card jumps to the catalog
pre-filtered. Reads useBrandAggregates(tires, null) for whole-catalog
scope."
```

---

## Task 8: Drop `TireDescriptionCellForTest` export (tech-debt fold-in)

**Files:**
- Modify: `src/components/tires/MarginTable.jsx`
- Modify: `src/components/tires/MarginTable.test.jsx`

- [ ] **Step 1: Inspect the current shim**

Read `src/components/tires/MarginTable.test.jsx` to find every `TireDescriptionCellForTest` import. There's typically one named import like:

```jsx
import { TireDescriptionCellForTest as TireDescriptionCell } from './MarginTable.jsx'
```

Replace with the `vi.importActual` pattern:

```jsx
import * as MarginTableModule from './MarginTable.jsx'
const TireDescriptionCell = MarginTableModule.TireDescriptionCell ?? null
```

If `MarginTable.jsx` does not currently export `TireDescriptionCell` (it does not — only the memoized version is module-scoped), add the export to the source:

In `src/components/tires/MarginTable.jsx`, find:

```jsx
const TireDescriptionCell = memo(function TireDescriptionCell({ description, pillTags }) { ... })
```

Change to:

```jsx
export const TireDescriptionCell = memo(function TireDescriptionCell({ description, pillTags }) { ... })
```

Also delete the:

```jsx
export const TireDescriptionCellForTest = TireDescriptionCell
```

line.

- [ ] **Step 2: Run tests**

Run: `cd .claude/worktrees/brand-aggregates && npx vitest run src/components/tires/MarginTable.test.jsx`

Expected: pass. If a test imports `TireDescriptionCellForTest` from somewhere besides `MarginTable.test.jsx`, fix that import too. `grep -rn TireDescriptionCellForTest src/` after the change must return zero hits.

- [ ] **Step 3: Verify clean grep**

Run: `cd .claude/worktrees/brand-aggregates && grep -rn "TireDescriptionCellForTest" src/`

Expected: no output.

- [ ] **Step 4: Commit**

```bash
cd .claude/worktrees/brand-aggregates
git add src/components/tires/MarginTable.jsx src/components/tires/MarginTable.test.jsx
git commit -m "refactor(tires): drop TireDescriptionCellForTest shim

The test-only re-export was a workaround for the memo wrapper. Export
TireDescriptionCell directly (the memoized version) so the test file
imports the canonical name. Closes the tech-debt entry from the polish
PR review."
```

---

## Task 9: Lint, bundle, full vitest, manual eye-check

**Files:** none

- [ ] **Step 1: Lint**

Run: `cd .claude/worktrees/brand-aggregates && npm run lint`

Expected: 0 errors. Pre-existing warnings stay; new code adds no warnings.

- [ ] **Step 2: Bundle-size check**

Run: `cd .claude/worktrees/brand-aggregates && npm run build && npx size-limit`

Expected: tires page chunk under 42 KB; Dashboard page chunk under its own cap. New code adds ~3 KB gzipped (two components + selector). If a chunk goes over, inspect the breakdown and either trim or bump the cap with a one-line note in `.size-limit.cjs`.

- [ ] **Step 3: Full vitest**

Run: `cd .claude/worktrees/brand-aggregates && npx vitest run src/`

Expected: green.

- [ ] **Step 4: Manual eye-check**

`npm run dev`. Walk through:

- **Catalog page**: pill row above MarginFilters renders. `<select>` brand chip is gone. Click MICHELIN → table filters; click All → clears; click MICHELIN again from selected → no-op. Switch to Passenger tab — pill counts shrink to in-category. Mobile: pills horizontally scroll, active pill snapped into view.
- **Dashboard**: Brand portfolio strip renders three cards with non-zero counts (MICHELIN/BFG/UNIROYAL all stocked today). Click a card → routes to `/tires?brand=<X>` with the table pre-filtered.
- **Filter presets**: save the current filters with one brand selected; load a preset; brand pill highlights correctly.
- **a11y**: tab through pill row with keyboard, arrow-key navigation works (matches CategoryTabs).

- [ ] **Step 5: Final commit if anything was tweaked**

If you tweaked any size-limit cap or visual nit, commit with an explanatory message. Otherwise skip this step.

- [ ] **Step 6: Push branch**

```bash
cd .claude/worktrees/brand-aggregates
git push -u origin brand-aggregates
```

The branch is ready to land via `superpowers:finishing-a-development-branch`.

---

## Verification checklist (final)

- All vitest tests green (`npx vitest run src/`)
- Lint clean (`npm run lint`)
- Bundle size within caps (`npx size-limit`)
- BrandStatsRow renders above MarginFilters; brand `<select>` is gone
- BrandTierStrip renders on Dashboard with three cards; click navigates
- Pill click contract: All clears, brand sets, active is no-op
- Mobile pill row scroll-snaps; active pill auto-scrolls into view
- Switching CategoryTabs updates BrandStatsRow counts
- 0-SKU brand shows NOT STOCKED red badge (test only — no real 0 brand on prod today)
- a11y: pill row has `role="tablist"`, pills have `role="tab"` + `aria-selected`
- Filter presets still work end-to-end
- `TireDescriptionCellForTest` shim is gone (`grep` confirms zero references)
