# Wipe-script safety + customer recovery — design spec (STORMED 2026-04-27)

**Status:** Stormed. Original draft questioned PITR + soft-delete + testFixture in isolation. Storm session resolved: **named Firestore DB primary, testFixture contract secondary, fail-closed wipe-script signatures.** Implementation captured as `docs/handoffs/patch-622-firestore-isolation-and-fixtures.md`.

## Already shipped before this storm

- ✅ Soft-delete primitive: `archivedAt` / `archivedReason` fields + `isArchived()` helper (PR #171)
- ✅ Archive script with safety: dry-run by default, exclude list, restore mode (PR #161, fixed in PR #172)
- ✅ Recovery toolkit on main: import-snapshot / diff / cherry-pick scripts (PR #162)
- ✅ Daily Firestore exports confirmed working — 30 days of clean backups in `gs://skedaddle-inventory-firestore-backups/firestore/`
- ✅ Bucket protection: Soft Delete (7d) + Object Versioning + Default event-based hold
- ✅ Wipe investigation closed — no real customer data was lost; the 6 destroyed orders were confirmed test fixtures (PR #163)

## What the storm closed

The original four open decisions:

| Decision | Stormed answer |
|---|---|
| 1. PITR status check | Moot — daily exports give us 30 days of recovery. PITR can be added later as defense-in-depth. |
| 2. Soft-delete adoption scope | Already adopted on `users` / `crmAccounts` / `crmLeads` / `contacts` (PR #171). Apply to any future production-relevant collection. |
| 3. testFixture flag retrofitting | Don't retrofit. Enforce contract on new test data going forward. |
| 4. Export-before-wipe | Already covered by the daily Cloud Run Job. Wipes targeting the `tests` DB don't threaten production exports anyway. |

## Storm decision: structural isolation, not just discipline

**Primary: named Firestore database `tests` in the same project.** Production code only writes to the default DB. Test seeding, integration smoke runs, and load testing target `tests`. Wipe scripts targeting `tests` are safe by construction because they cannot reach production data even if invoked with the wrong flag. Named DBs are free when idle; isolation is at the credential boundary, so production service accounts shouldn't have write access to `tests` and the test runner shouldn't have write access to default.

**Secondary: `testFixture` contract.** Every doc written from a test context (in either DB) carries `testFixture: true` and `testFixtureExpiresAt: <timestamp>`. ESLint rule flags violations at PR time. Daily Cloud Function sweeps expired fixtures from `tests`.

**Tertiary: fail-closed wipe signatures.** No wipe script defaults to a database. `--db=tests` or `--db=production --i-understand-this-is-production` (two flags). Production path prints doc count and a 10-second countdown before proceeding.

## Five-step rollout sequence (preserved in patch-622)

1. **Audit** `scripts/` and `functions/scripts/` to determine whether Firestore client instantiation flows through a single helper or each script calls `getFirestore()` independently.
2. **Standardize** on a shared `lib/firestore-client.mjs` helper across every script, then flip default to `tests`.
3. **Create the `tests` named DB** via gcloud.
4. **Migrate seed/wipe scripts** to require `--db`, add the ESLint rule, add the cleanup Cloud Function, update PR template, update AI-CONTEXT.md.
5. **Deploy** the cleanup function with `npm run deploy:firebase` before merging the frontend PR-template change so the sweep is live the moment the new model is in place.

## Decision log

- **(b) named DB primary, (a) testFixture secondary** — chosen because (b) gets isolation at the credential boundary which (a) alone cannot. (a) layered on top means even a misconfigured client that writes to production gets a contract-flagged doc that the sweep job would catch.
- **(c) suffix collections rejected** — doubles collection count; harder to grep; doesn't isolate at any layer the test runner can see.
- **(d) pure-mock rejected** — loses real-Firestore confidence in the integration smoke runs we already do (recovery toolkit relies on it).
- **`testFixtureExpiresAt` instead of fixed-window cleanup** — letting the test author choose the expiry means short-lived load tests can be cleaned up next morning while a long-lived dev fixture can survive a sprint.
- **PR template checkbox** — explicit reviewer enforcement adds a second pair of eyes beyond the linter.

## Out of scope for this storm

- GDPR / customer-data retention policy (different concern; addresses customer rights, not us preserving the data)
- Test isolation between Firebase projects (separate `skedaddle-inventory-test` project) — overkill; named DB suffices
- Hard-delete cron threshold for `archivedAt`-stamped docs in production — the soft-delete pattern stays as-is; cron can come later if storage cost matters

## Next step

Dispatch `docs/handoffs/patch-622-firestore-isolation-and-fixtures.md`. Sequence enforced by the brief itself.
