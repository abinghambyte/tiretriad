# GCP resource cleanup — 2026-04-26

**Trigger:** Operator surfaced Cloud Hub Optimization view showing $2.17/wk gross cost, 5.8% vCPU utilization, top spender `skedaddle-os-postgres` at $1.68/wk. Asked "are these used or wasteful old stuff?"

## Verdict — what's used vs. dead weight

### ✅ Active (KEEP)

These are the live Cloud Run services that back current Firebase Functions in the deployed portal:

- `advisornarrate` — listing advisor narrative generation
- `getdashboardstats` — dashboard hot tile data
- `crmstalecheck` — CRM lead aging
- `tirepriceresearchafternoon` — Kyle's research queue
- `processelevationreverts` — admin auto-elevation rollback
- `checkaccessexpiry` — invite token expiration
- `enqueuebelowmarginfloor` — margin-floor alerts
- `backfilltirecreatedat` — historical tire backfill (verify if still needed; runs idempotently anyway)
- `recordlogin`, `updatepresence`, `enqueuetoresearch` — utility callables

These all map 1:1 to files in `functions/*.js`. Confirmed active. Leave alone.

### 🗑️ Dead weight (DELETE — not referenced anywhere in the codebase)

Code search across `src/`, `functions/`, and root configs returned **zero** references to any of these:

| Resource | Type | Cost/wk | Annualized waste |
|---|---|---|---|
| `skedaddle-os-postgres` | Cloud SQL (Postgres) | $1.68 | **~$87/yr** |
| `aet-uscentral1-skedaddle--os--connector` | Compute Engine (VPC connector) | $0.14 | ~$7/yr |
| `skedaddle-os-motive-sync` | Cloud Run Job | $0.06 | ~$3/yr |

**Why these are dead:**
- The portal stack per `docs/AI-CONTEXT.md` is **Firestore + Firebase Functions**. There is no Postgres client anywhere. `skedaddle-os-postgres` is leftover from the *previous* generation of this project (the "skedaddle-os" prefix is the giveaway — current resources use either no prefix or domain-named prefixes).
- The VPC connector exists *only* to bridge Cloud Run → Cloud SQL. If Cloud SQL goes, the connector is orphaned.
- `motive-sync` is a Motive (fleet telematics) integration that doesn't exist in current code. Found only in `docs/archive/TACTICAL-OS-FLEET-ALERTS.md` — explicitly archived.

**Total annual savings if deleted:** ~$97/yr. Not huge, but it's pure waste, and Cloud SQL instances are the kind of thing you forget about for 5 years.

### ⚠️ Investigate before touching

| Resource | Why investigate |
|---|---|
| `skedaddle-os-firestore-backup` (Cloud Run service, $0.00, 8.3% vCPU) | Operator says "I don't think the backup firestore has been backing up." If true, this is **directly relevant** to the 2026-04-25 customer wipe — there may be no working backup mechanism. Don't delete until we confirm whether it's actually producing exports somewhere. |

## Recommended actions

### Round 1: investigate the backup (gate on this — relates to data recovery)

1. **Check Firebase Console** → Firestore Database → **Backups** tab
   - Is **PITR (Point-in-Time Recovery)** ON? (independent of `skedaddle-os-firestore-backup`)
   - Are there scheduled exports listed? When was the last successful one?
2. **Check Cloud Storage** for `gs://skedaddle-inventory-backups/` or similar bucket
   - If recent `.firestore_export/` folders exist with timestamps, the backup IS running
   - If empty or stopped weeks ago, the backup is broken
3. **Check Cloud Scheduler** → look for a job that triggers `skedaddle-os-firestore-backup`
   - If no scheduler, the service is idle and useless

After this, we know:
- Whether the customer wipe is recoverable
- Whether to fix/replace the backup or delete it as more dead weight

### Round 2: delete the confirmed dead weight (after backup investigation)

```bash
# CLOUD SQL — biggest single saving (~$87/yr)
# Console: SQL → skedaddle-os-postgres → Delete
# CLI:
gcloud sql instances delete skedaddle-os-postgres --project=skedaddle-inventory

# VPC CONNECTOR — depends on Cloud SQL, delete after
gcloud compute networks vpc-access connectors delete \
  aet-uscentral1-skedaddle--os--connector \
  --region=us-central1 --project=skedaddle-inventory

# MOTIVE SYNC JOB
gcloud run jobs delete skedaddle-os-motive-sync \
  --region=us-central1 --project=skedaddle-inventory
```

**Before any delete:** export a snapshot of the Postgres DB even if you don't think it's needed. Costs nothing in storage; protects you from "wait, that table had X" regret.

```bash
gcloud sql export sql skedaddle-os-postgres \
  gs://skedaddle-inventory-archives/skedaddle-os-postgres-final-$(date +%Y%m%d).sql.gz \
  --project=skedaddle-inventory
```

## Open questions for the operator

1. Permission to delete Cloud SQL `skedaddle-os-postgres` after final export? (yes/no)
2. Permission to delete VPC connector once SQL is gone? (yes/no)
3. Permission to delete `skedaddle-os-motive-sync` Job? (yes/no)
4. Will you check Firestore PITR + backup bucket, or do you want a runbook of console clicks?
