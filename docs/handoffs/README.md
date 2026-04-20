# Parallel rollout handoffs

Seven independent patches designed to be shipped simultaneously by separate Cursor agents.
Each `patch-*.md` in this directory is a complete, self-contained brief. Paste one file
into a Cursor agent and it has everything it needs to open a PR.

## How to hand off

1. Open a new Cursor agent session.
2. Paste the full contents of the patch file (e.g. `patch-a-palette-polish.md`).
3. The agent branches, implements, validates, and opens the PR. It stops after PR open.
4. Merge PRs in any order, with one exception below.

## Branch / file ownership map

| Patch | Branch | Owns |
|---|---|---|
| A | `palette-polish` | `src/components/layout/CommandPalette.jsx`, `src/components/layout/PortalChrome.jsx` |
| B | `shared-utils` | NEW: `src/utils/localStorage.js`, `src/hooks/useFirestoreQuery.js` (+ tests) |
| C | `dashboard-pagination` | `src/hooks/useDashboardSignals.js`, NEW `functions/dashboardStats.js`, one export line in `functions/index.js` |
| D | `tires-memo-perf` | `src/components/tires/TiresDashboard.jsx`, `src/components/tires/MarginTable.jsx` |
| E | `people-split` | `src/components/people/PeopleDashboard.jsx`, NEW siblings in `src/components/people/` |
| F | `functions-domain-split` | `functions/index.js`, NEW `functions/{orders,crm,people,slack}.js` |
| G | `integration-tests-pass-1` | NEW `*.test.*` files only |

## Merge coordination

* C and F both touch `functions/index.js`. If C merges first, F rebases and keeps C's one-line export. If F merges first, C adds its export to the new split index. Either order works; just not both merging without rebase.
* Everything else is orthogonal. Order is free.

## Guardrails every agent follows

* Branch from latest `main` at start.
* Touch only files listed in the brief's scope.
* Run the brief's validation commands before opening PR.
* Open PR with the exact title given, then stop.
* Any bug found outside scope goes into the PR body under "Found but not fixed:" - not a code fix.
