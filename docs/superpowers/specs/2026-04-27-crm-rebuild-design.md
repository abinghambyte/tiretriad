# CRM rebuild — design spec (STORMED 2026-04-27)

**Status:** Stormed. Implementation captured as patch-624 (schema migration), patch-625 (Kanban UI rebuild), patch-626 (SMS auto-Spotted with dedup).

## Pre-storm state

- `src/pages/CrmPage.jsx` (1270 lines, the god-component target of patch-402)
- `src/utils/crmPipeline.js`: stages = `Spotted → Contacted → Qualified → Quoted → Closed` (1–5), Lost = 7. v1→v2 migration logic already in place.
- `crmAccounts` collection holds the leads
- `crmLeads` collection holds something else (1 doc; legacy/inbound staging?)
- `crmVehicles` subcollection links vehicles to accounts
- `<CrmAccountDetailPanel>` exists for account detail view
- `<LeadSourceBadge>` exists for source rendering
- Existing filters: `Location contains` (geo), `Min score`, `Search company`, segment picklist

## Stormed decisions

### 1. Stage architecture (v3 schema)

**New stage labels:** `Spotted → Researched → Contacted → Quoted → Negotiating`. Lost stays at 7.

```js
export const CRM_STAGE_LABELS_V3 = {
  1: 'Spotted',
  2: 'Researched',
  3: 'Contacted',
  4: 'Quoted',
  5: 'Negotiating',
  7: 'Lost',
}

export const CRM_PIPELINE_SCHEMA_VERSION = 3
```

**Migration v2 → v3:**
- Existing `Qualified` (stage 3 in v2) → `Contacted` (stage 3 in v3) **if** no quote doc exists for that account; → `Quoted` (stage 4 in v3) **if** a quote doc exists. The migration queries `quotes where accountId == ...` (or whatever the existing quote linkage is) per account.
- Existing `Quoted` (stage 4 in v2) → `Quoted` (stage 4 in v3). Same number, same meaning.
- Existing `Closed` (stage 5 in v2) → stays archived as-is. Do NOT retroactively backfill `customers` docs from old closures (that's a separate data-hygiene pass).
- Existing `Lost` (stage 7) stays as-is.
- Migration script: `scripts/migrate-crm-stages-v3.mjs`. Per Storm 2's isolation model, targets `tests` DB first; production requires `--db=production --i-understand-this-is-production`.

### 2. Won terminus: convert-to-Customer

When a lead crosses past Negotiating (drag onto Won zone), an automation:
1. Creates a `customers/{newId}` doc populated from the `crmAccount` (name, phone, primary contact, vehicle list, last-touch history)
2. Sets `archivedAt: serverTimestamp()` + `archivedReason: 'won-converted-to-customer'` on the crmAccount
3. Stamps `customerId: newId` on the crmAccount for audit trail
4. Posts to `#fleet-ops` Slack: "🎉 [Company] converted to customer — [vehicle count] vehicles, est. $[value]"

Reduces visual noise on Kanban; reinforces funnel-not-graveyard mental model.

### 3. Lost handling

- Static "Lost" column **deleted** from the Kanban
- Lost = `archivedAt` set + `archivedReason: 'lost'` (consistent with soft-delete pattern from PR #171)
- Existing "Lost" toggle button stays; clicking surfaces archived-lost leads in a side panel for review

### 4. Drag zones (three, bottom of screen)

Visible only during drag (hidden state otherwise).

| Zone | Action | Slack notification |
|---|---|---|
| **Lost** | `archivedAt` set + `archivedReason: 'lost'`. Optional reason picker before commit (subset of common reasons: "no budget", "went with competitor", "ghosted", "other"). | "[Lead] marked Lost: [reason]" |
| **Won → Customer** | Convert-to-Customer flow per decision 2 | per decision 2 |
| **Park** | Inline picker on drop: `7d / 30d / 60d / 90d / custom date`. Default 30d (one-click). Custom opens date picker. Esc cancels and returns card to original column. Sets `archivedAt: serverTimestamp()` + `archivedReason: 'parked'` + `unparkAt: <chosen-date>` + `parkedFromStage: <originating-stage>`. | "[Lead] parked until [date]" |

**Unpark Cloud Function** — hourly cron in `functions/cleanupCrmParked.js`:
```js
export const unparkCrmAccounts = onSchedule(
  { schedule: 'every 1 hours', region: 'us-central1' },
  async () => {
    const now = new Date()
    const snap = await db.collection('crmAccounts')
      .where('archivedReason', '==', 'parked')
      .where('unparkAt', '<', now)
      .get()
    for (const doc of snap.docs) {
      const data = doc.data()
      const fromStage = data.parkedFromStage
      const stageLabel = CRM_STAGE_LABELS_V3[fromStage] || `Stage ${fromStage}`
      await doc.ref.set({
        archivedAt: FieldValue.delete(),
        archivedReason: FieldValue.delete(),
        unparkAt: FieldValue.delete(),
        // parkedFromStage stays for audit
        unparkedAt: FieldValue.serverTimestamp(),
      }, { merge: true })
      await postToSlack(`🔔 [${data.companyName}] back in **${stageLabel}** after park`)
    }
  },
)
```

### 5. Lead intake button placement

**Single `+ New Lead` button** in the top-right of the Kanban header. Not floating. No per-column adders. Matches `<ModuleSubheader>` action-slot convention used elsewhere.

### 6. What enters Spotted

Three intake routes. Ship the first two; defer the third.

#### 6a. Manual: `+ New Lead` button (always available)

Standard form modal: company name, primary contact phone, source dropdown (`manual / referral / inbound-call / other`), notes textarea. On save, lead enters `Spotted`.

#### 6b. Auto from inbound SMS (with dedup) — **ships in this storm batch**

When `inboundSms` Cloud Function receives a message, dedup before creating a lead:

```js
async function classifyInboundSms({ phoneRaw, body }) {
  const phone = normalizePhone(phoneRaw)

  // 1. Check non-archived crmAccounts
  const acctSnap = await db.collection('crmAccounts')
    .where('contactPhone', '==', phone)
    .get()
  const liveAccounts = acctSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((a) => !isArchived(a))
  if (liveAccounts.length > 0) {
    const acct = liveAccounts[0]
    await appendActivity(acct.id, { type: 'sms-in', body, at: serverTimestamp() })
    await db.collection('crmAccounts').doc(acct.id).update({
      lastTouchAt: serverTimestamp(),
    })
    await postSlack(`📩 Existing prospect **${acct.companyName}** reached out: "${body.slice(0, 80)}"`)
    return { route: 'existing-prospect', accountId: acct.id }
  }

  // 2. Check contacts (already-converted customers)
  const contactSnap = await db.collection('contacts').where('phone', '==', phone).get()
  if (!contactSnap.empty) {
    const contact = { id: contactSnap.docs[0].id, ...contactSnap.docs[0].data() }
    if (!isArchived(contact)) {
      // Route to existing customer thread; do NOT create a CRM lead
      await postSlack(`💬 Customer **${contact.name}** sent SMS: "${body.slice(0, 80)}"`)
      return { route: 'existing-customer', contactId: contact.id }
    }
  }

  // 3. No match — create fresh Spotted lead
  const newLead = await db.collection('crmAccounts').add({
    companyName: '(unknown)',
    contactPhone: phone,
    pipelineStage: 1,  // Spotted
    schemaVersion: 3,
    source: 'sms',
    estValueCents: 0,
    lastTouchAt: serverTimestamp(),
    activityLog: [{ type: 'sms-in', body, at: serverTimestamp() }],
    createdAt: serverTimestamp(),
  })
  await postSlack(`🆕 New lead from SMS: "${body.slice(0, 80)}" — phone ${phone}`)
  return { route: 'new-lead', accountId: newLead.id }
}
```

Three differentiated Slack messages:
- "🆕 New lead from SMS: ..."
- "📩 Existing prospect [Name] reached out: ..."
- "💬 Customer [Name] sent SMS: ..."

#### 6c. Research-speculation (DEFERRED)

Future: Kyle's research queue (`tirePriceResearchAfternoon`) creates speculative leads tagged `source: 'research-speculation'` for SKUs with no current listing. Out of scope for this storm batch. Track as a follow-up patch when patch-501 (Listing Advisor fallback) ships.

### 7. Card content (denormalized)

Five fields render on each Kanban card:

| Field | Source |
|---|---|
| **Name** | `companyName` (or contact name fallback) |
| **Source badge** | existing `<LeadSourceBadge>` from `source` field |
| **Last touch** | denormalized `lastTouchAt` (relative time) |
| **Est. value** | denormalized `estValueCents` (display via `formatCurrency(cents/100)`) |
| **Owner avatar** | `assignedToUid` lookup → role color chip |

**Denormalization mandatory** — both `estValueCents` and `lastTouchAt` are denormalized fields on the `crmAccount` doc, not computed at render time:

- `estValueCents` (integer) — recomputes via Cloud Function trigger on `crmVehicles` create/update/delete for that `accountId`. Formula: `sum over vehicles of (vehicle.tireCount * vehicle.estUnitPriceCents)`. Falls back to 0 if no vehicles.
- `lastTouchAt` (Timestamp) — updates on every activity write: SMS in or out, quote sent, stage change, manual note, drag/drop into a stage. Single field, monotonic increase only.

This solves three things at once:
- Card render is one read, no joins
- The new "Last touch" filter (decision 8) has an indexed field to query
- The metrics strip (decision 9) computes conversion rate over time windows without scanning subcollections

**Composite index needed:** `(pipelineStage, lastTouchAt desc)` on `crmAccounts` for the Kanban column ordering.

**Migration:** backfill both fields from existing data on first deploy, as part of `scripts/migrate-crm-stages-v3.mjs`.

### 8. Filters

| Filter | Status | Rationale |
|---|---|---|
| `Location contains` (geo) | ❌ Drop | NoCo only — confirmed |
| `Min score` | ❌ Drop | Ambiguous unless we ship the score formula publicly |
| `crmAccountSegment` picklist | ❌ Drop | Overengineered for current scale |
| `Owner` (admin / sourcer / mechanic) | ✅ Keep | Crew filtering matters in multi-user mode |
| `Stage` | ✅ Keep | Useful as a single-column filter dropdown |
| `Source` (sms / research / manual / referral) | ✅ Keep | Aligns with new auto-intake |
| `Last touch` (today / 7d / 30d / 90d / older / never) | 🆕 Add | Most useful CRM filter; uses denormalized `lastTouchAt` |

### 9. Metrics strip placement

Render `Total leads / Conversion rate` inline in the `<ModuleSubheader>` slot for the CRM page, right-aligned. Saves the vertical space the existing strip takes. Conversion rate computed as `(count where pipelineStage transitioned out of Negotiating into customer in last 30d) / (count entered Spotted in last 30d)`. Recomputed on Cloud Function timer (every 6h) and cached on `meta/crmStats` doc to avoid re-scan-on-every-render.

## DnD library note

Reuse whatever the portal already has. Likely `dnd-kit` on React 19 (react-dnd is in maintenance mode). If nothing exists yet, **dnd-kit is the right choice for React 19**. Do NOT introduce a new DnD primitive just for the drop zones.

## Patch decomposition

Three coordinated briefs:

1. **patch-624** — CRM schema migration v3 + denormalization fields + composite index + backfill script. Targets `tests` DB first per Storm 2's isolation model. **Ships first.**
2. **patch-625** — Kanban UI rebuild: new stage labels, three drag zones with Park picker, `+ New Lead` button, card content with denormalized fields, dropped/kept/added filters, ModuleSubheader metrics placement, unpark Cloud Function. **Ships after 624.**
3. **patch-626** — SMS auto-Spotted with dedup logic in `functions/inboundSms.js`. **Ships after 624 (depends on `lastTouchAt` denormalization).**

Total estimated effort: M-L (the schema migration + UI rebuild is a multi-day initiative, but each patch is shippable independently after 624 lands).

## Decision log

- **Stage names: audit's vocabulary with 'Quoted' kept** because it matches an actual workflow step, not just a SaaS label
- **Convert-to-Customer terminus** — funnel, not graveyard
- **Static Lost column gone** — toggle is enough
- **Three drag zones (Lost / Won / Park) with Park picker** — fixed 30d default + 7/60/90/custom options
- **Unpark cron is hourly** — granularity matches the human cadence of "today vs tomorrow vs next week"
- **Slack message on unpark must include originating stage** — Alex/Kyle pick up context, not re-triage from Spotted
- **SMS auto-Spotted requires dedup** — three Slack message variants (new / existing-prospect / existing-customer)
- **Card fields denormalized** — `estValueCents` + `lastTouchAt` on the account doc; cron-recomputed on writes
- **Composite index `(pipelineStage, lastTouchAt desc)`** — required for Kanban column ordering performance
- **Research-speculation intake deferred** — out of scope until Listing Advisor fallback (patch-501) ships
- **dnd-kit for DnD** — React 19 default; don't add a new primitive

## Out of scope

- patch-402 god-component refactor (CrmPage.jsx 1270 lines) — orthogonal; can ship before or after this rebuild
- Customer doc shape after Won-conversion — uses existing `customers` collection structure
- Per-vehicle pricing in `crmVehicles` — assumes existing schema; if missing, add `estUnitPriceCents` field as part of patch-624
- Slack channel routing (whether unpark / SMS notifications go to `#fleet-ops` vs `#crm`) — confirm with admin before patch-625 deploy

## Next step

Dispatch patch-624 first. Then 625 and 626 in parallel after 624's migration succeeds against `tests` DB.
