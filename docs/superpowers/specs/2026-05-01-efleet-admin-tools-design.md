# eFleet admin tools — design

**Status:** approved 2026-05-01
**Branch target:** `efleet-admin-tools`
**Roadmap entries shipped:** *FET audit endpoint*, *Side-by-side eFleet diff view*, *Surface eFleet account number admin* (all Next). Three roadmap items, one PR.

## Goal

Surface eFleet import results to admins so data-quality issues like the 2026-04-29 brand-conflict surprise (MSPNs 54802 and 61309 duplicated across BFGoodrich and Michelin sections) are visible before they bite. Read-only diagnostic page; no inline fix actions in v1.

## Non-goals

- Inline / bulk fix actions. The existing `scripts/fix-brand-conflict-tires.mjs` and Firestore Console cover manual reconciliation. Adding write paths in the admin UI is a follow-up once these views prove themselves.
- Drift-over-time charts. No historical snapshot stream today; out of scope.
- Brand-conflict resolution UI. The importer's `brandConflictMspns` guard plus the hotfix script handle this; the admin view just surfaces the conflict.
- Customer-facing surfaces. Strictly admin-gated.

## Architecture

New admin sub-route `/admin/efleet` rendered by `AdminEFleetPage.jsx`. Page is `role === 'admin'` gated (matches `AdminPage.jsx` pattern). Internal state via `<ModuleSubheader>` tabs:

```
[Account] [FET audit] [Diff]
```

Single Firestore read on mount: `meta/categoryMap` (extended below). Cross-references `tires/*` in memory via `useTires()`. The selector `useEFleetDiff(tires, records)` returns the four diff buckets used by the Diff tab and (via filter) the FET audit tab.

### Files created

```
src/pages/AdminEFleetPage.jsx                Route component, tab-state, role gate
src/components/admin/efleet/AccountCard.jsx  Tab 1
src/components/admin/efleet/FetAuditTable.jsx Tab 2
src/components/admin/efleet/EFleetDiffView.jsx Tab 3 wrapper
src/components/admin/efleet/DiffStateTabs.jsx Sub-tab strip (colored headers)
src/hooks/useEFleetDiff.js                   Bucket selector
src/hooks/useEFleetDiff.test.js
src/components/admin/efleet/AccountCard.test.jsx
src/components/admin/efleet/FetAuditTable.test.jsx
src/components/admin/efleet/EFleetDiffView.test.jsx
```

### Files modified

```
src/App.jsx                                  Add route
src/pages/AdminPage.jsx                      Add "eFleet tools →" entry card
scripts/import-efleet.mjs                    Write the new records field
scripts/import-efleet.test.mjs               Cover new field shape
ROADMAP.md                                   Move 3 entries to Resolved
```

## Data model

### `meta/categoryMap` extension

Today the doc holds `{ mspns, importedAt, sourceFile, sourceReportDate, account, totalParsed }`. Extend with a `records` field:

```js
records: {
  '54802': {
    fet: 4.44,
    price: 686.40,
    brand: 'BFGOODRICH',
    description: '42X14.50R17LT 128Q MDTRTA KM3 D',
    lr: 'E',
    tread: 'MDTRTA KM3',
  },
  // ... 1,628 entries, ~325 KB at current catalog size
}
```

The `records` map carries the same data the importer's `tireRecords[]` already produces in Phase 1; it just persists it. Brand-conflict MSPNs ARE included in `records` (using the eFleet record verbatim) so the diff view can see "the eFleet wants this brand at this price" even though the importer's planner refused to overwrite.

### Why a single doc

Per brainstorming, single-doc storage is the right shape:
- 1,628 records × ~200 bytes = ~325 KB; well under Firestore's 1 MB limit.
- Single read on page mount; no fan-out.
- Co-located with the existing categoryMap metadata that the page also displays.
- New imports overwrite the field atomically — no schema migration tracking.

If the catalog ever grows past ~4,500 entries (~900 KB), revisit storage. Out of scope for now.

## `useEFleetDiff` selector

```js
/**
 * @param {Array<EnrichedTire>} tires       From useTires()
 * @param {Record<string, EFleetRecord>} records  meta/categoryMap.records
 * @returns {{
 *   mismatched: Array<DiffEntry>,           // exists in both, eFleet-sourced fields differ
 *   invOnly: Array<DiffEntry>,              // tire doc exists, no record under MSPN
 *   eFleetOnly: Array<DiffEntry>,           // record exists, no tire doc
 *   aligned: Array<DiffEntry>,              // both exist, all eFleet fields match
 *   counts: { mismatched, invOnly, eFleetOnly, aligned, total }
 * }}
 */
```

`DiffEntry` shape:

```js
{
  mspn: string,
  brand: string,            // canonical (from tire if exists, else from record)
  description: string,      // primary display string
  isOffProgram: boolean,    // tire.offProgramAt set
  isBrandConflict: boolean, // tire.brand !== record.brand
  deltas: Array<{ field: 'price'|'fet'|'lr'|'description'|'tread', before, after }>,
}
```

### Bucket logic

For each MSPN in the union of `tires` keys + `records` keys:

1. Skip the tire entirely if `tire.archivedAt` is set (operator already removed).
2. If only `tire` exists → `invOnly`. Carries `isOffProgram` if `tire.offProgramAt` set.
3. If only `record` exists → `eFleetOnly`.
4. If both exist:
   - Brand mismatch → `mismatched` with `isBrandConflict: true`.
   - Compare `EFLEET_SOURCED_FIELDS = ['price', 'fet', 'description', 'lr', 'tread']`. If any differ, `mismatched`. Otherwise `aligned`.

The selector is pure and memoizable on `(tires, records)`. O(n) where n is the union size.

## Component contracts

### `AdminEFleetPage`

```jsx
<AdminEFleetPage />
```

- Role gate: redirects to `/dashboard?notice=access` if `profile.role !== 'admin'`.
- Calls `useTires()` and reads `meta/categoryMap` once via a small inline `useEffect` + `getDoc(doc(db, 'meta', 'categoryMap'))`. One-shot read; no need for `onSnapshot` since the operator triggers imports manually and can refresh the page after.
- Tab state: `?tab=account|fet|diff`, defaults to `account`. Mirrors existing CategoryTabs URL-state pattern.
- Renders `<ModuleSubheader title="eFleet tools" tabs={[...]}>` and the active tab body.
- Empty-state when `meta/categoryMap` is missing: full-page card "No eFleet import yet. Run `node scripts/import-efleet.mjs` from your machine to populate."

### `AccountCard`

```jsx
<AccountCard categoryMap={categoryMap} diffCounts={counts} />
```

Renders metadata in a single-column card:

| Field | Source |
|---|---|
| Account (ship-to) | `categoryMap.account` |
| Last import | `categoryMap.importedAt` (relative time + absolute) |
| Source report date | `categoryMap.sourceReportDate` |
| Source file | `categoryMap.sourceFile` |
| Total parsed (records) | `Object.keys(categoryMap.records).length` |
| Mismatched / Inv only / eFleet only / Aligned | from `diffCounts` |

Each line is a definition list `<dt>` / `<dd>`. Missing fields render as `--`.

### `FetAuditTable`

```jsx
<FetAuditTable diff={diffResult} />
```

Filters `diff.mismatched` to entries with a FET delta (`deltas.some(d => d.field === 'fet')`). Plus a second pass over `diff.invOnly` and `diff.aligned` for tires that carry `tire.fet > 0` AND no eFleet record (or `record.fet === 0`) — surfaces over-applied FET (e.g., the `$3.00` overhead-as-FET typo from the roadmap entry).

Table columns: MSPN · Brand · Description · Portal FET · eFleet FET · Delta · Notes (if brand-conflict).

Sortable by Delta descending by default — biggest tax-compliance risks float to the top.

### `EFleetDiffView` + `DiffStateTabs`

```jsx
<EFleetDiffView diff={diffResult} />
```

Wraps `<DiffStateTabs>` (the four colored sub-tabs) and a body that renders the active state's table.

```jsx
<DiffStateTabs counts={counts} active={activeState} onChange={setActiveState} />
```

Tabs:

| State | Bg tint | Text |
|---|---|---|
| Mismatched | `bg-red-950/30` | `text-red-300` (active) / `text-red-400/60` (inactive) |
| Inv only | `bg-amber-950/30` | `text-amber-300` (active) / `text-amber-400/60` (inactive) |
| eFleet only | `bg-blue-950/30` | `text-blue-300` (active) / `text-blue-400/60` (inactive) |
| Aligned | `bg-emerald-950/30` | `text-emerald-300` (active) / `text-emerald-400/60` (inactive) |

Active tab uses higher opacity bg + bolder text. Each tab label includes the count: `Mismatched 12`. URL state: `?tab=diff&state=mismatched|inv-only|efleet-only|aligned` (defaults to `mismatched`).

Body: a table per state, columns scaled to what's relevant:

- **Mismatched:** MSPN · Brand · Description · Deltas (per-field rows: `price $686 → $237`, `fet $4.44 → 0`, `BRAND CONFLICT` pill if applicable)
- **Inv only:** MSPN · Brand · Description · `OFF-PROGRAM` badge if applicable
- **eFleet only:** MSPN · Brand · Description · Price · FET (action hint: "consider adding to inventory")
- **Aligned:** MSPN · Brand · Description (compact; rarely opened)

All four tables: virtualized via `react-window` if row count > 200 (matches existing MarginTable pattern); plain render otherwise.

## URL state

`/admin/efleet?tab=<account|fet|diff>&state=<mismatched|inv-only|efleet-only|aligned>`

- Default: `tab=account`
- `state` only meaningful when `tab=diff`; ignored otherwise.
- Reload-friendly so an admin can deep-link to a specific finding.

## Edge cases

- **No `meta/categoryMap` doc.** Empty state on every tab. Account card shows "No import yet."
- **`records` field missing on existing categoryMap.** Same as above — diff cannot run. Empty-state with same hint to run the importer (the next import populates the field).
- **Brand-conflict MSPNs.** Land in `Mismatched` with `isBrandConflict: true` and a visual `BRAND CONFLICT` pill. Their deltas show every differing field, not just brand.
- **Soft-archived tires.** Excluded from all four buckets. The operator already removed them from active inventory.
- **`offProgramAt` tires.** Land in `invOnly` (the eFleet record was removed in a prior export, the importer correctly soft-tagged it). Carry an `OFF-PROGRAM` pill so the operator can distinguish them from genuinely aged stock.
- **Stale `categoryMap`.** No special handling beyond what `categoryMapAgeStatus.js` already provides on the Tires page; reuse the same banner if the import is >30 days old.

## Testing

Each component has a focused unit/component test file. Selector tests run on synthetic fixtures.

### `useEFleetDiff.test.js`

Cases:
- Empty inputs → all-empty buckets.
- All aligned → only `aligned` populated.
- All four states present → each MSPN lands in its expected bucket.
- Brand mismatch with otherwise-aligned fields → `mismatched`, `isBrandConflict: true`, deltas list every field that actually differs.
- Off-program tire with no eFleet record → `invOnly`, `isOffProgram: true`.
- Soft-archived tire → excluded entirely.
- 54802-shape regression: both brand and price/fet differ → mismatched + brand conflict + multiple deltas.

### `AccountCard.test.jsx`

- Renders all metadata fields when present.
- Dash-fallback on missing fields.
- `total parsed` count matches `Object.keys(records).length`.

### `FetAuditTable.test.jsx`

- Filters to FET-only mismatches.
- Surfaces over-applied FET on tires whose eFleet record has `fet === 0`.
- Sortable by delta magnitude.

### `EFleetDiffView.test.jsx` + `DiffStateTabs.test.jsx`

- Sub-tab activation (URL state + counts in labels).
- Empty-state per tab when `counts[state] === 0`.
- Brand-conflict pill renders when `isBrandConflict`.

### Importer test extension

`scripts/import-efleet.test.mjs` adds:
- `meta/categoryMap` write includes the `records` field.
- `records` is keyed by MSPN, contains `{ fet, price, brand, description, lr, tread }`.
- Brand-conflict MSPNs are present in `records` (the eFleet's view of them).

## Risks

- **Doc-size growth.** At ~5,000 records the doc would hit ~1 MB. Currently 1,628; lots of headroom. If the catalog ever doubles, revisit storage. Add a guard in the importer: if `records` payload exceeds 800 KB, log a warning and abort.
- **Read cost.** Single read of an extended doc on every admin tools mount. ~325 KB transfer; one-shot, not subscribed. Acceptable for an admin-only page used a handful of times per import cycle.
- **Operator confusion: "aligned" not the same as "good".** A tire can be aligned with eFleet but still have stale retail or low margin. Make it explicit on the Aligned tab: "These rows match the latest eFleet export. They may still need other attention (retail research, margin review)."

## Out of scope

- Per the non-goals: write actions, drift charts, brand-conflict resolution UI, customer-facing surfaces.
- The roadmap's "bulk-deprecate or bulk-add with one click" is explicitly held until v2.
