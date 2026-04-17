# Cursor handoff — Reroute bulk refresh to `/refreshprice all`

>Worker: Field Executor (Cursor)
>Author: Portal Architect (Sonnet 4.6)
>Date: 2026-04-16

## Problem

Slack enforces a hard 25-command limit per app. The Rubber Signal app is already at the limit. `/refreshpriceall` was built as a separate slash command but cannot be registered in Slack.

## Fix

Remove `/refreshpriceall` as a standalone command. Instead, detect the keyword `all` inside the existing `/refreshprice` handler and route it to `runBulkPriceRefresh`.

No Slack app changes needed. No new command slot used.

---

## Changes — `functions/priceIntelSlack.js`

### 1. Remove `/refreshpriceall` from the command allowlist

Find the block that checks if a command is handled by `tryHandlePriceIntelSlash`. Remove `'/refreshpriceall'` from the list of allowed commands.

### 2. Update the `/refreshprice` handler

Find the block that handles `command === '/refreshprice'`. Currently it reads the MSPN from `form.text` and opens a modal or runs a single refresh.

Add a check at the top of that block — **before** the modal open:

```javascript
if (command === '/refreshprice') {
  const text = String(form.text || '').trim().toLowerCase()

  // Bulk refresh: /refreshprice all
  if (text === 'all') {
    const authCheck = await resolveSlackUserAdminOrSupplier(db, form.user_id)
    if (!authCheck.allowed) {
      return { handled: true, text: '🔒 Admin or supplier access required.' }
    }
    const geminiKey = GEMINI_API_KEY.value()
    if (!geminiKey || geminiKey === '-') {
      return { handled: true, text: '❌ GEMINI_API_KEY not configured.' }
    }
    const slack = { token, channel: fleetChannel }
    // Acknowledge immediately
    await slackApiPost(token, 'chat.postMessage', {
      channel: fleetChannel,
      text: '🔄 Bulk price refresh started across all ~1,160 tires. Results will post when complete.',
    })
    // Run async — do not await
    runBulkPriceRefresh(db, geminiKey, slack).catch((e) =>
      console.error('runBulkPriceRefresh error', e)
    )
    return { handled: true, text: '' }
  }

  // Single tire: /refreshprice [mspn] — existing modal flow continues below
  ...
}
```

### 3. Update Slack usage hint

In the modal or the ephemeral text that `/refreshprice` posts, update the hint to mention the `all` keyword:

> Tip: use `/refreshprice all` to refresh the entire catalog.

---

## Do NOT touch

- `runBulkPriceRefresh` implementation — leave as-is
- `processTireResearchDoc` — leave as-is
- Any other command handlers
- Slack app manifest — no changes needed, no new command to register
- eBay files — on hold

## After changes

```bash
cd functions && npm run lint
npm run deploy:firebase
```

Confirm deploy succeeds. Test in Slack:
- `/refreshprice 09100` → opens modal as normal
- `/refreshprice all` → posts bulk start message and begins refresh
