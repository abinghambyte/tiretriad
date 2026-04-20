# Patch B - Shared utils foundation

You are a Cursor agent shipping ONE patch from a parallel rollout. Six other patches (A, C, D, E, F, G) are in flight concurrently. Do not touch any file outside the scope below. See `docs/handoffs/README.md` for the full ownership map if needed.

## Goal

Land two reusable primitives that later patches will adopt. Do NOT migrate any existing callers.

## Branch

`shared-utils` (cut from latest `main`).

## Scope (only touch these files, all new)

* NEW: `src/utils/localStorage.js`
* NEW: `src/utils/localStorage.test.js`
* NEW: `src/hooks/useFirestoreQuery.js`
* NEW: `src/hooks/useFirestoreQuery.test.js`

## Tasks

### 1. `src/utils/localStorage.js`

Export four functions, all safe for SSR (`typeof window === 'undefined'` early return) and quota / parse errors (swallow with a single `console.warn`, return fallback):

* `safeGetJSON(key, fallback)`
* `safeSetJSON(key, value)`
* `safeGetString(key, fallback = '')`
* `safeSetString(key, value)`

### 2. `src/hooks/useFirestoreQuery.js`

Export `useFirestoreQuery(buildQuery, deps)` returning `{ data, loading, error }`.

* `buildQuery` is a function that receives the Firestore `db` and returns either a `Query` (subscribe via `onSnapshot`) or a one-shot `Promise` from `getDocs`. If it returns `null`, the hook idles with `data: null, loading: false, error: null`.
* Live subscription path uses `onSnapshot` and unsubscribes on cleanup.
* Both paths use a `cancelled` flag so late results after unmount do not set state.
* Error path sets `error` and stops `loading`.

### 3. Tests

Match the style already in the repo (see `src/components/layout/paletteActions.test.js` for vitest + mocks). For `useFirestoreQuery`, mock the firestore module or inject `db` via the closure returned by `buildQuery`.

## Out of scope

Migrating any existing caller (TiresDashboard, useDashboardSignals, etc.). That is patch D and a later follow-up.

## Validation

```
./node_modules/.bin/vitest run
./node_modules/.bin/eslint src/utils/localStorage.js src/utils/localStorage.test.js src/hooks/useFirestoreQuery.js src/hooks/useFirestoreQuery.test.js
./node_modules/.bin/vite build
```

## PR

* Title: `Add shared localStorage + useFirestoreQuery utilities`
* Body: short summary plus Test plan checklist. No Claude trailers, no em dashes in published text.

Stop after the PR is open.
