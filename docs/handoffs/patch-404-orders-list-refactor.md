---
id: 404
title: OrdersList refactor (Option D — parallel with 402/403)
branch: refactor-orders-list
depends_on:
  - 401
touches_shared:
  - src/components/orders/OrdersList.jsx
frontend_only: true
---

# Patch 404 — OrdersList refactor (Option D)

**READ FIRST: `BATCH-10-PATTERN.md`** + the patch-401 PR diff. Same pattern.

## Branch

`refactor-orders-list`

## Scope

`src/components/orders/OrdersList.jsx` (964 lines) houses the entire order workflow: list rendering + poke modal + cancel modal + complete modal + sound effects + confirm-modal stack. Mounted from both `/orders` (standalone page) and `/tires?tab=orders`.

Refactor target shape:

```
src/utils/orderSelectors.js
  selectVisibleOrders(orders, filters)
  selectOrderStatusGroup(order)
  // pure derivations
src/utils/orderSelectors.test.js

src/components/orders/useOrdersList.js
  Sub-hooks:
    useOrderActions()      (poke, cancel, complete callables)
    useOrderModals()       (which modal is open + the active order)
    useOrderSounds()       (sound effects + mute preference)
src/components/orders/useOrdersList.test.js

src/components/orders/OrdersList.jsx          ← thin shell, ~100 lines
src/components/orders/OrdersTable.jsx         ← row rendering
src/components/orders/PokeModal.jsx
src/components/orders/CancelModal.jsx
src/components/orders/CompleteModal.jsx
src/components/orders/SoundManager.jsx        ← if needed; could fold into useOrderSounds
```

## Specifics for this page

- OrdersList is mounted in 2 places (`/orders` and `/tires?tab=orders`). Both consumers should keep working without code changes — pass-through props stay the same.
- The poke / cancel / complete actions call backend Firebase Functions. These belong in `useOrderActions` sub-hook with proper error handling (toast on failure).
- Sound effects are a real feature — there's an audio cue on completion. Don't accidentally drop it. The SoundManager sub-component or `useOrderSounds` hook needs to preserve the audio cue behavior.
- The mute preference (if any) should persist in localStorage. Check existing behavior; preserve it.

## Process

Same shape as patch-401 / 402 / 403. Validate G1.

## Acceptance criteria

Same as patch-401. Plus:
- `<PokeModal>`, `<CancelModal>`, `<CompleteModal>` are individual files; each ≤ 150 lines
- `useOrderActions` has renderHook tests for at least: poke success, poke failure, cancel with disposition, complete success
- The sound cue on order completion is verified to still fire (manual smoke or a test that asserts the audio element / hook is invoked)
- Both mount sites (`/orders` and `/tires?tab=orders`) still render correctly post-refactor

## Out of scope

- Changing the order workflow itself
- Changing the `meta/orderEngagement` data shape
- Touching the `/orders` route or `/tires?tab=orders` route logic
- Refactoring related order-side helpers in `src/utils/orderSelectors.js` beyond what this patch requires

## Validation

```
npm run lint
npm run test
npm run build
```

## PR title

`Refactor OrdersList into hook + selectors + subcomponents (Option D)`

Execute this brief exactly. Branch from main (after 401 merged), run all validation commands before opening the PR, and stop after the PR is open.
