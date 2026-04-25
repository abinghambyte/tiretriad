# docs/handoffs

Active Cursor agent handoff briefs. Each brief is a self-contained patch
spec that a Cursor agent can pick up cold, implement, validate, and open
a PR from - then stop.

## Active rollout

**Batch 7 — Mobile selection UX redesign + per-tire photo library (April 25, 2026).** Three patches that finish the mobile-first product cycle. The audit has surfaced that selection actions take over the viewport and there's no way to capture tire photos for re-listing.

| Patch | Branch | What it ships |
| --- | --- | --- |
| 201 `mobile-selection-bar` | `mobile-selection-bar` | Replace mobile bulk-action stack with sticky bottom bar (Quote + List only); fix Popover off-screen clipping |
| 202 `multi-tire-quote` | `multi-tire-quote` | HaggleSheet handles N tires with per-tire qty steppers + bundle margin |
| 203 `tire-photo-library` | `tire-photo-library` | Per-tire photo upload, gallery, and count badge on catalog cards |

Coordination notes:
- 202 depends on 201 (the mobile selection bar wires the Quote button that 202 extends to multi-tire). Land 201 first.
- 203 is independent of 201/202 — different files, can ship in parallel.
- 203 modifies `firestore.rules` (the only patch in this batch that does). Verify rules deploy after merge (check `npm run deploy:firebase` or whatever the existing workflow is).
- All three should produce visual snapshot diffs that need a baseline regen via the `Visual tests - update Linux baselines` workflow_dispatch after merge.

## Previous rollout

**Batch 6 — testing-process foundation (April 25, 2026).** Five
parallelizable, frontend-only patches that put guardrails in place
before the bigger mobile-chrome and testing-foundation PRs land. All
five are independent and can be dispatched in any order; none touch
shared application code.

| Patch | Branch | What it ships |
| --- | --- | --- |
| 101 `pr-template` | `pr-template` | `.github/pull_request_template.md` with mobile / a11y / perf checklist |
| 102 `codeowners` | `codeowners` | `.github/CODEOWNERS` auto-routes chrome / auth / backend changes |
| 103 `eslint-jsx-a11y` | `eslint-jsx-a11y` | Adds `eslint-plugin-jsx-a11y` to lint pipeline |
| 104 `size-limit` | `size-limit` | `.size-limit.cjs` budgets + CI step to fail PRs that grow bundles |
| 105 `quarterly-audit-cron` | `quarterly-audit-cron` | Quarterly GHA that runs Playwright + axe + Lighthouse against prod |

Coordination notes:
- 101, 102, 103, 104 have no shared file conflicts and can ship in parallel.
- 105's script references `npm run test:visual` which lands in the parallel
  testing-foundation PR (admin-driven, not via Cursor). 105 degrades
  gracefully if test:visual is missing — ship in any order.

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

April 21, 2026 - batch 5. Dashboard redesign scope B. Six briefs (T, U,
V, W, X, Y) consolidated into PR #78. Rolling-average hot-state hero
glow, ActivityTicker aria-live, crew row deep-link, and plan closeout
shipped as a follow-on on the same day.

| Patch | Scope | PR |
| --- | --- | --- |
| T `dashboard-top-sellers-data` | `buildTopSellersAggregate` + `refreshTopSellers` in `functions/financeStats.js`; `selectHiddenGems`, `selectTopSellersFromRevenueDoc`, and `topSellers` / `hiddenGems` / `allTimeMargin` memos on `useDashboardSignals`; `topSellersPalette` | #78 |
| U `dashboard-top-sellers-card` | `TopSellersCard` - 50 / 50 split, paired palette per rank, 3 s flip cycle, hover pauses | #78 |
| V `dashboard-hidden-gems` | `HiddenGemsSurface` - up to 5 rows with missing-platform chips and a `Post it` action | #78 |
| W `dashboard-activity-ticker` | `ActivityTicker` - full-width scrolling chip bar, 35 s loop, hover pauses, kind-coded | #78 |
| X `dashboard-crew-widget-v2` | `CrewDirectoryWidget` - WIP badge + today completions + streak + online dot | #78 |
| Y `dashboard-shell-compose` | `TodayStrip` + rewritten `Dashboard.jsx`; drops modules row, Catalog Health, inline Crew; adds `.pc-card` hover-bloom | #78 |

## Previous rollout

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
