---
patch: 628
title: My Queue relocation — header bell + dashboard widget; drop nav entry; keep route
status: ready-to-dispatch
priority: P2 — UX polish, not a regression
depends_on: []
spec: docs/superpowers/specs/2026-04-27-my-queue-relocation-design.md
batch: my-queue
---

# patch-628 — My Queue relocation

## Files touched

- `src/components/layout/MyQueueBell.jsx` — **new** — bell icon + count badge + popover panel for top 5 queue items
- `src/components/dashboard/MyQueueWidget.jsx` — **new** — top-10 list rendered between `<HomepageModuleGrid>` and Recent Activity
- `src/components/layout/PortalTopBar.jsx` — insert `<MyQueueBell />` between role pill and sign-out (desktop) and inside profile dropdown (mobile)
- `src/components/layout/MobileBottomNav.jsx` — drop the `/my-queue` item (already gated by role; just remove the entry)
- `src/components/layout/DesktopTopNav.jsx` — same: drop `/my-queue` from items list
- `src/components/dashboard/Dashboard.jsx` — render `<MyQueueWidget>` after the module grid
- `src/hooks/useDashboardSignals.js` — extend to expose `myQueueItems` (role-filtered, top 10) and `myQueueCount` (just count, for the bell badge)
- `src/components/layout/paletteActions.js` — keep `Open My Queue` action (route still exists; just not in nav)
- Tests: `MyQueueBell.test.jsx` for popover behavior + role filtering; `MyQueueWidget.test.jsx` for rendering; `Dashboard.test.jsx` extended for widget render

## Bell skeleton

```jsx
import { Popover } from '../ui/Popover.jsx'
import { Link } from 'react-router-dom'
import { useUserProfile } from '../../hooks/useUserProfile'
import { useDashboardSignals } from '../../hooks/useDashboardSignals'

export function MyQueueBell() {
  const { profile } = useUserProfile()
  const { myQueueItems = [], myQueueCount = 0 } = useDashboardSignals()
  const role = String(profile?.role || '').toLowerCase()

  // Hide for roles without a queue (e.g., viewer-only). Existing role-gating
  // in MyQueuePage already handles this; mirror it here.
  if (role !== 'admin' && role !== 'sourcer' && role !== 'mechanic') return null

  const top5 = myQueueItems.slice(0, 5)

  return (
    <Popover
      label="My Queue"
      align="end"
      anchor={
        <button
          type="button"
          aria-label={`My Queue: ${myQueueCount} ${myQueueCount === 1 ? 'item' : 'items'}`}
          className="relative inline-flex h-11 min-h-[44px] w-11 min-w-[44px] items-center justify-center rounded-lg border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-zinc-100"
        >
          <BellIcon />
          {myQueueCount > 0 ? (
            <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-zinc-950">
              {myQueueCount > 9 ? '9+' : myQueueCount}
            </span>
          ) : null}
        </button>
      }
    >
      <div className="w-72 max-w-[90vw]">
        <div className="border-b border-zinc-800 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
          My Queue · {myQueueCount}
        </div>
        {top5.length === 0 ? (
          <p className="px-3 py-3 text-sm text-zinc-500">Nothing in your queue.</p>
        ) : (
          <ul className="divide-y divide-zinc-800/80">
            {top5.map((item) => (
              <li key={item.id}>
                <Link
                  to={item.href || `/my-queue?focus=${item.id}`}
                  className="block px-3 py-2.5 text-sm text-zinc-200 hover:bg-zinc-800/80"
                >
                  <p className="truncate">{item.label}</p>
                  <p className="mt-0.5 text-xs text-zinc-500">{item.relativeTime}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Link
          to="/my-queue"
          className="block border-t border-zinc-800 px-3 py-2 text-center text-xs text-amber-300 hover:bg-zinc-800/80"
        >
          Open full queue →
        </Link>
      </div>
    </Popover>
  )
}
```

## Widget skeleton

```jsx
export function MyQueueWidget() {
  const { profile } = useUserProfile()
  const { myQueueItems = [], myQueueCount = 0 } = useDashboardSignals()
  const role = String(profile?.role || '').toLowerCase()

  if (role !== 'admin' && role !== 'sourcer' && role !== 'mechanic') return null

  const top10 = myQueueItems.slice(0, 10)

  return (
    <section
      aria-label="My Queue"
      className="pc-card rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 sm:p-5"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-300">
          My Queue · {myQueueCount}
        </h2>
        <Link to="/my-queue" className="text-xs text-amber-300 hover:underline">
          Open full →
        </Link>
      </div>
      {top10.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-500">Nothing in your queue.</p>
      ) : (
        <ul className="mt-3 divide-y divide-zinc-800/80">
          {top10.map((item) => (
            <li key={item.id} className="py-2">
              <Link to={item.href || `/my-queue?focus=${item.id}`} className="hover:underline">
                <p className="text-sm text-zinc-200">{item.label}</p>
                <p className="mt-0.5 text-xs text-zinc-500">{item.relativeTime}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
```

## Hook extension

`useDashboardSignals.js` adds `myQueueItems` and `myQueueCount`. Source data is whatever `kylesQueueCount` already reads from + role-specific extras:

- `admin` — sees everything (sourcer queue + mechanic queue + their own)
- `sourcer` (Kyle) — research queue from existing `tirePriceResearchAfternoon` flow
- `mechanic` (DJ) — assigned `crmJobs` where `assignedToUid === user.uid`

Each item normalized to `{ id, label, relativeTime, href }`. Sort newest-first.

## Acceptance

- [ ] Bell renders in `<PortalTopBar>` between role pill and sign-out (desktop) and inside profile dropdown (mobile)
- [ ] Bell badge shows `myQueueCount`; "9+" once over 9
- [ ] Popover lists top 5 items + "Open full queue →" footer link
- [ ] Empty state: "Nothing in your queue."
- [ ] Widget renders below the homepage module grid (post patch-627), above Recent Activity
- [ ] `/my-queue` deep link still works; nav entry gone from desktop top nav and mobile bottom nav
- [ ] Bell hidden for `viewer` role (no queue access)
- [ ] Click any popover or widget item navigates to the focused item context
- [ ] Tests cover all 3 role variants (admin / sourcer / mechanic)
- [ ] Visual snapshots refreshed after deploy via `visual-tests-update` workflow

## Notes for the agent

- Coordinate with patch-627: this widget renders in `<Dashboard>` between the module grid and Recent Activity. If 627 hasn't merged yet, render this widget conservatively (skeleton) rather than failing.
- The 44×44 tap target on the bell is mandatory per Storm 7's heuristic-audit triage (PR #176).
- Reuse the existing `<Popover>` primitive — it already has flip-up logic and z-index handling. Don't reinvent.
- Don't expand the bell to general notifications. Spec scope is queue-only.
