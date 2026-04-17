# Cursor handoff — Slack modal smoke test

>Worker: Field Executor (Cursor)
>Author: Portal Architect (Sonnet 4.6)
>Date: 2026-04-16

## Goal

Verify that the five Slack slash commands converted to modal UX in commit `428dc28` are fully wired end-to-end. Each command must open a modal, accept valid input, and fire the correct downstream action. No regressions on existing routes or functions.

## Context

Cursor recently refactored `/payout`, `/onmyway`, `/done`, `/sms`, and `/confirm` from text-parsing to modal-based UX (`slackModalShared.js`). The view_submission pipeline in `functions/index.js` was also wired to call `tryHandleFinanceViewSubmission` and `tryHandleFieldViewSubmission`. This handoff verifies that wiring is correct before crew onboarding.

Key files:
- `functions/index.js` — Slack event router, view_submission chain
- `functions/financeSlackCommands.js` — `/payout` modal, `tryHandleFinanceViewSubmission`
- `functions/fieldSlackCommands.js` — `/onmyway`, `/done`, `/sms`, `/confirm` modals, `tryHandleFieldViewSubmission`
- `functions/slackModalShared.js` — shared helpers

## Tasks

### 1. Audit the view_submission wiring in `functions/index.js`

Find the `view_submission` handler block. Confirm it calls handlers in this order:
1. `tryHandleFinanceViewSubmission` (payout_modal_submit)
2. `tryHandleFieldViewSubmission` (onmyway, done, sms, confirm callbacks)
3. Falls through to `handleSlackPayload` if neither matches

If the chain is missing or in the wrong order, fix it.

### 2. Audit each modal's callback_id registration

In each slash command handler, confirm the modal opened via `slackViewsOpen` has the correct `callback_id` that matches what `tryHandleFinanceViewSubmission` / `tryHandleFieldViewSubmission` check for:

| Command | Expected callback_id |
|---|---|
| `/payout` | `payout_modal_submit` |
| `/onmyway` | `onmyway_modal_submit` |
| `/done` | `done_modal_submit` |
| `/sms` | `sms_modal_submit` |
| `/confirm` | `confirm_modal_submit` |

Fix any mismatches.

### 3. Audit error handling

Each `tryHandle*` function should:
- Return `true` if it handled the event (so the chain stops)
- Return `false` if the callback_id didn't match (so the chain continues)
- Catch errors internally and respond to Slack with a user-facing error message (not a 500)

Confirm `viewSubmissionErrorsBody` from `slackModalShared.js` is used consistently for error responses.

### 4. Lint and build

```bash
cd functions && npm run lint
npm run build   # if applicable
```

Fix any lint errors introduced by the modal refactor.

### 5. Deploy functions

```bash
npm run deploy:firebase
```

Confirm all functions deploy successfully with no errors.

## Success criteria

- `functions/index.js` view_submission chain calls finance handler then field handler in order
- All five callback_ids match between modal open and submission handler
- Error paths use `viewSubmissionErrorsBody` consistently
- `npm run lint` passes clean
- `npm run deploy:firebase` succeeds
- No existing function signatures or routes were modified

## Do NOT touch

- `src/` (frontend) — already deployed, do not modify
- `functions/taskDispatcher.js` — dispatcher logic, separate concern
- `functions/inventorySlackCommands.js` — qty accounting, do not touch
- Firestore data or security rules
- Any file not directly related to the five modal commands
