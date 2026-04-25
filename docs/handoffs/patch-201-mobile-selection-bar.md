---
id: 201
title: Mobile selection bar (Quote + List only) + Popover off-screen clip fix
branch: mobile-selection-bar
depends_on: []
touches_shared:
  - src/components/tires/TiresDashboard.jsx
  - src/components/ui/Popover.jsx
  - src/components/layout/MobileBottomNav.jsx
frontend_only: true
---

# Patch 201 — Mobile selection bar + Popover clip fix

The current mobile selection action stack (Generate listings / Quote / Log sale / Notify team / Log prospective order / Clear selection / Bulk overhead edit) takes over the entire viewport when even one tire is selected. The user can no longer see the cards they selected. Replace with a thin sticky bottom bar showing only Quote and List. Other actions are removed from mobile entirely and stay on desktop.

Also fix a Popover primitive bug where popovers anchored at the right edge of the viewport clip off-screen.

## Branch

`mobile-selection-bar`

## Scope

**Modify:**
- `src/components/tires/TiresDashboard.jsx` — split the bulk-action toolbar into a desktop block (existing, unchanged) and a new mobile sticky-bottom block with only Quote + List
- `src/components/ui/Popover.jsx` — clamp position so right-anchored popovers don't render outside viewport
- `src/components/layout/MobileBottomNav.jsx` — hide the bottom nav (Home / Tires) while a selection bar is showing

## Design

### Mobile selection bar

Renders only when `selectedIds.size >= 1` AND viewport is `< sm` (640px). Position: `fixed bottom-0 inset-x-0 z-50` so it overlays the catalog cards but stays above them. Replaces the bottom nav while visible.

```jsx
{selectedIds.size > 0 ? (
  <div
    role="toolbar"
    aria-label="Tire selection actions"
    className="fixed inset-x-0 bottom-0 z-50 flex items-center gap-2 border-t border-zinc-800 bg-zinc-950 px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:hidden"
  >
    <button
      type="button"
      aria-label="Clear selection"
      onClick={clearSelection}
      className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:bg-zinc-800/60"
    >
      ×
    </button>
    <span className="flex-1 text-sm font-medium text-zinc-200">
      {selectedIds.size} selected
    </span>
    <button
      type="button"
      onClick={() => setQuoteOpen(true)}
      className="min-h-[40px] rounded-lg bg-amber-500 px-4 text-sm font-semibold text-zinc-950 hover:bg-amber-400"
    >
      Quote
    </button>
    <button
      type="button"
      onClick={() => setListingOpen(true)}
      disabled={selectedTires.length === 0 || loading}
      className="min-h-[40px] rounded-lg border border-zinc-600 bg-zinc-900 px-4 text-sm font-medium text-zinc-100 hover:border-zinc-500 hover:bg-zinc-800 disabled:opacity-50"
    >
      List
    </button>
  </div>
) : null}
```

### Desktop unchanged

The existing toolbar block (with Generate listings / Quote / Log sale / Notify team / Log prospective order / Clear selection / Bulk overhead edit) wraps in `<div className="hidden sm:block">...</div>` so it ONLY renders at sm and above. No code is removed; it just doesn't show on phones.

### MobileBottomNav hides during selection

`MobileBottomNav` needs to know when a selection is active so it can hide. Two options:
- Read a global state (Zustand/Jotai) — none currently exist; introducing one is overkill for this
- Use a CSS-only signal: pass through Tailwind by toggling a `data-selection-active` attr on `<body>` or a parent

**Simplest path:** in `TiresDashboard.jsx`, when `selectedIds.size > 0`, write `body.dataset.tiresSelection = 'active'` via a `useEffect`. `MobileBottomNav` reads `document.body.dataset.tiresSelection` once per render via state synced through a small `MutationObserver` OR (simpler) the existing component re-renders frequently enough that a `useState`-based check on mount + listener is fine.

Actually, **simpler still**: hide the bottom nav whenever the route is `/tires` AND a query-string flag is set, OR keep it always visible and let the selection bar overlap (it will, since the selection bar is `bottom-0 z-50` and the bottom nav is `bottom-0 z-[120]` — bottom nav would cover the selection bar).

**Cleanest implementation:**
- Selection bar gets `z-[125]` (above the bottom nav's z-[120])
- AND adds `bottom: env(safe-area-inset-bottom)` plus enough padding that it visually replaces the nav
- AND in `MobileBottomNav`, render nothing when `selectedIds.size > 0`. Pull the count from a custom event:

```jsx
// MobileBottomNav.jsx
const [selectionActive, setSelectionActive] = useState(false)
useEffect(() => {
  function onChange(e) { setSelectionActive(Boolean(e.detail?.active)) }
  window.addEventListener('skedaddle:tires-selection', onChange)
  return () => window.removeEventListener('skedaddle:tires-selection', onChange)
}, [])
if (selectionActive) return null
// ...existing render
```

```jsx
// TiresDashboard.jsx
useEffect(() => {
  window.dispatchEvent(new CustomEvent('skedaddle:tires-selection', {
    detail: { active: selectedIds.size > 0 }
  }))
  return () => {
    window.dispatchEvent(new CustomEvent('skedaddle:tires-selection', {
      detail: { active: false }
    }))
  }
}, [selectedIds.size])
```

A custom event is uglier than a context but contained — no global state plumbing through `<App>`. Acceptable for a single use case.

### Popover off-screen clip fix

`src/components/ui/Popover.jsx` `useLayoutEffect` currently positions via `right: window.innerWidth - rect.right` (when `align="end"`). When the anchor is far enough right that the popover would render past the viewport edge, no clamp exists. Fix:

```js
const popoverWidth = popoverRef.current?.offsetWidth || 180
const right = Math.max(8, window.innerWidth - rect.right) // base position
const computedLeft = window.innerWidth - right - popoverWidth
const safeLeft = Math.max(8, computedLeft)
const safeRight = window.innerWidth - safeLeft - popoverWidth
setPos({
  ...(flip === 'down' ? { top } : { bottom: viewportH - rect.top + 6 }),
  ...(align === 'end' ? { right: safeRight } : { left: rect.left }),
  flip,
})
```

The clamp `Math.max(8, ...)` ensures at least 8px from the viewport edge. For `align="start"`, do the same with `left`.

## Tasks

- [ ] Read `src/components/tires/TiresDashboard.jsx` to find the selection toolbar block (around line 1072 area: `selectedIds.size > 0 ?`)
- [ ] Wrap the existing toolbar block in `<div className="hidden sm:block">` so it only renders at sm and above
- [ ] Add the new mobile selection bar (sm:hidden) per the JSX above
- [ ] Add the custom-event dispatcher (selection state → `skedaddle:tires-selection`)
- [ ] Update `src/components/layout/MobileBottomNav.jsx` to listen for the event and hide itself when selection is active
- [ ] Update `src/components/ui/Popover.jsx` `useLayoutEffect` to clamp position so popovers don't clip off-screen at any anchor location
- [ ] Verify existing Popover tests still pass; add 1 new test that asserts a right-edge anchor produces a `safeRight >= 8` (or equivalent)

## Out of scope

- Multi-tire Quote — separate patch (202)
- Photo library — separate patch (203)
- Removing the action functions themselves (Notify team etc.) — they stay in code, just not surfaced on mobile

## Validation

```
npm run lint
npm run test
npm run build
```

All three clean. Vitest expects 1 new Popover test, otherwise no count delta.

## PR title

`Mobile tires selection: sticky bottom bar (Quote + List only) + Popover clip fix`

Execute this brief exactly. Branch from main, run all validation commands before opening the PR, and stop after the PR is open.
