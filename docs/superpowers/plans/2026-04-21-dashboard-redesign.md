# Dashboard redesign implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship scope B of the dashboard redesign: kill the modules row, replace Catalog Health with Hidden Gems, add Top Sellers and Total Profit cards, wire the Crew widget to `crewSignals`, add the Activity Ticker, and migrate visual language to Precision Cockpit.

**Architecture:** UI-only changes inside `src/components/dashboard/Dashboard.jsx` plus new presentational components under `src/components/dashboard/`. Data is supplied by the existing `useDashboardSignals` hook; one new Firestore aggregation (top-10 sellers) is added to `functions/financeStats.js`, and hidden-gems data is selected via a new memo inside the hook from an existing tires query.

**Tech Stack:** React 19, Vite, Tailwind, Firestore (web SDK), Cloudflare Functions (Node admin SDK), Vitest + React Testing Library, framer-motion.

**Reference spec:** `docs/superpowers/specs/2026-04-21-dashboard-redesign-design.md`

---

## File structure

**New files:**
- `src/components/dashboard/TopSellersCard.jsx` - flip-display card (rank left, sold right, paired palette).
- `src/components/dashboard/TopSellersCard.test.jsx` - component tests.
- `src/components/dashboard/HiddenGemsSurface.jsx` - replaces Catalog Health inline section.
- `src/components/dashboard/HiddenGemsSurface.test.jsx` - component tests.
- `src/components/dashboard/ActivityTicker.jsx` - full-width scrolling chip bar.
- `src/components/dashboard/ActivityTicker.test.jsx` - component tests.
- `src/components/dashboard/CrewDirectoryWidget.jsx` - extracted and enriched crew widget reading `crewSignals`.
- `src/components/dashboard/CrewDirectoryWidget.test.jsx` - component tests.
- `src/components/dashboard/TodayStrip.jsx` - the 4-card strip (Pending, TopSellers, Today Revenue hero, Total Profit).
- `src/components/dashboard/TodayStrip.test.jsx` - component tests.
- `src/components/dashboard/topSellersPalette.js` - paired palette table (ranks 1-10).
- `tests/e2e/dashboard.screenshot.spec.ts` - Playwright visual baseline at 1440px.

**Modified files:**
- `src/components/dashboard/Dashboard.jsx` - remove Modules row, Catalog Health inline section, inline 4-card strip, inline Crew section; compose new components; destructure `crewSignals`, `topSellers`, `hiddenGems`, `allTimeMargin` from hook.
- `src/hooks/useDashboardSignals.js` - expose `topSellers`, `hiddenGems`, `allTimeMargin` to consumers; derive hidden gems in a memo.
- `functions/financeStats.js` - add top-10 sellers aggregation alongside the existing revenue stats writer.

**Deleted:** none. The inline sections inside `Dashboard.jsx` are replaced in-place; no standalone components are being removed.

> Note: the spec mentioned `<SinchChatMount />` as dead code on the dashboard. A repo-wide grep confirms it is not imported in `Dashboard.jsx`, so no removal is needed here. Leaving its current mount site alone.

---

## Task 1: Paired palette module

**Files:**
- Create: `src/components/dashboard/topSellersPalette.js`
- Test: `src/components/dashboard/topSellersPalette.test.js`

- [ ] **Step 1: Write the failing test**

```js
// src/components/dashboard/topSellersPalette.test.js
import { describe, it, expect } from 'vitest'
import { TOP_SELLERS_PALETTE, paletteForRank } from './topSellersPalette'

describe('topSellersPalette', () => {
  it('exposes 10 paired entries indexed by rank 1-10', () => {
    expect(TOP_SELLERS_PALETTE).toHaveLength(10)
    for (const entry of TOP_SELLERS_PALETTE) {
      expect(entry.primary).toMatch(/^#[0-9a-f]{6}$/i)
      expect(entry.accent).toMatch(/^#[0-9a-f]{6}$/i)
      expect(entry.primary.toLowerCase()).not.toEqual(entry.accent.toLowerCase())
    }
  })

  it('paletteForRank returns the entry for the given rank (1-based)', () => {
    expect(paletteForRank(1).primary).toBe('#fbbf24')
    expect(paletteForRank(1).accent).toBe('#94a3b8')
    expect(paletteForRank(10).primary).toBe('#94a3b8')
  })

  it('paletteForRank wraps out-of-range ranks safely', () => {
    expect(paletteForRank(0)).toEqual(paletteForRank(10))
    expect(paletteForRank(11)).toEqual(paletteForRank(1))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/dashboard/topSellersPalette.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the palette**

```js
// src/components/dashboard/topSellersPalette.js
// Paired palette from the spec Appendix A. Primary paints the big numerals
// (rank digit + sold count). Accent paints the # glyph and the SOLD caption.
export const TOP_SELLERS_PALETTE = [
  { primary: '#fbbf24', accent: '#94a3b8' }, // 1 gold / slate
  { primary: '#e2e8f0', accent: '#fbbf24' }, // 2 silver / gold
  { primary: '#f97316', accent: '#2dd4bf' }, // 3 bronze / teal
  { primary: '#a3e635', accent: '#64748b' }, // 4 lime / slate
  { primary: '#34d399', accent: '#fcd34d' }, // 5 emerald / amber
  { primary: '#22d3ee', accent: '#a78bfa' }, // 6 cyan / violet
  { primary: '#60a5fa', accent: '#fda4af' }, // 7 sky / rose
  { primary: '#a78bfa', accent: '#6ee7b7' }, // 8 violet / mint
  { primary: '#f472b6', accent: '#22d3ee' }, // 9 pink / cyan
  { primary: '#94a3b8', accent: '#fcd34d' }, // 10 slate / amber
]

export function paletteForRank(rank) {
  const n = Number(rank)
  if (!Number.isFinite(n)) return TOP_SELLERS_PALETTE[0]
  const idx = ((Math.trunc(n) - 1) % TOP_SELLERS_PALETTE.length + TOP_SELLERS_PALETTE.length)
    % TOP_SELLERS_PALETTE.length
  return TOP_SELLERS_PALETTE[idx]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/dashboard/topSellersPalette.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/topSellersPalette.js src/components/dashboard/topSellersPalette.test.js
git commit -m "feat(dashboard): add Top Sellers paired palette"
```

---

## Task 2: Top-10 sellers aggregation in finance worker

**Files:**
- Modify: `functions/financeStats.js`
- Test: `functions/financeStats.test.js` (new or extend if it already exists - check before creating)

- [ ] **Step 1: Inspect the worker and locate the revenue-stats write**

Open `functions/financeStats.js` and locate the section that writes `meta/revenueStats` (around the `allTimeMargin` update near line 211). The new aggregation runs after the finance totals are computed and extends the same `meta/revenueStats` doc.

- [ ] **Step 2: Write the failing test**

```js
// functions/financeStats.test.js (add describe block; if file doesn't exist, create it)
import { describe, it, expect, vi } from 'vitest'
import { buildTopSellersAggregate } from './financeStats.js'

describe('buildTopSellersAggregate', () => {
  it('returns the top 10 by salesCount desc with rank starting at 1', () => {
    const docs = Array.from({ length: 15 }, (_, i) => ({
      id: `sku-${i}`,
      data: () => ({
        mspn: `SKU${i}`,
        description: `Tire ${i}`,
        category: 'all-season',
        salesCount: 15 - i,
      }),
    }))
    const result = buildTopSellersAggregate(docs)
    expect(result).toHaveLength(10)
    expect(result[0]).toEqual({
      rank: 1,
      sku: 'SKU0',
      description: 'Tire 0',
      category: 'all-season',
      salesCount: 15,
    })
    expect(result[9].rank).toBe(10)
    expect(result[9].salesCount).toBe(6)
  })

  it('handles fewer than 10 docs and skips rows with no salesCount', () => {
    const docs = [
      { id: 'a', data: () => ({ mspn: 'A', salesCount: 5 }) },
      { id: 'b', data: () => ({ mspn: 'B' }) },
      { id: 'c', data: () => ({ mspn: 'C', salesCount: 2 }) },
    ]
    const result = buildTopSellersAggregate(docs)
    expect(result).toEqual([
      { rank: 1, sku: 'A', description: '', category: '', salesCount: 5 },
      { rank: 2, sku: 'C', description: '', category: '', salesCount: 2 },
    ])
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run functions/financeStats.test.js`
Expected: FAIL (`buildTopSellersAggregate` is not exported).

- [ ] **Step 4: Add the exported helper and wire it into the writer**

In `functions/financeStats.js`, add near the top (below the existing imports):

```js
export function buildTopSellersAggregate(docs) {
  const rows = []
  for (const doc of docs) {
    const data = doc.data() || {}
    const count = Number(data.salesCount)
    if (!Number.isFinite(count) || count <= 0) continue
    rows.push({
      sku: String(data.mspn || doc.id || ''),
      description: String(data.description || ''),
      category: String(data.category || ''),
      salesCount: count,
    })
  }
  rows.sort((a, b) => b.salesCount - a.salesCount)
  return rows.slice(0, 10).map((r, i) => ({ rank: i + 1, ...r }))
}
```

Then, in the routine that writes `meta/revenueStats` (the function that sets `allTimeMargin`), add a parallel read of the tires collection ordered by `salesCount` desc limited to 10, transform with `buildTopSellersAggregate`, and include the result under the key `topSellers` in the same `set(..., { merge: true })` payload.

```js
// Inside the revenue-stats writer, after computing the other totals:
const tiresSnap = await db
  .collection('tires')
  .orderBy('salesCount', 'desc')
  .limit(10)
  .get()
const topSellers = buildTopSellersAggregate(tiresSnap.docs)
// ... merge into the revenueStats write payload:
// await REVENUE_REF(db).set({ ...existingPayload, topSellers }, { merge: true })
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run functions/financeStats.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add functions/financeStats.js functions/financeStats.test.js
git commit -m "feat(finance): aggregate top-10 sellers into meta/revenueStats"
```

---

## Task 3: Hook - expose topSellers, hiddenGems, allTimeMargin

**Files:**
- Modify: `src/hooks/useDashboardSignals.js`
- Test: `src/hooks/useDashboardSignals.test.js` (add cases; if absent, create)

The hook already subscribes to `meta/revenueStats` and to the tires collection. Extend its return value so the dashboard can consume the new fields without creating parallel listeners.

- [ ] **Step 1: Write failing tests for the new selectors**

```jsx
// src/hooks/useDashboardSignals.test.js
import { describe, it, expect } from 'vitest'
import { selectHiddenGems, selectTopSellersFromRevenueDoc } from './useDashboardSignals'

describe('selectHiddenGems', () => {
  it('returns tires with marginConfirmed true and fewer than 2 active platform listings', () => {
    const tires = [
      {
        id: 't1',
        data: {
          mspn: 'AAA',
          description: 'All-season 205/55R16',
          marginConfirmed: true,
          platformListings: { ebay: { status: 'active', lastPostedAt: 1000 } },
        },
      },
      {
        id: 't2',
        data: {
          mspn: 'BBB',
          marginConfirmed: true,
          platformListings: {
            ebay: { status: 'active' },
            marketplace: { status: 'active' },
            craigslist: { status: 'active' },
          },
        },
      },
      {
        id: 't3',
        data: { mspn: 'CCC', marginConfirmed: false, platformListings: {} },
      },
    ]
    const gems = selectHiddenGems(tires)
    expect(gems).toHaveLength(1)
    expect(gems[0]).toMatchObject({
      sku: 'AAA',
      description: 'All-season 205/55R16',
      platformCount: 1,
      lastPostedAt: 1000,
    })
  })
})

describe('selectTopSellersFromRevenueDoc', () => {
  it('returns [] when the doc has no topSellers field', () => {
    expect(selectTopSellersFromRevenueDoc({})).toEqual([])
  })
  it('passes the array through untouched when present', () => {
    const list = [{ rank: 1, sku: 'A', salesCount: 9 }]
    expect(selectTopSellersFromRevenueDoc({ topSellers: list })).toBe(list)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/hooks/useDashboardSignals.test.js`
Expected: FAIL (selectors not exported).

- [ ] **Step 3: Add the selectors and extend the hook return**

Near the top of `src/hooks/useDashboardSignals.js`, add:

```js
export function selectHiddenGems(tires) {
  const out = []
  for (const t of tires) {
    const d = t.data || {}
    if (!d.marginConfirmed) continue
    const listings = d.platformListings || {}
    const platforms = Object.keys(listings).filter(
      (p) => listings[p]?.status === 'active',
    )
    if (platforms.length >= 2) continue
    let lastPostedAt = null
    for (const p of Object.keys(listings)) {
      const ts = Number(listings[p]?.lastPostedAt)
      if (Number.isFinite(ts) && (lastPostedAt === null || ts > lastPostedAt)) {
        lastPostedAt = ts
      }
    }
    out.push({
      id: t.id,
      sku: String(d.mspn || d.sku || t.id),
      description: String(d.description || ''),
      platformCount: platforms.length,
      platforms,
      lastPostedAt,
    })
  }
  return out
}

export function selectTopSellersFromRevenueDoc(doc) {
  const list = doc?.topSellers
  return Array.isArray(list) ? list : []
}
```

Inside the hook body, add memos that wire these selectors to the existing tire snapshot and the existing `revenueStats` subscription, and extend the return object at the bottom of `useDashboardSignals`:

```js
const hiddenGems = useMemo(() => selectHiddenGems(tiresList), [tiresList])
// `revenueStatsDoc` is the local state already maintained for allTimeMargin/signal bar.
const topSellers = useMemo(
  () => selectTopSellersFromRevenueDoc(revenueStatsDoc),
  [revenueStatsDoc],
)
const allTimeMargin = Number(revenueStatsDoc?.allTimeMargin) || 0

return {
  // ...existing fields
  crewSignals: crewSignalsState.map,
  crewSignalsLoading: crewSignalsState.loading,
  topSellers,
  hiddenGems,
  allTimeMargin,
}
```

If `tiresList` or `revenueStatsDoc` are not already named in the hook, bind them to the existing state variables (the hook already maintains both for other selectors - reuse them rather than adding listeners).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/hooks/useDashboardSignals.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useDashboardSignals.js src/hooks/useDashboardSignals.test.js
git commit -m "feat(dashboard): expose topSellers, hiddenGems, allTimeMargin from hook"
```

---

## Task 4: TopSellersCard component

**Files:**
- Create: `src/components/dashboard/TopSellersCard.jsx`
- Test: `src/components/dashboard/TopSellersCard.test.jsx`

Implements the v16 mockup: 50/50 split, rank digit on the left, sold count on the right, SOLD caption 8px below the count, flip every 3 seconds through the top 10, paired palette per place.

- [ ] **Step 1: Write failing tests**

```jsx
// src/components/dashboard/TopSellersCard.test.jsx
import { describe, it, expect } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { TopSellersCard } from './TopSellersCard'

const sellers = [
  { rank: 1, sku: 'AAA', description: 'A-tire', category: 'all-season', salesCount: 14 },
  { rank: 2, sku: 'BBB', description: 'B-tire', category: 'winter', salesCount: 9 },
]

describe('TopSellersCard', () => {
  it('renders the current slot with rank, count, SKU, description, and SOLD caption', () => {
    render(<TopSellersCard sellers={sellers} />)
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('14')).toBeInTheDocument()
    expect(screen.getByText('AAA')).toBeInTheDocument()
    expect(screen.getByText('A-tire')).toBeInTheDocument()
    expect(screen.getByText(/SOLD/i)).toBeInTheDocument()
  })

  it('renders an empty state when sellers is empty', () => {
    render(<TopSellersCard sellers={[]} />)
    expect(screen.getByText(/no sales yet/i)).toBeInTheDocument()
  })

  it('cycles to the next seller after the interval', () => {
    vi.useFakeTimers()
    render(<TopSellersCard sellers={sellers} intervalMs={3000} />)
    expect(screen.getByText('AAA')).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(3000) })
    expect(screen.getByText('BBB')).toBeInTheDocument()
    vi.useRealTimers()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/dashboard/TopSellersCard.test.jsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the component**

```jsx
// src/components/dashboard/TopSellersCard.jsx
import { useEffect, useState } from 'react'
import { paletteForRank } from './topSellersPalette'

export function TopSellersCard({ sellers = [], intervalMs = 3000 }) {
  const [idx, setIdx] = useState(0)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (paused || sellers.length <= 1) return
    const t = setInterval(() => {
      setIdx((i) => (i + 1) % sellers.length)
    }, intervalMs)
    return () => clearInterval(t)
  }, [paused, sellers.length, intervalMs])

  if (sellers.length === 0) {
    return (
      <div className="rounded-xl bg-zinc-900/60 p-[14px] text-sm text-zinc-500">
        <p className="mb-2 text-[9px] font-bold uppercase tracking-[0.12em] text-zinc-500">
          Top Sellers
        </p>
        <p className="text-zinc-400">No sales yet</p>
      </div>
    )
  }

  const current = sellers[Math.min(idx, sellers.length - 1)]
  const palette = paletteForRank(current.rank)

  return (
    <div
      className="relative rounded-xl bg-zinc-900/60 p-[14px]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <p className="mb-2 text-[9px] font-bold uppercase tracking-[0.12em] text-zinc-500">
        Top Sellers
      </p>
      <div
        className="grid items-center gap-0"
        style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)' }}
      >
        <div className="flex items-baseline justify-center gap-[22px] border-r border-zinc-800/60">
          <div
            className="w-[96px] text-center font-extrabold tabular-nums"
            style={{ fontSize: 52, color: palette.primary, lineHeight: 1 }}
          >
            <span
              className="mr-[2px] font-medium align-[0.35em]"
              style={{ fontSize: '0.6em', color: palette.accent }}
            >
              #
            </span>
            {current.rank}
          </div>
          <div className="relative w-[96px]">
            <div
              className="text-center font-extrabold tabular-nums"
              style={{ fontSize: 52, color: palette.primary, lineHeight: 1 }}
            >
              {current.salesCount}
            </div>
            <div
              className="absolute -left-5 -right-5 text-center font-bold uppercase"
              style={{
                top: 'calc(100% + 8px)',
                fontSize: 13,
                letterSpacing: '0.22em',
                color: palette.accent,
              }}
            >
              SOLD
            </div>
          </div>
        </div>
        <div className="min-w-0 pl-4">
          <p className="truncate font-mono text-[18px] text-zinc-100">{current.sku}</p>
          <p className="truncate text-[13px] text-zinc-300">{current.description}</p>
          <p className="mt-1 text-[10px] uppercase tracking-wide text-zinc-500">
            {current.category}
          </p>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/dashboard/TopSellersCard.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/TopSellersCard.jsx src/components/dashboard/TopSellersCard.test.jsx
git commit -m "feat(dashboard): add TopSellersCard with flip cycle"
```

---

## Task 5: HiddenGemsSurface component

**Files:**
- Create: `src/components/dashboard/HiddenGemsSurface.jsx`
- Test: `src/components/dashboard/HiddenGemsSurface.test.jsx`

- [ ] **Step 1: Write failing tests**

```jsx
// src/components/dashboard/HiddenGemsSurface.test.jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { HiddenGemsSurface } from './HiddenGemsSurface'

const gems = [
  { id: 't1', sku: 'AAA', description: 'All-season', platforms: ['ebay'], lastPostedAt: Date.now() - 86400000 * 3 },
  { id: 't2', sku: 'BBB', description: 'Winter', platforms: [], lastPostedAt: null },
]

describe('HiddenGemsSurface', () => {
  it('renders the title and each gem row', () => {
    render(<HiddenGemsSurface gems={gems} onPost={() => {}} />)
    expect(screen.getByText(/hidden gems/i)).toBeInTheDocument()
    expect(screen.getByText('AAA')).toBeInTheDocument()
    expect(screen.getByText('BBB')).toBeInTheDocument()
  })

  it('shows "never" when lastPostedAt is null', () => {
    render(<HiddenGemsSurface gems={gems} onPost={() => {}} />)
    expect(screen.getByText(/never/i)).toBeInTheDocument()
  })

  it('renders an empty state when gems is empty', () => {
    render(<HiddenGemsSurface gems={[]} onPost={() => {}} />)
    expect(screen.getByText(/nothing hidden/i)).toBeInTheDocument()
  })

  it('shows "View all N" when more than 5 gems exist', () => {
    const many = Array.from({ length: 8 }, (_, i) => ({
      id: `g${i}`, sku: `S${i}`, description: 'x', platforms: [], lastPostedAt: null,
    }))
    render(<HiddenGemsSurface gems={many} onPost={() => {}} />)
    expect(screen.getByText(/view all 8/i)).toBeInTheDocument()
  })

  it('calls onPost(id) when the "Post it" button is clicked', () => {
    const onPost = vi.fn()
    render(<HiddenGemsSurface gems={gems} onPost={onPost} />)
    fireEvent.click(screen.getAllByRole('button', { name: /post it/i })[0])
    expect(onPost).toHaveBeenCalledWith('t1')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/dashboard/HiddenGemsSurface.test.jsx`
Expected: FAIL.

- [ ] **Step 3: Implement the component**

```jsx
// src/components/dashboard/HiddenGemsSurface.jsx
import { timeAgo } from '../../utils/timeAgo'

const ALL_PLATFORMS = ['ebay', 'marketplace', 'craigslist']
const PLATFORM_LABELS = { ebay: 'eBay', marketplace: 'Marketplace', craigslist: 'Craigslist' }

function missingPlatforms(gemPlatforms) {
  const have = new Set(gemPlatforms || [])
  return ALL_PLATFORMS.filter((p) => !have.has(p))
}

export function HiddenGemsSurface({ gems = [], onPost }) {
  const visible = gems.slice(0, 5)

  return (
    <section className="rounded-xl bg-zinc-900/60 p-[14px]">
      <h2 className="text-[9px] font-bold uppercase tracking-[0.12em] text-zinc-500">
        Hidden Gems
      </h2>
      {gems.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-500">
          Nothing hidden - everything cross-posted.
        </p>
      ) : (
        <>
          <ul className="mt-3 divide-y divide-zinc-800/80">
            {visible.map((gem) => (
              <li key={gem.id} className="flex items-start justify-between gap-3 py-3 first:pt-0">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-[13px] text-zinc-100">{gem.sku}</p>
                  <p className="truncate text-[13px] text-zinc-300">{gem.description}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    {missingPlatforms(gem.platforms).map((p) => (
                      <span
                        key={p}
                        className="rounded-full bg-zinc-800/80 px-2 py-0.5 text-[10px] text-zinc-300"
                      >
                        {PLATFORM_LABELS[p]}
                      </span>
                    ))}
                    <span className="ml-2 text-[10px] text-zinc-500">
                      {gem.lastPostedAt ? timeAgo(gem.lastPostedAt) : 'never'}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onPost?.(gem.id)}
                  className="rounded-lg bg-emerald-500/20 px-3 py-1.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/30"
                >
                  Post it
                </button>
              </li>
            ))}
          </ul>
          {gems.length > 5 ? (
            <button
              type="button"
              className="mt-3 text-xs font-medium text-amber-300/90 hover:underline"
              onClick={() => onPost?.('__all__')}
            >
              View all {gems.length}
            </button>
          ) : null}
        </>
      )}
    </section>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/dashboard/HiddenGemsSurface.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/HiddenGemsSurface.jsx src/components/dashboard/HiddenGemsSurface.test.jsx
git commit -m "feat(dashboard): add HiddenGemsSurface"
```

---

## Task 6: ActivityTicker component

**Files:**
- Create: `src/components/dashboard/ActivityTicker.jsx`
- Test: `src/components/dashboard/ActivityTicker.test.jsx`

- [ ] **Step 1: Write failing tests**

```jsx
// src/components/dashboard/ActivityTicker.test.jsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ActivityTicker } from './ActivityTicker'

const chips = [
  { id: 'a', kind: 'inventory', label: '3 hidden gems to post' },
  { id: 'b', kind: 'kyle', label: 'Kyle has 7 in queue' },
  { id: 'c', kind: 'ops', label: 'DJ has 2 pickups to confirm' },
  { id: 'd', kind: 'people', label: '1 pending invite' },
]

describe('ActivityTicker', () => {
  it('renders each chip', () => {
    render(<ActivityTicker chips={chips} />)
    for (const c of chips) {
      expect(screen.getByText(c.label)).toBeInTheDocument()
    }
  })

  it('renders nothing when chips is empty', () => {
    const { container } = render(<ActivityTicker chips={[]} />)
    expect(container.firstChild).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/dashboard/ActivityTicker.test.jsx`
Expected: FAIL.

- [ ] **Step 3: Implement the component**

```jsx
// src/components/dashboard/ActivityTicker.jsx
import { useState } from 'react'

const TONE_CLASSES = {
  inventory: 'bg-teal-500/15 text-teal-200 border-teal-700/40',
  kyle: 'bg-amber-500/15 text-amber-200 border-amber-700/40',
  ops: 'bg-rose-500/15 text-rose-200 border-rose-700/40',
  people: 'bg-emerald-500/15 text-emerald-200 border-emerald-700/40',
  neutral: 'bg-zinc-700/30 text-zinc-200 border-zinc-700/50',
}

export function ActivityTicker({ chips = [] }) {
  const [paused, setPaused] = useState(false)
  if (!chips.length) return null

  return (
    <div
      className="relative w-full overflow-hidden rounded-xl bg-zinc-900/60 py-2"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      aria-label="Activity ticker"
    >
      <div
        className="flex min-w-max gap-3 whitespace-nowrap px-3"
        style={{
          animation: paused ? 'none' : 'ticker-scroll 35s linear infinite',
        }}
      >
        {[...chips, ...chips].map((c, i) => (
          <span
            key={`${c.id}-${i}`}
            className={`inline-flex items-center rounded-full border px-3 py-1 text-xs ${
              TONE_CLASSES[c.kind] || TONE_CLASSES.neutral
            }`}
          >
            {c.label}
          </span>
        ))}
      </div>
      <style>{`
        @keyframes ticker-scroll {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/dashboard/ActivityTicker.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/ActivityTicker.jsx src/components/dashboard/ActivityTicker.test.jsx
git commit -m "feat(dashboard): add ActivityTicker"
```

---

## Task 7: CrewDirectoryWidget wired to crewSignals

**Files:**
- Create: `src/components/dashboard/CrewDirectoryWidget.jsx`
- Test: `src/components/dashboard/CrewDirectoryWidget.test.jsx`

Extracts the existing inline Crew section from `Dashboard.jsx` and adds WIP count, today's completions, streak days, and online/offline dot from `crewSignals[userId]`.

- [ ] **Step 1: Write failing tests**

```jsx
// src/components/dashboard/CrewDirectoryWidget.test.jsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CrewDirectoryWidget } from './CrewDirectoryWidget'

const users = [
  { id: 'u1', data: { firstName: 'Kyle', lastName: 'B', role: 'researcher' } },
  { id: 'u2', data: { firstName: 'DJ', lastName: 'M', role: 'ops' } },
]

const signals = {
  u1: { wipCount: 3, todayCompletions: 5, streakDays: 4, lastSeenAt: Date.now() },
  u2: { wipCount: 0, todayCompletions: 2, streakDays: 1, lastSeenAt: Date.now() - 1000 * 60 * 60 },
}

describe('CrewDirectoryWidget', () => {
  it('renders each crew member with WIP, completions, and streak from signals', () => {
    render(
      <CrewDirectoryWidget
        crew={{ users, hasMore: false }}
        crewSignals={signals}
        loading={false}
      />,
    )
    expect(screen.getByText(/Kyle/)).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument() // WIP badge
    expect(screen.getByText(/5 today/i)).toBeInTheDocument()
    expect(screen.getByText(/4\s*day/i)).toBeInTheDocument()
  })

  it('renders the skeleton when loading', () => {
    const { container } = render(
      <CrewDirectoryWidget crew={{ users: [], hasMore: false }} crewSignals={{}} loading={true} />,
    )
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
  })

  it('renders empty state when no users', () => {
    render(
      <CrewDirectoryWidget crew={{ users: [], hasMore: false }} crewSignals={{}} loading={false} />,
    )
    expect(screen.getByText(/no crew rows/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/dashboard/CrewDirectoryWidget.test.jsx`
Expected: FAIL.

- [ ] **Step 3: Implement the component**

```jsx
// src/components/dashboard/CrewDirectoryWidget.jsx
import { Link } from 'react-router-dom'
import { crewTagFromRole } from '../../constants/peoplePermissions'

const ONLINE_WINDOW_MS = 5 * 60 * 1000

function displayName(d) {
  const n = `${d.firstName || ''} ${d.lastName || ''}`.trim()
  return n || String(d.email || '-').trim()
}

export function CrewDirectoryWidget({ crew, crewSignals = {}, loading }) {
  return (
    <section className="rounded-xl bg-zinc-900/60 p-[14px]">
      <div className="flex items-center justify-between">
        <h2 className="text-[9px] font-bold uppercase tracking-[0.12em] text-zinc-500">Crew</h2>
        {crew.hasMore ? (
          <Link to="/people" className="text-xs font-medium text-amber-300/90 hover:underline">
            View all
          </Link>
        ) : null}
      </div>
      {loading ? (
        <div className="mt-3 space-y-2">
          {[1, 2, 3, 4].map((k) => (
            <div key={k} className="h-12 animate-pulse rounded-lg bg-zinc-800/60" />
          ))}
        </div>
      ) : crew.users.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-500">No crew rows loaded.</p>
      ) : (
        <ul className="mt-3 divide-y divide-zinc-800/80">
          {crew.users.map(({ id, data }) => {
            const sig = crewSignals[id] || {}
            const online =
              Number.isFinite(sig.lastSeenAt) && Date.now() - sig.lastSeenAt < ONLINE_WINDOW_MS
            return (
              <li key={id} className="flex items-center justify-between gap-2 py-2.5 first:pt-0">
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    aria-label={online ? 'online' : 'offline'}
                    className={`h-2 w-2 rounded-full ${
                      online ? 'bg-[#32CD32]' : 'bg-zinc-600'
                    }`}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium text-zinc-100">
                      {displayName(data)}
                    </p>
                    <p className="text-[10px] uppercase tracking-wide text-zinc-500">
                      {String(data.crewTag || crewTagFromRole(data.role || 'viewer'))}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-right">
                  {sig.wipCount > 0 ? (
                    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500/20 px-1.5 text-[10px] font-semibold text-amber-200">
                      {sig.wipCount}
                    </span>
                  ) : null}
                  <div className="text-[10px] text-zinc-400">
                    <p>{Number(sig.todayCompletions) || 0} today</p>
                    <p className="text-zinc-500">{Number(sig.streakDays) || 0} day streak</p>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/dashboard/CrewDirectoryWidget.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/CrewDirectoryWidget.jsx src/components/dashboard/CrewDirectoryWidget.test.jsx
git commit -m "feat(dashboard): add CrewDirectoryWidget wired to crewSignals"
```

---

## Task 8: TodayStrip component

**Files:**
- Create: `src/components/dashboard/TodayStrip.jsx`
- Test: `src/components/dashboard/TodayStrip.test.jsx`

Four-card strip: Pending Orders, Top Sellers (double width), Today Revenue (hero), Total Profit. Hero revenue uses neon-lime when today's total exceeds the rolling average.

- [ ] **Step 1: Write failing tests**

```jsx
// src/components/dashboard/TodayStrip.test.jsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { TodayStrip } from './TodayStrip'

function wrap(ui) {
  return render(<MemoryRouter>{ui}</MemoryRouter>)
}

describe('TodayStrip', () => {
  it('renders all four slots', () => {
    wrap(
      <TodayStrip
        pendingOrders={3}
        topSellers={[{ rank: 1, sku: 'A', description: 'tire', category: 'x', salesCount: 1 }]}
        todayRevenue={1234}
        rollingAverage={500}
        allTimeMargin={9876}
        loading={false}
      />,
    )
    expect(screen.getByText(/pending orders/i)).toBeInTheDocument()
    expect(screen.getByText(/top sellers/i)).toBeInTheDocument()
    expect(screen.getByText(/today revenue/i)).toBeInTheDocument()
    expect(screen.getByText(/total profit/i)).toBeInTheDocument()
  })

  it('glows hero revenue only when today exceeds rolling average', () => {
    const { rerender } = wrap(
      <TodayStrip
        pendingOrders={0} topSellers={[]} todayRevenue={100} rollingAverage={500}
        allTimeMargin={0} loading={false}
      />,
    )
    expect(screen.getByTestId('hero-revenue')).not.toHaveClass('text-[#32CD32]')
    rerender(
      <MemoryRouter>
        <TodayStrip
          pendingOrders={0} topSellers={[]} todayRevenue={900} rollingAverage={500}
          allTimeMargin={0} loading={false}
        />
      </MemoryRouter>,
    )
    expect(screen.getByTestId('hero-revenue')).toHaveClass('text-[#32CD32]')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/dashboard/TodayStrip.test.jsx`
Expected: FAIL.

- [ ] **Step 3: Implement the component**

```jsx
// src/components/dashboard/TodayStrip.jsx
import { Link } from 'react-router-dom'
import { formatCurrency, formatQty } from '../../utils/format'
import { TopSellersCard } from './TopSellersCard'

function StatCard({ label, value, to, loading, tone = 'zinc' }) {
  const content = (
    <div className="rounded-xl bg-zinc-900/60 p-[14px]">
      <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-zinc-500">{label}</p>
      {loading ? (
        <div className="mt-3 h-7 w-20 animate-pulse rounded bg-zinc-800/80" />
      ) : (
        <p
          className={`mt-2 text-[26px] font-bold tabular-nums tracking-[-0.02em] ${
            tone === 'warn' ? 'text-amber-200' : 'text-zinc-50'
          }`}
        >
          {value}
        </p>
      )}
    </div>
  )
  return to ? <Link to={to}>{content}</Link> : content
}

export function TodayStrip({
  pendingOrders,
  topSellers,
  todayRevenue,
  rollingAverage,
  allTimeMargin,
  loading,
}) {
  const hot = Number(todayRevenue) > Number(rollingAverage || 0)
  return (
    <section
      aria-label="Today"
      className="grid gap-[10px]"
      style={{ gridTemplateColumns: '1fr 2fr 1fr 1fr' }}
    >
      <StatCard
        label="Pending orders"
        value={formatQty(pendingOrders ?? 0)}
        to="/orders"
        loading={loading}
        tone={Number(pendingOrders) > 0 ? 'warn' : 'zinc'}
      />
      <TopSellersCard sellers={topSellers} />
      <div className="rounded-xl bg-gradient-to-b from-emerald-500/10 to-transparent p-[14px]">
        <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-zinc-500">
          Today revenue
        </p>
        <p
          data-testid="hero-revenue"
          className={`mt-2 text-[34px] font-bold tabular-nums tracking-[-0.02em] ${
            hot ? 'text-[#32CD32]' : 'text-emerald-300'
          }`}
          style={
            hot
              ? { textShadow: '0 0 12px rgba(50,205,50,.55)' }
              : undefined
          }
        >
          {formatCurrency(todayRevenue ?? 0)}
        </p>
      </div>
      <StatCard
        label="Total profit"
        value={formatCurrency(allTimeMargin ?? 0)}
        to="/analytics?tab=revenue"
        loading={loading}
      />
    </section>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/dashboard/TodayStrip.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/TodayStrip.jsx src/components/dashboard/TodayStrip.test.jsx
git commit -m "feat(dashboard): add TodayStrip with hero revenue"
```

---

## Task 9: Compose the new Dashboard shell

**Files:**
- Modify: `src/components/dashboard/Dashboard.jsx`

Replace the inline 4-card strip, inline Recent-activity + Catalog-health grid, inline Crew section, and Modules row with the new components. Destructure the new fields from the hook. Keep the existing Recent Activity inline section (kept per spec); move it into the bottom grid paired with `HiddenGemsSurface`.

- [ ] **Step 1: Update the hook destructure**

In `Dashboard.jsx` (function `Dashboard`), change the destructure block to include the new fields:

```jsx
const {
  catalogSkuDisplay,
  needsRepostingCount,
  tireSku,
  priceIntelResearched,
  crm,
  people,
  completedOrders,
  signalBar,
  recentActivity,
  catalogHealth, // keep until the next task removes the last reference
  crewPreview,
  crewSignals,
  crewSignalsLoading,
  topSellers,
  hiddenGems,
  allTimeMargin,
} = useDashboardSignals()
```

- [ ] **Step 2: Add imports at the top of `Dashboard.jsx`**

```jsx
import { TodayStrip } from './TodayStrip'
import { ActivityTicker } from './ActivityTicker'
import { HiddenGemsSurface } from './HiddenGemsSurface'
import { CrewDirectoryWidget } from './CrewDirectoryWidget'
```

- [ ] **Step 3: Build the ticker chip list inline**

Just before the `return`, compose a memo of chips from the signals that already exist:

```jsx
const tickerChips = useMemo(() => {
  const chips = []
  if (hiddenGems?.length) {
    chips.push({ id: 'gems', kind: 'inventory', label: `${hiddenGems.length} hidden gems to post` })
  }
  if (signalBar.crewAlerts > 0) {
    chips.push({ id: 'crew', kind: 'ops', label: `${signalBar.crewAlerts} crew alerts` })
  }
  if (needsRepostingCount > 0) {
    chips.push({
      id: 'repost',
      kind: 'inventory',
      label: `${needsRepostingCount} listings need reposting`,
    })
  }
  return chips
}, [hiddenGems, signalBar.crewAlerts, needsRepostingCount])
```

- [ ] **Step 4: Replace the `<section aria-label="Operational signals">` block**

Delete the entire `<section aria-label="Operational signals"> ... </section>` block (the inline 4-card grid) AND the `<div className="grid grid-cols-1 gap-6 lg:grid-cols-2"> ... </div>` two-column grid (Recent activity + Catalog health) AND the `<section>` for Crew AND the `<section aria-label="Modules">` block.

Replace them with:

```jsx
<TodayStrip
  pendingOrders={signalBar.pendingOrders}
  topSellers={topSellers}
  todayRevenue={signalBar.todayRevenue}
  rollingAverage={signalBar.todayRevenueRollingAverage}
  allTimeMargin={allTimeMargin}
  loading={sigLoading}
/>

<ActivityTicker chips={tickerChips} />

<div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
  {/* Keep the existing Recent activity <section> block here verbatim */}
  {/* (copied from the old grid; only its parent wrapper changed) */}
  <HiddenGemsSurface
    gems={hiddenGems}
    onPost={(id) => {
      // opens the existing platform-selection modal - leave a stub hook
      // until the modal wiring lands in a follow-up task; for now route to the tire row.
      if (id === '__all__') window.location.href = '/tires?hiddenGems=true'
      else window.location.href = `/tires?highlight=${encodeURIComponent(id)}`
    }}
  />
</div>

<CrewDirectoryWidget
  crew={crewPreview}
  crewSignals={crewSignals || {}}
  loading={crewSignalsLoading || crewLoading}
/>
```

Ensure the old `catalogHealth`, `visibleModules`, and unused `SignalCard` references are also deleted if nothing else consumes them; ESLint/Vite will flag dead imports.

- [ ] **Step 5: Run unit + component tests**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 6: Spot-check the page in dev**

Run: `npm run dev`
Load `/dashboard`, verify: 4-card strip, ticker chips, HiddenGems with "Post it" buttons, Crew widget with WIP badges and online dots, no module tiles, no Catalog Health. Confirm nothing crashes when `topSellers` is empty (pre-aggregation).

- [ ] **Step 7: Commit**

```bash
git add src/components/dashboard/Dashboard.jsx
git commit -m "feat(dashboard): compose new TodayStrip, ticker, HiddenGems, CrewDirectory"
```

---

## Task 10: Precision Cockpit token pass

**Files:**
- Modify: `src/components/dashboard/TopSellersCard.jsx`, `HiddenGemsSurface.jsx`, `ActivityTicker.jsx`, `CrewDirectoryWidget.jsx`, `TodayStrip.jsx`

Tokens were already applied inline during the component builds (bg `#18181b` on `#09090b` via `bg-zinc-900/60`, 14px padding, 10px gap, `#32CD32` reserved for hero hot-state and online dot). This task is a single consolidation sweep + hover bloom.

- [ ] **Step 1: Add the shared hover-bloom utility**

In `src/index.css` (or `src/styles/globals.css`, wherever global styles live - confirm with `ls src/**/*.css` first), add:

```css
.pc-card {
  transition: box-shadow .18s ease;
}
.pc-card:hover {
  box-shadow: 0 0 0 1px rgba(50,205,50,.15), 0 0 24px rgba(50,205,50,.08);
}
```

- [ ] **Step 2: Apply `pc-card` class to every dashboard card root**

Add `pc-card` alongside each `rounded-xl bg-zinc-900/60 ...` root in the five component files. No other class changes needed - token alignment is already done.

- [ ] **Step 3: Verify tests still pass**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/index.css src/components/dashboard
git commit -m "style(dashboard): apply Precision Cockpit hover bloom"
```

---

## Task 11: Playwright visual baseline

**Files:**
- Create: `tests/e2e/dashboard.screenshot.spec.ts`

Confirm Playwright config exists (`playwright.config.*`) before creating the test. If the repo has no Playwright setup, skip this task and open a follow-up issue instead - don't add the framework in this plan.

- [ ] **Step 1: Confirm Playwright is installed**

Run: `npx playwright --version`
Expected: a version string. If the command fails, stop and skip the rest of this task.

- [ ] **Step 2: Write the test**

```ts
// tests/e2e/dashboard.screenshot.spec.ts
import { test, expect } from '@playwright/test'

test('dashboard layout at 1440 desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/dashboard')
  await page.waitForSelector('[aria-label="Today"]')
  await expect(page).toHaveScreenshot('dashboard-1440.png', {
    maxDiffPixelRatio: 0.02,
    fullPage: true,
  })
})
```

- [ ] **Step 3: Capture the baseline**

Run: `npx playwright test tests/e2e/dashboard.screenshot.spec.ts --update-snapshots`
Expected: snapshot written.

- [ ] **Step 4: Run the test**

Run: `npx playwright test tests/e2e/dashboard.screenshot.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/dashboard.screenshot.spec.ts tests/e2e/dashboard.screenshot.spec.ts-snapshots
git commit -m "test(dashboard): add Playwright visual baseline at 1440"
```

---

## Closing

After Task 11, push the branch and open a PR. The spec (`docs/superpowers/specs/2026-04-21-dashboard-redesign-design.md`) is the source of truth; link it in the PR body.
