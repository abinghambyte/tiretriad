# Patch D - Tires perf memoization

You are a Cursor agent shipping ONE patch from a parallel rollout. Six other patches (A, B, C, E, F, G) are in flight concurrently. Do not touch any file outside the scope below. See `docs/handoffs/README.md` for the full ownership map if needed.

## Goal

Stop the margin table from fully re-rendering on every filter keystroke.

## Branch

`tires-memo-perf` (cut from latest `main`).

## Context

`src/components/tires/TiresDashboard.jsx` passes a fresh `filteredAndSortedData` array to `MarginTable` on every render. Sort state lives inside `MarginTable`, creating two-way coupling between parent and child.

Patch B (`shared-utils`) is landing a `useFirestoreQuery` hook in parallel. DO NOT depend on it here. Keep local memoization only. A follow-up PR will migrate callers once B has landed and settled.

## Scope (only touch these files)

* `src/components/tires/TiresDashboard.jsx`
* `src/components/tires/MarginTable.jsx`

## Tasks

1. In `TiresDashboard.jsx`, wrap the filter-plus-sort pipeline in `useMemo` keyed on the real inputs (raw `tires`, filter state object, search query, sort key, sort direction). The output is the array passed to `MarginTable`.
2. Lift sort state (`sortKey`, `sortDir`) out of `MarginTable` into `TiresDashboard`. Pass `sortKey`, `sortDir`, and `onSortChange(nextKey, nextDir)` as props.
3. `MarginTable` becomes pure for sort purposes: it renders sorted rows and calls `onSortChange` when the header is clicked. No internal sort state.
4. Verify in React DevTools profiler that typing in the filter input no longer re-renders the memoized row components when their row data is unchanged.

## Out of scope

Column config, CTS editor internals, virtualization tweaks, anything outside sort-state lifting and filter memoization.

## Validation

```
./node_modules/.bin/vitest run
./node_modules/.bin/eslint src/components/tires/TiresDashboard.jsx src/components/tires/MarginTable.jsx
./node_modules/.bin/vite build
```

Manual: load `/tires` with a populated catalog, type fast in the filter input, confirm no visible jank.

## PR

* Title: `Tires: memoize filter pipeline, lift sort state`
* Body: short summary plus Test plan checklist. No Claude trailers, no em dashes in published text.

Stop after the PR is open.
