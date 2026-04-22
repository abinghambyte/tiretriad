# docs/handoffs

Active Cursor agent handoff briefs. Each brief is a self-contained patch
spec that a Cursor agent can pick up cold, implement, validate, and open
a PR from - then stop.

## Active rollout - batch 5 (2026-04-21)

Dashboard redesign scope B. Spec lives at
`docs/superpowers/specs/2026-04-21-dashboard-redesign-design.md`; plan at
`docs/superpowers/plans/2026-04-21-dashboard-redesign.md`. Six briefs,
dispatched in three rounds: round 1 is T alone (data contract), round 2
is U / V / W / X in parallel (presentational components), round 3 is Y
(shell compose).

| Patch | Branch | Scope |
| --- | --- | --- |
| T `dashboard-top-sellers-data` | `dashboard-top-sellers-data` | Extends `functions/financeStats.js` with a top-10-sellers aggregation into `meta/revenueStats`. Adds `topSellers`, `hiddenGems`, `allTimeMargin`, `crewSignals` / `crewSignalsLoading` to `useDashboardSignals`. Ships the paired palette module. Data contract only - no UI. |
| U `dashboard-top-sellers-card` | `dashboard-top-sellers-card` | `TopSellersCard` component: 50 / 50 split, rank left, sold right, `SOLD` caption, paired palette per rank, 3 s flip cycle, pauses on hover. |
| V `dashboard-hidden-gems` | `dashboard-hidden-gems` | `HiddenGemsSurface` component: up to 5 rows with missing-platform chips and an inline `Post it` action. Replaces Catalog Health in the grid (actual swap is Patch Y). |
| W `dashboard-activity-ticker` | `dashboard-activity-ticker` | `ActivityTicker` component: full-width scrolling chip bar, 35 s loop, hover pauses, kinds color-coded. |
| X `dashboard-crew-widget-v2` | `dashboard-crew-widget-v2` | `CrewDirectoryWidget` component: WIP badge + today's completions + streak + online / offline dot reading `crewSignals`. |
| Y `dashboard-shell-compose` | `dashboard-shell-compose` | `TodayStrip` + rewritten `Dashboard.jsx` body (kill modules row, kill Catalog Health, mount new components, build ticker chip list). Adds `.pc-card` hover-bloom utility. |

Merge coordination:

- T is the only patch in this batch with a Cloud Function deploy. Land
  it first.
- U / V / W / X are four independent new component files with zero file
  overlap. They can merge in any order after T.
- Y owns the only writes to `src/components/dashboard/Dashboard.jsx` in
  this rollout and must land last. Resolve any
  `src/components/dashboard/Dashboard.jsx` conflicts in favour of the
  patch-Y shape - the old inline sections (Operational signals strip,
  Catalog Health, Crew, Modules) are being deleted by design.
- One Cloud Function deploy total (`onOrderCompletedUpdateStats` from
  Patch T). No Firestore rules change in this rollout.
- Playwright visual baseline is deferred until the new shell has baked
  on main, so it is not in this batch.

## Conventions

- One file per patch: `patch-<letter>-<short-name>.md`.
- Every brief starts with a YAML frontmatter block (see schema below),
  then a blank line, then the H1 title (no em dashes anywhere).
- Brief body covers: branch name, scope (files touched), tasks,
  out-of-scope, validation commands, PR title.
- Briefs end with the dispatch line:
  `Execute this brief exactly. Branch from main, run all validation
  commands before opening the PR, and stop after the PR is open.`
- When a rollout bundles multiple patches, the README should carry the
  branch / file ownership map and any merge-coordination notes for that
  rollout.
- Delete a brief once its PR merges. Keep the folder as narrow as
  possible so an agent opening it sees only active work.

## Frontmatter schema (required)

Every `patch-*.md` opens with YAML frontmatter. The `dispatch-handoffs`
skill parses this as data; prose inference is explicitly disallowed, so
malformed or missing frontmatter halts dispatch loudly.

```yaml
---
id: Q                             # patch letter (matches filename)
title: Margin floor queue backend # short human-readable title
branch: margin-queue-backend      # exact branch name the Cursor agent will create
depends_on: []                    # list of patch ids that must merge first; [] if none
touches_shared:                   # files also edited by OTHER patches in the same batch
  - src/hooks/useDashboardSignals.js
frontend_only: false              # true iff the brief touches zero backend state
deploy:                           # required unless frontend_only: true
  functions:
    - enqueueBelowMarginFloor
    - enqueueToResearch
    - resolveQueueItem
  firestore_rules: true           # true iff firestore.rules is edited
  scripts:                        # post-merge one-offs; empty list ok
    - scripts/backfill-margin-floor.mjs --dry-run
    - scripts/backfill-margin-floor.mjs --confirm
---
```

Required fields: `id`, `title`, `branch`, `depends_on`, `touches_shared`,
and EITHER `frontend_only: true` OR a non-empty `deploy` block. A brief
with neither a `deploy` block nor `frontend_only: true` is invalid and
halts dispatch.

## Last rollout

April 21, 2026 - batch 4. Five patches total. P, Q, Qa, R consolidated
into PR #75 after a Cursor file-watcher race blended shared-file edits
across the Q and R commits. Patch S shipped separately in PR #76. A
follow-up fix for the `kylesQueueCount` badge shipped in PR #77.

| Patch | Scope | PR |
| --- | --- | --- |
| P `payout-panel-polish` | Live Buy/Qty/Retail ledger preview in `PayoutConfigPanel.jsx` | #75 |
| Q `margin-queue-backend` | `functions/researchQueue.js` + scheduled nightly sweep + `enqueueToResearch` / `resolveQueueItem` callables; replaces red margin row with `kylesQueueCount` signal | #75 |
| Qa `unutilized-inventory-backend` | `unutilizedClassifier` + `useUnutilizedSignals` hook; eBay deferred to the sell-side integration | #75 |
| R `crew-widget-backend` | `updatePresence` callable + heartbeat client + `crewSignals` map on `useDashboardSignals` | #75 |
| S `my-queue-page` | `/my-queue` page, `QueueRow`, Analytics `verification-queue` + `margin-archive` tabs | #76 |
| Queue-count fix | `deriveKylesQueueCount` counts every open queue entry, not just margin-floor | #77 |

## Previous rollout

April 20, 2026 - batch 3. Five patches shipped in parallel. All merged.

| Patch | Scope | PR |
| --- | --- | --- |
| K `payout-config` | `meta/payoutConfig` doc + admin Payouts & Taxes panel at `/ops`, buy-side taxes folded into costTotal | #74 |
| L `fet-tag` | `hasFet` tag on tires + MarginTable render fix + backfill script | #72 |
| M `tire-haystack-v2` | Description-search normalizer: sidewall codes, load range, speed rating | #71 |
| N `dispatch-kill` | Remove permanent `/dispatch` placeholder route + `DispatchRedirect.jsx` | #70 |
| O `vip-magic-link-v1` | Signed VIP magic links + public `/vip/:token` route + branded Sinch shell | #73 |
