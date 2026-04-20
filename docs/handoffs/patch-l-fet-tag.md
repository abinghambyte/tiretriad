# Patch L - FET tag on tire catalog

You are a Cursor agent shipping ONE patch from a parallel rollout. Two other patches (K, M) are in flight concurrently. Do not touch any file outside the scope below. See `docs/handoffs/README.md` for the full ownership map if needed.

## Goal

Replace the current "show `$0.00` for tires that have no FET" rendering in the Tires catalog MarginTable with a proper tag: a tire either has FET (show the amount) or does not (show an em-dash "--" like other missing-data cells, not a zero). Add an `hasFet: boolean` field to the tire schema so the UI has an explicit signal instead of inferring it from `fet > 0`.

## Branch

`fet-tag` (cut from latest `main`).

## Context

- `src/components/tires/MarginTable.jsx` is the Tires catalog table. The FET column is rendered at line 683, 786, 1311 (there are three render paths for different table variants / mobile vs desktop). Each currently does `formatCurrencyOrDash(Number(row.fet) || 0)`, which coerces missing FET into `$0.00` instead of the em-dash the helper would produce for a true nullish value.
- Tire docs today carry a numeric `fet` field (may be 0, missing, or a dollar amount). Non-FET tires were seeded with `fet: 0`, which is indistinguishable from "FET genuinely zero".
- The ROADMAP / master doc has a pending item to make FET an explicit tag so reports can say "12 non-FET tires in stock" vs. "0-dollar FET" which today would double-count.
- FET is NOT part of the profit-pool cost math and stays that way (see Patch K; taxes are buy-side but FET is explicitly NOT added to costTotal). This patch is a display + schema change only.

## Scope (only touch these files)

- `src/components/tires/MarginTable.jsx` - update the three FET cell render paths and the tooltip copy
- NEW: `scripts/migrate-tire-fet-tag.mjs` - one-off backfill that sets `hasFet: (Number(fet) > 0)` on every tire doc that does not yet carry the field
- NEW: `scripts/migrate-tire-fet-tag.test.mjs` - pure-helper unit test for the classification rule
- `src/utils/opportunityScore.js` if and only if it reads `fet` directly (check first; if it does, teach it to short-circuit on `hasFet === false`). Touch only if a read site exists; do not add speculative changes.

Do not touch any Cloud Function file. Do not touch the Sale Messenger. Do not touch `ctsCalc.js` or `marginCalc.js`.

## Tasks

### 1. MarginTable rendering

At each of the three FET cell render sites (currently line 683, 786, 1311), replace:

```jsx
{formatCurrencyOrDash(Number(row.fet) || 0)}
```

with:

```jsx
{row.hasFet === false ? '--' : formatCurrencyOrDash(Number(row.fet) || 0)}
```

Rationale: `row.hasFet === false` is an explicit "no FET" signal. If the field is missing (legacy unmigrated docs) or true, fall through to the existing formatter - that preserves today's behavior until the backfill runs.

Add a title tooltip on the three FET column headers that reads: "FET per tire. Tires marked Not FET show -- (applied to tire categories that are FET-exempt)." Keep the existing "already included in buy price" aside where it already appears.

### 2. Backfill script - `scripts/migrate-tire-fet-tag.mjs`

Reference `scripts/backfill-revenue-stats.mjs` (shipped in Patch I last batch) for the CLI scaffolding pattern. Use the same conventions:

- Read `GOOGLE_APPLICATION_CREDENTIALS` env var. Exit non-zero with an explicit message if unset.
- Initialize `firebase-admin` with the credential.
- Query `tires` collection, no filter. Batched read in chunks of 500.
- For each doc, classify: `hasFet = Number(fet) > 0`. If the doc already carries `hasFet` (any type), skip.
- `--dry-run` flag that logs the classification counts without writing.
- `--yes` flag that skips the interactive confirmation prompt.
- Explicit confirmation prompt before writing unless `--yes`: "This will add hasFet to N tires (K true, J false). Continue? (y/N)".
- Progress line every 200 docs.
- End banner: "Updated X, skipped Y (already had hasFet)".

### 3. Pure-helper test - `scripts/migrate-tire-fet-tag.test.mjs`

Extract the classification into a pure function `classifyHasFet(doc) -> boolean | null` (returns `null` to mean "skip, already set"). Unit test:

- Doc with `fet: 5.25` and no `hasFet` -> `true`
- Doc with `fet: 0` and no `hasFet` -> `false`
- Doc with `fet` missing entirely and no `hasFet` -> `false`
- Doc with `fet: '4.50'` string and no `hasFet` -> `true` (Number-coerced)
- Doc with existing `hasFet: true` -> `null` (skip)
- Doc with existing `hasFet: false` -> `null` (skip)

Six cases, one assertion each.

### 4. opportunityScore.js touch-check

`grep -n fet src/utils/opportunityScore.js` - if `fet` is only referenced in a comment or stringified output, leave the file alone. If the scoring logic actually folds `fet` into a numeric calculation, add a leading `if (tire.hasFet === false) return <score without FET adjustment>` branch so non-FET tires are not penalized by a missing FET value. Do not rewrite the scoring logic.

## Out of scope

- Adding a "Not FET" filter chip to the catalog (follow-up).
- Editing FET values inline from the table (still Firestore-admin only).
- Retroactively recomputing `salesCount` / margin aggregates for historical orders - FET is not in those aggregates today.
- Changing how SaleMessenger or QuoteCalculator render FET (they stay as-is; if a non-FET tire has `fet: 0`, they already show 0 correctly since those UIs assume the tire sold carries a real FET if any).
- Adding the backfill script to `package.json` scripts.

## Validation (must all pass before PR)

```
./node_modules/.bin/vitest run
./node_modules/.bin/eslint src/components/tires/MarginTable.jsx scripts/migrate-tire-fet-tag.mjs scripts/migrate-tire-fet-tag.test.mjs
./node_modules/.bin/vite build
node --check scripts/migrate-tire-fet-tag.mjs
node scripts/migrate-tire-fet-tag.mjs --dry-run < /dev/null 2>&1 | head -10
```

The last line should fail gracefully with the credentials-missing message if `GOOGLE_APPLICATION_CREDENTIALS` is unset in the agent sandbox. That is an acceptable exit state - do not commit a service account JSON.

## PR

- Title: `Tires: FET tag on catalog + backfill script`
- Body: short summary + Test plan + "Run in production with:" block for the migration script (same format as Patch I's PR body). Explicit note that the migration is idempotent and safe to re-run. No Claude trailers, no em dashes in published text.

Execute this brief exactly. Branch from main, run all validation commands before opening the PR, and stop after the PR is open.
