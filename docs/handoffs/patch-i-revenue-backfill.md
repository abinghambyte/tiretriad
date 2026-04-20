# Patch I - Revenue stats backfill script

You are a Cursor agent shipping ONE patch from a parallel rollout. Two other patches (H, J) are in flight concurrently. Do not touch any file outside the scope below. See `docs/handoffs/README.md` for the full ownership map if needed.

## Goal

One-off Node script that reads every `status == 'completed'` order and rebuilds `meta/revenueStats` from scratch. The live rollup only runs forward from the commit that wired it (`a8dbec2`, April 13); historical completions predating that commit are not reflected in MTD / WTD / all-time tiles on Analytics.

This is a script, not a function. Ops runs it on demand from their machine. It never auto-runs.

## Branch

`revenue-stats-backfill` (cut from latest `main`).

## Context

- `functions/financeStats.js` exports `bumpRevenueFields(prev, paymentAmount, costTotal, marginTotal, completedMs)` which handles window-reset logic + additive aggregation. Reuse it; do not re-implement.
- `meta/revenueStats` shape comes from `defaultRevenueDoc()` in the same file. Daily / weekly / monthly windows + all-time / YTD totals, plus `dailyWindow / weeklyWindow / monthlyWindow / ytdYear` keys.
- `src/utils/isoWeekDenver.js` has `denverYmd`, `isoWeekKey`, `denverYm`, `denverYear` helpers that `bumpRevenueFields` calls. Do not duplicate those.
- Reference scripts: `scripts/seed-tires.mjs`, `scripts/migrate-tire-price-field.mjs`, `scripts/reset-failed-price-research.mjs`. All use `firebase-admin` with a service-account JSON path from env and talk to prod Firestore.

## Scope

- NEW: `scripts/backfill-revenue-stats.mjs` - the script
- NEW: `scripts/README.md` touched only if a brief mention fits the existing conventions; optional, skip if not a natural fit

Do not edit any source file. Do not import from `src/`. Do not add new npm deps - `firebase-admin` is already in the repo.

## Tasks

1. **Script**:
   - Read the service-account JSON path from `GOOGLE_APPLICATION_CREDENTIALS` env var. If unset, print the exact env var name + how to generate a key in Firebase Console (Settings -> Service accounts -> Generate new private key) and exit non-zero.
   - Initialize `firebase-admin` with the credential. Region-free, project auto-detected from the JSON.
   - Query `orders` collection where `status == 'completed'`, ordered by `completedAt` ascending. No limit.
   - For each doc: extract `paymentAmount`, derive `completedMs` from `completedAt.toMillis()` (fallback to 0 if missing, skip with a warn log if zero), skip docs with `paymentAmount <= 0`.
   - Cost + margin totals: compute via `poolDollarsForOrder` if that is importable cleanly; otherwise keep cost / margin at 0 (the script is for revenue reconciliation, aggregate margin is a follow-up).
   - Import `bumpRevenueFields` from `../functions/financeStats.js`. Node ESM / CJS interop: use `createRequire(import.meta.url)` or dynamic `await import()`, whichever Node accepts. Reference `scripts/seed-tires.mjs` for the pattern the repo already uses.
   - Start from `defaultRevenueDoc()` (import if exported, otherwise inline the shape from the current `financeStats.js`). Iterate orders chronologically, fold through `bumpRevenueFields` to get the final doc.
   - Write the final doc to `meta/revenueStats` via a plain `.set()` (not a transaction - this is a one-shot).

2. **Logging**:
   - Start banner: project ID, orders count, date range found.
   - Progress: one line per 50 orders or at least one line for the whole run.
   - End banner: final doc snapshot (all numeric fields) + the timestamp of the most-recent order folded.

3. **Safety**:
   - `--dry-run` flag (default off) that logs what the final doc would be without writing.
   - Explicit console prompt "This will overwrite meta/revenueStats. Continue? (y/N)" before the write unless `--yes` is passed. Use `readline` for the prompt.
   - No `--force` that skips confirmation and dry-run both. Keep ops honest.

4. **Idempotency check**:
   - After the write, log "Rerun with --dry-run to verify idempotency" as a suggestion. The script itself does not need to verify.

## Out of scope

- Touching `meta/crewEarnings` or any other rollup doc.
- Adding a scheduled cron around this.
- Adding it to `package.json` scripts (stays a bare `node scripts/...` invocation so it is harder to run by accident).
- Updating the UI hints on `/analytics` that mention "Shown while the cached total is empty" - those will resolve naturally once the doc is populated.

## Validation

```
./node_modules/.bin/eslint scripts/backfill-revenue-stats.mjs
node --check scripts/backfill-revenue-stats.mjs
node scripts/backfill-revenue-stats.mjs --dry-run < /dev/null 2>&1 | head -20
```

(The last line should fail gracefully with the service-account-missing error message if `GOOGLE_APPLICATION_CREDENTIALS` is unset in the agent sandbox. That is an acceptable exit state for validation; do not commit a service account JSON.)

No vitest suite change expected. If you add a unit test for a pure-function helper extracted from the script, put it next to the script as `*.test.mjs` and document it in the PR body.

## PR

- Title: `Scripts: one-off backfill for meta/revenueStats`
- Body: short summary, the exact run command including the env-var requirement, and a "Run in production with:" block that Alex can copy-paste. Explicit note that this does NOT auto-run. No Claude trailers, no em dashes in published text.

Execute this brief exactly. Branch from main, run all validation commands before opening the PR, and stop after the PR is open.
