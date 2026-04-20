# Patch C - Dashboard pagination

You are a Cursor agent shipping ONE patch from a parallel rollout. Six other patches (A, B, D, E, F, G) are in flight concurrently. Do not touch any file outside the scope below. See `docs/handoffs/README.md` for the full ownership map if needed.

## Goal

Replace the unbounded `limit(5000)` completed-orders fetch in the dashboard with a server-side aggregation.

## Branch

`dashboard-pagination` (cut from latest `main`).

## Context

`src/hooks/useDashboardSignals.js` around line 210 currently pulls up to 5000 completed orders to sum revenue client-side. This will not scale past that threshold and burns Firestore reads on every dashboard load.

## Scope (only touch these files)

* `src/hooks/useDashboardSignals.js`
* NEW: `functions/dashboardStats.js`
* NEW: `functions/dashboardStats.test.mjs`
* `functions/index.js` - add exactly one export line at the bottom, nothing else

## Coordination with Patch F

Patch F (`functions-domain-split`) is splitting `functions/index.js` concurrently. Add your one-line export at the BOTTOM of the current `functions/index.js`. If F merges first, rebase onto the new split layout and re-add the single export in the appropriate domain file. Do not reorganize anything else in `index.js`.

## Tasks

### 1. `functions/dashboardStats.js`

Export a callable Cloud Function `getDashboardStats({ windowDays })`:

* Defaults `windowDays` to 90 if missing; clamps to `[1, 365]`.
* Queries completed orders via admin SDK: `where('status','==','completed')` plus the date window.
* Returns `{ totalRevenue, orderCount, byMonth: [{ yearMonth: '2026-04', revenue, count }, ...] }`.
* Reuses admin SDK init pattern from a sibling function file (see any existing callable like `financeStats.js` as a template).
* Enforces auth: `context.auth` present, else throw `HttpsError('unauthenticated')`.

### 2. `functions/dashboardStats.test.mjs`

Use the test harness already in the repo (`financeStats.test.mjs` is a good template). Cover: happy path, auth guard, date window clamp.

### 3. `src/hooks/useDashboardSignals.js`

* Replace the `limit(5000)` completed-orders fetch with a single `httpsCallable('getDashboardStats')` invocation on mount (and on window change if applicable).
* Preserve the hook's current return shape; map callable output into it.
* Leave the in-progress orders live subscription untouched.

### 4. `functions/index.js`

Add at the very bottom:

```js
export { getDashboardStats } from './dashboardStats.js'
```

(Use whatever export/require pattern matches the current file.)

## Out of scope

Any other Cloud Function. Any UI change. Reorganizing `functions/index.js`.

## Validation

```
./node_modules/.bin/vitest run
cd functions && npm test
./node_modules/.bin/eslint src/hooks/useDashboardSignals.js
./node_modules/.bin/vite build
```

Manual: after CI deploys the preview, load the dashboard and compare the revenue number to production.

## PR

* Title: `Dashboard: server-side revenue aggregation`
* Body: short summary plus Test plan checklist. No Claude trailers, no em dashes in published text.

Stop after the PR is open.
