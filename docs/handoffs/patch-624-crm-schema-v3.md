---
patch: 624
title: CRM schema v3 — stage rename + denormalization + composite index
status: ready-to-dispatch
priority: P1 — gates patch-625 (Kanban UI) and patch-626 (SMS dedup)
depends_on: [622]
spec: docs/superpowers/specs/2026-04-27-crm-rebuild-design.md
batch: crm-rebuild
---

# patch-624 — CRM schema v3 + denormalization

Schema-only patch. Runs first; lands the field shape that patch-625 (UI) and patch-626 (SMS dedup) depend on.

## Files touched

- `src/utils/crmPipeline.js` — add `CRM_STAGE_LABELS_V3`, bump `CRM_PIPELINE_SCHEMA_VERSION` to 3, extend `normalizeStage()` to map v2→v3 labels for display while data migration runs
- `functions/recomputeCrmEstValue.js` — **new** — Cloud Function trigger on `crmVehicles` create/update/delete that recomputes `estValueCents` on the parent `crmAccount`
- `functions/touchCrmAccount.js` — **new helper** — exported `touchAccount(accountId)` that updates `lastTouchAt: serverTimestamp()`. Imported by `inboundSms.js`, `crmActivityLog.js`, quote-sent flows, drag/drop handlers in patch-625
- `firestore.indexes.json` — add composite index `(pipelineStage ASC, lastTouchAt DESC)` on `crmAccounts`
- `scripts/migrate-crm-stages-v3.mjs` — **new** — one-time migration script
- `src/utils/crmPipeline.test.js` — extend with v2→v3 mapping cases

## Migration script

```js
// scripts/migrate-crm-stages-v3.mjs
import { getDb } from './lib/firestore-client.mjs'  // from patch-622
import { FieldValue } from 'firebase-admin/firestore'

const args = new Set(process.argv.slice(2))
const APPLY = args.has('--apply')
if (!process.argv.find((a) => a.startsWith('--db='))) {
  console.error('Refuse to run without --db=tests OR --db=production --i-understand-this-is-production')
  process.exit(1)
}

const db = getDb()  // honors the storm-2 contract: defaults to tests DB

async function migrate() {
  const snap = await db.collection('crmAccounts').get()
  const plan = []

  for (const doc of snap.docs) {
    const data = doc.data() || {}
    const currentStage = Number(data.pipelineStage ?? 1)
    const currentVersion = Number(data.schemaVersion ?? 1)
    if (currentVersion >= 3) continue  // already migrated

    const updates = { schemaVersion: 3 }

    // Stage v2 → v3
    if (currentStage === 3 /* Qualified */) {
      // Has a quote? -> v3 Quoted (4). Else -> v3 Contacted (3).
      const quoteSnap = await db.collection('quotes')
        .where('accountId', '==', doc.id)
        .limit(1)
        .get()
      updates.pipelineStage = quoteSnap.empty ? 3 : 4
    }
    // 1 (Spotted), 2 (Contacted), 4 (Quoted), 5 (Closed), 7 (Lost) keep their numbers

    // Denormalize estValueCents from crmVehicles
    const vehSnap = await db.collection('crmVehicles')
      .where('accountId', '==', doc.id)
      .get()
    const totalCents = vehSnap.docs.reduce((sum, v) => {
      const d = v.data() || {}
      const count = Number(d.tireCount) || 0
      const unitCents = Number(d.estUnitPriceCents) || 0
      return sum + count * unitCents
    }, 0)
    updates.estValueCents = totalCents

    // Denormalize lastTouchAt from existing fields (best-effort)
    const candidates = [data.lastContactedAt, data.updatedAt, data.createdAt].filter(Boolean)
    if (candidates.length > 0) {
      // Pick the latest; Firestore Timestamps have toMillis()
      const latest = candidates.reduce((a, b) =>
        (a?.toMillis?.() || 0) > (b?.toMillis?.() || 0) ? a : b,
      )
      updates.lastTouchAt = latest
    }

    plan.push({ ref: doc.ref, id: doc.id, name: data.companyName || '(unnamed)', updates })
  }

  console.log(`migration plan: ${plan.length} crmAccount docs to update`)
  for (const p of plan.slice(0, 5)) {
    console.log(`  ${p.id} ${p.name} -> stage ${p.updates.pipelineStage}, est $${(p.updates.estValueCents || 0) / 100}`)
  }
  if (plan.length > 5) console.log(`  ... and ${plan.length - 5} more`)

  if (!APPLY) {
    console.log('\nDry run. Re-run with --apply to write.')
    return
  }

  for (const p of plan) {
    await p.ref.set(p.updates, { merge: true })
  }
  console.log(`\nDone. ${plan.length} docs migrated.`)
}

migrate().catch((e) => { console.error(e); process.exit(1) })
```

## Composite index

`firestore.indexes.json`:
```json
{
  "indexes": [
    {
      "collectionGroup": "crmAccounts",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "pipelineStage", "order": "ASCENDING" },
        { "fieldPath": "lastTouchAt", "order": "DESCENDING" }
      ]
    }
  ]
}
```

Deploy with `firebase deploy --only firestore:indexes`.

## Cloud Function: recomputeCrmEstValue

```js
import { onDocumentWritten } from 'firebase-functions/v2/firestore'
import { getFirestore } from 'firebase-admin/firestore'

export const recomputeCrmEstValue = onDocumentWritten(
  { document: 'crmVehicles/{vehicleId}', region: 'us-central1' },
  async (event) => {
    const after = event.data?.after?.data()
    const before = event.data?.before?.data()
    const accountId = after?.accountId || before?.accountId
    if (!accountId) return

    const db = getFirestore()
    const vehSnap = await db.collection('crmVehicles')
      .where('accountId', '==', accountId)
      .get()
    const totalCents = vehSnap.docs.reduce((sum, v) => {
      const d = v.data() || {}
      const count = Number(d.tireCount) || 0
      const unitCents = Number(d.estUnitPriceCents) || 0
      return sum + count * unitCents
    }, 0)

    await db.collection('crmAccounts').doc(accountId).set(
      { estValueCents: totalCents },
      { merge: true },
    )
  },
)
```

## Acceptance

- [ ] `CRM_STAGE_LABELS_V3` defined; v2 mapping logic in `normalizeStage()` updated
- [ ] `firestore.indexes.json` updated and deployed
- [ ] `recomputeCrmEstValue` Cloud Function deployed
- [ ] `touchCrmAccount` helper exported from `functions/touchCrmAccount.js`
- [ ] Migration script runs successfully against `tests` DB (dry-run + apply)
- [ ] Migration script applied to production with explicit flags after smoke-test
- [ ] After migration: every `crmAccounts` doc has `schemaVersion: 3`, `estValueCents`, `lastTouchAt` set
- [ ] No regression in existing `<CrmPage>` rendering (still uses v2 labels but reads v3-normalized stages — should "just work" via normalizeStage())
- [ ] `npm run lint && npm run test && npm run build` green
- [ ] `npm run deploy:firebase` succeeds with new function + index

## Notes for the agent

- **Migration order matters:** index deploy → function deploy → migration script run. The script writes `lastTouchAt`, which the index depends on; the trigger also writes back, so deploying the function first prevents a race.
- **`tests` DB first.** Per Storm 2's contract, run the migration script against `--db=tests` first. Hand-create 3-4 fake crmAccounts in `tests` to validate the migration before touching production. Production migration requires `--db=production --i-understand-this-is-production`.
- **Don't change UI in this patch.** Patch-625 owns the Kanban rebuild. This patch ships shape + data only; the existing CRM UI continues to render against the migrated data.
- **`estUnitPriceCents` may not exist on existing crmVehicles.** Check before assuming the field name. If the existing field is `estPrice` or similar, normalize to cents in the migration.
