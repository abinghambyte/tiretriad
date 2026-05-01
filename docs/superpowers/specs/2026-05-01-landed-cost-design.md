# Landed-cost rollup (v1) - Design

**Status:** approved 2026-05-01

## Problem

Today the portal treats the eFleet catalog "Price" column as the all-in cost of a tire. The actual eFleet invoice charges:

- catalog Price (net unit price)
- + Unit FET
- + wholesale sales tax on the (price x qty) base (CO: county 1.09% + local 3.12% + state 3.02% = ~7.23%)
- + Colorado tire fee ($2 per tire)

For example, MSPN 09100 (LT265/70R17 BFG KO3) ships at catalog $220.35 / FET $0.00, but the actual invoice for 4 of them runs ~$953 (catalog $881.40 + tax $63.73 + fee $8). The portal currently shows the buy as $881.40, which means every quote, margin %, opportunity score, and crew earnings calc systematically under-states cost. On a 23% bundle margin the real margin is closer to 17%.

`functions/payoutConfig.js` already has the rates and a `computeOrderTaxes(buyPerTire, qty, taxes)` helper that produces these numbers. It is not wired into any display or earnings path.

## Architecture

Three layers of cost truth.

### 1. Catalog (unchanged)

Tire docs continue to carry just `price`, `fet`, `priceIntel.activeBuyPrice` etc. The catalog is the price ladder, not landed. eFleet HTML importer (`scripts/import-efleet.mjs`) does not change.

### 2. Predictive landed (computed on read)

A new pure helper:

```js
// src/utils/tireLandedBuy.js  (new)
export function tireLandedBuyNumber(tire, taxes) {
  const buy = tireCatalogBuyNumber(tire)
  if (buy <= 0) return 0
  const fet = Number(tire?.fet) || 0
  const rate = (Number(taxes?.countyTaxPct) || 0)
    + (Number(taxes?.localTaxPct) || 0)
    + (Number(taxes?.stateTaxPct) || 0)
  const fee = Number(taxes?.tireFeePerTire) || 0
  return buy + fet + buy * rate + fee
}
```

Same idea on the server (functions side already has `computeOrderTaxes`; consolidate by exporting `tireLandedBuyNumber` from `functions/payoutConfig.js` too so client + server math is identical).

All consumers switch:

- `QuoteCalculator.jsx` - "Buy cost total" row uses landed; FET / tax / fee shown as broken-out reference rows below for transparency
- `TirePricingCard.jsx` - "Buy" row shows landed; an info chip surfaces the breakdown on hover/tap
- `MarginTable.jsx` - margin column recomputes off landed
- `marginCalc.js` `computeBundleQuote` and `computeListingMargin` - take landed buy, not catalog buy
- `opportunityScore.js` - landed buy
- `useEFleetDiff.js` / hidden-gems / brand aggregates - landed buy where margin is involved
- `tirePriceResearch.js` (server) - landed buy when any margin computation lives there

The catalog price helper (`tireCatalogBuyNumber`) stays available for the rare component that genuinely needs the list price (eFleet drift comparison etc.).

Tax rates come from `meta/payoutConfig.taxes`, loaded once via the existing `usePayoutConfig` hook on the client and `loadPayoutConfig(db)` on the server. Rate changes propagate immediately to every quote without doc rewrites.

### 3. Realized landed (per order)

At order completion, snapshot the estimated landed onto the order doc. The pattern mirrors `deliveryBumpAtCompletion` we just shipped.

Order doc gains:

- `dr: string | null` - delivery receipt number, set later by the invoice importer (or by an admin manually)
- `estimatedLandedCostAtCompletion: number` - written in `completionPatch` by `completeOrder`. Computed as `qty * tireLandedBuyNumber(tire, taxes)` using the live `payoutConfig.taxes` at completion time. Frozen so live tax-rate edits don't rewrite history.
- `actualLandedCost: number | null` - filled in by the importer when the invoice reconciles. Defaults null.
- `invoiceLineRef: string | null` - Firestore path to the matched invoice line.

`completedOrderMarginPool` uses `actualLandedCost ?? estimatedLandedCostAtCompletion ?? legacyCostTotal`. The legacy fallback covers historical orders (per Q6 C, no backfill).

A new subcollection `orders/{id}/costAudit/{auto-id}` records every cost write:

```
{
  setBy: string,            // uid or 'system' for completion writes
  setAt: serverTimestamp,
  oldEstimated: number | null,
  oldActual: number | null,
  newEstimated: number | null,
  newActual: number | null,
  source: 'completion' | 'invoice-reconcile' | 'admin-edit',
  notes: string | null,
}
```

## Invoice importer

New page `/admin/efleet/invoices` (sister to existing `/admin/efleet`).

### Parser

`scripts/import-efleet-invoice.mjs` (new). Reuses the same HTML parsing patterns as `import-efleet.mjs`. Extracts:

- Document level: `docNumber` (DA####), `docDate`, `dr` (cross reference), `poNumber`, `orderNumber`, `orderDate`, `terms`, `total`
- Per line: `mspn` (from product code), `qty`, `unitPrice`, `discount`, `netUnitPrice`, `unitFet`, `extended`
- Aggregates: `countyTax`, `localTax`, `stateTax`, `tireFee`, `bonusTotal`, `nobonusTotal`, `fetTotal`, `invoiceTotal`

Pure function, no Firestore writes. Tested with a fixture sample (one of the screenshots from this brainstorm becomes `scripts/__fixtures__/efleet-invoice-sample.html`).

### Storage

New collection `invoices/{id}` where id is the invoice doc number (`DA####` stripped to digits or kept as-is). Schema:

```
{
  docNumber: string,
  docDate: timestamp,
  dr: string,
  poNumber: string,
  orderNumber: string,
  total: number,
  bonusTotal: number,
  nobonusTotal: number,
  fetTotal: number,
  countyTax: number,
  localTax: number,
  stateTax: number,
  tireFee: number,
  importedAt: serverTimestamp,
  importedBy: uid,
  lines: [
    {
      mspn, qty, unitPrice, discount, netUnitPrice, unitFet, extended,
      attachedOrderId: string | null,
      attachedAt: timestamp | null,
      attachedBy: uid | null,
    }
  ],
  status: 'pending' | 'partial' | 'attached',  // derived from lines[].attachedOrderId
}
```

### UI flow

1. Admin drops invoice HTML on `/admin/efleet/invoices`. Parser runs in the browser; preview shows extracted lines + DR + totals before commit.
2. On commit, write the `invoices/{docNumber}` doc with `status: 'pending'`.
3. Hybrid auto-attach: for each line, search portal orders where `order.dr === invoice.dr` AND the order has a matching MSPN line. Auto-set `attachedOrderId` and trigger the recompute (below). Mark line `attachedAt: serverTimestamp, attachedBy: uid`.
4. Manual review queue: lines without an auto-match render as a list; each line shows ranked candidate orders (`(MSPN match, qty match, doc-date proximity within +/- 14 days)`). Admin clicks a candidate to attach. Same recompute flow fires.
5. After every line attaches, line `status` rolls up to `attached`.

### Recompute on attach

Per Q5 A. Atomic Firestore transaction.

`newRealized` for the attached line must match the predictive-landed shape (net + FET + wholesale tax + tire fee), because the predictive math already runs through the same formula. Per-line tax / fee are NOT carried on the invoice line itself - they appear once at the invoice level - so the importer pro-rates the invoice's order-level taxes and tire fee across each line by line-extended share:

```
lineShareOfInvoice = line.extended / invoice.bonusTotal
linePackedTax = lineShareOfInvoice * (invoice.countyTax + invoice.localTax + invoice.stateTax)
lineTireFee = invoice.tireFee * (line.qty / invoice.totalTires)   // tire fee is per-tire flat
newRealized = line.extended + linePackedTax + lineTireFee
```

(`invoice.totalTires` = sum of `lines[].qty`. The pro-ration is exact when only one line per invoice; with multi-line invoices it's faithful to "the per-tire share of the bill we actually paid.")

When an order receives multiple invoice lines (multi-SKU order), each subsequent attach uses the order's most-recent `actualLandedCost` as `oldRealized` so deltas accumulate rather than replace. The first attach moves the order from `estimatedLandedCostAtCompletion` -> `line1Realized`; the second attach moves it from the running `actualLandedCost` -> `running + line2Realized`. The invoice line records what it contributed, and the order's `actualLandedCost` is the running sum.

```
const oldRealized = order.actualLandedCost ?? order.estimatedLandedCostAtCompletion ?? legacyCostTotal
const incremental = newLineRealized
const newRealized = (order.actualLandedCost ?? 0) + incremental    // accumulating across lines
const poolDelta = -(newRealized - oldRealized)  // higher cost shrinks the margin pool

For each split key (alex, dj, kyle):
  delta_k = poolDelta * adjustedSplits[k]   // adjustedSplits = applyDeliveryBump(splits, deliveryBumpAtCompletion, deliveredBy)

Update meta/crewEarnings.members[k]:
  totalEarned += delta_k
  balance += delta_k
  Append to meta/crewEarnings.members[k].adjustments:
    { orderId, oldBalance, newBalance, delta: delta_k, reason: 'invoice-reconcile',
      invoiceId, lineMspn, acknowledgedBy: null, acknowledgedAt: null, createdAt: serverTimestamp }

Update order:
  actualLandedCost = newRealized
  invoiceLineRef = `invoices/${invoiceId}` (line index implicit)

Append orders/{id}/costAudit:
  { setBy, setAt, oldEstimated, oldActual, newEstimated, newActual, source: 'invoice-reconcile' }

Update invoices/{id}.lines[i].attachedOrderId etc.
```

If the order's `deliveredBy` is set, the bump-tracking fields (`totalDeliveryBumps`, `deliveryBumpCount`) need to update too: the dollar delta on the bumped split moves with the new pool. Detail in plan.

The recompute logic shares with `applyDeliveredByChange` from the just-shipped DJ delivery bump - both adjust crew earnings against a different cost model on a single order. Extract to a shared `applyOrderCostChange` helper or compose the existing one. Plan time decision.

### Failure modes

- **Invoice already imported** (same `docNumber`): block import with a clear error.
- **Line cannot be matched** (no DR + admin can't find a candidate): line stays in the review queue forever; cost doesn't reconcile until it's manually attached or explicitly dismissed. Add a "Dismiss line (no portal order)" action for off-portal purchases.
- **Auto-attach picks wrong order** (rare; same MSPN, same qty, same DR somehow on multiple orders): manual review queue still shows the line; admin can re-attach to a different order, which fires another recompute (reversing the wrong one and applying the right one).
- **Order completed before this lands** (no `dr`, no `estimatedLandedCostAtCompletion`): manual queue catches it. Admin can attach; recompute uses `legacyCostTotal` as the "old realized" for the delta calc.

## Crew visibility

`meta/crewEarnings.members.{k}.adjustments` is the source of truth for pending reconcile entries.

### Web

New page or section `/people/earnings` (admin sees all crew; non-admin sees just self):

- Top: current balance + total earned + total paid (existing data, just newly surfaced for self-service)
- "Pending adjustments" panel: listing entries where `acknowledgedBy === null`. Each row shows `Order #abc - cost reconciled - delta -$12.45 - 2026-04-30`. One-click "Acknowledge" sets `acknowledgedBy: uid, acknowledgedAt: serverTimestamp` (does not undo the balance change; just clears the flag).

### Slack

`/owed` per-member line gets a callout when there are unacked entries:

```
*DJ* - earned $1,240.00 (incl. $25 from 2 delivered orders) - balance $980.00
   :warning: 2 reconcile adjustments pending (net -$28.40)
```

### Optional Slack DM

When an adjustment is written, post a DM to the affected member (mapping uid -> Slack user id via existing pattern, e.g. `users/{uid}.slackUserId`):

```
Heads up - your balance was just adjusted by -$12.45 because order #abc was
reconciled against the eFleet invoice DA0065549567.

New balance: $980.00. Acknowledge in the portal: <link>
```

Default on. Codified for v1; an admin toggle UI is deferred.

## Data fields summary

| Doc / collection | New |
|---|---|
| `tires/{id}` | nothing |
| `meta/payoutConfig.taxes` | nothing (already in shape) |
| `orders/{id}` | `dr` (string, nullable), `estimatedLandedCostAtCompletion` (number), `actualLandedCost` (number, nullable), `invoiceLineRef` (string, nullable) |
| `orders/{id}/costAudit/{id}` | new subcollection per the schema above |
| `meta/crewEarnings.members.{k}.adjustments` | array of pending entries (or split to a subcollection if growth becomes a problem; v1 array is fine - one entry per reconcile per member, expected order of magnitude is dozens/year) |
| `invoices/{docNumber}` | new collection per the schema above |

## Files touched (estimate)

**New:**
- `src/utils/tireLandedBuy.js` + `src/utils/tireLandedBuy.test.js`
- `functions/payoutConfig.js` (add `tireLandedBuyNumber` export; tests in existing `payoutConfig.test.mjs`)
- `scripts/import-efleet-invoice.mjs` + tests + fixture
- `src/pages/AdminEFleetInvoicesPage.jsx` (or extend existing AdminEFleetPage with a tab)
- `src/components/admin/efleet/InvoiceImportPanel.jsx` + test
- `src/components/admin/efleet/InvoiceLineReviewQueue.jsx` + test
- `functions/applyOrderCostChange.js` (shared recompute helper) + tests
- `functions/importInvoice.js` (callable that writes the invoice doc + auto-attaches) + tests
- `functions/attachInvoiceLine.js` (callable for manual attach) + tests
- `functions/acknowledgeAdjustment.js` (callable for the ack click) + tests
- `src/pages/PeopleEarningsPage.jsx` (or section on existing People page)
- `src/components/people/PendingAdjustmentsPanel.jsx` + test

**Modified:**
- `src/utils/marginCalc.js` (computeBundleQuote / computeListingMargin take landed buy)
- `src/components/tires/QuoteCalculator.jsx` (use landed; show breakdown reference)
- `src/components/tires/detail/TirePricingCard.jsx` (Buy row = landed; breakdown chip)
- `src/components/tires/MarginTable.jsx` (margin uses landed)
- `src/utils/opportunityScore.js`
- `src/utils/tireCatalogBuy.js` (no change to the helper itself; consumers move off it)
- `functions/orders.js` (`completeOrder` writes `estimatedLandedCostAtCompletion` and accepts an optional `dr` field)
- `functions/financeStats.js` (`completedOrderMarginPool` uses `actualLandedCost ?? estimatedLandedCostAtCompletion ?? legacy`)
- `functions/financeSlackCommands.js` (`/owed` adds the pending-adjustments callout)
- `functions/index.js` (register new callables)
- `src/components/orders/OrdersList.jsx` (DR field on the complete modal: optional text input below payment amount)

## Out of scope (deferred)

- Per-jurisdiction tax rates (CO-only for v1; if Skedaddle ever ships out of state, extend `payoutConfig.taxes` to a list of rules keyed by ship-to zip)
- Auto-import from email / Drive (manual upload only for v1)
- Vendors other than Michelin (Continental, Goodyear, etc.)
- Backfill of historical orders (per Q6 C: clean break, only orders completed after this lands get the new model; analytics will show a visible cliff at the cutover, which is fine)
- Admin toggle UI for the Slack DM on adjustment (codified on for v1)
- Multi-DR-per-invoice (Michelin's reports today are 1 invoice = 1 DR)

## Testing plan

- `tireLandedBuyNumber`: zero buy, zero rates, only-fet, only-fee, all-zero, full case (LT265 KO3 example: 220.35 + 0 + 220.35*0.0723 + 2 = 238.28)
- `completedOrderMarginPool` with each cost source present: actual > estimated > legacy
- `applyOrderCostChange` shared helper: estimated -> actual, actual -> revised actual, with deliveredBy set, with deliveredBy null, when bump > 0, when bump = 0, edge case oldOthersTotal = 0
- `import-efleet-invoice` parser: full fixture from one of the brainstorm screenshots, including discount lines and the no-bonus aggregate line
- `importInvoice` callable: idempotent on docNumber, writes invoice doc, auto-attaches by DR, fires recompute exactly once per line, transaction integrity
- `attachInvoiceLine` callable: re-attach changes target order, recompute reverses prior, idempotent
- `acknowledgeAdjustment` callable: sets the ack fields, doesn't touch the delta
- Web component tests: `InvoiceImportPanel` (drop -> preview -> commit), `InvoiceLineReviewQueue` (rank + click-to-attach), `PendingAdjustmentsPanel` (list + ack)
- Lint + bundle + full vitest after each task

## Verification

Manual smoke after each ship:
1. Mark a delivery order complete with payment. Order doc has `estimatedLandedCostAtCompletion`. Slack `/owed` shows the new earnings split (computed off landed, not catalog).
2. Upload one of the brainstorm-screenshot invoices. Importer auto-attaches one line; one line lands in the review queue (DR mismatch on that fixture). Manually attach. Slack DM fires to the affected crew member. `/owed` shows the pending adjustment.
3. Ack the adjustment in the web People page. Subline disappears from `/owed`.
4. Catalog quote on a high-FET tire (e.g. an LR-G truck tire) shows the FET in the breakdown and rolls into the displayed Buy. Margin % matches expectation (= (rev - landed)/rev).
