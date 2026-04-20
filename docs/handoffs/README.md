# docs/handoffs

Active Cursor agent handoff briefs. Each brief is a self-contained patch
spec that a Cursor agent can pick up cold, implement, validate, and open
a PR from - then stop.

## Active rollout: April 20, batch 3

Five patches. K / L / M are fully orthogonal. N and O both touch `src/App.jsx` routing, so N merges first (pure removal of the `/dispatch` stub) and O rebases on top if needed (adds the public `/vip/:token` route).

| Patch | Branch | Owns |
| --- | --- | --- |
| K | `payout-config` | `functions/financeStats.js`, `functions/financeSlackCommands.js`, `functions/lookupUtilitySlackCommands.js`, `functions/financeStats.test.mjs`, NEW `functions/payoutConfig.js` / `.test.mjs`, `src/pages/OpsPage.jsx` (new section only), NEW `src/components/ops/PayoutConfigPanel.jsx` / `.test.jsx` |
| L | `fet-tag` | `src/components/tires/MarginTable.jsx`, NEW `scripts/migrate-tire-fet-tag.mjs` / `.test.mjs`, optional touch of `src/utils/opportunityScore.js` |
| M | `tire-haystack-v2` | `src/utils/tireSearchHaystack.js`, `src/utils/tireSearchHaystack.test.js`, NEW `src/utils/tireSearchHaystack.fixtures.js` |
| N | `dispatch-kill` | `src/App.jsx` (remove `/dispatch` route only), DELETE `src/components/DispatchRedirect.jsx` |
| O | `vip-magic-link-v1` | `src/App.jsx` (add `/vip/:token` public route), NEW `src/pages/VipConciergePage.jsx` / `.test.jsx`, `src/components/chat/SinchChatMount.jsx` (two new optional props), `src/components/crm/CrmAccountDetailPanel.jsx` (Generate VIP link button), NEW `functions/vipLinks.js` / `.test.mjs`, `functions/index.js` (export new callables), `functions/.env.example` (new secret comment) |

Merge order: K / L / M / N in any order; O last (rebase onto post-N main if N merges while O is in flight).

## When the folder is empty

No active rollout in flight. Add new briefs here when dispatching one or
more agents in parallel.

## Conventions

- One file per patch: `patch-<letter>-<short-name>.md`.
- First line of each brief is the H1 title (no em dashes anywhere).
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

## Last rollout

April 20, 2026 - batch 2. Three small patches shipped in parallel. All merged.

| Patch | Scope | PR |
| --- | --- | --- |
| H `sinch-lead-drawer` | CRM Leads source pill + inquiry preview + detail drawer | #69 |
| I `revenue-stats-backfill` | One-off script to rebuild `meta/revenueStats` | #67 |
| J `backdate-log-sale` | Optional backdated completion timestamp on Log Sale | #68 |

## Previous rollout

April 20, 2026 - batch 1. Seven patches shipped in parallel via Cursor
Background Agents. All merged.

| Patch | Scope | PR |
| --- | --- | --- |
| A `palette-polish` | Command palette debounce + stable callbacks | #62 |
| B `shared-utils` | `src/utils/localStorage.js` + `useFirestoreQuery` | #57 |
| C `dashboard-pagination` | `getDashboardStats` callable + hook rewrite | #55 |
| D `tires-memo-perf` | TiresDashboard / MarginTable memoization | #54 |
| E `people-split` | Split PeopleDashboard into focused components | #56 |
| F `functions-domain-split` | Split `functions/index.js` into domain files | #60 |
| G `integration-tests-pass-1` | Order workflow + People permission tests | #61 |
