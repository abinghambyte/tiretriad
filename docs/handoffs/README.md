# docs/handoffs

Active Cursor agent handoff briefs. Each brief is a self-contained patch
spec that a Cursor agent can pick up cold, implement, validate, and open
a PR from - then stop.

## Active rollout: April 20, batch 2

Three small patches, all orthogonal. Paste one brief per agent.

| Patch | Branch | Owns |
| --- | --- | --- |
| H | `sinch-lead-drawer` | `src/pages/CrmPage.jsx` (Leads table rows/columns only), NEW `src/components/crm/CrmLeadDetailDrawer.jsx` / `.test.jsx`, NEW `src/components/crm/leadSourceBadge.jsx` |
| I | `revenue-stats-backfill` | NEW `scripts/backfill-revenue-stats.mjs` only |
| J | `backdate-log-sale` | `src/components/tires/SaleMessenger.jsx`, `functions/orders.js`, NEW `functions/orders.backdate.test.mjs` |

No merge coordination needed - zero file overlap across H / I / J. Merge in any order.

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

April 20, 2026 - seven patches shipped in parallel via Cursor Background
Agents. All merged.

| Patch | Scope | PR |
| --- | --- | --- |
| A `palette-polish` | Command palette debounce + stable callbacks | #62 |
| B `shared-utils` | `src/utils/localStorage.js` + `useFirestoreQuery` | #57 |
| C `dashboard-pagination` | `getDashboardStats` callable + hook rewrite | #55 |
| D `tires-memo-perf` | TiresDashboard / MarginTable memoization | #54 |
| E `people-split` | Split PeopleDashboard into focused components | #56 |
| F `functions-domain-split` | Split `functions/index.js` into domain files | #60 |
| G `integration-tests-pass-1` | Order workflow + People permission tests | #61 |
