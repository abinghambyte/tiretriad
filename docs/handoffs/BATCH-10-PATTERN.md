# Batch 10 — God-component refactor pattern

**Read this before any of patch-401 / 402 / 403 / 404.** Every brief in Batch 10 follows the same Option D pattern, plus the same guardrails. This document is the canonical reference; each individual brief specifies only what's unique to that page.

## The pattern (Option D)

For each god-component, refactor in this exact shape:

```
src/utils/<page>Selectors.js          ← pure functions (sort/filter/derive)
src/utils/<page>Selectors.test.js     ← unit tests, no React, fast
src/components/<area>/use<Page>.js    ← page-level state + effects + handlers
src/components/<area>/use<Page>.test.js ← renderHook tests for state transitions
src/components/<area>/<Page>.jsx      ← thin shell, calls the hook, renders subcomponents
src/components/<area>/<Subcomponent>.jsx ← pure presentation, takes prop slices
```

The page (`<Page>.jsx`) shrinks to ~50-100 lines of orchestration:

```jsx
export function TiresDashboard() {
  const dash = useTiresDashboard()
  return (
    <PageShell>
      <FilterPanel
        filters={dash.filters}
        onFilterChange={dash.setFilter}
      />
      <MarginTable
        rows={dash.sortedRows}
        sort={dash.sort}
        onSortChange={dash.setSort}
        selectedIds={dash.selectedIds}
        onToggleSelect={dash.toggleSelection}
      />
      <SelectionBar
        count={dash.selectedIds.size}
        onClear={dash.clearSelection}
      />
    </PageShell>
  )
}
```

## Hard guardrails

These are non-negotiable. Every reviewer should reject a brief that violates them.

### G1 — No god-hooks

A single hook MUST NOT exceed:
- **150 lines** of code (excluding imports / exports / type comments)
- **12 named values** in its return object

If your hook would exceed either, **split it into composable sub-hooks**. Example:

```js
// AVOID:
export function useTiresDashboard() {
  // 14 useState, 7 useEffect, 18 named returns... 220 lines
}

// PREFER:
function useTireFilters() { /* ~50 lines, 5 returns */ }
function useTireSelection() { /* ~30 lines, 4 returns */ }
function useTireSort() { /* ~25 lines, 3 returns */ }
function useTireModals() { /* ~40 lines, 4 returns */ }

export function useTiresDashboard() {
  const filters = useTireFilters()
  const selection = useTireSelection()
  const sort = useTireSort()
  const modals = useTireModals()
  // Compose: ~30 lines, returns spread of all four sub-hooks plus
  // any cross-cutting derivations.
  return { ...filters, ...selection, ...sort, ...modals }
}
```

The page hook composes; the sub-hooks own discrete state slices.

### G2 — Subcomponents take prop slices, NOT the hook

Pure presentation components (`<MarginRow>`, `<FilterChip>`, `<LeadCard>`, `<UserRow>`) MUST receive only the props they need, not the entire `dash` object.

```jsx
// CORRECT
<MarginRow
  tire={tire}
  selected={dash.selectedIds.has(tire.id)}
  onToggle={() => dash.toggleSelection(tire.id)}
/>

// WRONG — couples the leaf to the whole hook
<MarginRow tire={tire} dash={dash} />
```

This keeps leaf components snapshot-testable in isolation without mocking the hook.

### G3 — Selectors are pure

Anything in `src/utils/<page>Selectors.js` MUST be a pure function. No `useState`, no `useEffect`, no `useMemo`, no `import` from React. Selectors take inputs and return outputs.

```js
// CORRECT
export function selectVisibleTires(tires, filters, sortKey) { /* pure */ }

// WRONG
export function useVisibleTires(tires, filters, sortKey) {
  return useMemo(() => /* ... */, [tires, filters, sortKey])
}
```

The hook calls `useMemo` around selector calls, not the selector itself. This keeps selectors trivially unit-testable.

### G4 — Behavioral test coverage is non-optional

Every brief in Batch 10 MUST add:
- Selector unit tests for any non-trivial sort/filter/derive logic
- renderHook tests for state transitions the user can trigger (apply filter while sorted, toggle selection, open then close a modal)
- At minimum, the regressions you find while reading the existing code

The visual safety net only catches **chrome diffs**. Behavioral diffs ("filter no longer narrows when applied while sorted by margin") are invisible to it. Tests are the only net.

## Sequential dispatch order

1. **401 PeopleDashboard** — smallest (737 lines), lowest blast radius. Validates the pattern.
2. **402 CrmPage + 403 CrmAccountDetailPanel + 404 OrdersList** — same domain (sales/customer flow), same shape. After 401 lands, dispatch 402, 403, 404 in parallel — they touch independent files.
3. **405 TiresDashboard + 406 MarginTable** — highest risk. Ship 405 first; 406 after 405 lands.

## Per-page specifics

See:
- `patch-401-people-dashboard-refactor.md`
- `patch-402-crm-page-refactor.md`
- `patch-403-crm-account-detail-refactor.md`
- `patch-404-orders-list-refactor.md`
- `patch-405-tires-dashboard-refactor.md`
- `patch-406-margin-table-refactor.md`

Each brief incorporates this pattern by reference and specifies only what's unique to that page.
