---
id: W
title: Dashboard activity ticker
branch: dashboard-activity-ticker
depends_on: []
touches_shared: []
frontend_only: true
---

# Patch W: Dashboard activity ticker

Branch: `dashboard-activity-ticker`

Scope (files touched):

- `src/components/dashboard/ActivityTicker.jsx` - NEW. Full-width horizontally-scrolling chip bar. Right-to-left scroll over 35 seconds, pauses on hover. Chips are color-coded by `kind` (inventory / kyle / ops / people / neutral).
- `src/components/dashboard/ActivityTicker.test.jsx` - NEW.

Pure presentational; consumes a `chips` prop. The parent (Patch Y) composes the chip list from `useDashboardSignals` fields.

## Tasks

1. **Component API**: `ActivityTicker({ chips = [] })`. Each chip is `{ id, kind, label }` where `kind` is one of `inventory | kyle | ops | people | neutral`. Unknown kinds fall back to `neutral`.

2. **Render rules**:
   - When `chips.length === 0`, render nothing (`return null`).
   - Root container: `relative w-full overflow-hidden rounded-xl bg-zinc-900/60 py-2` with `aria-label="Activity ticker"`. Apply the `pc-card` class (hover-bloom utility lands in Patch Y).
   - Inner track: `flex min-w-max gap-3 whitespace-nowrap px-3`. Duplicate the chip list twice inside the track so the translateX animation can seamlessly loop.
   - Animation: apply a CSS keyframe `ticker-scroll` (declared inline in this component's `<style>` block) that moves `transform: translateX(0)` to `translateX(-50%)` over 35 s linear infinite. Hover pauses by setting `animation: none`.
   - Chip classes:
     ```
     inventory: bg-teal-500/15 text-teal-200 border-teal-700/40
     kyle:      bg-amber-500/15 text-amber-200 border-amber-700/40
     ops:       bg-rose-500/15 text-rose-200 border-rose-700/40
     people:    bg-emerald-500/15 text-emerald-200 border-emerald-700/40
     neutral:   bg-zinc-700/30 text-zinc-200 border-zinc-700/50
     ```
     Each chip: `inline-flex items-center rounded-full border px-3 py-1 text-xs`.

3. **Tests**:
   - Renders the label text of each chip in a four-chip fixture.
   - Returns `null` (no DOM rendered) for an empty chips array - assert that `container.firstChild` is `null`.

## Out of scope

- Wiring chips from the dashboard signals - Patch Y owns that composition.
- Crew-alert removal from the old 4-card strip - also Patch Y.
- Accessible live-region announcements for new chips. v1 is decorative; a follow-on patch can add `aria-live` once the content stabilizes.

## Validation

```
npm run lint
npm run test -- ActivityTicker
npm run build
```

All must pass.

## PR title

`Dashboard activity ticker`

Execute this brief exactly. Branch from main, run all validation commands before opening the PR, and stop after the PR is open.
