# Patch J - Backdate Log Sale timestamp

You are a Cursor agent shipping ONE patch from a parallel rollout. Two other patches (H, I) are in flight concurrently. Do not touch any file outside the scope below. See `docs/handoffs/README.md` for the full ownership map if needed.

## Goal

Let the Log Sale flow record sales that happened earlier in the week. Today `completeOrder` stamps `completedAt` as `serverTimestamp()` and computes `completedMs` as `Date.now()`, so a sale logged three days late shows up as today's revenue. Add an optional "Completed at" datetime on the Sale Messenger modal; when set, pass it through to the callable and use it as the completion timestamp.

## Branch

`backdate-log-sale` (cut from latest `main`).

## Context

- `src/components/tires/SaleMessenger.jsx` is the modal. It builds a payload and invokes `sendTireSaleSms` (line ~13) via `httpsCallable`. The callable handles order creation plus the completion hand-off; this patch only changes the completion portion.
- `functions/orders.js` line 304 defines `exports.completeOrder` which reads `request.data`, computes `completedMs = Date.now()` (line 345), sets `completedAt = FieldValue.serverTimestamp()` (line 385), then calls `runCompletionTransaction`. The new optional input rides through this same callable.
- `functions/financeStats.js` `bumpRevenueFields` buckets by `completedMs` into daily / weekly / monthly / YTD windows. It is already backdate-safe - if `completedMs` points at last week, the weekly bucket rolls back correctly.
- Master `docs/ROADMAP.md` / `/ROADMAP.md` have the feature spec; the 30-day minimum floor below matches what that doc proposed.

## Scope (only touch these files)

- `src/components/tires/SaleMessenger.jsx` - add the datetime input + serialize on submit
- `functions/orders.js` - accept + validate + apply the backdated timestamp inside `exports.completeOrder`
- NEW: `functions/orders.backdate.test.mjs` - validation edge cases for the callable

Do not touch `runCompletionTransaction` or `bumpRevenueFields`; they already do the right thing once `completedMs` is the backdated number.

## Tasks

1. **Frontend - SaleMessenger.jsx**:
   - Add an optional `<input type="datetime-local">` labelled "Completed at (optional)" below the existing Pickup / delivery notes fields. Placeholder hint text: "Defaults to now. Max: 30 days back."
   - Client-side constraint: `min` attribute is 30 days before now, `max` is now. Both as `YYYY-MM-DDTHH:mm` strings (local time; the input type is local by design).
   - On submit, if the field has a value, include `completedAtMs` in the callable payload as a number (Date.parse). If blank, omit the field entirely - do not send null.
   - Small caption under the input when a value is set: render a subtle line "Recording as <relative time> ago" using the project's existing relative-time helper if one exists; otherwise format manually as a simple `Xd Yh` string. Non-blocking if no helper - just skip the caption rather than introducing a dependency.

2. **Backend - functions/orders.js** (inside `exports.completeOrder`):
   - Parse `completedAtMs` from `request.data`. If absent, behavior unchanged: `completedMs = Date.now()` and `completedAt = FieldValue.serverTimestamp()`.
   - If present: require `Number.isFinite(completedAtMs)`, `completedAtMs <= Date.now() + 60_000` (one minute skew tolerance), and `completedAtMs >= Date.now() - 30 * 86_400_000`. Reject with `invalid-argument` HttpsError on any violation, with a specific message naming the rule that failed.
   - When valid, set `completedMs = completedAtMs` and `completedAt = Timestamp.fromMillis(completedAtMs)`. Also set `completedAtSource = 'backdated'` on the completion patch. For same-now timestamps the field is omitted entirely so analytics can distinguish real-time vs backdated.
   - All downstream fulfillment-minute calculations already reference `completedMs`, so they adjust automatically.

3. **Tests - functions/orders.backdate.test.mjs**:
   - Unit-test the extracted `resolveCompletionTimestamp(input, nowMs)` helper (refactor the parse-and-validate block into a pure function so it is testable without the full callable harness). Tests: no input -> now, valid past -> backdated, future -> throw, too-old past -> throw, garbage string -> throw, NaN -> throw, right-at-30-days boundary -> accepted. Seven cases, all assertions on the return value or the thrown error code.
   - Import `resolveCompletionTimestamp` from `./orders.js` (export it with a JSDoc `@internal` note so it is clear this is for test-time use only).

## Out of scope

- Retrofitting already-completed orders (that is Patch I's job).
- Backdating before 30 days (compliance simplicity - surface a feature flag later if ops needs longer lookback).
- Adjusting Slack notification copy to say "Logged as sold on <date>" when backdated (nice-to-have, not required).
- UI affordance on the order card to distinguish `completedAtSource == 'backdated'` orders visually.

## Validation (must all pass before PR)

```
./node_modules/.bin/vitest run
./node_modules/.bin/eslint src/components/tires/SaleMessenger.jsx functions/orders.js functions/orders.backdate.test.mjs
./node_modules/.bin/vite build
```

## PR

- Title: `Log Sale: optional backdated completion timestamp`
- Body: short summary + Test plan. Include an "Edge cases" note listing the seven validation tests. Mention explicitly that retroactive order rebuild (Patch I) handles the historical data separately. No Claude trailers, no em dashes in published text.

Execute this brief exactly. Branch from main, run all validation commands before opening the PR, and stop after the PR is open.
