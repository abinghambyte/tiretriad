---
id: 402
title: CrmPage refactor (Option D — depends on 401 reference)
branch: refactor-crm-page
depends_on:
  - 401
touches_shared:
  - src/pages/CrmPage.jsx
frontend_only: true
---

# Patch 402 — CrmPage refactor (Option D)

**READ FIRST: `BATCH-10-PATTERN.md`** in this directory. The pattern is documented there. **READ patch-401's PR diff** as the reference implementation — apply the same shape here.

## Branch

`refactor-crm-page`

## Scope

`src/pages/CrmPage.jsx` (1260 lines) houses: Board kanban + Leads table + DispatchTab + Add Account flow + Lost-deals ribbon + score / segment / location / free-text filters. Three tabs share a top-level filter and search.

Refactor target shape:

```
src/utils/crmSelectors.js
  selectAccountsByStage(accounts, stage)
  selectVisibleLeads(leads, filters, search)
  selectLostDeals(accounts)
  // any other pure derivations you find
src/utils/crmSelectors.test.js

src/components/crm/useCrmPage.js
  Page hook composing sub-hooks:
    useCrmFilters()       (search, score, segment, location)
    useCrmRouting()       (tab + active account id)
    useCrmAccountActions() (add account, move stage, mark lost)
src/components/crm/useCrmPage.test.js

src/pages/CrmPage.jsx                 ← thin shell, ~80 lines
src/components/crm/BoardTab.jsx       ← kanban
src/components/crm/LeadsTab.jsx       ← table + filters
src/components/crm/DispatchTab.jsx    ← already gated behind flags.multiUserMode
src/components/crm/AddAccountFlow.jsx ← stage-1 input prompt + commit
src/components/crm/LostDealsRibbon.jsx
```

## Specifics for this page

- `DispatchTab` is gated behind `flags.multiUserMode` from patch 304. Preserve that gate.
- The existing `<CrmAccountDetailPanel>` is mounted from CrmPage's BoardTab. Don't touch its internals (patch 403 handles it). Just thread `selectedAccountId` + `onSelect` through props.
- `crmModuleTabs.js` already exists with `canDispatch`. Use it; don't re-implement.
- The "Add VIP client" stage-1 flow uses `<InputPromptModal>` from `src/components/ui/InputPromptModal.jsx`. Preserve that primitive — the new `AddAccountFlow.jsx` is a thin wrapper that owns the open/close state via the page hook.

## Process

1. `cd` worktree, `npm ci`
2. **Read in order:** `BATCH-10-PATTERN.md`, the patch-401 PR diff (your reference), `CrmPage.jsx` in full, any test that exists for it (likely none), `crmModuleTabs.js`, `crmPipeline.js`
3. Identify state grouping: routing (tab/active id) → filters (search + 3 chips) → account actions (add/move/mark lost) → leads-specific state
4. Write selectors first with tests
5. Write each sub-hook with renderHook tests
6. Extract subcomponents
7. Rewrite the page shell
8. Verify lint / test / build / G1 caps per hook
9. Commit in logical chunks (selectors → hooks → subcomponents → shell)
10. Open PR titled: `Refactor CrmPage into hook + selectors + subcomponents (Option D)`

## Acceptance criteria

Same as patch-401. Plus:
- `BoardTab` / `LeadsTab` / `DispatchTab` each ≤ 200 lines and stateless (consume from page hook via prop slices)
- Tab routing logic lives in `useCrmRouting` sub-hook; tab subcomponents render based on the prop they receive

## Out of scope

- `CrmAccountDetailPanel.jsx` (separate patch 403)
- `crmPipeline.js` utility
- `InputPromptModal.jsx` primitive

## Validation

```
npm run lint
npm run test
npm run build
```

## PR title

`Refactor CrmPage into hook + selectors + subcomponents (Option D)`

Execute this brief exactly. Branch from main (after 401 has merged), run all validation commands before opening the PR, and stop after the PR is open.
