---
id: 401
title: PeopleDashboard refactor (Option D — first of Batch 10)
branch: refactor-people-dashboard
depends_on: []
touches_shared:
  - src/components/people/PeopleDashboard.jsx
frontend_only: true
---

# Patch 401 — PeopleDashboard refactor (Option D)

**READ FIRST: `BATCH-10-PATTERN.md`** in this directory. The pattern, guardrails (150-line / 12-value cap, prop-slices, pure selectors, mandatory behavioral tests), and dispatch order are documented there.

This patch is the FIRST of Batch 10. It validates the pattern on the smallest god-component (737 lines) before we attempt the bigger ones (CrmPage 1260, TiresDashboard 1262, MarginTable 1275). Apply the pattern faithfully — subsequent briefs will reference this PR as the reference implementation.

## Branch

`refactor-people-dashboard`

## Scope

`src/components/people/PeopleDashboard.jsx` (737 lines) holds: invite create flow + NFC + elevation scheduling + permission editor mount + lock/revoke/delete confirmations + role-defaults edit + AvailabilityBlocker + history modal + the users table itself.

Refactor target shape:

```
src/utils/peopleSelectors.js
  selectVisibleUsers(users, search, roleFilter)
  selectInviteFormState(formData)
  // any other pure derivations you find while reading
src/utils/peopleSelectors.test.js

src/components/people/usePeopleDashboard.js
  Page hook composing 3-4 sub-hooks if needed:
    useInviteForm()
    useUserActions()  (history modal, lock/revoke/delete)
    useElevationScheduling()
src/components/people/usePeopleDashboard.test.js

src/components/people/PeopleDashboard.jsx          ← thin shell, ~70 lines
src/components/people/InviteWidget.jsx             ← invite form + NFC button
src/components/people/UsersTable.jsx               ← table + row actions
src/components/people/PeopleConfirmModals.jsx      ← lock / revoke / delete confirms
```

## Specifics for this page

- The `<CrewDirectoryWidget>` render is already wrapped in `hidden sm:block` from PR #142. Preserve that wrapper.
- `<AvailabilityBlocker>` is gated behind `flags.multiUserMode` from patch 304. Preserve that gate.
- `<CreateUserInviteSection>` already exists as a subcomponent — verify the new `InviteWidget` doesn't duplicate it. If `CreateUserInviteSection` is essentially the same as the new `InviteWidget` should be, KEEP `CreateUserInviteSection` and just relocate state into the hook.
- Existing `PeopleDashboard.permissions.test.jsx` MUST still pass. If the test asserts on internal DOM that you're refactoring, update the test to query by accessible role/label, not structure.

## Process

1. `cd` into the worktree, `npm ci`
2. **Read in this order:** `BATCH-10-PATTERN.md`, `PeopleDashboard.jsx` in full, `PeopleDashboard.permissions.test.jsx`, `CrewDirectoryWidget.jsx`
3. Identify all useState, useEffect, useCallback in `PeopleDashboard.jsx`. Group them by concern (invite form, user actions, elevation scheduling, page-level routing).
4. Write `peopleSelectors.js` first — extract any pure functions you find inline (e.g., filter/sort logic over the users array).
5. Write `peopleSelectors.test.js` to cover the selectors before extraction.
6. Write the sub-hooks one at a time. For each, write the renderHook test alongside it.
7. Compose the sub-hooks in `usePeopleDashboard.js`.
8. Extract `InviteWidget`, `UsersTable`, `PeopleConfirmModals` as pure-presentation components taking prop slices.
9. Rewrite `PeopleDashboard.jsx` as a thin shell.
10. Verify:
    - `npm run lint` clean
    - `npm run test` passes (existing PeopleDashboard.permissions.test.jsx + new selector + hook tests)
    - `npm run build` clean
    - **Each new hook must satisfy G1: ≤ 150 lines, ≤ 12 returned values.** If any sub-hook is over, split further.
11. Commit in logical chunks (selectors first, hooks second, subcomponents third, shell rewrite last) so the diff is reviewable.
12. Open PR with title: `Refactor PeopleDashboard into hook + selectors + subcomponents (Option D)`

## Acceptance criteria

- `PeopleDashboard.jsx` is ≤ 100 lines after the refactor
- All extracted hooks satisfy G1 (≤ 150 lines, ≤ 12 returns)
- Selectors are pure (no React imports) and individually unit-tested
- Hook(s) have renderHook coverage for at least these state transitions: invite form submit success, invite form submit error, user lock confirmation, user revoke confirmation
- Subcomponents take prop slices, not the entire hook
- Existing tests pass without weakening (don't change `expect(...).toBeTruthy()` to `expect(...).toBeDefined()` to dodge a real failure)
- Lint clean, build clean

## Out of scope

- Touching `CreateUserInviteSection` internals beyond moving its state owner
- Touching `<CrewDirectoryWidget>` internals
- Touching `AvailabilityBlocker` internals (the gate stays as-is from patch 304)
- Refactoring `ContactsPage.jsx` (separate file, separate concern; it's at `/people?tab=customers`)

## Validation

```
npm run lint
npm run test
npm run build
```

Plus per-file checks: `wc -l src/components/people/usePeopleDashboard.js` and any sub-hooks must be ≤ 150 lines each.

## PR title

`Refactor PeopleDashboard into hook + selectors + subcomponents (Option D)`

Execute this brief exactly. Branch from main, run all validation commands before opening the PR, and stop after the PR is open.
