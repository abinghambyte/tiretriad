---
id: 405
title: TiresDashboard refactor (Option D — highest risk; runs after 401-404)
branch: refactor-tires-dashboard
depends_on:
  - 401
  - 402
  - 403
  - 404
touches_shared:
  - src/components/tires/TiresDashboard.jsx
frontend_only: true
---

# Patch 405 — TiresDashboard refactor (Option D)

**READ FIRST: `BATCH-10-PATTERN.md`** + every prior Batch 10 PR (401-404). This is the largest refactor in the batch and the highest blast radius. Apply the pattern conservatively.

## Branch

`refactor-tires-dashboard`

## Scope

`src/components/tires/TiresDashboard.jsx` (1262 lines) is the core product surface. It owns: 14+ useState (filters, sort, selection, modal flags, persistent flags), 7 useEffects, URL ↔ state sync, mobile selection bar (from PR-1), HaggleSheet mount, ListingGenerator mount, QuoteCalculator mount, BulkCtsModal mount, SaleMessenger mount.

Refactor target shape:

```
src/utils/tireSelectors.js
  selectVisibleTires(tires, filters, search)
  selectSortedTires(tires, sortKey, sortDir)
  selectHiddenGems(tires)              ← already exists somewhere; relocate here
  selectTopOpportunities(tires, ...)
  // pure derivations
src/utils/tireSelectors.test.js

src/components/tires/useTiresDashboard.js
  Composes sub-hooks:
    useTireFilters()      (filter chips, search, persistent URL sync)
    useTireSort()         (sort key + direction)
    useTireSelection()    (selectedIds set + toggle/clear/all)
    useTireModals()       (which modal is open + payload — Haggle, Listing, Quote, BulkCts, Sale)
src/components/tires/useTiresDashboard.test.js

src/components/tires/TiresDashboard.jsx        ← thin shell, ~100 lines
src/components/tires/TiresFilterPanel.jsx
src/components/tires/TiresToolbar.jsx          ← sort/select-all/table-options
src/components/tires/TiresModalsMount.jsx      ← mounts whatever modal is open
```

## Specifics for this page

### Mobile selection bar from PR-1 stays untouched

The `<div className="fixed inset-x-0 bottom-0 ...">` mobile selection bar from PR #150 (patch 201) MUST keep working. The custom event dispatcher (`window.dispatchEvent(new CustomEvent('skedaddle:tires-selection', ...))`) that hides MobileBottomNav stays. Move the selection state into `useTireSelection`, but keep the side-effect that dispatches the event whenever `selectedIds.size` changes.

### MarginTable is NOT in this patch

`src/components/tires/MarginTable.jsx` is patch 406. This patch (405) only refactors `TiresDashboard.jsx`. The page passes `sortedRows` + handlers to `<MarginTable>` as props (already does this; preserve the contract).

### The 5 modals: keep them mountable from anywhere

HaggleSheet, ListingGenerator, QuoteCalculator, BulkCtsModal, SaleMessenger are all mounted from this file today. Move the open/close state into `useTireModals` and centralize via `<TiresModalsMount>`. Don't change the modal components themselves — just relocate the state owner.

### URL sync is real

Several states are persisted to the URL via `setSearchParams` (e.g., `?tab=catalog&filter=lowMargin&sort=margin`). `useTireFilters` and `useTireSort` need to absorb the URL ↔ state effects — and they need to handle both the initial-mount-from-URL case AND the user-changes-state-update-URL case symmetrically.

### Selectors that already exist

`selectHiddenGems`, `selectTopSellers`, `selectRollingAverageRevenue` are scattered across the codebase. **Don't move them** in this patch — the patch's scope is what's INSIDE `TiresDashboard.jsx`. If a selector is already in `src/hooks/useDashboardSignals.js`, leave it there (different page). The audit will flag any duplication separately.

## Process

Same shape as 401-404. Plus, because of the size:

- Make extraction commits very small — each sub-hook in its own commit, reviewable independently
- Run the visual + a11y tests (`npm run test:visual`) after every meaningful commit. Snapshots WILL diff because chrome moves around — that's fine and expected; verify the diffs match intent and regenerate baselines via the existing workflow_dispatch after merge
- Validate G1 mercilessly: this page has the most state, so the temptation to write a 200-line `useTiresDashboard` is real. Resist. Split into sub-hooks.

## Acceptance criteria

Same as patch-401. Plus:
- `<TiresDashboard>` is ≤ 120 lines after refactor (this is the largest god-component; allow a slightly higher bound)
- The mobile selection bar from PR-1 still works (selection bar appears on mobile when 1+ tires selected; bottom nav hides; all visible)
- All 5 modals still mount and render their existing UI
- URL ↔ state sync still works in both directions
- 'npm run test:visual' passes after baseline regen via workflow_dispatch

## Out of scope

- `MarginTable.jsx` (separate patch 406)
- Modal component internals
- The mobile cards (`<TireCardMobile>`) and their wiring (from PR-1)
- HaggleSheet bundle math (unrelated; landed in PR #154)
- Removing `selectHiddenGems` from `useDashboardSignals` (different file, different page; not this patch)

## Validation

```
npm run lint
npm run test
npm run build
npm run test:visual
```

After merge, trigger `Visual tests - update Linux baselines` workflow_dispatch and merge the resulting bot PR.

## PR title

`Refactor TiresDashboard into hook + selectors + subcomponents (Option D)`

Execute this brief exactly. Branch from main (after 401-404 have all merged), run all validation commands before opening the PR, and stop after the PR is open.
