---
id: T
title: Dashboard top-sellers data pipeline
branch: dashboard-top-sellers-data
depends_on: []
touches_shared:
  - src/hooks/useDashboardSignals.js
  - functions/financeStats.js
frontend_only: false
deploy:
  functions:
    - onOrderCompletedUpdateStats
  firestore_rules: false
  scripts: []
---

# Patch T: Dashboard top-sellers data pipeline

Branch: `dashboard-top-sellers-data`

Scope (files touched):

- `functions/financeStats.js` - extend the existing revenue-stats writer with a top-10-sellers aggregation. Query `tires` ordered by `salesCount desc limit 10`, shape via a new exported helper `buildTopSellersAggregate`, and merge the result into the `meta/revenueStats` doc under `topSellers`.
- `functions/financeStats.test.js` - NEW (or extend if present). Cover `buildTopSellersAggregate`: rank ordering, 1-based rank assignment, skipping rows with zero or missing `salesCount`, truncating at 10.
- `src/components/dashboard/topSellersPalette.js` - NEW. Exports `TOP_SELLERS_PALETTE` (10-entry paired palette from the spec Appendix A) and `paletteForRank(rank)` that wraps out-of-range ranks.
- `src/components/dashboard/topSellersPalette.test.js` - NEW. Palette entries distinct per row, correct values for rank 1 and 10, wrap-around safe.
- `src/hooks/useDashboardSignals.js` - add two pure selectors and expose three new hook return fields. Selectors: `selectHiddenGems(tires)` (marginConfirmed AND fewer than 2 active platform listings) and `selectTopSellersFromRevenueDoc(doc)` (safe passthrough). Memos wire them to the hook's existing tire snapshot and `meta/revenueStats` subscription. Return object gains `topSellers`, `hiddenGems`, `allTimeMargin`, `crewSignals`, and `crewSignalsLoading` (the last two expose the existing `crewSignalsState` that is already maintained internally but is not currently returned to consumers).
- `src/hooks/useDashboardSignals.test.js` - extend. Cover both selectors.

No schema changes. `tires` already carries `salesCount` (incremented by the existing finance worker), `marginConfirmed`, and `platformListings`. `meta/revenueStats` already carries `allTimeMargin`. The `topSellers` array is new but writes via merge so absence is a valid empty-state.

## Tasks

1. **Paired palette module** (`src/components/dashboard/topSellersPalette.js`):
   - Export `TOP_SELLERS_PALETTE` as an array of 10 `{ primary, accent }` hex pairs matching the Appendix A table in `docs/superpowers/specs/2026-04-21-dashboard-redesign-design.md`. The primary paints the big numerals (rank digit + sold count); the accent paints the `#` glyph and the `SOLD` caption. Each row must have `primary !== accent`.
   - Export `paletteForRank(rank)` that returns the entry at `((rank - 1) mod 10)` with safe wrapping for 0 and values greater than 10.

2. **`buildTopSellersAggregate` helper** (`functions/financeStats.js`):
   - Pure function that accepts the docs array from a Firestore snapshot (each doc exposes `.id` and `.data()`), filters out rows with non-finite or non-positive `salesCount`, sorts by `salesCount` descending, truncates to 10, and returns `{ rank, sku, description, category, salesCount }` with `rank` 1-based. `sku` falls back to `doc.id` when `mspn` is absent. `description` and `category` default to empty strings.

3. **Wire the aggregate into the revenue-stats writer**: inside the routine that currently updates `meta/revenueStats` with `allTimeMargin` (near line 211 in `financeStats.js`), run
   ```js
   const tiresSnap = await db
     .collection('tires')
     .orderBy('salesCount', 'desc')
     .limit(10)
     .get()
   const topSellers = buildTopSellersAggregate(tiresSnap.docs)
   ```
   and include `topSellers` in the same `set(..., { merge: true })` payload that writes `allTimeMargin`. Do not introduce a separate write.

4. **Hook selectors** (`src/hooks/useDashboardSignals.js`):
   - Export `selectHiddenGems(tires)` and `selectTopSellersFromRevenueDoc(doc)` at module scope for unit testing. `tires` here is the same `{ id, data }` shape the hook already maintains internally.
   - `selectHiddenGems`: for each tire, keep rows where `marginConfirmed === true` and fewer than 2 entries in `platformListings` have `status === 'active'`. Return `{ id, sku, description, platformCount, platforms, lastPostedAt }`. `sku` falls back to `mspn` then `sku` then `id`. `lastPostedAt` is the maximum `platformListings[*].lastPostedAt` timestamp across platforms, or `null` if none exist.
   - `selectTopSellersFromRevenueDoc`: return `doc?.topSellers` when it is an array; otherwise `[]`.
   - Inside the hook body, memoize `topSellers`, `hiddenGems`, and a plain numeric `allTimeMargin = Number(revenueStatsDoc?.allTimeMargin) || 0`. Reuse the existing state variables that back the current `signalBar` / tire subscription - do not add new listeners.
   - Extend the return object with `topSellers`, `hiddenGems`, `allTimeMargin`, `crewSignals: crewSignalsState.map`, `crewSignalsLoading: crewSignalsState.loading`. Do not break any existing field. `crewSignalsState` is already maintained (added in Patch R) but is not currently exposed to consumers.

5. **Tests**:
   - `topSellersPalette.test.js`: 10 entries, each with distinct `primary` vs `accent`, specific spot-checks for rank 1 (`#fbbf24` / `#94a3b8`) and rank 10 (`#94a3b8` / `#fcd34d`), wrap behaviour for rank 0 and rank 11.
   - `functions/financeStats.test.js`: `buildTopSellersAggregate` with 15 docs returns 10 rows ranked 1 to 10 in descending `salesCount` order; with 3 docs where one has no `salesCount` returns 2 rows; docs with `salesCount <= 0` are skipped.
   - `useDashboardSignals.test.js`: `selectHiddenGems` rejects `marginConfirmed !== true`, rejects tires with 2 or more active listings, keeps 1-active and 0-active rows, surfaces the max `lastPostedAt`. `selectTopSellersFromRevenueDoc` returns `[]` for `{}` and passes arrays through unchanged.

6. **Manual smoke after deploy**: trigger one order completion in the staging project (or run the existing stats backfill script if it is already wired) and confirm `meta/revenueStats.topSellers` appears in Firestore with ten rows.

## Out of scope

- Any UI. This patch delivers the data contract only. Top Sellers UI ships in Patch U; Hidden Gems UI ships in Patch V.
- New Firestore indexes beyond what the existing `tires` queries already require. The `orderBy('salesCount','desc').limit(10)` query uses the default single-field index.
- Rolling-average or hot-state comparison on today's revenue. That is a follow-on once the data source is settled.

## Validation

```
cd functions && npm test -- financeStats
cd functions && npm run lint
cd .. && npm run lint
npm run test -- topSellersPalette
npm run test -- useDashboardSignals
npm run build
```

All must pass.

## Deploy note (include in PR body)

`firebase deploy --only functions:onOrderCompletedUpdateStats` after merge. No Firestore rules change.

## PR title

`Dashboard top-sellers aggregation + hook selectors`

Execute this brief exactly. Branch from main, run all validation commands before opening the PR, and stop after the PR is open.
