---
id: 403
title: CrmAccountDetailPanel refactor (Option D — parallel with 402)
branch: refactor-crm-account-detail
depends_on:
  - 401
touches_shared:
  - src/components/crm/CrmAccountDetailPanel.jsx
frontend_only: true
---

# Patch 403 — CrmAccountDetailPanel refactor (Option D)

**READ FIRST: `BATCH-10-PATTERN.md`** + the patch-401 PR diff. Same pattern.

## Branch

`refactor-crm-account-detail`

## Scope

`src/components/crm/CrmAccountDetailPanel.jsx` (918 lines) is a side-panel that opens when a CRM account is selected. It owns: contacts list, notes editor, deal value editor, next action editor, stage-move controls, activity log.

Refactor target shape:

```
src/utils/accountDetailSelectors.js
  selectActivityTimeline(account, contacts, orders)
  selectDealValueDisplay(account)
  // pure derivations
src/utils/accountDetailSelectors.test.js

src/components/crm/useAccountDetail.js
  Sub-hooks:
    useAccountFields()      (deal value, next action, notes)
    useAccountContacts()    (add/remove/edit contacts)
    useAccountStageMove()   (stage controls + lost confirmation)
src/components/crm/useAccountDetail.test.js

src/components/crm/CrmAccountDetailPanel.jsx  ← thin shell, ~80 lines
src/components/crm/AccountHeader.jsx
src/components/crm/ContactList.jsx
src/components/crm/NotesPane.jsx
src/components/crm/ActivityLog.jsx
src/components/crm/StageMoveControls.jsx
```

## Specifics

- The panel is mounted from `CrmPage.jsx` (patch 402's BoardTab). After 402 lands, the parent passes `accountId` + `onClose` as props. Don't touch how it's mounted — touch only what's inside.
- Per-account Firestore subscriptions (notes, contacts, activity) belong in the sub-hooks, not in the page hook above.
- The "Mark lost" confirmation MUST be preserved as a confirm gate (it's a destructive action). Move the modal state into the relevant sub-hook.

## Process

Same as patch-401 / 402. Validate G1 (≤ 150 lines, ≤ 12 returns) per hook.

## Acceptance criteria

Same as patch-401. Plus:
- `<CrmAccountDetailPanel>` is ≤ 100 lines after refactor
- Each sub-hook has at least one renderHook test for its primary state transition (add contact, edit notes, move stage)
- Selectors are pure and unit-tested

## Out of scope

- `CrmPage.jsx` (separate patch 402)
- `crmPipeline.js`
- Any change to the Firestore data model

## Validation

```
npm run lint
npm run test
npm run build
```

## PR title

`Refactor CrmAccountDetailPanel into hook + selectors + subcomponents (Option D)`

Execute this brief exactly. Branch from main (after 401 merged; 402 may or may not be merged — they touch different files), run all validation commands before opening the PR, and stop after the PR is open.
