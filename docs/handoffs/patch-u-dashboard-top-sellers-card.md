---
id: U
title: Top Sellers card UI
branch: dashboard-top-sellers-card
depends_on:
  - T
touches_shared: []
frontend_only: true
---

# Patch U: Top Sellers card UI

Branch: `dashboard-top-sellers-card`

Scope (files touched):

- `src/components/dashboard/TopSellersCard.jsx` - NEW. Presentational card with 50/50 column split: left half shows rank digit and sold count on a shared baseline with `SOLD` caption 8 px below the count; right half shows SKU, description, category. Flips through the full list every 3 seconds, pauses on hover. Paired palette per rank from Patch T.
- `src/components/dashboard/TopSellersCard.test.jsx` - NEW. Renders current slot fields, cycles on timer advance, pauses on mouse enter, empty-state when `sellers` is empty.

Consumes `topSellers` from `useDashboardSignals` (shipped in Patch T) and `paletteForRank` from `src/components/dashboard/topSellersPalette.js` (also Patch T). No hook or backend edits.

## Tasks

1. **Component API**: `TopSellersCard({ sellers = [], intervalMs = 3000 })`. Accept a potentially empty array. Do not throw when `sellers[0]` is undefined.

2. **Empty state**: when `sellers.length === 0`, render the card chrome with the label `Top Sellers` and body copy `No sales yet`. Keep the same padding and radius as the populated state so the 4-card strip grid does not shift.

3. **Populated state**:
   - Container: `rounded-xl bg-zinc-900/60 p-[14px]` with `pc-card` class (the Precision Cockpit hover-bloom utility lands in Patch Y; leave the class name in place so Patch Y is a no-op on this file).
   - Label: `text-[9px] font-bold uppercase tracking-[0.12em] text-zinc-500` reading `Top Sellers`.
   - Grid: `display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr)`. No gap. Right column gets `pl-4`.
   - Left half: flex row, `align-items: baseline`, `gap: 22px`, centered. A 96 px fixed-width slot for the rank digit and a 96 px fixed-width relative wrapper for the sold count so the paired centers do not drift between 1-digit and 3-digit values. Both numerals: 52 px, `font-extrabold`, `tabular-nums`, `lineHeight: 1`, colored with `palette.primary`. The `#` glyph renders at `font-size: 0.6em`, `vertical-align: 0.35em`, `font-weight: 500`, colored with `palette.accent`. The `SOLD` caption is absolutely positioned `top: calc(100% + 8px)` on the sold-count wrapper with `left: -20px; right: -20px; text-align: center; font-size: 13px; font-weight: 700; letter-spacing: 0.22em; text-transform: uppercase`, colored with `palette.accent`.
   - Right half: SKU on one line (`font-mono text-[18px] text-zinc-100 truncate`), description (`text-[13px] text-zinc-300 truncate`), category (`text-[10px] uppercase tracking-wide text-zinc-500` with `mt-1`).

4. **Flip cycle**: index advances every `intervalMs` while not hovered. Use a single `useEffect` with `setInterval` and a cleanup. When `sellers.length <= 1`, do not start the interval. Resume from the current index on unpause (do not restart at 0). When `idx >= sellers.length`, clamp to `sellers.length - 1` during render (avoids stale-index flashes when the list shrinks).

5. **Tests** (`@testing-library/react` + Vitest fake timers):
   - With two sellers, the first render shows rank 1 and its SKU / description; advancing time by `intervalMs` and re-rendering shows the second seller.
   - Empty array renders the empty-state copy.
   - Hovering the card (`fireEvent.mouseEnter`) freezes the cycle; a timer advance after the hover keeps the same seller visible.

## Out of scope

- Dashboard composition. The shell swap that puts this card into the grid ships in Patch Y.
- Framer-motion or CSS keyframe flip animations. The interval-driven content swap is the v1 behaviour; split-flap animation can be a follow-on.
- Any read from the hook inside this component. Sellers are passed in as a prop; the parent (Patch Y) does the hook read.

## Validation

```
npm run lint
npm run test -- TopSellersCard
npm run build
```

All must pass.

## PR title

`Dashboard Top Sellers card (flip cycle + paired palette)`

Execute this brief exactly. Branch from main, run all validation commands before opening the PR, and stop after the PR is open.
