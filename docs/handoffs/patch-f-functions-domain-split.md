# Patch F - Functions domain split

You are a Cursor agent shipping ONE patch from a parallel rollout. Six other patches (A, B, C, D, E, G) are in flight concurrently. Do not touch any file outside the scope below. See `docs/handoffs/README.md` for the full ownership map if needed.

## Goal

Split the monolithic `functions/index.js` into domain files. Mechanical move. Zero behavior changes.

## Branch

`functions-domain-split` (cut from latest `main`).

## Context

`functions/index.js` contains 50-plus Cloud Functions in a single 1000-plus-line file. Break it by domain.

## Scope

* `functions/index.js`
* NEW: `functions/orders.js`, `functions/crm.js`, `functions/people.js`, `functions/slack.js`
* NEW if shared init is needed: `functions/_shared.js`

Do not touch function implementations. Do not add tests. Do not rename exports.

## Coordination with Patch C

Patch C (`dashboard-pagination`) is adding a new callable `getDashboardStats` in `functions/dashboardStats.js` and one export line in `functions/index.js`. If C has merged when you rebase, preserve its export by including it in the new split index. If C has not merged, it will rebase onto your new layout.

## Tasks

1. Group the existing functions by domain:
   * Orders lifecycle, notifications, sale logging -> `orders.js`
   * CRM leads, accounts, jobs, dispatch triggers -> `crm.js`
   * People / auth / invite / permission functions -> `people.js`
   * All Slack command handlers -> `slack.js`
2. Keep scheduled functions and triggers with their domain (not in a separate "triggers" file).
3. Shared admin SDK init (`admin.initializeApp()`) stays in `index.js` or moves to `_shared.js` and is imported by each domain file. Exactly one initialization path.
4. `index.js` becomes a registry: imports from each domain and re-exports.
5. All existing tests (`functions/*.test.*`) must pass unchanged.

## Out of scope

New functionality, new tests, renames, signature changes, runtime option changes.

## Validation

```
cd functions && npm test
# If a function emulator workflow is present in the repo, run it to verify the deployed function inventory is unchanged.
```

Compare `firebase functions:list` output (or the equivalent inventory from the emulator) before and after to confirm the set of exported function names is identical.

## PR

* Title: `Functions: split index.js into domain files`
* Body: short summary plus Test plan checklist. Emphasize this is a mechanical move with no behavior change. List the before/after function inventory match. No Claude trailers, no em dashes in published text.

Stop after the PR is open.
