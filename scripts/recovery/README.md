# Wipe recovery — 2026-04-25 customer data

Runbook for restoring customer/order data lost in the 2026-04-25 wipe.

**Source backup:** `gs://skedaddle-inventory-firestore-backups/firestore/2026-04-25T091801Z/`
(daily Firestore export, captured at 03:18 AM Mountain on 2026-04-25, **before** the wipe)

**Recovery database:** `recovery-2026-04-25` (named DB in same project, isolated from live)

**Live database:** `(default)` in project `skedaddle-inventory`

---

## Pre-flight checklist

- [ ] `gcloud` CLI installed and on PATH
- [ ] `gcloud auth login` — logged in as a user with **Datastore Owner** in `skedaddle-inventory`
- [ ] `gcloud auth application-default login` — ADC set up (the diff and cherry-pick scripts need this)
- [ ] `gcloud config set project skedaddle-inventory`
- [ ] Bucket protection confirmed: Soft Delete (7d) + Object Versioning ON
- [ ] No one is doing destructive operations on live `(default)` while the recovery runs

---

## Phase 1 — Restore April 25 backup to a sandbox database

**Risk:** Zero — the live database is never touched.

```bash
# Dry run first (prints the plan, no side effects)
node scripts/recovery/01-import-snapshot.mjs

# Looks right? Apply.
node scripts/recovery/01-import-snapshot.mjs --apply
```

What it does:

1. Verifies the source backup exists at `gs://.../firestore/2026-04-25T091801Z/`
2. Reads the location of `(default)` so the recovery DB matches
3. Creates `recovery-2026-04-25` Firestore database (Native mode)
4. Triggers `gcloud firestore import` async, returns operation ID

**Wait time:** 5–30 min depending on data size. Watch progress with:

```bash
gcloud firestore operations describe <OPERATION_ID> \
  --database=recovery-2026-04-25 \
  --project=skedaddle-inventory
```

Operation must show `state: SUCCESSFUL` before proceeding to Phase 2.

---

## Phase 2 — Diff recovery vs. live

**Risk:** Zero writes. Reads only. Output is a local JSON file.

```bash
# Default — diffs all customer-relevant collections
node scripts/recovery/02-diff-against-live.mjs

# Or scope to specific collections
node scripts/recovery/02-diff-against-live.mjs --collections=orders,contacts

# Verbose mode includes the full onlyInLive list (otherwise capped at 20 IDs)
node scripts/recovery/02-diff-against-live.mjs --verbose
```

Default collections diffed: `orders`, `contacts`, `crmAccounts`, `crmVehicles`, `tires`, `users`.

For each collection produces:

- **`recovery`** — total docs in the April 25 snapshot
- **`live`** — total docs currently in production
- **`missingInLive`** — docs in recovery but NOT in live (this is the wipe damage)
- **`modified`** — docs in both, but with different content (changed since wipe)
- **`onlyInLive`** — docs created since the wipe; informational only

Output: `scripts/recovery/recovery-manifest-2026-04-25.json`

### Review the manifest before Phase 3

Open `recovery-manifest-2026-04-25.json` and eyeball:

1. **Counts plausible?** If `orders.missingInLive` is 0 but you remember losing customers, something's wrong with the diff (wrong DB? wrong backup folder?).
2. **`missingInLive` previews look like real data?** Each entry has a small preview of fields. Names should be human, dates should be reasonable, IDs should look like other IDs in your system.
3. **`modified` count low?** If it's high, real users have been editing live data since the wipe and a blind restore would clobber their work. Investigate before `--include-modified`.

---

## Phase 3 — Cherry-pick missing docs back into live

**Risk:** Live writes. Idempotent (skips docs that already exist in live), but real writes nonetheless.

```bash
# Dry run — prints what WOULD be written
node scripts/recovery/03-cherry-pick.mjs

# Sanity test — write 5 docs per collection, then verify in the app
node scripts/recovery/03-cherry-pick.mjs --apply --limit=5

# Full restore — writes everything in missingInLive
node scripts/recovery/03-cherry-pick.mjs --apply

# Scope to specific collections
node scripts/recovery/03-cherry-pick.mjs --apply --collections=orders,contacts

# DANGEROUS: also overwrite docs that were modified since the wipe
node scripts/recovery/03-cherry-pick.mjs --apply --include-modified
```

Each restored doc gets:

```js
{
  ...originalFields,
  restoredFrom: '2026-04-25T091801Z',
  restoredAt: serverTimestamp(),
  restoredBy: 'recovery-2026-04-25-script',
  _wasModified: false,  // true if from the `modified` set
}
```

The provenance fields make it easy to:

- Audit what came back via the recovery later (`where('restoredFrom', '==', '2026-04-25T091801Z')`)
- Roll back the recovery selectively if needed (a separate script could query on `restoredFrom`)

### Recommended sequence

1. `node scripts/recovery/03-cherry-pick.mjs` (dry run, look at numbers)
2. `node scripts/recovery/03-cherry-pick.mjs --apply --limit=5` (small test)
3. Open the live app. Verify the 5 new docs appear correctly. Especially:
   - `/people?tab=customers` for `contacts` restoration
   - CRM page for `crmAccounts`
   - Order pages for `orders`
4. If the test looks right: `node scripts/recovery/03-cherry-pick.mjs --apply` (full restore, no `--limit`)
5. Re-verify in the app.

---

## Aftermath

### Cleanup the recovery database

Once you're confident the live data looks right (give it a few days):

```bash
gcloud firestore databases delete \
  --database=recovery-2026-04-25 \
  --project=skedaddle-inventory
```

The April 25 backup folder in Cloud Storage stays — keep it forever (bucket has Object Versioning + Soft Delete).

### Audit the restored docs

Anytime later, list everything that came back via the recovery:

```js
const restored = await db
  .collectionGroup('orders')
  .where('restoredFrom', '==', '2026-04-25T091801Z')
  .get()
```

(Replace `orders` with `contacts`, `crmAccounts`, etc.)

### Future-proofing

After this recovery, the soft-delete + testFixture + pre-wipe-export proposals in
`docs/superpowers/specs/2026-04-25-wipe-safety-and-customer-recovery-design.md`
become much higher priority. We had this backup by luck (the daily job from the
old project carried over and kept running). Don't rely on luck again.

---

## Troubleshooting

**`gcloud firestore import` fails with `PERMISSION_DENIED`**
The user running gcloud needs **Datastore Owner** AND **Storage Object Viewer** on the backup bucket. Grant both.

**`02-diff-against-live.mjs` reports `recovery=0` for every collection**
Phase 1 import didn't finish or the recovery DB is empty. Check the operation state with `gcloud firestore operations describe`.

**Script crashes with `Could not load the default credentials`**
Run `gcloud auth application-default login` (different from `gcloud auth login` — the ADC are separate).

**Cherry-pick reports lots of `skipped (already in live)`**
Healthy outcome — means the live DB has docs that survived the wipe. Idempotent skip is working. Only `missingInLive` docs from the manifest get written.

**Cherry-pick reports `fail: ... PERMISSION_DENIED`**
ADC user needs Datastore User role on `(default)` database. Grant it.
