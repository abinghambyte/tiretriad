# Patch N - Kill the `/dispatch` placeholder route

You are a Cursor agent shipping ONE patch from a parallel rollout. Four other patches (K, L, M, O) are in flight concurrently. Do not touch any file outside the scope below. See `docs/handoffs/README.md` for the full ownership map if needed.

## Goal

Remove the permanent "Task Dispatcher is being extracted to a standalone application" stub. The external Workforce app is not coming back into `/dispatch`; leaving a perpetual "coming back soon" sign in the nav reads worse than removing the route. `WORKFORCE_URL` stays (Growth Lab still links to the external app); only the in-portal route and its stub component are deleted.

## Branch

`dispatch-kill` (cut from latest `main`).

## Context

- `src/App.jsx` line 9 imports `DispatchRedirect`. Line 85-89 renders it at the `/dispatch` path inside the authenticated tree.
- `src/App.jsx` line 164 is a DIFFERENT route: `/crm/dispatch` -> `/crm?tab=dispatch`. That is the CRM Field Dispatch tab and is unrelated. Do not touch it.
- `src/components/DispatchRedirect.jsx` is the entire stub component. 25 lines. Delete the file.
- `src/constants/externalUrls.ts` exports `WORKFORCE_URL`. Still consumed by `src/pages/GrowthLabPage.jsx` line 250 (external link in the Growth Lab tile). Leave the constant and the file intact.
- No palette-action entry points at `/dispatch` today. Searching for `/dispatch` in `src/components/layout/paletteActions.js` returns only the `/crm/dispatch` tab. Confirm before editing anything else.

## Scope (only touch these files)

- `src/App.jsx` - remove the import and the `/dispatch` route
- DELETE `src/components/DispatchRedirect.jsx`

Do not touch `externalUrls.ts`, `GrowthLabPage.jsx`, `paletteActions.js`, or any CRM file. Do not touch the `/crm/dispatch` redirect at line 164 of App.jsx.

## Tasks

### 1. App.jsx edits

- Remove the import line `import { DispatchRedirect } from './components/DispatchRedirect.jsx'` at line 9.
- Remove the `<Route path="/dispatch" ... element={<DispatchRedirect />} ... />` block around line 85-89. If that `<Route>` is wrapped in any auth-guard element, remove the full wrapping block so no dead guard remains.
- Leave the `/crm/dispatch` redirect at line 164 alone.

### 2. Delete the stub

- `git rm src/components/DispatchRedirect.jsx`. Do not leave a re-export shim.

### 3. Verify no orphaned references

Run a grep for `DispatchRedirect` and `"/dispatch"` (note the quotes; excludes `/crm/dispatch`) across `src/`. Both should return no matches after your edits. If either does, either (a) the grep caught a test asserting the route is gone - fine, keep it; or (b) a stale import somewhere else - remove it and include it in the PR diff with a note.

## Out of scope

- Removing `WORKFORCE_URL` or editing `externalUrls.ts`. Growth Lab still uses it.
- Changing the `/crm/dispatch` redirect or the CRM Field Dispatch tab.
- Updating any documentation that mentions `/dispatch`. The ROADMAP already lists this as a decision item; the follow-up commit on ROADMAP happens separately.
- Rebuilding an in-portal Task Dispatcher. That would be its own greenfield patch if ever revived.

## Validation (must all pass before PR)

```
./node_modules/.bin/vitest run
./node_modules/.bin/eslint src/App.jsx
./node_modules/.bin/vite build
```

Also manually grep-verify: `rg "DispatchRedirect|\"/dispatch\"" src/` should be empty except possibly a test asserting the route no longer exists.

## PR

- Title: `Kill the /dispatch placeholder route`
- Body: one-paragraph summary + Test plan checklist confirming `/dispatch` returns the normal 404 / not-found path and no other routes changed. No Claude trailers, no em dashes in published text.

Execute this brief exactly. Branch from main, run all validation commands before opening the PR, and stop after the PR is open.
