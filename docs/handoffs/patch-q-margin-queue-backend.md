# Patch Q: Margin floor verification queue backend

Branch: `margin-queue-backend`

Scope (files touched):

- `functions/researchQueue.js` - NEW. Scheduled sweep + two callables.
- `functions/researchQueue.test.mjs` - NEW. Covers sweep idempotency, callable auth, outcome branching.
- `functions/index.js` - export the new callables + scheduled function.
- `scripts/backfill-margin-floor.mjs` - NEW. One-off: stamps `marginFloor` on every existing tire doc that lacks it, reading the default from `meta/payoutConfig` or a hard-coded 0.15.
- `src/hooks/useDashboardSignals.js` - remove `lowMargin` signal (and the Firestore snapshot that populated it); add `kylesQueueCount` (count of open `researchQueue` entries assigned to Kyle or any with `reason === 'below-margin-floor'`, regardless of assignee - v1 keeps this simple).
- `src/components/dashboard/Dashboard.jsx` - remove the "Below 15% margin" red row block (lines ~553-565, the block that starts with the `belowMarginFloor` check and ends at its closing `</li>` or equivalent). Keep the "Overhead not set" block as-is; that is a separate concern owned by Patch not-yet-planned. Leave a brief `// removed margin-floor row: auto-enqueued to research queue by scheduled sweep` comment where the block used to live.
- `firestore.rules` - add rule that denies client writes to `tires/*` for `researchQueue`, `marginConfirmed`, and `marginFloor` fields (server-only). Clients can read these; writes must come from the callables below.

## Firestore schema changes

Tire doc gains three optional fields:

```
marginFloor: number            // buy-side floor; e.g. 0.15 for a 15% target. Owner-configurable default.
researchQueue: {               // null | this shape
  at: Timestamp,
  by: string,                  // uid, or 'system' for scheduled sweeps
  reason: 'below-margin-floor' | 'unutilized-needs-research',
  resolvedAt: Timestamp | null,
  resolvedOutcome: 'retail-wrong' | 'confirm-archive' | 'punt' | null,
  resolvedBy: string | null
} | null
marginConfirmed: boolean       // true means terminal archived; tire stays out of unutilized surface and off the dashboard
```

No migration required beyond the one-off backfill; omitted fields read as null / undefined and the callables treat them as such.

## Tasks

1. **Scheduled sweep** (`enqueueBelowMarginFloor`): Gen2 `onSchedule`, 03:00 America/Chicago, idempotent. For every tire where `(retail - buy - overhead - fet) / retail < marginFloor` AND `researchQueue == null` AND `marginConfirmed !== true` AND retail is a positive number, write `researchQueue: { at: serverTimestamp(), by: 'system', reason: 'below-margin-floor', resolvedAt: null, resolvedOutcome: null, resolvedBy: null }`. Log a single summary line with `{ scanned, enqueued }`. If a tire already has `researchQueue != null`, skip it - do not overwrite.

2. **Callable `enqueueToResearch(tireId, reason)`**: auth-required, any non-viewer role. `reason` must be one of the two allowed values. Rejects if the tire already has an open queue entry (`researchQueue != null && resolvedAt == null`). Writes the queue entry with `by: request.auth.uid`.

3. **Callable `resolveQueueItem(tireId, outcome)`**: auth-required, `admin` or `sourcer` role (Kyle is a sourcer). `outcome` must be one of `'retail-wrong' | 'confirm-archive' | 'punt'`. Behavior per outcome:
   - `'retail-wrong'` - caller must also pass `newRetail` (number, > 0). Updates `tire.retail = newRetail`, clears `researchQueue` to null, logs the prior value. Does not touch `marginConfirmed`.
   - `'confirm-archive'` - sets `marginConfirmed: true`, fills in `researchQueue.resolvedAt/resolvedOutcome/resolvedBy`. Tire now disappears from dashboard and unutilized surface; visible only in Analytics archive ledger.
   - `'punt'` - updates `researchQueue.at` to `serverTimestamp()`, leaves `resolvedAt` null. Effectively a bump; the queue row re-sorts to newest.

4. **Tests** (`functions/researchQueue.test.mjs`): cover happy path for each outcome, sweep idempotency (running twice enqueues each tire exactly once), viewer role is rejected by both callables, sweep skips tires with `marginConfirmed: true`, sweep skips tires with existing open queue entries.

5. **Backfill script**: `scripts/backfill-margin-floor.mjs`. Reads `meta/payoutConfig.marginFloor` if present, else uses `0.15`. For every tire missing `marginFloor`, writes it. Dry-run flag + `--confirm` flag, same ergonomics as `scripts/backfill-revenue-stats.mjs`. Safe to re-run.

6. **Dashboard hook**: add `kylesQueueCount` to the return of `useDashboardSignals`. Source: a Firestore query `collection('tires').where('researchQueue.resolvedAt', '==', null)` filtered for `reason === 'below-margin-floor'` (if Firestore composite-index support is a blocker, keep the query broader and filter in JS - the volume is small). Remove the `lowMargin` return field entirely. Update the one `Dashboard.jsx` consumer accordingly; the value feeds Kyle's crew-widget pill, not a red row.

7. **Firestore rules**: deny client writes to `researchQueue`, `marginConfirmed`, `marginFloor` on `tires/*`. Keep read permissive (same as existing tire read rules).

## Out of scope

- `MyQueuePage` UI - that is Patch S (depends on this one).
- Analytics archive ledger UI - deferred; Patch S scaffolds the `/analytics?tab=margin-archive` tab but full ledger polish is later.
- Any crew-widget visual change - that is Patch R.
- Unutilized Inventory surface - that is Patch Qa.
- Historical retail-correction audit trail beyond the single logged prior value.

## Validation

```
cd functions && npm test -- researchQueue
cd functions && npm run lint
cd .. && npm run lint
npm run test -- useDashboardSignals
npm run build
node scripts/backfill-margin-floor.mjs --dry-run
```

All must succeed. The backfill dry-run should print a count of tires it would touch and exit 0.

## Deploy note (include in PR body)

`firebase deploy --only functions:enqueueBelowMarginFloor,functions:enqueueToResearch,functions:resolveQueueItem` plus `firebase deploy --only firestore:rules` after merge. Owner runs `node scripts/backfill-margin-floor.mjs --confirm` once afterwards.

## PR title

`Margin floor queue: nightly sweep + Kyle resolution callables`

Execute this brief exactly. Branch from main, run all validation commands before opening the PR, and stop after the PR is open.
