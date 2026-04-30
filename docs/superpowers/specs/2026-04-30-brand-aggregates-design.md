# Brand stats card + Dashboard hero strip — design

**Status:** approved 2026-04-30
**Branch target:** `brand-aggregates`
**Roadmap entries shipped:** *Brand stats card row* + *Brand-tier hero strip on Dashboard* (Now). Bundles the *Slim `useCategoryMap` hook*, *Shared `TIRE_CATEGORY_KEYS` constant*, and *Replace `TireDescriptionCellForTest` with `vi.importActual`* tech-debt entries.

## Goal

Surface brand-mix at a glance in two places that share a single selector:

1. **Catalog brand stats row** above `MarginTable` on the Tires page. Tab-style pills `[All — N]  [MICHELIN — N]  [BFG — N]  [UNIROYAL — N]` show count + avg listing margin; clicking a pill filters the catalog. Replaces the existing `<InlineBrand>` `<select>` chip in `MarginFilters` row 1.
2. **Dashboard brand-tier hero strip** showing the same per-brand block with a 0-SKU red `NOT STOCKED` warning. Clicking a brand jumps to `/tires?brand=<BRAND>`.

Both consume `useBrandAggregates`, computed once over the `enriched` tire list, scoped to the selected category on the catalog (catalog-aware) and unscoped on the Dashboard (whole catalog).

## Non-goals

- Multi-brand selection. Single-select matches existing `<InlineBrand>` semantics; multi-select is a separate feature if/when needed.
- Cross-brand drill-down (drill into a brand → tread → size). That's *Catalog-first navigation* (Later).
- Custom brand color override. Uses existing `--color-brand-*` tokens.
- Avg buy price, avg FET. Cut from selector — low signal at brand level.
- Change-detection vs prior import (option C from the brainstorming round). Future enhancement; needs a new `meta/categoryMap` field.

## Architecture

```
src/constants/tireCategory.js     (NEW)       — TIRE_CATEGORY_KEYS, CATEGORY_LABELS
src/hooks/useCategoryMap.js       (NEW)       — slim categoryMap reader
src/hooks/useBrandAggregates.js   (NEW)       — per-brand aggregate selector
src/components/tires/BrandStatsRow.jsx
                                  (NEW)       — pill-row component, used in catalog
src/components/dashboard/BrandTierStrip.jsx
                                  (NEW)       — Dashboard hero widget
```

Touches:
- `src/components/tires/MarginFilters.jsx` — drop `<InlineBrand>` and the `brands` / `brand` / `onBrand` props. Filter chip row collapses to LR + tags.
- `src/components/tires/TiresDashboard.jsx` — render `<BrandStatsRow>` above the toolbar; remove the `<InlineBrand>` integration with `MarginFilters`; thread `selectedCategory` into `useBrandAggregates`.
- `src/components/tires/MarginTable.jsx` — drop the `TireDescriptionCellForTest` export (tech-debt fold-in); `MarginTable.test.jsx` switches to `vi.importActual('./MarginTable.jsx')` and reaches into the memoized component via the existing import.
- `src/components/dashboard/DashboardPage.jsx` (or whatever the Dashboard route file is — to be confirmed during plan) — mount `<BrandTierStrip>` near the top.
- `src/hooks/useDashboardSignals.js` — slim down: stop reading `categoryMap` (delegated to `useCategoryMap`); consumers update.
- 5 callers that inline `'passenger' | 'lightTruck' | 'truck'` — switch to `TIRE_CATEGORY_KEYS`. Identified during plan.

### `useBrandAggregates` selector contract

```js
/**
 * Build per-brand aggregates from an enriched tire list.
 *
 * @param {Array<EnrichedTire>} tires   — TiresDashboard enriched rows
 * @param {string|null}         category — 'passenger' | 'lightTruck' | 'truck' | null (null = all)
 * @returns {{
 *   total: number,                                    // tires across all brands in scope
 *   brands: Array<{
 *     brand: string,                                  // canonical uppercase, e.g. 'MICHELIN'
 *     count: number,                                  // SKUs in scope
 *     avgListingMarginPct: number | null,             // mean of computeListingMargin (researched only); null if no researched retails
 *     avgResearchedRetail: number | null,             // mean priceIntel.retailPrice (researched only)
 *     offProgramCount: number,                        // tires with offProgramAt set
 *     missingRetailResearchCount: number,             // tires with no priceIntel.retailPrice
 *   }>,
 *   missingBrands: Array<string>,                     // EXPECTED_BRANDS that have count===0 in scope
 * }}
 */
```

`EXPECTED_BRANDS` is a hard-coded constant `['MICHELIN', 'BFGOODRICH', 'UNIROYAL']` matching the three brands in the Loveland eFleet account. Future brands additions edit one place. The selector's output `brands` array is sorted by `count` descending so the most-stocked brand always renders first.

Memoized on `(tires, category)`. Computation is O(n) per row, single pass building per-brand running totals into a `Map<string, BrandAccum>`, then Object.fromEntries-style serialization. For 1,628 tires the work is sub-millisecond on a modern laptop.

### `BrandStatsRow` component

```jsx
<BrandStatsRow
  brands={brands}                  // brands array from useBrandAggregates
  total={total}
  selectedBrand={brand}            // null | string
  onBrandChange={onBrand}          // (next: string|null) => void
/>
```

Renders horizontally, flex-wrap on desktop, `overflow-x-auto scroll-snap-x mandatory` on mobile (`<sm`). Each pill is a `<button role="tab">` inside `role="tablist"`. The leading `All` pill is `aria-selected={selectedBrand == null}`. Brand pills use `aria-selected={selectedBrand === brand}` and active state shows filled bg via `bg-[color-mix(in_oklab,var(--color-brand-X)_18%,transparent)]` + brand-color text.

Click contract:
- Click `All` → `onBrandChange(null)` (clear filter)
- Click a brand pill → `onBrandChange(brandName)` (set filter)
- Click the currently-selected brand → noop (no toggle-off; matches CategoryTabs)
- Keyboard: arrow-keys move focus between pills, `Enter`/`Space` activates (matches CategoryTabs pattern)

Below each pill in the desktop view:

```
MICHELIN
627 SKUs · 22.6%
```

On mobile the `· 22.6%` line is dropped to keep pill width compact; long-press / hover surfaces it via `title`.

### `BrandTierStrip` component

```jsx
<BrandTierStrip aggregates={aggregates} navigate={navigate} />
```

Renders all `EXPECTED_BRANDS` (not just stocked) so a missing brand surfaces visibly. Layout is a horizontal row of cards; on `<sm` cards stack vertically. Cards click-navigate to `/tires?brand=<UPPERCASE>` via the `navigate` prop (react-router `useNavigate`). `0`-SKU brands render with `border-red-500 text-red-500` and a `NOT STOCKED` badge per the brainstorming decision (option B — only zero is a warning, no thin-coverage threshold).

### Filter chip row interplay

`MarginFilters` currently has three rows on desktop:
1. min margin · brand select · needs-reposting · clear filters
2. LR chip row
3. Tags chip row

After the change:
1. min margin · needs-reposting · clear filters (brand select removed)
2. LR chip row
3. Tags chip row

The `BrandStatsRow` lives ABOVE the entire MarginFilters card, in `TiresDashboard.jsx`. Visual hierarchy: brand pills → filter card → table.

## Data flow

`TiresDashboard.jsx`:
- Already memoizes `enriched` and `selectedCategory`.
- Adds `const aggregates = useBrandAggregates(enriched, selectedCategory)`.
- Passes `aggregates.brands`, `aggregates.total`, current `brand`, `onBrand` (existing setter) to `<BrandStatsRow>`.
- Removes the `brands={...}` / `brand={...}` / `onBrand={...}` props from `<MarginFilters>` (they're absorbed by `<BrandStatsRow>`).

`DashboardPage.jsx`:
- Reads `tires` from existing dashboard signals path (or directly via `useTires()` if that exists; verify during plan).
- Calls `useBrandAggregates(tires, null)` — null category for portfolio view.
- Renders `<BrandTierStrip>` near the top of the dashboard, above the existing widgets.

## Edge cases

- **No tires loaded yet (initial render):** `useBrandAggregates([], category)` returns `{ total: 0, brands: [], missingBrands: EXPECTED_BRANDS }`. `BrandStatsRow` shows skeleton pills with `· loading` instead of count. `BrandTierStrip` shows skeleton cards.
- **Brand string normalization:** `BFG` and `BFGOODRICH` exist in the data. Selector uppercases-and-trims `tire.brand` before bucketing; `EXPECTED_BRANDS` uses the canonical uppercase (`'BFGOODRICH'`). A normalization helper `normalizeBrand(s) → 'MICHELIN' | 'BFGOODRICH' | 'UNIROYAL' | <other-uppercased>`.
- **Tires with empty/null brand:** bucketed under `'(unknown)'`. The pill for `(unknown)` only renders if `count > 0`.
- **Researched-only margin avg:** `priceIntel.retailPrice` may be missing or be a catalog-median estimate. Use `tireRetailIsResearched(tire)` (existing helper) to filter the population that contributes to `avgListingMarginPct`. Tires with no researched retail still count toward `count` but not toward the margin avg. If a brand has zero researched retails, `avgListingMarginPct` is null and the pill displays `--`.
- **Category filter scope on the catalog:** when `selectedCategory === 'passenger'`, the aggregates filter to passenger tires only. The brand counts shrink. The `[All]` pill shows `passenger total`, not whole-catalog total. This is the click-into-context behavior locked in during brainstorming.
- **Filter preset save/load:** unchanged. Presets serialize the `brand` field as before; the pill row drives reads and writes against the same state slice.

## Testing

### Unit

- `useBrandAggregates.test.js` — count, avg margin (researched-only), avg retail (researched-only), off-program count, missing-research count, category scoping, missingBrands list, sort-by-count-desc, empty-input safety, brand normalization (`bfg` → `BFGOODRICH`).
- `BrandStatsRow.test.jsx` — All-pill renders + has `aria-selected={true}` when `selectedBrand === null`; clicking a pill calls `onBrandChange(brand)`; clicking All calls `onBrandChange(null)`; clicking the already-selected pill does NOT call `onBrandChange`; keyboard arrow-key navigation (matches CategoryTabs test pattern).
- `BrandTierStrip.test.jsx` — renders all `EXPECTED_BRANDS` even when stocked count is 0; 0-count cards carry a `NOT STOCKED` badge and apply the red border class; clicking a card calls `navigate('/tires?brand=<X>')`.
- `tireCategory.test.js` — sanity: the constant exposes the three keys and their labels.

### Integration

- `TiresDashboard.test.jsx` — selecting a brand pill in `<BrandStatsRow>` mutates the brand filter that flows into the table (asserted via row count or first-row brand inspection); the deprecated `<InlineBrand>` is gone (`getByLabelText('Brand')` for the `<select>` returns null).
- `MarginFilters.test.jsx` — the `brand`/`brands`/`onBrand` props are no longer accepted, the `<InlineBrand>` slot is gone (snapshot or markup assertion).

### Bundle size

The 42 KB tires-page cap stays. Two small components (~120 LOC total) plus the selector add ~2 KB gzipped — well within budget. Dashboard page chunk has its own cap; the `<BrandTierStrip>` adds maybe 1.5 KB.

### Visual / a11y

- Mobile: pill row scrolls horizontally with snap; the active pill auto-scrolls into view on `selectedBrand` change. Snapshot under tablet-768 + mobile-375 gets fresh baselines via the existing `Visual tests - update Linux baselines` workflow.
- Color contrast: brand pill active state uses `text-[color:var(--color-brand-X)]` on `bg-[color-mix(in_oklab,var(--color-brand-X)_18%,transparent)]`. The 18% mix produces a tinted background while keeping pill text contrast above 4.5:1 in both light and dark modes (verify in axe pass during plan).

## Risks

- **Brand chip removal regression:** any consumer of `MarginFilters` outside `TiresDashboard` would break. `git grep` confirms `MarginFilters` is only mounted from `TiresDashboard.jsx` — clean.
- **Filter preset deserialization:** old saved presets carry a `brand` value; the new pill row reads the same state slice. No migration needed. Verify with a manual roundtrip during PR review.
- **Aggregator perf at 5K+ tires:** if the catalog grows, the single-pass build is still O(n). At 10K rows it's ~100 µs; not a concern.

## Out of scope

- AI sales advisor drawer
- Catalog-first drill-down
- Customer-facing read-only catalog
- Brand color palette refresh
- Multi-brand selection
- Change-detection (option C from brainstorming — needs `meta/categoryMap` schema change)
