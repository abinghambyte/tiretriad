# Wipe-script safety + customer recovery — design spec (DRAFT — needs admin brainstorm)

**Status:** Draft. Surfaced from 2026-04-25 evening production observations. Needs admin input before any code is written.

## What happened

Earlier today the admin ran `scripts/wipe-test-orders.mjs` to clear test orders in preparation for real sales tracking. The script worked as designed: it deleted every doc in the `orders` collection. But the `orders` collection contained both test data AND real customer relationships from prior sales. The wipe removed all of it.

Symptom on the live app: `/people?tab=customers` shows "No contacts yet" with the explanation "Customer contacts fill in automatically after their first completed order." Real customers from before today are gone from this view.

## Why this happened

The wipe script's contract was "delete everything in `orders`." It had no way to distinguish test orders from real orders because the data model didn't tag them. Two design assumptions failed:

1. **Test data and production data shared a collection** with no marker
2. **The cleanup script was destructive (hard delete) rather than soft (mark archived)**

## Recovery options for the existing customer history

### Option A — Firestore Point-in-Time Recovery (PITR)

Firebase Firestore supports PITR for up to 7 days when enabled at the project level. Status as of 2026-04-25: **unknown — admin needs to verify in Firebase Console → Firestore Database → Backups.**

If PITR is enabled:
- Restore a snapshot from before the wipe (e.g., 2026-04-25 06:00 UTC)
- Restore TO a different project or different database
- Diff restored docs against current production
- Cherry-pick real customer/order docs back

If PITR is NOT enabled:
- Customer history is gone
- Enable PITR going forward so this never happens again

**Action item:** admin checks PITR status. If on, schedule a restore.

### Option B — Client-side analytics or Slack message archives

If real sales were posted to Slack via the existing notify-team flow, the Slack message history may have enough information to reconstruct customer names + tire details for past sales. Not a full recovery, but partial.

### Option C — Accept the loss and move on

The admin has been the primary user; if customer data was light, the loss may be tolerable. Going forward, every real sale auto-populates the contact list again.

## Future-proofing — design proposal

### Soft-delete pattern

Every collection that holds production-relevant data uses a `archivedAt: Timestamp | null` field instead of being hard-deleted. Wipes filter to `archivedAt != null` instead of removing docs. Reads filter `archivedAt == null` to hide archived rows.

```js
// Instead of: db.collection('orders').doc(id).delete()
// Do:        db.collection('orders').doc(id).update({ archivedAt: serverTimestamp() })
```

Trade-off: Firestore costs scale with stored docs. If we accumulate 100K archived orders this becomes a real bill. Mitigation: a cron job that hard-deletes docs with `archivedAt < 90 days ago`.

### Test-fixture flag

Every doc created during testing gets a `testFixture: true` field. Wipe scripts filter on `testFixture == true` and never touch real data. Production code never writes this field, so the production path is unaffected.

```js
// Test setup
await db.collection('orders').doc(testId).set({
  ...realOrderShape,
  testFixture: true,
})

// Wipe script
const snap = await db.collection('orders').where('testFixture', '==', true).get()
await Promise.all(snap.docs.map(d => d.ref.delete()))
```

### Cleanup-script PR template guard

Add a section to `.github/pull_request_template.md` that requires PR authors of any `scripts/wipe-*.mjs` to:
- Confirm the script is dry-run-able with `--dry-run`
- Confirm the script's filter scope (testFixture, archivedAt, dateRange, MSPN whitelist, etc.)
- Confirm what data is at risk if the filter is wrong

### Backup snapshots before any cleanup script runs

Before any cleanup script touches Firestore, it first runs a Firestore export to a Cloud Storage bucket. If something goes wrong, the snapshot is the recovery path.

```js
// Pseudo-code for the wrapper
const snapshotPath = `gs://skedaddle-backups/wipe-${Date.now()}/`
await admin.firestore().exportData({ collectionIds: ['orders'], outputUriPrefix: snapshotPath })
// THEN run the actual wipe
```

## Decisions needed before any code

1. **PITR status check** — admin confirms if PITR is enabled. If not, enable it now and accept this loss.
2. **Should we adopt soft-delete across all production collections** or just orders/contacts/users?
3. **Is the testFixture flag worth retrofitting** existing test data with, or only enforce on new test data going forward?
4. **Should every cleanup script trigger a Firestore export first** as a hard rule, or just for "dangerous" ones (deletions across >100 docs)?

## Out of scope for this spec

- Restoring the lost customer data (separate restoration effort if PITR is on)
- Full Firestore backup strategy (different concern; addresses disasters, not script accidents)
- GDPR / customer-data retention policy (different concern; addresses customer rights, not us preserving the data)

## Next step

Admin brainstorm: confirm PITR status, decide on soft-delete adoption, decide on the testFixture flag policy. Then write the implementation plan.
