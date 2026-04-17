# Cursor handoff — Slack alert on price research job failure

>Worker: Field Executor (Cursor)
>Author: Portal Architect (Sonnet 4.6)
>Date: 2026-04-17

## Problem

The nightly `tirePriceResearch` scheduled function runs at 2am Denver time and calls Gemini across ~1,160 tires. If it fails — Gemini down, quota exceeded, unhandled exception — nobody knows. The morning brief shows stale data and the crew has no idea why buy prices stopped updating.

## Fix

In `functions/tirePriceResearch.js`, wrap the top-level scheduled job handler in a try/catch and post a Slack alert on failure.

---

## Change — `functions/tirePriceResearch.js`

Find the scheduled function export (the function triggered by Firebase Scheduler, not the callable). It likely looks like:

```javascript
exports.tirePriceResearch = onSchedule({ schedule: '...', timeZone: 'America/Denver' }, async () => {
  // ... research logic
})
```

Wrap the body in try/catch and post to Slack on error:

```javascript
exports.tirePriceResearch = onSchedule({ schedule: '...', timeZone: 'America/Denver' }, async () => {
  const db = admin.firestore()
  const botToken = SLACK_BOT_TOKEN.value()
  const channel = SLACK_CHANNEL_ID.value()
  try {
    await runBulkPriceRefresh(db, GEMINI_API_KEY.value(), { token: botToken, channel })
  } catch (e) {
    console.error('tirePriceResearch scheduled run failed', e)
    const msg = e instanceof Error ? e.message : String(e)
    if (botToken && channel) {
      await slackApiPost(botToken, 'chat.postMessage', {
        channel,
        text: `⚠️ Nightly price research failed: ${escapeSlackMrkdwn(msg.slice(0, 300))}\nBuy prices may be stale. Check Firebase logs for details.`,
      }).catch(() => {})
    }
  }
})
```

If the scheduled function already calls `runBulkPriceRefresh`, just wrap that call. If it has its own inline logic, wrap the entire body.

---

## Do NOT touch

- `runBulkPriceRefresh` implementation
- `processTireResearchDoc`
- The callable `tirePriceResearchRun` (if separate) — only touch the scheduled export
- Any other files
- eBay files — on hold

---

## After changes

```bash
cd functions && npm run lint
npm run deploy
```

Confirm deploy succeeds. No way to test the failure path easily — just verify lint passes and the function deploys clean.

---

## Field Executor — completion notes (2026-04-15)

### Shipped

- **`functions/index.js`** — The scheduled export **`tirePriceResearch`** already lives here (not in `tirePriceResearch.js`). Wrapped **`tirePriceResearchRun`** in **try/catch**, `console.error` on failure, and **`chat.postMessage`** via the **existing local `slackApiPost`** when `token` + `channel` are set. Message text uses **`escapeSlackMrkdwn`** imported from **`./tirePriceResearch`** (first 300 chars of error). Nested try/catch so Slack alert failures are logged but do not mask the original error.

### Deploy / ops

- **`npm run deploy:firebase`** (or functions-only deploy) after merge — **`index.js`** changed.

### Verify

- `npm run lint` passed from repo root.
