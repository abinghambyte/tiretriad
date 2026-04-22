---
id: Y
title: Dashboard shell compose + Precision Cockpit pass
branch: dashboard-shell-compose
depends_on:
  - T
  - U
  - V
  - W
  - X
touches_shared:
  - src/components/dashboard/Dashboard.jsx
frontend_only: true
---

# Patch Y: Dashboard shell compose + Precision Cockpit pass

Branch: `dashboard-shell-compose`

Scope (files touched):

- `src/components/dashboard/TodayStrip.jsx` - NEW. Four-card strip: Pending Orders (1fr), Top Sellers (2fr), Today Revenue hero (1fr), Total Profit (1fr). Top Sellers gets double width per the v16 mockup. Hero revenue renders the value in emerald at 34 px.
- `src/components/dashboard/TodayStrip.test.jsx` - NEW.
- `src/components/dashboard/Dashboard.jsx` - rewrite the body to compose the new components. Remove the inline 4-card `<section aria-label="Operational signals">` block, the inline `Recent activity + Catalog health` two-column grid (keep the Recent activity block; drop Catalog health entirely), the inline Crew `<section>`, and the `<section aria-label="Modules">` block plus any now-unused helpers (`visibleModules`, `SignalCard` if nothing else consumes it, `IconTires` / `IconCrm` / `IconPeople` / `IconAnalytics` / `IconGrowth` if their only consumer was the modules array). Destructure `crewSignals`, `crewSignalsLoading`, `topSellers`, `hiddenGems`, `allTimeMargin` from `useDashboardSignals()`. Compose ticker chips inline via `useMemo` from the existing `hiddenGems`, `signalBar.crewAlerts`, and `needsRepostingCount` signals.
- `src/index.css` (or whichever global stylesheet already ships; confirm with `ls src/**/*.css` before editing) - add the `.pc-card` hover-bloom utility used by every new dashboard component. Do not introduce a new file for a single rule.

## Tasks

1. **TodayStrip component**:
   - API: `TodayStrip({ pendingOrders, topSellers, todayRevenue, allTimeMargin, loading })`. No rolling-average glow in v1; the hero renders in emerald always. A follow-on patch adds the hot-state comparison once a rolling-average source exists.
   - Grid: `display: grid; gap: 10px; grid-template-columns: 1fr 2fr 1fr 1fr`.
   - Pending Orders slot: small stat card. Value uses `formatQty` from `src/utils/format.js`. Tone amber when `pendingOrders > 0`, otherwise zinc. Link-wrap to `/orders`.
   - Top Sellers slot: `<TopSellersCard sellers={topSellers} />`.
   - Today Revenue slot: hero treatment. Root `rounded-xl bg-gradient-to-b from-emerald-500/10 to-transparent p-[14px]`. Label `Today revenue` in the standard label style. Value `formatCurrency(todayRevenue ?? 0)` at `text-[34px] font-bold tabular-nums tracking-[-0.02em] text-emerald-300`. Mark the numeral `data-testid="hero-revenue"` so the test can assert on it.
   - Total Profit slot: small stat card. Value `formatCurrency(allTimeMargin ?? 0)`. Link-wrap to `/analytics?tab=revenue`. Label `Total profit`.
   - Apply the `pc-card` class to every card root.

2. **Dashboard compose** (`Dashboard.jsx`):
   - Update the `useDashboardSignals()` destructure to add the new fields listed above. `catalogHealth` is no longer needed - delete it from the destructure if nothing else references it.
   - Build `tickerChips` via `useMemo`. Include, in order:
     - `{ id: 'gems', kind: 'inventory', label: 'N hidden gems to post' }` when `hiddenGems.length > 0`.
     - `{ id: 'crew', kind: 'ops', label: 'N crew alerts' }` when `signalBar.crewAlerts > 0`.
     - `{ id: 'repost', kind: 'inventory', label: 'N listings need reposting' }` when `needsRepostingCount > 0`.
   - Body structure under `<main>`:
     ```
     <TodayStrip ... loading={sigLoading} />
     <ActivityTicker chips={tickerChips} />
     <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
       {/* existing Recent activity <section> block, copied verbatim */}
       <HiddenGemsSurface
         gems={hiddenGems}
         onPost={(id) => {
           if (id === '__all__') window.location.href = '/tires?hiddenGems=true'
           else window.location.href = '/tires?highlight=' + encodeURIComponent(id)
         }}
       />
     </div>
     <CrewDirectoryWidget
       crew={crewPreview}
       crewSignals={crewSignals || {}}
       loading={crewSignalsLoading || crewLoading}
     />
     ```
   - Remove the entire Modules section and delete the `modules` array and any icon helpers whose sole consumer was that array. Run `npm run lint` and fix any dead-import warnings.

3. **Precision Cockpit hover-bloom**: in the chosen global stylesheet, add:
   ```css
   .pc-card {
     transition: box-shadow .18s ease;
   }
   .pc-card:hover {
     box-shadow: 0 0 0 1px rgba(50,205,50,.15), 0 0 24px rgba(50,205,50,.08);
   }
   ```
   Every dashboard card root introduced by Patches U, V, W, X and in this patch (`TodayStrip` slots) must carry the class. Sweep and confirm.

4. **Tests**:
   - `TodayStrip.test.jsx`: renders all four labels (`pending orders`, `top sellers`, `today revenue`, `total profit`), and the `hero-revenue` test id is present with the formatted currency value.
   - Extend or add `Dashboard.test.jsx` (only if one already exists in the tree - do not scaffold a new one here): assert that the Modules section is gone and that the HiddenGems and CrewDirectory widgets render. Skip this step if no Dashboard test file exists and the other component tests already cover behaviour.

5. **Manual smoke**: `npm run dev`, open `/dashboard`, confirm: 4-card strip, ticker chips, Hidden Gems list with `Post it`, Crew widget with online dots, no module tiles, no Catalog Health card. Confirm no crashes when `topSellers` is empty (pre-aggregation or before any sale has been logged).

## Merge coordination

This patch owns the only writes to `src/components/dashboard/Dashboard.jsx` in this rollout. No conflicts expected with T through X. If T has not landed, `topSellers` / `hiddenGems` / `crewSignals` / `allTimeMargin` are undefined and the new components already handle the empty case, so this patch can be drafted against a T-less base but must merge only after T.

## Out of scope

- Rolling-average hot-state glow on hero revenue (spec Section "Precision Cockpit migration"). Deferred until the rolling-average data source is settled.
- Playwright visual baseline - ships in Patch Z.
- Any backend or rules change.
- Restructuring `src/hooks/useDashboardSignals.js`. Patch T already exposed everything needed.

## Validation

```
npm run lint
npm run test
npm run build
```

All must pass.

## PR title

`Dashboard shell: TodayStrip + ticker + HiddenGems + Crew v2`

Execute this brief exactly. Branch from main, run all validation commands before opening the PR, and stop after the PR is open.
