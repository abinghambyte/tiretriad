# Cursor handoff — restore truncated files + wire credit/SMS modal handlers

> PRIORITY: CRITICAL
> Date: 2026-04-15
> Branch: cursor/payout-modal-65051

## What happened
The working tree has widespread file truncation — every function file is missing its last 50–450 lines. The git objects are intact (commit 77f0cdc is clean). You need to restore first, then finish the wiring.

## Step 1 — Restore the working tree (do this FIRST)

```bash
git checkout cursor/payout-modal-65051 -- .
```

Verify with `git diff --stat` — output must be empty (no diffs). If files are still truncated, close all other editors/tools touching this repo and try again.

## Step 2 — The credit/SMS modal error-handling work (may need to be redone)

These changes were described as complete but may not have been committed before the truncation. Check `git log --oneline -1` — if the latest commit is `77f0cdc`, the credit/SMS work was lost and needs to be redone:

### `functions/creditTrackerSlack.js`
- Import `viewSubmissionErrorsBody` from `./slackModalShared` (line 15 — already present in committed version, verify).
- Add a helper:
```js
function creditViewErrorBlockId(callbackId) {
  const cb = String(callbackId || '')
  if (cb.includes('payment')) return 'payment_modal_amount'
  if (cb.includes('charge')) return 'charge_modal_qty'
  if (cb.includes('credit_edit')) return 'credit_edit_qty'
  return ''
}
```
- Find `tryHandleCreditViewSubmission` (or the equivalent view_submission handler in the file). Wrap its entire body in try/catch. In the catch:
```js
} catch (e) {
  console.error('creditViewSubmission', cb, e)
  return { handled: true, kind: 'json', body: viewSubmissionErrorsBody(creditViewErrorBlockId(cb), e, view) }
}
```

### `functions/smsReplySlack.js`
- Import `viewSubmissionErrorsBody` from `./slackModalShared` (line 7 — already present in committed version, verify).
- Find the main submission path in `tryHandleSmsReplyViewSubmission`. Wrap it in try/catch. In the catch:
```js
} catch (e) {
  console.error('smsReplyViewSubmission', e)
  return { handled: true, kind: 'json', body: viewSubmissionErrorsBody('sms_body_block', e, view) }
}
```

## Step 3 — Verify the view_submission wiring in index.js

After restore, `functions/index.js` should already have this block (from commit 77f0cdc) inside the `slackActions` handler's `view_submission` section:

```js
if (payload.type === 'view_submission') {
  const lu = await tryHandleLookupUtilityViewSubmission(db, token, envChannel, payload)
  if (lu.handled) {
    if (lu.kind === 'json') {
      res.setHeader('Content-Type', 'application/json')
      res.status(200).send(JSON.stringify(lu.body))
      return
    }
    res.status(200).send('')
    return
  }
  const fi = await tryHandleFinanceViewSubmission(db, token, envChannel, payload)
  if (fi.handled) {
    if (fi.kind === 'json') {
      res.setHeader('Content-Type', 'application/json')
      res.status(200).send(JSON.stringify(fi.body))
      return
    }
    res.status(200).send('')
    return
  }
  const fld = await tryHandleFieldViewSubmission(db, token, envChannel, payload)
  if (fld.handled) {
    if (fld.kind === 'json') {
      res.setHeader('Content-Type', 'application/json')
      res.status(200).send(JSON.stringify(fld.body))
      return
    }
    res.status(200).send('')
    return
  }
}
```

Verify this is present. The imports at the top should include:
```js
const { tryHandleFieldViewSubmission } = require('./fieldSlackCommands')
const { tryHandleFinanceViewSubmission } = require('./financeSlackCommands')
```

## Step 4 — Commit and verify

```bash
npm run lint && npm run build
```

If the credit/SMS changes required redo, commit them:
```bash
git add functions/creditTrackerSlack.js functions/smsReplySlack.js
git commit -m "credit + SMS modal: wrap view_submission handlers in try/catch with viewSubmissionErrorsBody"
```

## Step 5 — Merge to main and deploy

```bash
git checkout main
git merge cursor/payout-modal-65051
npm run lint && npm run build
npm run deploy:firebase
git push
```

Deploy functions BEFORE push — the branch has both function changes and frontend changes.

## Do NOT touch
- Order workflow logic (orderWorkflow.js) — read-only unless the restore reveals a break
- Slack secrets (slackSecrets.js)
- Firestore rules or security config
- Any route, auth guard, or dashboard card other than what's already committed on this branch
- The _handoffs/ directory (gitignored, not part of the repo)
