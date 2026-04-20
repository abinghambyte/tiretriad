# Patch A - Palette polish

You are a Cursor agent shipping ONE patch from a parallel rollout. Six other patches (B, C, D, E, F, G) are in flight concurrently. Do not touch any file outside the scope below. See `docs/handoffs/README.md` for the full ownership map if needed.

## Goal

Debounce the command palette Firestore search and stabilize `buildPaletteActions` dependencies so keystrokes stop thrashing.

## Branch

`palette-polish` (cut from latest `main`).

## Context

* `src/components/layout/CommandPalette.jsx` around line 112 fires four parallel `getDocs` calls on every keystroke once the query reaches 2+ characters. No debounce.
* `buildPaletteActions` in the palette is re-memoed on every `PortalChrome` render because `navigate` and `onClose` are unstable callbacks.

## Scope (only touch these files)

* `src/components/layout/CommandPalette.jsx`
* `src/components/layout/PortalChrome.jsx`
* NEW: `src/components/layout/CommandPalette.test.jsx` (create if it does not exist)

## Tasks

1. In `CommandPalette.jsx`, debounce the effect that calls `runSearch(q)` by ~120ms. Use `useEffect` + `setTimeout` keyed on `q`. Cancel on unmount and on next keystroke. Keep the min-length 2 guard.
2. In `PortalChrome.jsx`, wrap `closePalette` and `navigate` handoff in `useCallback` so their identity is stable across renders. Confirm the `actions` `useMemo` inside `CommandPalette` does not recompute on unrelated renders.
3. Add a vitest using fake timers: three keystrokes inside 120ms fire exactly one search call.

## Out of scope

Action registry changes, UI styling, unrelated refactors.

## Validation (must all pass before PR)

```
./node_modules/.bin/vitest run
./node_modules/.bin/eslint src/components/layout/CommandPalette.jsx src/components/layout/PortalChrome.jsx src/components/layout/CommandPalette.test.jsx
./node_modules/.bin/vite build
```

## PR

* Title: `Command palette: debounce search + stabilize action deps`
* Body: short summary plus Test plan checklist. No Claude trailers, no em dashes in published text.

Stop after the PR is open.
