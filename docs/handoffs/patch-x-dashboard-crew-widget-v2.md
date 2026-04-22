---
id: X
title: Crew widget v2 UI (consume crewSignals)
branch: dashboard-crew-widget-v2
depends_on:
  - T
touches_shared: []
frontend_only: true
---

# Patch X: Crew widget v2 UI (consume crewSignals)

Branch: `dashboard-crew-widget-v2`

Scope (files touched):

- `src/components/dashboard/CrewDirectoryWidget.jsx` - NEW. Renders the crew directory with WIP count badge, today's completions, streak days, and online / offline dot per user. Reads from the `crewSignals` map shipped by Patch R and now exposed through `useDashboardSignals` by Patch T.
- `src/components/dashboard/CrewDirectoryWidget.test.jsx` - NEW.

No hook or backend edits. The current inline Crew section inside `Dashboard.jsx` stays in place until Patch Y swaps it out.

## Tasks

1. **Component API**: `CrewDirectoryWidget({ crew, crewSignals = {}, loading })`. `crew` matches the existing `crewPreview` return shape (`{ users: Array<{ id, data }>, hasMore: boolean }`). `crewSignals` is the map shipped by Patch R keyed by uid.

2. **Loading / empty states**:
   - `loading === true`: render four skeleton rows (`h-12 animate-pulse rounded-lg bg-zinc-800/60`).
   - `crew.users.length === 0` with `loading === false`: `No crew rows loaded.` in `text-sm text-zinc-500`.

3. **Populated rows**:
   - Card chrome: `rounded-xl bg-zinc-900/60 p-[14px]` with `pc-card` class.
   - Header: label `Crew` at `text-[9px] font-bold uppercase tracking-[0.12em] text-zinc-500`, plus a `View all` link to `/people` (right-aligned, `text-xs font-medium text-amber-300/90 hover:underline`) when `crew.hasMore`.
   - Row: flex row justify-between, `py-2.5 first:pt-0`, divided by `divide-y divide-zinc-800/80`.
   - Left: a 2 px online / offline dot (`h-2 w-2 rounded-full`) followed by display name and crew tag. Online when `Date.now() - sig.lastSeenAt < 5 * 60 * 1000`. Online dot: `bg-[#32CD32]`. Offline: `bg-zinc-600`. Display name: the same helper used in the existing Dashboard (`firstName lastName`, fall back to email); re-implement the helper locally to avoid importing from `Dashboard.jsx`. Crew tag: `data.crewTag` or `crewTagFromRole(data.role || 'viewer')` from `src/constants/peoplePermissions.js`.
   - Right: a WIP badge when `sig.wipCount > 0` (`inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500/20 px-1.5 text-[10px] font-semibold text-amber-200` showing the count), then a small two-line block: `N today` over `N day streak` (both `text-[10px]`, the streak line `text-zinc-500`).
   - `#32CD32` is the Precision Cockpit active-signal color. It is used here only for the online dot; do not paint anything else at that hue in this widget.

4. **Accessibility**: set `aria-label="online"` or `aria-label="offline"` on the presence dot.

5. **Tests**:
   - Two-user fixture with signals renders the name, the WIP badge value, `5 today`, and `4 day streak`.
   - `loading` renders at least one element with the `animate-pulse` class.
   - Empty `users` array with `loading: false` renders the `No crew rows loaded.` copy.

## Out of scope

- Dashboard composition - Patch Y removes the inline Crew section and mounts this widget.
- Presence heartbeat - already shipped in Patch R.
- Per-user deep-link routing on row click. v1 is read-only; a follow-on can add click-through to `/people/:uid`.

## Validation

```
npm run lint
npm run test -- CrewDirectoryWidget
npm run build
```

All must pass.

## PR title

`Crew widget v2 UI (WIP, completions, streaks, online dots)`

Execute this brief exactly. Branch from main, run all validation commands before opening the PR, and stop after the PR is open.
