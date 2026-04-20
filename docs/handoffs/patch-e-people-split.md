# Patch E - PeopleDashboard split

You are a Cursor agent shipping ONE patch from a parallel rollout. Six other patches (A, B, C, D, F, G) are in flight concurrently. Do not touch any file outside the scope below. See `docs/handoffs/README.md` for the full ownership map if needed.

## Goal

Break up the 1,553-line `PeopleDashboard.jsx` god-component into focused children. Pure UI lift. Zero behavior changes.

## Branch

`people-split` (cut from latest `main`).

## Scope

* `src/components/people/PeopleDashboard.jsx`
* NEW siblings under `src/components/people/`:
  * `InviteUrlToolkit.jsx`
  * `PermissionEditor.jsx`
  * `UserRow.jsx`
  * `UserHistoryModal.jsx` (if the existing file contains this concern)

Do not touch `NfcWriterModal.jsx` or any other unrelated file.

## Tasks

1. Extract each of the above concerns into its own file.
2. Props mirror what the original component closed over. The parent stays the orchestrator of state; children stay dumb (pure presentation plus their own event handlers).
3. PeopleDashboard should land under 700 lines after the extraction.
4. No semantic changes: invite flow, permission toggles, history display all behave identically.

## Out of scope

* NFC writer
* Permission semantics
* Firestore query changes
* Routing / nav

## Validation

```
./node_modules/.bin/vitest run
./node_modules/.bin/eslint src/components/people/
./node_modules/.bin/vite build
```

Manual smoke on `/people`:

* Load the page, see the user list
* Toggle a permission for a user, confirm save
* Generate an invite URL, confirm it appears
* Open user history if applicable

## PR

* Title: `People: split PeopleDashboard into focused components`
* Body: short summary plus Test plan checklist. Call out that this is a pure refactor. No Claude trailers, no em dashes in published text.

Stop after the PR is open.
