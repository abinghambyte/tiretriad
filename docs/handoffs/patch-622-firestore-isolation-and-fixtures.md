---
patch: 622
title: Firestore isolation — named `tests` DB + testFixture contract + fail-closed wipe signatures
status: ready-to-dispatch
priority: P1 — prevents the 2026-04-25 wipe situation from recurring
depends_on: []
spec: docs/superpowers/specs/2026-04-25-wipe-safety-and-customer-recovery-design.md
batch: data-safety
---

# patch-622 — Firestore database isolation + testFixture contract

## Goal

Make it structurally impossible for a future cleanup script to wipe real customer data, without sacrificing the ability to seed real-Firestore integration smoke runs.

Three layers, defense-in-depth:

1. **Primary** — production Firestore (`skedaddle-inventory` default DB) is reserved for production code paths. All test seeding, integration smoke runs, and load testing target a named Firestore database called `tests` in the same project.
2. **Secondary** — every doc written from a test context carries `testFixture: true` + `testFixtureExpiresAt: <timestamp>`. ESLint rule flags violations at PR time. Daily Cloud Function sweeps expired fixtures.
3. **Tertiary** — no wipe script defaults to a database. `--db=tests` or `--db=production --i-understand-this-is-production` (two flags). Production path prints doc count and a 10-second countdown before proceeding.

## Sequence (do not parallelize)

### Step 1 — Audit (report-only, no code changes)

Audit `scripts/` and `functions/scripts/` to determine whether all Firestore client instantiation flows through a single helper or whether each script calls `getFirestore()` (or `initializeApp()` with admin SDK) independently. Specifically check:

- `scripts/seed-tires.mjs`
- `scripts/import-tires-csv.mjs`
- `scripts/migrate-*.mjs` (all)
- `scripts/backfill-*.mjs` (all)
- `scripts/reset-*.mjs` (all)
- `scripts/archive-test-data.mjs`
- `scripts/inspect-collections.mjs`
- `scripts/recovery/*.mjs`
- Any cleanup scripts under `functions/scripts/`

**Output:** a paragraph-long summary in the PR description listing every file that calls `initializeApp()` / `getFirestore()` directly, plus a recommendation: standardize first or migration is one-file change.

If there's a single helper already, the migration is a one-file change. If each script instantiates its own client, **first standardize on a shared `lib/firestore-client.mjs` helper across every script, then flip the default**. Don't skip the standardization step — leaving even one script with its own `getFirestore()` call defeats the entire isolation guarantee.

### Step 2 — Standardize the client helper

Create `scripts/lib/firestore-client.mjs` (or `lib/firestore-client.mjs` if it makes more sense at the repo root):

```js
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const PROJECT_ID = 'skedaddle-inventory'
const DEFAULT_DB = 'tests'  // <- safe default
const PRODUCTION_DB = '(default)'

/**
 * Returns a Firestore client. Defaults to the `tests` named DB.
 * Pass `--prod` on the CLI or set SKEDADDLE_DB=production to target production.
 *
 * Logs a loud warning to stderr whenever production is selected.
 */
export function getDb({ argv = process.argv, env = process.env } = {}) {
  const prodFlag = argv.includes('--prod') || argv.includes('--db=production')
  const prodEnv = String(env.SKEDADDLE_DB || '').toLowerCase() === 'production'
  const wantProd = prodFlag || prodEnv

  const app = getApps()[0] || initializeApp({
    credential: applicationDefault(),
    projectId: PROJECT_ID,
  })

  if (wantProd) {
    console.error('⚠️  TARGETING PRODUCTION FIRESTORE — writes will hit live data ⚠️')
    return getFirestore(app, PRODUCTION_DB)
  }

  return getFirestore(app, DEFAULT_DB)
}
```

Migrate every script to import from this helper. Remove all direct `initializeApp()` / `getFirestore()` calls outside this helper. Run `npm run lint` after each script migration; commit per-script if it helps reviewability.

**Acceptance for step 2:** `grep -rn "initializeApp\|getFirestore" scripts/ functions/scripts/` returns only the helper file.

### Step 3 — Create the `tests` named Firestore DB

```bash
gcloud firestore databases create \
  --database=tests \
  --location=nam7 \
  --type=firestore-native \
  --project=skedaddle-inventory
```

(Match the location of `(default)` — verified earlier as `nam7`.)

Update Firebase IAM so:
- Production service accounts (Cloud Functions runtime, prod Vercel, etc.) have NO write permission to `tests`
- Test runner / dev service accounts have NO write permission to `(default)`

This is the credential-boundary isolation that makes the named DB primary. Document the exact role bindings in the PR description.

### Step 4 — Migrate scripts and add the contract

Per-step changes (one commit each is fine):

#### 4a — Wipe-script signatures

For every script under `scripts/wipe-*.mjs` (and `scripts/archive-test-data.mjs`):

```js
// At the top, after imports:
const args = new Set(process.argv.slice(2))
const dbFlag = process.argv.find((a) => a.startsWith('--db='))?.split('=')[1]
if (!dbFlag) {
  console.error('Refuse to run without explicit --db. Pass --db=tests OR --db=production --i-understand-this-is-production')
  process.exit(1)
}
const isProd = dbFlag === 'production'
if (isProd && !args.has('--i-understand-this-is-production')) {
  console.error('Production --db requires --i-understand-this-is-production as a separate flag')
  process.exit(1)
}
if (isProd) {
  // Print doc count of what's about to be wiped, then 10-second countdown
  const matchCount = await countMatches()
  console.error(`About to wipe ${matchCount} docs from PRODUCTION. 10s to abort with Ctrl+C…`)
  for (let i = 10; i > 0; i--) {
    process.stderr.write(`\r${i}s `)
    await new Promise((r) => setTimeout(r, 1000))
  }
  process.stderr.write('\n')
}
```

#### 4b — ESLint rule `require-test-fixture-stamp`

New file: `eslint-rules/require-test-fixture-stamp.js`. Custom rule that flags any `.set(`, `.add(`, or `.update(` call inside files matching `*.test.*`, `*.spec.*`, or under `tests/` and `scripts/seed-*` that doesn't include both `testFixture: true` and `testFixtureExpiresAt: <expression>` in the payload object literal.

Wire into `eslint.config.js`:

```js
import requireTestFixtureStamp from './eslint-rules/require-test-fixture-stamp.js'

// ...
{
  files: ['**/*.test.*', '**/*.spec.*', 'tests/**', 'scripts/seed-*.mjs'],
  plugins: {
    'skedaddle-test-safety': { rules: { 'require-fixture-stamp': requireTestFixtureStamp } },
  },
  rules: {
    'skedaddle-test-safety/require-fixture-stamp': 'error',
  },
},
```

Tests for the rule itself: `eslint-rules/require-test-fixture-stamp.test.js` covering accept (both fields present) and reject (missing one or both, including dynamic-key edge cases) cases.

#### 4c — Daily cleanup Cloud Function

New file: `functions/cleanupTestFixtures.js`. Exports `cleanupTestFixtures` scheduled at `0 9 * * *` (3am MT in UTC). Behavior:

```js
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { getFirestore } from 'firebase-admin/firestore'

export const cleanupTestFixtures = onSchedule(
  { schedule: '0 9 * * *', timeZone: 'America/Denver', region: 'us-central1' },
  async () => {
    const db = getFirestore('tests')
    const collections = await db.listCollections()
    let totalDeleted = 0
    for (const col of collections) {
      const snap = await col
        .where('testFixtureExpiresAt', '<', new Date())
        .limit(400)
        .get()
      if (snap.empty) continue
      const batch = db.batch()
      snap.docs.forEach((d) => batch.delete(d.ref))
      await batch.commit()
      totalDeleted += snap.size
    }
    console.log(`cleanupTestFixtures: deleted ${totalDeleted} expired fixtures`)
  },
)
```

Wire into `functions/index.js` exports. Deploy with `npm run deploy:firebase` BEFORE merging the rest of this PR so the sweep goes live the moment the new model is in place.

#### 4d — PR template

Edit `.github/pull_request_template.md`. Add to the checklist section:

```md
- [ ] If this PR adds or modifies a script that writes to Firestore: confirm the
      script defaults to the `tests` DB and requires an explicit flag to target
      production.
```

#### 4e — AI-CONTEXT.md update

In `docs/AI-CONTEXT.md`, add a new section after "Pricing model":

```md
## Firestore database isolation

The `skedaddle-inventory` Firebase project hosts two Firestore databases:

- `(default)` — production data. Production code only.
- `tests` — test seeding, integration smoke runs, load testing.

**Rules:**
- Production code paths NEVER write to `tests`.
- Test code, seeding scripts, and any `scripts/wipe-*` / `scripts/archive-*` /
  `scripts/seed-*` script defaults to `tests`. Targeting production requires
  an explicit `--db=production --i-understand-this-is-production` flag pair.
- Every doc written from a test context MUST include `testFixture: true` AND
  `testFixtureExpiresAt: <timestamp>`. The `cleanupTestFixtures` scheduled
  function sweeps expired fixtures daily at 3am Mountain.
- Use `scripts/lib/firestore-client.mjs` `getDb()` to obtain a Firestore
  client; never call `initializeApp()` / `getFirestore()` directly in scripts.
- ESLint rule `skedaddle-test-safety/require-fixture-stamp` enforces (b) at PR time.
```

Add to the "Never" rules block:

```md
- Never instantiate a Firestore admin client outside scripts/lib/firestore-client.mjs
- Never write to the `(default)` DB from a test, seed, or migration script without
  --db=production AND --i-understand-this-is-production
```

### Step 5 — Deploy + verify

1. `npm run lint && npm run build`
2. `npm run deploy:firebase` — deploys the new `cleanupTestFixtures` scheduled function
3. Verify in Firebase Console that the function appears with the expected schedule
4. Open the PR. The PR template's new checkbox should be visible.
5. After merge, manually run `gcloud firestore databases describe --database=tests --project=skedaddle-inventory` to confirm the named DB exists and is healthy.

## Acceptance

- [ ] Audit step 1 reported in PR description: list of every script's Firestore-client touch points
- [ ] `scripts/lib/firestore-client.mjs` exists and is the only place `initializeApp` / `getFirestore` are called outside of `functions/`
- [ ] `gcloud firestore databases list` shows both `(default)` and `tests`
- [ ] `wipe-test-orders.mjs` (if it still exists; may have been replaced by `archive-test-data.mjs` flow) AND `archive-test-data.mjs` BOTH refuse to run without `--db=`
- [ ] `eslint-rules/require-test-fixture-stamp.js` exists with passing tests; `npm run lint` flags any test/seed file that writes a Firestore doc without both fields
- [ ] `functions/cleanupTestFixtures.js` deployed and visible in Firebase Console
- [ ] `.github/pull_request_template.md` has the new checkbox
- [ ] `docs/AI-CONTEXT.md` has the "Firestore database isolation" section + "Never" rules
- [ ] No existing test or script broke: `npm run test && npm run test:visual:update --grep dashboard` (or equivalent CI green)

## Notes for the agent

- This patch CANNOT be skipped after starting. Once the helper defaults to `tests`, scripts targeting `(default)` without the flag will refuse to run — that's the point. Make sure step 5 deploys the scheduled function first so cleanup is live the moment the new model is.
- IAM role bindings are the most error-prone step. Audit them carefully. If you're unsure, document the current state in the PR description and let the admin make the role-binding decisions.
- Keep `archive-test-data.mjs` working through the migration. The data-safety toolkit is more important than the audit symmetry.
- Don't try to retrofit `testFixture` onto the existing test data we already archived in PR #161/#171/#172. Per the storm decision, contract enforcement is forward-only.
- The `tests` DB starts empty. That's fine. Future test seeding will populate it as it ships.

## Out of scope

- Firestore project-level isolation (separate `skedaddle-inventory-test` project) — named DB suffices
- Hard-delete cron threshold for `archivedAt`-stamped docs in production — the soft-delete pattern stays as-is
- GDPR / customer-data retention policy — different concern
