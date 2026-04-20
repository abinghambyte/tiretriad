# Patch G - Integration tests pass 1

You are a Cursor agent shipping ONE patch from a parallel rollout. Six other patches (A, B, C, D, E, F) are in flight concurrently. Do not touch any file outside the scope below. See `docs/handoffs/README.md` for the full ownership map if needed.

## Goal

Add integration coverage for the two highest-risk surfaces that currently have zero tests: the order workflow and the People permission matrix.

## Branch

`integration-tests-pass-1` (cut from latest `main`).

## Scope

NEW test files only. No source edits.

* `functions/orderWorkflow.test.mjs` (create if missing; there may already be a fragment)
* `src/components/people/PeopleDashboard.permissions.test.jsx`

## Tasks

### 1. Order workflow test

Use the Firebase functions-test harness already used by the repo (see `functions/financeStats.test.mjs` as a template). Cover the happy path:

* Create an order
* Transition it through the statuses the product uses (draft -> submitted -> completed, or whatever the live state machine is; verify against existing function code)
* Assert the final Firestore state and any outbound side effects (Slack notify calls mocked)

At minimum: one happy-path test, one auth-guard test, one validation-failure test.

### 2. Permission matrix test

Use React Testing Library + vitest (pattern: see `src/components/layout/paletteActions.test.js`). Render `PeopleDashboard` with a mocked profile context and verify:

* Admin profile sees permission editors for all modules
* Non-admin profile without `manage` on a module does NOT see that module's editor
* Toggling a permission fires the expected Firestore write (mock the firestore write, assert call shape)

Mock Firestore via the pattern already used elsewhere in the repo. Do not hit a real Firestore instance.

## Out of scope

Source edits. Bug fixes. If a test uncovers a real bug, add a `Found but not fixed:` line in the PR body and leave the code alone. A follow-up PR will address it.

## Validation

```
./node_modules/.bin/vitest run
cd functions && npm test
```

Run each three times to confirm no flakes.

## PR

* Title: `Tests: order workflow + permission matrix integration coverage`
* Body: short summary plus Test plan. Include a `Found but not fixed:` section if applicable. No Claude trailers, no em dashes in published text.

Stop after the PR is open.
