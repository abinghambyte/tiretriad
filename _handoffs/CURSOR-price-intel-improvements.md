# Cursor handoff — Slack Modal Enter Key Standard + Price Intel Bulk Refresh

>Worker: Field Executor (Cursor)
>Author: Portal Architect (Sonnet 4.6)
>Date: 2026-04-16

## Goal

Three improvements:
1. Enter key submits ALL single-line Slack modals across the entire codebase (make this the standard)
2. New `/refreshpriceall` bulk Gemini price refresh command
2. New `/refreshpriceall` Slack command triggers a bulk Gemini price refresh across the full tire catalog

---

## THING 1 — Enter key submits ALL single-line Slack modals (global standard)

### Background

39 `plain_text_input` elements exist across 10 function files. None currently submit on Enter. In Slack Block Kit modals, Enter key submission requires `dispatch_action: true` on the **input block** (not the element). When set, Slack fires a `block_actions` event on Enter — but for single-field modals (one input + submit button), the simpler pattern is to just ensure `multiline: false` is explicit on every non-multiline input. Slack will then submit the modal on Enter in those inputs.

### Files to update

Touch every `plain_text_input` element in these files and add `multiline: false` explicitly if not already set. Skip any that already have `multiline: true` — those are legitimate multi-line fields (notes, messages, SMS body):

| File | Legitimate multiline: true to KEEP |
|---|---|
| `functions/creditTrackerSlack.js` | none |
| `functions/crmSlackCommands.js` | line ~128 (note field) — KEEP |
| `functions/fieldSlackCommands.js` | line ~124 (SMS body) — KEEP |
| `functions/financeSlackCommands.js` | none |
| `functions/inventorySlackCommands.js` | none |
| `functions/lookupUtilitySlackCommands.js` | line ~271 (note field) — KEEP |
| `functions/orderWorkflow.js` | already has `multiline: false` on some — confirm all |
| `functions/priceIntelSlack.js` | none |
| `functions/scheduleSlackCommands.js` | none |
| `functions/smsReplySlack.js` | line ~59 (message body) — KEEP |

### Rule

For every `plain_text_input` that does NOT have `multiline: true`:
- Add `multiline: false` explicitly to the element object

That is the entire change per element. Do not add `dispatch_action` — the explicit `multiline: false` is sufficient for single-line Enter submission in Slack modals.

### Verification

After the change, grep to confirm no `plain_text_input` is missing `multiline`:
```bash
grep -A5 "plain_text_input" functions/*.js | grep -v "multiline"
```
There should be no hits except the legitimate multiline: true fields.

---

## THING 2 — `/refreshpriceall` Slack command

### What it does

Triggers a full catalog price refresh — runs Gemini against every tire in the `tires` collection that either:
- Has never been researched (`priceIntel.lastResearched` is null/missing), OR
- Was last researched more than 30 days ago

Posts a Slack summary when done: total attempted, updated, flagged, skipped.

### Rate limiting

The catalog has ~1,160 tires. Gemini has rate limits. Process in batches of 20 with a 1-second delay between batches. This keeps it well under quota.

### Where to add it

**`functions/priceIntelSlack.js`** — add to `tryHandlePriceIntelSlash`:

```javascript
if (command === '/refreshpriceall') {
  // Only admin/supplier allowed (already checked above via resolveSlackUserAdminOrSupplier)
  // Acknowledge immediately, run async
  // Post "starting bulk refresh..." to channel
  // Call runBulkPriceRefresh(db, geminiKey, slack)
  return { handled: true, text: 'Bulk price refresh started. Results will post when complete.' }
}
```

**Add `runBulkPriceRefresh` function** in `priceIntelSlack.js` or extract to `tirePriceResearch.js` (preferred — it already has `processTireResearchDoc` and the batch logic scaffolded):

```javascript
async function runBulkPriceRefresh(db, geminiKey, slack) {
  // 1. Query tires where priceIntel.lastResearched == null OR < 30 days ago
  // 2. Process in batches of 20, 1s delay between batches
  // 3. For each doc call processTireResearchDoc(db, geminiKey, slack, docSnap, { silent: true })
  // 4. Track counts: attempted, updated, flagged_delta, not_found, skipped
  // 5. Post final summary to Slack channel
}
```

Note: `tirePriceResearch.js` already has most of the query logic built — look at the existing `refreshSingleTirePrice` and the preflight query scaffolding around line 223+. Use that as the base and extend it into a full batch runner.

### Register the slash command

In `functions/index.js`, the Slack slash command router calls `tryHandlePriceIntelSlash`. Confirm `/refreshpriceall` is passed through — it should work automatically if the function checks `command === '/refreshpriceall'`.

Also register `/refreshpriceall` in the Rubber Signal Slack app manifest (Slash Commands section) if not already present. The URL is the same `slackActions` Cloud Function endpoint.

---

## Constraints

- Do NOT change the Gemini model list in `tirePriceResearch.js` — it tries gemini-1.5-pro → gemini-2.5-flash → gemini-2.0-flash in order
- Do NOT modify `processTireResearchDoc` signature
- Do NOT touch any non-price-intel files
- Profit formula: profit = paymentAmount - cost. FET washes out. Do not change any financial logic.

## After changes

```bash
cd functions && npm run lint
```

Fix any lint errors, then:

```bash
npm run deploy:firebase
```

Confirm deploy succeeds. Test `/refreshprice 09100` still works, then test `/refreshpriceall` in Slack.
