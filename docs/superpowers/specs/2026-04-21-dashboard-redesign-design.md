# Dashboard redesign  -  scope B design

_Date: 2026-04-21_
_Status: draft, pending user approval_

## Context

Batch 4 shipped backend signals (PR #75)  -  `kylesQueueCount`, `useUnutilizedSignals`, `crewSignals`  -  but the dashboard never migrated to consume them. At the same time, the Section 11 addendum to `docs/design/dashboard-vibe-v2.md` defined a Precision Cockpit visual language and the "Hidden Gems" surface that were likewise never built. This spec closes both gaps and addresses three structural complaints: crew alerts living on the dashboard instead of in People/Ops, Catalog Health feeling like filler, and the modules row at the bottom feeling like old scaffolding.

Scope is locked at **B  -  finish v2 rollout plus three amendments** (Top Sellers card, Hidden Gems surface, ticker). Out of scope: command palette redesign, AI advisor drawer, eBay integration (all tracked separately in `ROADMAP.md`).

## Summary of decisions

| # | Decision | Lock |
|---|---|---|
| 1 | Top Sellers card | v16 mockup (rank-left, count-right, SOLD caption, paired palette, 50/50 grid, top 10 cycle) |
| 2 | Modules row | Kill it  -  nav + command palette own navigation |
| 3 | Catalog Health card | Replace with Hidden Gems surface (shows the actual gem list, not just a count) |
| 4 | Crew widget | Keep, wire to `crewSignals` from batch 4 |
| 5 | Crew alerts | Remove from dashboard; they live in the scrolling ticker only |
| 6 | Ticker placement | Option A  -  sits under the 4-card strip, spans full width |
| 7 | Visual language | Precision Cockpit migration (surface stacking, neon-lime active signal, hero revenue) |
| 8 | Widget text | Justified and normalized  -  consistent alignment, padding, baseline grid across all widgets |

## Architecture

Nothing architectural changes. Dashboard is still a React page composed of presentational components fed by the `useDashboardSignals` hook. The hook already returns the data we need; this work is UI-only.

### Component map

```
Dashboard
├── TodayStrip            (NEW  -  replaces the old 4-card SignalCard strip)
│   ├── PendingOrdersCard
│   ├── TopSellersCard    (NEW  -  cycling top-10 flip display)
│   ├── TodayRevenueCard  (hero treatment)
│   └── TotalProfitCard   (NEW  -  reads meta/revenueStats.allTimeMargin)
├── ActivityTicker        (NEW  -  full-width scrolling chip bar)
├── BottomRow
│   ├── RecentActivity    (kept, restyled)
│   └── HiddenGemsSurface (NEW  -  replaces CatalogHealthCard)
└── CrewDirectoryWidget   (kept, wired to crewSignals)
```

Deleted: `ModulesRow`, `CatalogHealthCard`, `<SinchChatMount />` orphan (unrelated but already dead code in the tree  -  safe to remove in the same pass since it's in the same file).

### Data flow

All data comes from `useDashboardSignals()`. New fields consumed in this pass:

- `topSellers: Array<{ rank, sku, description, category, salesCount }>`  -  top 10 by all-time `salesCount`, added to the same `meta/revenueStats` doc that the finance stats worker already writes. The worker runs a `orderBy('salesCount','desc').limit(10)` query on the tires collection and denormalizes the rows into the stats doc.
- `hiddenGems: Array<{ sku, description, platformCount, lastPostedAt }>`  -  tires with healthy `marginConfirmed === true` but `platformListings.length < 2`. Count already lives in `useUnutilizedSignals`; this surface exposes the actual list.
- `crewSignals` map  -  already returned from batch 4; just render it.
- `allTimeMargin`  -  from `meta/revenueStats.allTimeMargin`, already populated by the finance stats worker.

No new endpoints, no new Firestore fields. One aggregation added to the stats worker for top-10 sellers (trivial Firestore query, sort by salesCount desc, limit 10).

## Components

### TodayStrip

4-card grid: `1fr 2fr 1fr 1fr`. Top Sellers gets double width because the card splits into a left half (rank + count + SOLD) and a right half (tire info), both flipping in sync every 3 seconds through the top 10.

Ticker sits directly below the strip, spans full width, scrolls right-to-left over 35 seconds, pauses on hover.

### TopSellersCard

Per v16 mockup:

- Card split 50/50 (`grid-template-columns: minmax(0,1fr) minmax(0,1fr)`) with a vertical divider.
- Left half: rank digit (`#1`, 52px) on the left, sold count (52px) on the right, both on the same text baseline via `align-items:baseline`. `SOLD` caption (13px / 700 / .22em tracking) sits 8px below the count. Fixed 96px slots for each numeral so 3-digit and 1-digit values center identically.
- Right half: SKU (mono 18px), description (13px), category line (10px meta).
- Flip animation: `rotateX` split-flap transition, 3 seconds per slot, 30 seconds full cycle through top 10. Hover anywhere on the card pauses.
- Paired palette per place  -  rank color + sold color always distinct, always harmonious. Applied as grouping: both big numerals share the primary color; `#` and `SOLD` share the accent. See Appendix A for the full table.

### HiddenGemsSurface

Replaces Catalog Health. Renders the top 5 tires that are ready to sell but not cross-posted, with a "View all N" link at the bottom when there are more than 5. Each row:

- SKU + short description
- Missing platforms as small chips ("eBay", "Marketplace", "Craigslist")
- Last posted relative time ("3d ago", "never")
- Primary action: "Post it" button that opens the existing platform-selection modal

If the list is empty, card shows a quiet "Nothing hidden  -  everything cross-posted" empty state.

### CrewDirectoryWidget

Keeps its current position. Each crew card now reads from `crewSignals[userId]`:

- Work-in-progress count (badge top-right)
- Today's completed count
- Streak days
- Online/offline dot (presence, already tracked)

No new backend work  -  fields were populated in batch 4 and are currently unused.

### ActivityTicker

Full-width bar, chips for: hidden gems to post, Kyle's research queue depth, items needing reposts, DJ's pickups awaiting confirmation, pending invites. Crew alerts (the red-flag ones) roll into this ticker rather than living in a dedicated card.

Chip colors coded by kind (teal for inventory, amber for Kyle, rose for DJ/ops, emerald for people, slate for neutral).

## Precision Cockpit migration

Applied across all dashboard components:

- **Surface stacking**  -  cards use background elevation (`#18181b` on `#09090b`) instead of borders. Existing 1px dark borders become 1px alpha (`rgba(39,39,42,.6)`) where kept; most are dropped.
- **Neon-lime as the "active signal"**  -  `#32CD32` reserved for <3% of screen pixels at a time. Used only on live-state indicators: the hero revenue count when today's total is above the rolling average, active-task dots in the crew widget, and urgent ticker chips.
- **Hero revenue**  -  Today Revenue card gets a subtle gradient background and 34px emerald numeral. Numeral glows neon-lime (via the active-signal rule above) only when today's total exceeds the 7-day rolling average that `useDashboardSignals` already computes. No other card uses emerald at that weight.
- **Hover = bloom**  -  cards get a soft outer glow on hover instead of a border color shift.

### Widget text normalization

All widget text aligned to a shared set of rules:

- Labels: 9px / 700 / .12em tracking / `#71717a`, uppercase. One label per card, top.
- Primary numerals: 26px / 700 / tabular-nums / `-0.02em` tracking / `#fafafa`. Hero revenue is the only exception (34px emerald).
- Sub-captions: 10px / 400 / `#71717a`, sentence case.
- Body text inside widgets (recent activity, hidden gems rows): 13px / 400 / `#e4e4e7`, line-height 1.25.
- Padding: 14px all sides on cards. Grid gap 10px between cards.
- No centered text except where it's a flip-display (Top Sellers slots) or a hero metric.

## Error handling

UI-only changes  -  no new failure modes. Existing hook error states are preserved:

- If `useDashboardSignals` errors, the whole dashboard falls back to its current skeleton loader.
- If any individual signal is `undefined` (e.g. `topSellers` before the stats worker has run), the card shows its empty state rather than crashing.
- Top Sellers with fewer than 10 entries cycles through however many exist and loops.

## Testing

- Component tests for each new card using the existing Vitest + React Testing Library setup.
- Visual-regression: add one Playwright screenshot test at desktop width (1440) after migration to lock the new layout.
- No backend tests needed  -  the one new aggregation (top-10 query) is trivial and tested in the existing stats-worker spec.

## Implementation order

1. Delete modules row, Catalog Health card, and the dead `<SinchChatMount />` mount.
2. Add top-10 sellers aggregation to the stats worker.
3. Build `TopSellersCard` with v16 styling, paired palette, flip animation.
4. Build `HiddenGemsSurface` (reads existing `useUnutilizedSignals` data plus per-item details from the same tire docs).
5. Rebuild the Today strip grid with the new 4-card layout; replace `SignalCard` usage.
6. Build `ActivityTicker` under the strip.
7. Wire `CrewDirectoryWidget` to `crewSignals`.
8. Apply Precision Cockpit token migration (surface stacking, neon-lime restriction, hover bloom) across all dashboard components.
9. Run the text-normalization pass.
10. Playwright screenshot baseline.

## Appendix A  -  Top Sellers paired palette

| Place | Primary (numerals) | Accent (`#` + `SOLD`) |
|---|---|---|
| 1 | gold `#fbbf24` | slate `#94a3b8` |
| 2 | silver `#e2e8f0` | gold `#fbbf24` |
| 3 | bronze `#f97316` | teal `#2dd4bf` |
| 4 | lime `#a3e635` | slate `#64748b` |
| 5 | emerald `#34d399` | amber `#fcd34d` |
| 6 | cyan `#22d3ee` | violet `#a78bfa` |
| 7 | sky `#60a5fa` | rose `#fda4af` |
| 8 | violet `#a78bfa` | mint `#6ee7b7` |
| 9 | pink `#f472b6` | cyan `#22d3ee` |
| 10 | slate `#94a3b8` | amber `#fcd34d` |
