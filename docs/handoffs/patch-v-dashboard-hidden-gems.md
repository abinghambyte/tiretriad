---
id: V
title: Hidden Gems surface UI
branch: dashboard-hidden-gems
depends_on:
  - T
touches_shared: []
frontend_only: true
---

# Patch V: Hidden Gems surface UI

Branch: `dashboard-hidden-gems`

Scope (files touched):

- `src/components/dashboard/HiddenGemsSurface.jsx` - NEW. Replaces the Catalog Health card in the dashboard grid (the actual swap is Patch Y). Renders up to 5 rows of tires that are ready to sell but not cross-posted, with a `View all N` affordance when more exist and an inline `Post it` action per row.
- `src/components/dashboard/HiddenGemsSurface.test.jsx` - NEW.

Consumes `hiddenGems` from `useDashboardSignals` (shipped in Patch T). No hook or backend edits.

## Tasks

1. **Component API**: `HiddenGemsSurface({ gems = [], onPost })`. `onPost` is called with a gem id when the row action is pressed, and with the sentinel string `'__all__'` when the `View all N` affordance is pressed. The parent (Patch Y) owns routing.

2. **Empty state**: when `gems.length === 0`, render `Nothing hidden - everything cross-posted.` in `text-sm text-zinc-500`. Keep the card chrome.

3. **Populated state**:
   - Slice the first 5 gems for display; the rest are accessible via `View all`.
   - Row layout: flex row with `justify-between`, `py-3`, `first:pt-0`, and `divide-y divide-zinc-800/80` on the `<ul>`.
   - Left block per row: SKU on one line (`font-mono text-[13px] text-zinc-100 truncate`), description (`text-[13px] text-zinc-300 truncate`), then a flex-wrap chip row of the **missing** platforms drawn from the fixed set `['ebay', 'marketplace', 'craigslist']` minus the `gem.platforms` already posted. Chips: `rounded-full bg-zinc-800/80 px-2 py-0.5 text-[10px] text-zinc-300`. Labels: `eBay`, `Marketplace`, `Craigslist`. After the chips, an inline `lastPostedAt` label formatted via `src/utils/timeAgo.js` (for example `3d ago`), or `never` when `lastPostedAt` is `null`.
   - Row action (right): a button reading `Post it`, styling `rounded-lg bg-emerald-500/20 px-3 py-1.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/30`. Calls `onPost(gem.id)`.
   - `View all N` button below the list, only when `gems.length > 5`, styled `text-xs font-medium text-amber-300/90 hover:underline`. Calls `onPost('__all__')`.

4. **Card chrome**: root `rounded-xl bg-zinc-900/60 p-[14px]` with class `pc-card` (the hover-bloom utility lands in Patch Y). Label `Hidden Gems` at `text-[9px] font-bold uppercase tracking-[0.12em] text-zinc-500`.

5. **Tests** (`@testing-library/react` + Vitest):
   - Renders the label and each SKU for a two-gem fixture.
   - Shows `never` for a gem with `lastPostedAt: null`.
   - Empty array renders the empty-state copy.
   - With 8 gems, renders `View all 8`.
   - Clicking the first `Post it` button calls `onPost` with the matching id.

## Out of scope

- Dashboard composition and the Catalog Health removal - ships in Patch Y.
- The platform-selection modal that `Post it` should eventually open. Until that modal exists, Patch Y wires `onPost` to a route-push as a placeholder.
- Real-time re-sort when the list mutates under the user. v1 is a static snapshot per render.

## Validation

```
npm run lint
npm run test -- HiddenGemsSurface
npm run build
```

All must pass.

## PR title

`Dashboard Hidden Gems surface`

Execute this brief exactly. Branch from main, run all validation commands before opening the PR, and stop after the PR is open.
