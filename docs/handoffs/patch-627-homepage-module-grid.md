---
patch: 627
title: Homepage module grid + KPI absorption (replaces 5 empty widgets with 6-card grid)
status: ready-to-dispatch
priority: P0 — biggest visible UX gap on the home page
depends_on: []
spec: docs/superpowers/specs/2026-04-27-dashboard-onboarding-design.md
batch: dashboard-onboarding
also_known_as: patch-600b (audit triage table)
---

# patch-627 — Homepage module grid + KPI absorption

Same work as the audit's patch-600b. Builds the 6-card module grid spec'd in `docs/AI-CONTEXT.md` lines 71-78, with each card showing first-action CTAs at empty state and live metrics once data thresholds are crossed. Absorbs the existing 5 KPI widgets into the relevant cards.

## Files touched

- `src/components/dashboard/Dashboard.jsx` — replace TodayStrip + module-card-less layout with the new `<HomepageModuleGrid />` at the top
- `src/components/dashboard/HomepageModuleGrid.jsx` — **new** — auto-fit responsive grid container
- `src/components/dashboard/ModuleCard.jsx` — **new** — single card component (icon + title + CTA-or-metric + click target)
- `src/components/dashboard/cardConfig.js` — **new** — declarative config for each of the 6 cards (route, icon, threshold check, empty CTA, live metric formatter)
- `src/hooks/useDashboardSignals.js` — extend to expose:
  - `firstSaleAt` boolean (global threshold)
  - `tiresCount` (per-card)
  - `crmActiveCount` (per-card)
  - `usersCount` + `customersCount` (per-card)
  - `creditTrackerSet` (per-card; `meta/creditTracker` exists)
  - Existing fields stay (signalBar, recentActivity, etc.) — Recent Activity widget below grid still uses them
- `src/components/dashboard/Dashboard.test.jsx` — snapshot tests (per decision 6)
- Unit tests for `cardConfig.js` threshold logic per card

## Implementation skeleton

### `cardConfig.js`

```js
import { permissionMeets } from '../../constants/peoplePermissions'

/**
 * Card config — pure data, no React. Each card declares its threshold,
 * empty-CTA shape, and live-metric shape. The grid component renders
 * by mapping over this config and calling formatters with the signals
 * hook output.
 */
export const HOMEPAGE_CARDS = [
  {
    id: 'tires',
    title: 'Skedaddle Tires',
    icon: 'tires',
    href: '/tires',
    show: ({ permissionFor }) => permissionMeets(permissionFor('tires'), 'view'),
    hasData: ({ tiresCount }) => Number(tiresCount) > 0,
    emptyCta: () => '0 tires loaded — import catalog',
    metric: ({ tiresCount, listedCount = 0, pendingOrders = 0 }) =>
      `${tiresCount.toLocaleString()} tires · ${listedCount} listings active · ${pendingOrders} pending sales`,
  },
  {
    id: 'crm',
    title: 'Rubber CRM',
    icon: 'crm',
    href: '/crm',
    show: ({ permissionFor }) => permissionMeets(permissionFor('crm'), 'view'),
    hasData: ({ crmActiveCount }) => Number(crmActiveCount) > 0,
    emptyCta: () => '0 leads — create your first',
    emptyAction: { kind: 'open-new-lead-modal' }, // grid wires this to NewLeadModal from patch-625
    metric: ({ crmActiveCount, lastTouchAgoDays }) =>
      `${crmActiveCount} leads · last touch ${lastTouchAgoDays}d ago`,
  },
  {
    id: 'people',
    title: 'People Systems',
    icon: 'people',
    href: '/people',
    show: ({ permissionFor }) => permissionMeets(permissionFor('people'), 'manage'),
    hasData: ({ usersCount }) => Number(usersCount) > 1,
    emptyCta: () => 'Crew of 1 — invite Kyle / DJ',
    emptyAction: { kind: 'navigate', path: '/people?tab=crew&action=invite' },
    metric: ({ usersCount, customersCount }) =>
      customersCount > 0
        ? `Crew of ${usersCount} · ${customersCount} customers`
        : `Crew of ${usersCount}`,
  },
  {
    id: 'analytics',
    title: 'Analytics',
    icon: 'analytics',
    href: '/analytics',
    show: ({ permissionFor }) => permissionMeets(permissionFor('analytics'), 'view'),
    hasData: ({ firstSaleAt }) => Boolean(firstSaleAt),
    emptyCta: () => 'Waiting for first sale',
    emptyMuted: true,
    metric: ({ todayRevenue, mtdRevenue, totalProfit }) =>
      `Today: ${fmt$(todayRevenue)} · MTD: ${fmt$(mtdRevenue)} · Total profit: ${fmt$(totalProfit)}`,
  },
  {
    id: 'growth',
    title: 'Growth Lab',
    icon: 'growth',
    href: '/growth',
    show: ({ profile }) => profile?.role === 'admin',
    hasData: ({ firstSaleAt }) => Boolean(firstSaleAt),
    emptyCta: () => '0 experiments queued',
    metric: ({ growthLive = 0, growthQueued = 0 }) =>
      `${growthLive} live · ${growthQueued} queued`,
  },
  {
    id: 'ops',
    title: 'Ops Command',
    icon: 'ops',
    href: '/ops',
    show: ({ profile }) => profile?.role === 'admin',
    hasData: ({ creditTrackerSet }) => Boolean(creditTrackerSet),
    emptyCta: () => 'Set credit limit',
    emptyAction: { kind: 'navigate', path: '/ops?tab=credit' },
    metric: ({ creditAvailable, creditLimit, reorderCount = 0 }) =>
      `Credit: ${fmt$(creditAvailable)} / ${fmt$(creditLimit)} · ${reorderCount} reorder requests`,
  },
]
```

### `HomepageModuleGrid.jsx`

```jsx
import { useUserProfile } from '../../hooks/useUserProfile'
import { useDashboardSignals } from '../../hooks/useDashboardSignals'
import { HOMEPAGE_CARDS } from './cardConfig.js'
import { ModuleCard } from './ModuleCard.jsx'

export function HomepageModuleGrid({ onOpenNewLeadModal }) {
  const { profile, permissionFor } = useUserProfile()
  const signals = useDashboardSignals()

  const ctx = { profile, permissionFor, ...signals }
  const visible = HOMEPAGE_CARDS.filter((c) => c.show(ctx))

  return (
    <section
      aria-label="Modules"
      className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4"
    >
      {visible.map((card) => {
        const hasData = card.hasData(ctx)
        const content = hasData ? card.metric(ctx) : card.emptyCta()
        return (
          <ModuleCard
            key={card.id}
            id={card.id}
            title={card.title}
            icon={card.icon}
            href={card.href}
            content={content}
            isEmpty={!hasData}
            isMuted={!hasData && card.emptyMuted}
            emptyAction={!hasData ? card.emptyAction : null}
            onOpenNewLeadModal={onOpenNewLeadModal}
          />
        )
      })}
    </section>
  )
}
```

### `ModuleCard.jsx`

```jsx
import { Link } from 'react-router-dom'

export function ModuleCard({
  id, title, icon, href, content, isEmpty, isMuted, emptyAction, onOpenNewLeadModal,
}) {
  // Empty actions can be navigation or modal opens; data state is always nav.
  if (isEmpty && emptyAction?.kind === 'open-new-lead-modal') {
    return (
      <button
        type="button"
        onClick={onOpenNewLeadModal}
        className="pc-card flex flex-col gap-2 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 text-left transition-colors hover:border-amber-700/40 hover:bg-zinc-900/60"
      >
        <CardChrome title={title} icon={icon} />
        <p className={isMuted ? 'text-zinc-500' : 'text-zinc-200'}>{content}</p>
      </button>
    )
  }
  // Both data state and empty-with-navigate-action route through Link
  const linkHref = isEmpty && emptyAction?.kind === 'navigate' ? emptyAction.path : href
  return (
    <Link
      to={linkHref}
      className="pc-card flex flex-col gap-2 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 transition-colors hover:border-amber-700/40 hover:bg-zinc-900/60"
    >
      <CardChrome title={title} icon={icon} />
      <p className={isMuted ? 'text-zinc-500' : 'text-zinc-200'}>{content}</p>
    </Link>
  )
}

function CardChrome({ title, icon }) {
  return (
    <div className="flex items-center gap-2">
      <ModuleIcon kind={icon} />
      <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-300">{title}</h2>
    </div>
  )
}

function ModuleIcon({ kind }) {
  // Inline SVGs matching the existing portal icon style
  // (1.5 stroke, 24x24 viewBox, currentColor). Per audit §0.3, use generic
  // semantic icons here, NOT the BrandBolt — that's wayfinding.
  const map = {
    tires: <TiresIcon />,
    crm: <CrmIcon />,
    people: <PeopleIcon />,
    analytics: <AnalyticsIcon />,
    growth: <GrowthIcon />,
    ops: <OpsIcon />,
  }
  return <span className="text-zinc-400">{map[kind]}</span>
}
```

### `useDashboardSignals.js` extensions

Add to the hook output:
- `firstSaleAt` — read once from `meta/portal.firstSaleAt`. Set by `runCompletionTransaction` on first completed order (one-line addition there). Cached in localStorage so the grid renders correctly even if `meta/portal` read fails.
- `tiresCount` — `getCountFromServer(collection(db, 'tires'))` once on mount, cached
- `crmActiveCount` — `getCountFromServer` filtered to non-archived crmAccounts (mirrors the soft-delete pattern from PR #171)
- `usersCount`, `customersCount` — count queries against `users` and `contacts`, both filtering out archived
- `creditTrackerSet` — boolean from existing `meta/creditTracker` doc presence

### `Dashboard.jsx` updates

Replace the TodayStrip render with `<HomepageModuleGrid />`. Lift the NewLeadModal state up here so the CRM card's empty CTA can open it:

```jsx
import { useState } from 'react'
import { HomepageModuleGrid } from './HomepageModuleGrid.jsx'
import { NewLeadModal } from '../crm/NewLeadModal.jsx'  // exists after patch-625

export function Dashboard() {
  // ... existing hooks ...
  const [newLeadOpen, setNewLeadOpen] = useState(false)

  return (
    <div className="...">
      <main className="...">
        <h1 className="sr-only">Dashboard</h1>
        {/* notice banner unchanged */}
        <HomepageModuleGrid onOpenNewLeadModal={() => setNewLeadOpen(true)} />
        {/* Below-grid widgets unchanged: ActivityTicker, Recent Activity, Hidden Gems, Next to Post */}
      </main>
      {newLeadOpen ? <NewLeadModal onClose={() => setNewLeadOpen(false)} /> : null}
    </div>
  )
}
```

If patch-625 hasn't shipped yet (`<NewLeadModal>` doesn't exist), gate the CRM card's empty action behind a feature check and fall back to navigating to `/crm` when the modal isn't available.

## Tests

### Snapshot tests

`Dashboard.test.jsx` — render with synthetic `useDashboardSignals` returns covering:
- All-empty (no tires, no firstSaleAt, single user) — every card shows empty CTA
- All-data (1160 tires, firstSaleAt set, multi-user) — every card shows metric
- Admin role — all 6 cards render
- Supplier role — Tires/CRM/People/Analytics render; Growth Lab/Ops hidden
- Mechanic role — Tires/CRM/People/Analytics render; same hide list

### Unit tests for `cardConfig.js`

Each card's `show()`, `hasData()`, `emptyCta()`, `metric()` covered with synthetic ctx values. No DOM, no React.

### Manual verification (decision 6 checklist — mandatory in PR description)

- [ ] Visited `/home` as admin, supplier, mechanic. Confirmed all 6 cards render correct empty/data state per role.
- [ ] Verified Today / MTD / Total profit numbers match pre-merge values from legacy widgets.
- [ ] Confirmed mobile reachability of all visible cards at 375px and 414px widths.
- [ ] Confirmed admin-only Growth Lab + Ops Command cards do NOT render for non-admin roles.
- [ ] Confirmed Recent Activity widget below the grid still renders correctly.

## Acceptance

- [ ] `<HomepageModuleGrid />` renders 6 cards (admin) / 4 cards (non-admin) per role
- [ ] Auto-fit grid collapses correctly: 3-col desktop, 2-col tablet, 1-col mobile
- [ ] Empty-state cards show first-action CTA; data-state cards show live metric
- [ ] CRM empty CTA opens NewLeadModal (or navigates to `/crm` if patch-625 not shipped yet)
- [ ] Tires card metric absorbs Pending Orders + Top Sellers from legacy widgets
- [ ] Analytics card metric absorbs Last Sale + Total Profit from legacy widgets
- [ ] Recent Activity widget below the grid still renders
- [ ] `firstSaleAt` flag mechanism written from `runCompletionTransaction` on first completed order
- [ ] Snapshot tests cover 5 scenarios (3 roles × empty/data states)
- [ ] Manual verification checklist completed in PR description
- [ ] `npm run lint && npm run test && npm run build` green
- [ ] After merge: trigger `visual-tests-update` workflow on main to refresh dashboard snapshots

## Notes for the agent

- Single biggest UX gap on the home page. Ship it cleanly.
- The legacy 5-widget components (`<TodayStrip>`, `<TopSellersCard>`, etc.) are NOT deleted in this PR — their content is rendered through the new card metrics. Cleanup of orphan widget files is a follow-up patch once the new layout is verified stable.
- BrandBolt usage in module-card icons is **forbidden** per audit §0.3 (PR #174). Use generic semantic SVG icons matching the existing portal style.
- Do NOT introduce a new icon library. Inline SVG matches everything else in `MobileBottomNav.jsx` etc.
- The `firstSaleAt` flag write from `runCompletionTransaction` is one line. Don't refactor that function in this PR.
- Per Storm 2's Firestore isolation contract: any new test data added to verify the empty/data state flips must use the `tests` named DB and stamp `testFixture: true` + `testFixtureExpiresAt`.
- Coordinate with patch-625 timing — if patch-625 hasn't merged yet, this patch's CRM-card empty CTA falls back to `/crm` navigation. Once patch-625 lands, swap to opening `<NewLeadModal>`.
- After merge, manually trigger the `visual-tests-update` workflow on main. The dashboard snapshot will drift; the workflow regenerates baselines and opens an auto-PR like #170.
