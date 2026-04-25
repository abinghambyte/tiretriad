# docs/handoffs

Active Cursor agent handoff briefs. Each brief is a self-contained patch
spec that a Cursor agent can pick up cold, implement, validate, and open
a PR from - then stop.

## Active rollout

**Batch 10 — God-component refactors (April 25, 2026).** Six sequential patches that decompose the four largest files in the codebase using a shared "Option D" pattern: pure selectors + page hook + thin shell + presentation subcomponents. Read `BATCH-10-PATTERN.md` before any of these.

| Patch | Branch | What it ships |
| --- | --- | --- |
| 401 `refactor-people-dashboard` | `refactor-people-dashboard` | PeopleDashboard.jsx (737 lines) — pattern reference implementation |
| 402 `refactor-crm-page` | `refactor-crm-page` | CrmPage.jsx (1260 lines) — depends on 401 |
| 403 `refactor-crm-account-detail` | `refactor-crm-account-detail` | CrmAccountDetailPanel.jsx (918 lines) — parallel with 402 |
| 404 `refactor-orders-list` | `refactor-orders-list` | OrdersList.jsx (964 lines) — parallel with 402, 403 |
| 405 `refactor-tires-dashboard` | `refactor-tires-dashboard` | TiresDashboard.jsx (1262 lines) — depends on 401-404 lessons |
| 406 `refactor-margin-table` | `refactor-margin-table` | MarginTable.jsx (1275 lines, desktop path only) — depends on 405 |

Coordination notes:
- **Dispatch 401 first**, in isolation. It validates the pattern. Once 401's PR is reviewed and merged, the established hook/selector/subcomponent shape becomes the reference for the rest.
- **402, 403, 404 can ship in parallel** after 401 merges — they touch independent files (CRM page, CRM account detail panel, OrdersList).
- **405 ships after 401-404 are merged** — Tires is the most state-heavy and most-trafficked surface.
- **406 ships after 405** — MarginTable is the highest-risk file, with two hard constraints: do NOT touch the mobile cards path (battle-tested), and preserve the react-window grid-layout invariant (column widths must match between header and rows or the table visually breaks).
- Every patch must satisfy the **G1 guardrail**: no single hook over 150 lines or returning more than 12 named values; split into composable sub-hooks if it would.
- Every patch must add **behavioral test coverage** (renderHook for state transitions, unit tests for selectors). The visual safety net only catches chrome diffs, not behavioral regressions.

## Previous rollout

**Batch 8 — Desktop scope cleanup (April 25, 2026).** Eight parallelizable patches sourced from `docs/superpowers/audits/2026-04-25-desktop-scope-audit.md`. Each ships an audit-driven win: dead code removal, scope decisions made by the admin, small chrome polish, and one larger codemod. All frontend-only.

| Patch | Branch | What it ships |
| --- | --- | --- |
| 301 `commit-advisor-mode` | `commit-advisor-mode` | Pick NextToPostSurface as the canonical listing surface; delete HiddenGemsSurface + the `listingAdvisor` flag |
| 302 `growth-lab-admin-nav` | `growth-lab-admin-nav` | Add a Growth Lab discoverability link under the Admin panel |
| 303 `remove-tanner-block` | `remove-tanner-block` | Remove the `isTannerPortalBlocked` carve-out (no longer relevant) |
| 304 `multi-user-mode-flag` | `multi-user-mode-flag` | Gate AvailabilityBlocker, FieldDispatch tab, CrewDirectoryWidget behind a `multiUserMode` flag (default off until Kyle/DJ onboard) |
| 305 `inline-single-file-modules` | `inline-single-file-modules` | Verify SinchChatMount is mounted; flatten 3 single-file "module" dirs into callsites |
| 306 `button-styles-codemod` | `button-styles-codemod` | Codemod inline button class strings to BTN_PRIMARY / BTN_SECONDARY constants |
| 307 `credit-tracker-placement` | `credit-tracker-placement` | Give CreditTrackerCard its own Ops tab instead of rendering above every tab |
| 308 `small-chrome-cleanups` | `small-chrome-cleanups` | Drop stale `/settings` TODO + add inverse "Back to focused mobile" toggle in avatar dropdown |

Coordination notes:
- All 8 patches have non-overlapping file sets and can ship in parallel.
- 304 modifies `featureFlags.js`; 305 doesn't touch it. No shared-file conflicts expected.
- 306 (button codemod) may produce visual snapshot diffs depending on how strict the tolerance is — regenerate baselines via `Visual tests - update Linux baselines` workflow_dispatch after merge if so.
- All 8 are P1 / P2 / P3 — none gate any in-flight feature work.

## Previous rollout

**Batch 7 — Mobile selection UX redesign + per-tire photo library (April 25, 2026).** Three patches that finished the mobile-first product cycle.

| Patch | Branch | What it ships |
| --- | --- | --- |
| 201 `mobile-selection-bar` | `mobile-selection-bar` | Replace mobile bulk-action stack with sticky bottom bar (Quote + List only); fix Popover off-screen clipping |
| 202 `multi-tire-quote` | `multi-tire-quote` | HaggleSheet handles N tires with per-tire qty steppers + bundle margin |
| 203 `tire-photo-library` | `tire-photo-library` | Per-tire photo upload, gallery, and count badge on catalog cards |

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
