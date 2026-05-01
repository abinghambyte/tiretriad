# Landed-cost rollup (v1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quotes, margins, opportunity scores, and crew earnings reflect true landed cost (catalog price + FET + wholesale tax + tire fee), with an admin invoice importer that overrides estimated landed with the actual eFleet invoice line and triggers an atomic crew-earnings recompute with crew-visible adjustment entries.

**Architecture:** Three layers - catalog (unchanged) + predictive landed (computed-on-read pure helper, both client and server) + realized landed (snapshotted at completion, optionally overridden by importer). Importer parses Michelin invoice HTML, hybrid auto-attaches by DR, manual review queue for the rest. Reconcile fires atomic Firestore transaction reusing the `applyDeliveredByChange` recompute pattern. Crew sees pending adjustments + ack flow.

**Tech Stack:** Firebase Functions v2 (Node 22), Firestore, Vitest, React 19 + Vite + Tailwind v4, Slack Block Kit, Anthropic SDK (no AI in this feature; just sharing the existing stack).

**Spec:** `docs/superpowers/specs/2026-05-01-landed-cost-design.md`

**Worktree:** `.claude/worktrees/landed-cost` (branch `landed-cost`).

**Style guardrails (project-wide):**
- NO em dashes anywhere (use a regular hyphen with spaces or restructure the sentence)
- NO AI / Co-Authored-By trailers in commits
- CommonJS in `functions/`, ESM in `src/` and `scripts/`
- Vitest with plain `expect` and `fireEvent`. NO jest-dom matchers (`.toBeInTheDocument()` etc.); use `expect(el).not.toBeNull()`.

---

## File map

| File | Change | Responsibility |
|---|---|---|
| `src/utils/tireLandedBuy.js` | Create | `tireLandedBuyNumber(tire, taxes)` pure helper (client) |
| `src/utils/tireLandedBuy.test.js` | Create | Unit tests |
| `functions/payoutConfig.js` | Modify | Add `tireLandedBuyNumber` export so client + server math is identical |
| `functions/payoutConfig.test.mjs` | Modify | Tests for the server-side helper |
| `src/utils/marginCalc.js` | Modify | `computeBundleQuote` and `computeListingMargin` accept landed buy |
| `src/utils/marginCalc.test.js` | Modify | Updated cases |
| `src/components/tires/QuoteCalculator.jsx` | Modify | Buy total = landed; FET / tax / fee shown as broken-out reference rows |
| `src/components/tires/detail/TirePricingCard.jsx` | Modify | Buy row = landed; breakdown shown inline |
| `src/components/tires/detail/TirePricingCard.test.jsx` | Modify | Updated assertions |
| `src/components/tires/MarginTable.jsx` | Modify | Margin column off landed |
| `src/utils/opportunityScore.js` | Modify | Off landed |
| `src/utils/opportunityScore.test.js` | Modify | Updated cases |
| `functions/orders.js` | Modify | `completeOrder` writes `estimatedLandedCostAtCompletion` and accepts optional `dr` |
| `functions/orders.deliveredBy.test.mjs` (or new) | Modify | New cases for the field writes |
| `functions/financeStats.js` | Modify | `completedOrderMarginPool` uses `actualLandedCost ?? estimatedLandedCostAtCompletion ?? legacy` |
| `functions/financeStats.test.mjs` | Modify | Cases for each cost source |
| `src/components/orders/OrdersList.jsx` | Modify | DR text input on the complete modal |
| `scripts/import-efleet-invoice.mjs` | Create | Pure parser for Michelin invoice HTML |
| `scripts/import-efleet-invoice.test.mjs` | Create | Tests with fixture |
| `scripts/__fixtures__/efleet-invoice-sample.html` | Create | Fixture from one of the brainstorm screenshots |
| `functions/applyOrderCostChange.js` | Create | Shared recompute helper (used by importInvoice + attachInvoiceLine) |
| `functions/applyOrderCostChange.test.mjs` | Create | Tests |
| `functions/importInvoice.js` | Create | Callable: write invoice doc + auto-attach by DR |
| `functions/importInvoice.test.mjs` | Create | Tests |
| `functions/attachInvoiceLine.js` | Create | Callable: manual attach (re-attach OK, idempotent) |
| `functions/attachInvoiceLine.test.mjs` | Create | Tests |
| `functions/acknowledgeAdjustment.js` | Create | Callable: ack a pending adjustment entry |
| `functions/acknowledgeAdjustment.test.mjs` | Create | Tests |
| `functions/index.js` | Modify | Register the three new callables |
| `src/pages/AdminEFleetInvoicesPage.jsx` | Create | Admin route |
| `src/components/admin/efleet/InvoiceImportPanel.jsx` | Create | Drop zone + preview + commit |
| `src/components/admin/efleet/InvoiceImportPanel.test.jsx` | Create | Tests |
| `src/components/admin/efleet/InvoiceLineReviewQueue.jsx` | Create | Pending lines + ranked candidates |
| `src/components/admin/efleet/InvoiceLineReviewQueue.test.jsx` | Create | Tests |
| `src/pages/PeopleEarningsPage.jsx` | Create | Per-member balance + pending adjustments |
| `src/components/people/PendingAdjustmentsPanel.jsx` | Create | Adjustment list + ack |
| `src/components/people/PendingAdjustmentsPanel.test.jsx` | Create | Tests |
| `functions/financeSlackCommands.js` | Modify | `/owed` adds pending-adjustments callout |
| `functions/financeSlackCommands.test.mjs` | Modify | Tests for the callout |
| `functions/slackAdjustmentDm.js` | Create | Send DM to crew member on adjustment write |
| `src/router.jsx` (or wherever routes register) | Modify | Mount `/admin/efleet/invoices` and `/people/earnings` |

---

## Task 1: `tireLandedBuyNumber` pure helper (client + server)

**Files:**
- Create: `src/utils/tireLandedBuy.js`
- Create: `src/utils/tireLandedBuy.test.js`
- Modify: `functions/payoutConfig.js`
- Modify: `functions/payoutConfig.test.mjs`

- [ ] **Step 1: Write the failing client tests**

Create `src/utils/tireLandedBuy.test.js`:

```js
import { describe, expect, it } from 'vitest'
import { tireLandedBuyNumber } from './tireLandedBuy.js'

const COTaxes = {
  countyTaxPct: 0.0109,
  localTaxPct: 0.0312,
  stateTaxPct: 0.0302,
  tireFeePerTire: 2.0,
}

describe('tireLandedBuyNumber', () => {
  it('returns 0 when buy is 0', () => {
    expect(tireLandedBuyNumber({ price: 0 }, COTaxes)).toBe(0)
    expect(tireLandedBuyNumber(null, COTaxes)).toBe(0)
  })

  it('adds FET, wholesale tax, and tire fee', () => {
    // 220.35 (price) + 0 (FET) + 220.35 * 0.0723 (tax) + 2 (fee)
    // = 220.35 + 15.93 + 2 = 238.28
    const r = tireLandedBuyNumber({ price: 220.35, fet: 0 }, COTaxes)
    expect(r).toBeCloseTo(238.28, 2)
  })

  it('treats fet > 0 additively', () => {
    // 499 + 25.23 + 499 * 0.0723 + 2 = 562.30
    const r = tireLandedBuyNumber({ price: 499, fet: 25.23 }, COTaxes)
    expect(r).toBeCloseTo(562.31, 2)
  })

  it('prefers priceIntel.activeBuyPrice when present', () => {
    const tire = { price: 220, fet: 0, priceIntel: { activeBuyPrice: 240 } }
    // 240 + 0 + 240 * 0.0723 + 2 = 259.35
    expect(tireLandedBuyNumber(tire, COTaxes)).toBeCloseTo(259.35, 2)
  })

  it('returns just buy + fet when taxes are zero', () => {
    const r = tireLandedBuyNumber(
      { price: 100, fet: 5 },
      { countyTaxPct: 0, localTaxPct: 0, stateTaxPct: 0, tireFeePerTire: 0 },
    )
    expect(r).toBe(105)
  })

  it('treats missing taxes object as all-zero (defensive)', () => {
    expect(tireLandedBuyNumber({ price: 100, fet: 0 }, null)).toBe(100)
    expect(tireLandedBuyNumber({ price: 100, fet: 0 }, undefined)).toBe(100)
  })
})
```

- [ ] **Step 2: Run, verify failure**

`cd .claude/worktrees/landed-cost && npx vitest run src/utils/tireLandedBuy.test.js`

Expected: FAIL (module missing).

- [ ] **Step 3: Implement client helper**

Create `src/utils/tireLandedBuy.js`:

```js
import { tireCatalogBuyNumber } from './tireCatalogBuy.js'

/**
 * Landed buy cost per tire = catalog buy + FET + wholesale sales tax + tire fee.
 * Pure / computed on read - never stored on the tire doc.
 *
 * Wholesale sales tax base is the catalog buy (not buy + FET; matches how the
 * eFleet invoice computes it: tax is on Bonus Total which is qty * net unit
 * price, FET is a separate aggregate line).
 *
 * @param {Record<string, unknown> | null | undefined} tire
 * @param {Record<string, unknown> | null | undefined} taxes  meta/payoutConfig.taxes shape
 * @returns {number}
 */
export function tireLandedBuyNumber(tire, taxes) {
  const buy = tireCatalogBuyNumber(tire)
  if (!Number.isFinite(buy) || buy <= 0) return 0
  const fet = Number(tire?.fet) || 0
  const t = taxes && typeof taxes === 'object' ? taxes : {}
  const rate = (Number(t.countyTaxPct) || 0)
    + (Number(t.localTaxPct) || 0)
    + (Number(t.stateTaxPct) || 0)
  const fee = Number(t.tireFeePerTire) || 0
  return buy + fet + buy * rate + fee
}
```

- [ ] **Step 4: Verify pass**

`npx vitest run src/utils/tireLandedBuy.test.js` - all green.

- [ ] **Step 5: Server-side helper**

Add to `functions/payoutConfig.js` near `splitPool`:

```js
/**
 * Server-side mirror of src/utils/tireLandedBuy. Uses tire fields directly
 * since functions don't share the client tireCatalogBuyNumber helper.
 *
 * Buy resolution: priceIntel.activeBuyPrice -> price -> cost (matches client).
 *
 * @param {Record<string, unknown>} tire
 * @param {Record<string, unknown>} taxes
 * @returns {number}
 */
function tireLandedBuyNumber(tire, taxes) {
  const t = tire && typeof tire === 'object' ? tire : {}
  const pi = t.priceIntel && typeof t.priceIntel === 'object' ? t.priceIntel : {}
  let buy = Number(pi.activeBuyPrice)
  if (!Number.isFinite(buy) || buy <= 0) buy = Number(t.price)
  if (!Number.isFinite(buy) || buy <= 0) buy = Number(t.cost)
  if (!Number.isFinite(buy) || buy <= 0) return 0
  const fet = Number(t.fet) || 0
  const tx = taxes && typeof taxes === 'object' ? taxes : {}
  const rate = (Number(tx.countyTaxPct) || 0)
    + (Number(tx.localTaxPct) || 0)
    + (Number(tx.stateTaxPct) || 0)
  const fee = Number(tx.tireFeePerTire) || 0
  return buy + fet + buy * rate + fee
}
```

Add `tireLandedBuyNumber` to the `module.exports` block.

Add server-side tests to `functions/payoutConfig.test.mjs`:

```js
describe('tireLandedBuyNumber (server)', () => {
  const taxes = {
    countyTaxPct: 0.0109, localTaxPct: 0.0312, stateTaxPct: 0.0302, tireFeePerTire: 2,
  }
  it('matches the client helper case-for-case', () => {
    expect(tireLandedBuyNumber({ price: 220.35, fet: 0 }, taxes)).toBeCloseTo(238.28, 2)
    expect(tireLandedBuyNumber({ price: 499, fet: 25.23 }, taxes)).toBeCloseTo(562.31, 2)
    expect(tireLandedBuyNumber({ price: 0 }, taxes)).toBe(0)
    expect(tireLandedBuyNumber(null, taxes)).toBe(0)
  })
  it('priceIntel.activeBuyPrice takes precedence', () => {
    const tire = { price: 200, fet: 0, priceIntel: { activeBuyPrice: 240 } }
    expect(tireLandedBuyNumber(tire, taxes)).toBeCloseTo(259.35, 2)
  })
})
```

(The test file uses `createRequire` already; add the import line at top: `const { tireLandedBuyNumber } = require('./payoutConfig.js')` if not already present, or destructure from the existing require.)

- [ ] **Step 6: Run + commit**

```bash
cd .claude/worktrees/landed-cost
npx vitest run src/utils/tireLandedBuy.test.js functions/payoutConfig.test.mjs
git add src/utils/tireLandedBuy.js src/utils/tireLandedBuy.test.js functions/payoutConfig.js functions/payoutConfig.test.mjs
git commit -m "$(cat <<'EOF'
feat(landed-cost): tireLandedBuyNumber pure helper (client + server)

Returns catalog buy + FET + (catalog buy x wholesale tax rate) +
tire fee. Tax base matches eFleet invoice math: tax on Bonus Total
(price x qty), FET separate. Mirror exists on both sides so quote
display and crew-earnings math agree to the cent.
EOF
)"
```

---

## Task 2: Wire predictive landed into all consumers

**Files:**
- Modify: `src/utils/marginCalc.js`
- Modify: `src/utils/marginCalc.test.js`
- Modify: `src/utils/opportunityScore.js`
- Modify: `src/utils/opportunityScore.test.js`
- Modify: `src/components/tires/QuoteCalculator.jsx`
- Modify: `src/components/tires/detail/TirePricingCard.jsx`
- Modify: `src/components/tires/detail/TirePricingCard.test.jsx`
- Modify: `src/components/tires/MarginTable.jsx`

- [ ] **Step 1: Recon**

Read each consumer to find the exact call site that pulls `tireCatalogBuyNumber`. Note the existing function signatures. The `usePayoutConfig` hook (`src/hooks/usePayoutConfig.js`) already exists; reuse it for taxes.

Run: `grep -rn "tireCatalogBuyNumber\|computeBundleQuote\|computeListingMargin\|opportunityScore" src/`

- [ ] **Step 2: Update `marginCalc.js`**

`computeBundleQuote` and `computeListingMargin` already accept `buyPerTire` as a parameter. No signature change is needed; callers just pass landed instead of catalog. Verify by reading the function bodies: as long as they're not internally re-deriving buy from a tire object, no change. If they ARE, refactor to take `buyPerTire` as a number.

Add a JSDoc note on each: `@param {number} buyPerTire - landed cost per tire (use tireLandedBuyNumber, not tireCatalogBuyNumber)`.

If the existing tests test `computeBundleQuote({ buyPerTire: 220 })` directly with catalog-shaped numbers, leave them alone - the helper is shape-agnostic. Add ONE new test that documents the integration intent:

```js
it('computeBundleQuote with landed buy reflects post-tax margin', () => {
  // 4 x 238.28 (landed) sold at 4 x 291 -> margin = (1164 - 953.12) / 1164 = 18.1%
  const q = computeBundleQuote({ qty: 4, salePrice: 291, buyPerTire: 238.28, overheadPerTire: 3, fetPerTire: 0 })
  expect(q.marginPct).toBeCloseTo(18.1, 1)
})
```

- [ ] **Step 3: Update `opportunityScore.js`**

Find the buy-resolution call inside the score function. Replace `tireCatalogBuyNumber(tire)` with a takes-landed-precomputed approach: thread `buyPerTire` (a number) into the function signature, or accept a pre-resolved landed via a config. Keep YAGNI: simplest patch is to add a second arg `taxes` and call `tireLandedBuyNumber(tire, taxes)` internally.

```js
import { tireLandedBuyNumber } from './tireLandedBuy.js'

export function opportunityScore(tire, options = {}) {
  // ... existing prelude
  const taxes = options.taxes || null
  const buy = tireLandedBuyNumber(tire, taxes)
  // ... rest of the function uses `buy` (was `tireCatalogBuyNumber(tire)`)
}
```

Update every caller of `opportunityScore` to pass `{ taxes: payoutConfig?.taxes }`. Grep `opportunityScore(` to find them. Most likely callers: `MarginTable.jsx`, `useDashboardSignals.js`, hidden gems surface.

Update tests so each existing case passes a `taxes` object (use `{ countyTaxPct: 0, localTaxPct: 0, stateTaxPct: 0, tireFeePerTire: 0 }` to keep numerics identical to before).

Add ONE new test that documents the landed integration:

```js
it('opportunityScore drops when landed cost is applied', () => {
  const tire = { price: 220, fet: 0, mspn: 'X' /* etc minimal */ }
  const noTax = { countyTaxPct: 0, localTaxPct: 0, stateTaxPct: 0, tireFeePerTire: 0 }
  const coTax = { countyTaxPct: 0.0109, localTaxPct: 0.0312, stateTaxPct: 0.0302, tireFeePerTire: 2 }
  const a = opportunityScore(tire, { taxes: noTax /* + whatever else the function needs */ })
  const b = opportunityScore(tire, { taxes: coTax })
  expect(b).toBeLessThan(a)
})
```

(Test fixtures will need whatever else `opportunityScore` requires - check the function body. Mirror an existing passing test's setup.)

- [ ] **Step 4: `QuoteCalculator.jsx` - landed buy + breakdown rows**

Replace the "Buy cost total" row computation. Pull taxes from `usePayoutConfig`:

```jsx
import { tireLandedBuyNumber } from '../../utils/tireLandedBuy.js'

// Inside the component:
const { config: payoutConfig } = usePayoutConfig()
const taxes = payoutConfig?.taxes || null
const landedPerTire = tireLandedBuyNumber(tire, taxes)
const taxRate = (Number(taxes?.countyTaxPct) || 0)
  + (Number(taxes?.localTaxPct) || 0)
  + (Number(taxes?.stateTaxPct) || 0)
const buyCatalogPerTire = tireCatalogBuyNumber(tire)
const wholesaleTaxPerTire = buyCatalogPerTire * taxRate
const tireFeePerTire = Number(taxes?.tireFeePerTire) || 0
```

Pass `landedPerTire` as `buyPerTire` to `computeBundleQuote`. The returned `quote.buyTotal` is now landed total.

Replace the existing "Buy cost total" row sub-text (`${quote.qty} x ${formatCurrency(buyPerTire)}`) with `Buy total (incl. FET / tax / fee)`. Below it, add three reference rows (muted, like the existing FET row):

```jsx
{retailPerTire > 0 ? (
  /* existing retail row */
) : null}
<QuoteRow
  label="Buy (catalog)"
  sub={`${quote.qty} x ${formatCurrencyOrDash(buyCatalogPerTire)}`}
  value={formatCurrency(quote.qty * buyCatalogPerTire)}
  muted
/>
{fetPerTire > 0 ? (
  <QuoteRow
    label="FET"
    sub={`${quote.qty} x ${formatCurrencyOrDash(fetPerTire)}`}
    value={formatCurrency(quote.qty * fetPerTire)}
    muted
  />
) : null}
<QuoteRow
  label="Wholesale tax"
  sub={`${(taxRate * 100).toFixed(2)}% on catalog buy`}
  value={formatCurrency(quote.qty * wholesaleTaxPerTire)}
  muted
/>
<QuoteRow
  label="CO tire fee"
  sub={`${quote.qty} x ${formatCurrency(tireFeePerTire)}`}
  value={formatCurrency(quote.qty * tireFeePerTire)}
  muted
/>
```

Strip the FET-already-in-buy comment and the `fetPerTire: 0` hack:

```jsx
const quote = useMemo(
  () => computeBundleQuote({
    qty: Number(quantity) || 0,
    salePrice: Number(salePrice) || 0,
    buyPerTire: landedPerTire,
    overheadPerTire,
    fetPerTire: 0,  // FET is already inside landed; keep for back-compat
  }),
  [quantity, salePrice, landedPerTire, overheadPerTire],
)
```

- [ ] **Step 5: `TirePricingCard.jsx` - landed Buy + breakdown chip**

Same pattern. Replace the current "Buy" row with landed; change the row label to "Buy (landed)". Below the existing rows, insert a small breakdown block when expanded (or always-on if simpler):

```jsx
const taxes = payoutCfg?.taxes  // already available via usePayoutConfig in this file
const landed = tireLandedBuyNumber(tire, taxes)
// ...
<dl>
  {row('Buy (landed)', fmtNum(landed))}
  {row('Catalog', fmtNum(buy), 'font-mono text-zinc-500')}
  {fet > 0 ? row('FET / tire', fmtFet(fet)) : null}
  {row('Wholesale tax', fmtFet(buy * taxRate))}
  {row('CO tire fee', fmtFet(taxFee))}
  {row('Retail', fmtNum(retail), retailClass)}
  {row('Margin', fmtPct(margin))}
</dl>
```

Update `computeListingMargin` callers in this file to pass landed.

Update `TirePricingCard.test.jsx`:
- The "shows $238.28 as Buy (landed)" assertion replaces "shows $220.35 as Buy" if any such assertion exists.
- Existing test fixtures need a `payoutCfg` mock with the taxes shape.

- [ ] **Step 6: `MarginTable.jsx` - margin off landed**

Find the row-level margin compute. Swap `tireCatalogBuyNumber` -> `tireLandedBuyNumber(tire, taxes)`. Pull `taxes` once at the top of the component via `usePayoutConfig`.

If the table's "Buy" column header is rendered, change its label to "Landed" or "Buy (landed)" to match the new semantic.

- [ ] **Step 7: Run full client suite + lint**

```bash
cd .claude/worktrees/landed-cost
npx vitest run src/
npm run lint
```

Both clean.

- [ ] **Step 8: Commit**

```bash
git add -u src/
git commit -m "$(cat <<'EOF'
feat(landed-cost): wire predictive landed into all consumers

QuoteCalculator, TirePricingCard, MarginTable, marginCalc, and
opportunityScore now key off tireLandedBuyNumber instead of
tireCatalogBuyNumber. Quote modal shows the breakdown (catalog +
FET + wholesale tax + CO tire fee) for transparency. Tax rates pulled
from meta/payoutConfig.taxes via usePayoutConfig hook.
EOF
)"
```

---

## Task 3: `completeOrder` writes `estimatedLandedCostAtCompletion` + accepts `dr` field

**Files:**
- Modify: `functions/orders.js`
- Modify: `functions/orders.deliveredBy.test.mjs` (or wherever the tests live; check via grep)
- Modify: `functions/financeStats.js`
- Modify: `functions/financeStats.test.mjs`
- Modify: `src/components/orders/OrdersList.jsx`

- [ ] **Step 1: Failing tests for the snapshot**

Add to `functions/orders.deliveredBy.test.mjs` (or create `functions/orders.landedCost.test.mjs` if cleaner):

```js
describe('completeOrder - estimatedLandedCostAtCompletion', () => {
  it('snapshots estimated landed using payoutConfig.taxes', () => {
    // 4 tires of MSPN A at price 220.35, fet 0, with CO taxes
    // Each tire landed = 220.35 + 0 + 220.35*0.0723 + 2 = 238.28
    // Order total = 4 * 238.28 = 953.13
    // Test asserts the order doc gains estimatedLandedCostAtCompletion ~953.13
  })
  it('accepts a dr string', () => {
    // payload includes dr: 'DR3611350'; order doc gains dr field
  })
  it('rejects a non-string dr', () => {
    // HttpsError invalid-argument
  })
})
```

(Concrete mock setup mirrors existing tests; if the existing test file mocks the order's tire array shape - e.g. `order.tires: [{ mspn, qty }]` - mirror that.)

- [ ] **Step 2: Implement in `functions/orders.js`**

Inside `completeOrder`:

```js
const { tireLandedBuyNumber, loadPayoutConfig } = require('./payoutConfig')

// ... after pulling order data:

// Validate dr
const drRaw = data?.dr
const drNormalized = drRaw === undefined || drRaw === null
  ? null
  : (typeof drRaw === 'string' ? drRaw.trim().slice(0, 64) : null)
if (drRaw !== undefined && drRaw !== null && typeof drRaw !== 'string') {
  throw new HttpsError('invalid-argument', 'dr must be a string or null')
}

// Snapshot estimated landed across all tires on the order
const payoutCfg = await loadPayoutConfig(db)  // already loaded in completeOrder for deliveryBump
const taxes = payoutCfg.taxes
let estimatedLandedCost = 0
for (const line of (Array.isArray(d.tires) ? d.tires : [])) {
  const tireSnap = await db.collection('tires').doc(String(line.mspn)).get()
  const tire = tireSnap.exists ? tireSnap.data() : null
  if (!tire) continue
  const qty = Number(line.qty) || 0
  estimatedLandedCost += qty * tireLandedBuyNumber(tire, taxes)
}
estimatedLandedCost = Math.round(estimatedLandedCost * 100) / 100  // round2

// Extend completionPatch
completionPatch.estimatedLandedCostAtCompletion = estimatedLandedCost
completionPatch.dr = drNormalized
completionPatch.actualLandedCost = null  // explicit so downstream can read with ??
completionPatch.invoiceLineRef = null
```

Verify the order data shape (`d.tires` vs `d.lineItems` etc.); read the existing code to confirm.

- [ ] **Step 3: `completedOrderMarginPool` uses the new field**

In `functions/financeStats.js`, find `completedOrderMarginPool`. Update:

```js
function completedOrderMarginPool(paymentAmount, order, tireData) {
  const pay = Number(paymentAmount) || 0
  const actual = Number(order?.actualLandedCost)
  if (Number.isFinite(actual) && actual >= 0) return Math.max(0, pay - actual)
  const estimated = Number(order?.estimatedLandedCostAtCompletion)
  if (Number.isFinite(estimated) && estimated >= 0) return Math.max(0, pay - estimated)
  // Legacy fallback: pre-feature orders use the existing tire-based cost calc.
  // (Keep the existing body of completedOrderMarginPool as the fallback.)
  return Math.max(0, pay - legacyCostTotal(order, tireData))
}
```

Extract today's body into `legacyCostTotal` if the swap is non-trivial.

Add tests in `functions/financeStats.test.mjs`:

```js
describe('completedOrderMarginPool - cost source priority', () => {
  it('uses actualLandedCost when present', () => {
    expect(completedOrderMarginPool(1000, { actualLandedCost: 800 }, {})).toBe(200)
  })
  it('falls back to estimatedLandedCostAtCompletion', () => {
    expect(completedOrderMarginPool(1000, { estimatedLandedCostAtCompletion: 850 }, {})).toBe(150)
  })
  it('falls back to legacy when neither is set', () => {
    // Use whatever shape legacyCostTotal expects; assert numeric output.
  })
  it('clamps to >= 0', () => {
    expect(completedOrderMarginPool(500, { actualLandedCost: 700 }, {})).toBe(0)
  })
})
```

- [ ] **Step 4: OrdersList - DR text input**

In `src/components/orders/OrdersList.jsx`, complete modal:

```jsx
const [dr, setDr] = useState('')

// In openComplete:
setDr(orderRow?.dr || '')

// In submitComplete payload:
await completeOrder({
  orderId: completeFor,
  paymentReceived,
  paymentAmount: amt,
  deliveredBy: completeIsDelivery ? deliveredBy : null,
  dr: dr.trim() || null,
})
```

Add a label + input below the payment amount field:

```jsx
<label className="mt-3 block text-xs font-medium text-zinc-400">
  DR # (optional, from eFleet invoice)
  <input
    type="text"
    value={dr}
    onChange={(e) => setDr(e.target.value)}
    maxLength={64}
    placeholder="DR3611350"
    className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
  />
</label>
```

- [ ] **Step 5: Run + commit**

```bash
cd .claude/worktrees/landed-cost
npx vitest run functions/ src/components/orders/
npm run lint
git add -u functions/ src/components/orders/
git commit -m "$(cat <<'EOF'
feat(orders): completeOrder snapshots estimated landed + accepts DR

estimatedLandedCostAtCompletion = sum of qty * tireLandedBuyNumber
across the order's tires, computed against the live payoutConfig.taxes
at completion time. dr is optional (admin can fill later via the
invoice importer attach flow). completedOrderMarginPool prefers
actualLandedCost > estimatedLandedCostAtCompletion > legacy fallback.
OrdersList complete modal exposes the DR input.
EOF
)"
```

---

## Task 4: Invoice parser

**Files:**
- Create: `scripts/import-efleet-invoice.mjs`
- Create: `scripts/import-efleet-invoice.test.mjs`
- Create: `scripts/__fixtures__/efleet-invoice-sample.html`

- [ ] **Step 1: Build the fixture**

Create `scripts/__fixtures__/efleet-invoice-sample.html` from the structure shown in the brainstorm screenshots. Minimal viable doc:

```html
<!DOCTYPE html>
<html><head><title>Invoice</title></head>
<body>
<table>
<tr><th>Invoice</th><td>DA0065549567</td></tr>
<tr><th>Date</th><td>03/02/2026</td></tr>
<tr><th>Document Date</th><td>02/27/2026</td></tr>
<tr><th>PO#</th><td>8008135</td></tr>
<tr><th>Order #</th><td>D01469792</td></tr>
<tr><th>Cross Reference</th><td>DR3603421</td></tr>
</table>

<table class="invoice-lines">
<tr><th>Units</th><th>Brand / Product Code</th><th>Unit Price</th><th>Discount</th><th>Net Unit Price</th><th>Unit FET</th><th>Total Extended Amount</th></tr>
<tr><td>8</td><td>M / 19901</td><td>$758.00</td><td>$259.00-</td><td>$499.00</td><td>$25.23</td><td>$4,193.84</td></tr>
</table>

<table class="invoice-aggregates">
<tr><td>A4129 COUNTY TAX COLORADO</td><td>$44.04</td></tr>
<tr><td>D1305 LOCAL TAX COLORADO</td><td>$125.82</td></tr>
<tr><td>K3966 STATE TAX COLORADO</td><td>$121.62</td></tr>
<tr><td>J4221 COLORADO TIRE FEE</td><td>$16.00</td></tr>
</table>

<table class="invoice-totals">
<tr><td>Bonus Total</td><td>$3,992.00</td></tr>
<tr><td>No Bonus Total</td><td>$307.48</td></tr>
<tr><td>F.E.T. Total</td><td>$201.84</td></tr>
<tr><td>Invoice Total</td><td>$4,501.32</td></tr>
</table>
</body></html>
```

(Adjust to match the exact structure of the real eFleet invoice HTML when the implementer has access to it; the parser should be robust to whitespace and class-name variation.)

- [ ] **Step 2: Failing tests**

Create `scripts/import-efleet-invoice.test.mjs`:

```js
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { parseEfleetInvoice } from './import-efleet-invoice.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const fixture = readFileSync(join(__dirname, '__fixtures__', 'efleet-invoice-sample.html'), 'utf8')

describe('parseEfleetInvoice', () => {
  it('extracts document-level metadata', () => {
    const inv = parseEfleetInvoice(fixture)
    expect(inv.docNumber).toBe('DA0065549567')
    expect(inv.dr).toBe('DR3603421')
    expect(inv.poNumber).toBe('8008135')
    expect(inv.orderNumber).toBe('D01469792')
    expect(inv.docDate).toBe('2026-02-27')
  })
  it('extracts each invoice line', () => {
    const inv = parseEfleetInvoice(fixture)
    expect(inv.lines).toHaveLength(1)
    const [l] = inv.lines
    expect(l.mspn).toBe('19901')
    expect(l.qty).toBe(8)
    expect(l.unitPrice).toBeCloseTo(758, 2)
    expect(l.discount).toBeCloseTo(259, 2)
    expect(l.netUnitPrice).toBeCloseTo(499, 2)
    expect(l.unitFet).toBeCloseTo(25.23, 2)
    expect(l.extended).toBeCloseTo(4193.84, 2)
  })
  it('extracts aggregates and totals', () => {
    const inv = parseEfleetInvoice(fixture)
    expect(inv.countyTax).toBeCloseTo(44.04, 2)
    expect(inv.localTax).toBeCloseTo(125.82, 2)
    expect(inv.stateTax).toBeCloseTo(121.62, 2)
    expect(inv.tireFee).toBeCloseTo(16, 2)
    expect(inv.bonusTotal).toBeCloseTo(3992, 2)
    expect(inv.fetTotal).toBeCloseTo(201.84, 2)
    expect(inv.invoiceTotal).toBeCloseTo(4501.32, 2)
  })
  it('throws on empty input', () => {
    expect(() => parseEfleetInvoice('')).toThrow(/empty input/i)
  })
  it('throws on malformed input (no invoice metadata)', () => {
    expect(() => parseEfleetInvoice('<html><body>nothing here</body></html>'))
      .toThrow(/malformed/i)
  })
})
```

- [ ] **Step 3: Run, verify failure, implement**

`npx vitest run scripts/import-efleet-invoice.test.mjs` (FAIL).

Create `scripts/import-efleet-invoice.mjs`:

```js
/**
 * Parse a Michelin eFleet invoice HTML page into structured data.
 * Pure function - no Firestore writes. CLI wiring (if any) lives elsewhere.
 *
 * The parser is resilient to whitespace and uses substring matches on
 * stable column headers (Invoice, Date, Document Date, PO#, Order #,
 * Cross Reference) rather than depending on class names that can drift.
 */

const NUMERIC_RE = /-?\$?[\d,]+(?:\.\d+)?-?/

function clean(s) {
  return String(s || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseMoney(s) {
  if (s == null) return 0
  const str = String(s).replace(/[$,\s]/g, '').replace(/-$/, '')
  const negative = String(s).trim().endsWith('-')
  const n = Number(str)
  if (!Number.isFinite(n)) return 0
  return negative ? -n : n
}

function findCellAfterLabel(html, label) {
  const re = new RegExp(`${label}[\\s\\S]*?<td[^>]*>([\\s\\S]*?)</td>`, 'i')
  const m = html.match(re)
  return m ? clean(m[1]) : null
}

function findMoneyAfterLabel(html, label) {
  const c = findCellAfterLabel(html, label)
  return c ? parseMoney(c) : 0
}

function parseDocDate(s) {
  // 02/27/2026 -> 2026-02-27
  const m = String(s || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (!m) return null
  const mm = String(m[1]).padStart(2, '0')
  const dd = String(m[2]).padStart(2, '0')
  return `${m[3]}-${mm}-${dd}`
}

function parseLines(html) {
  const lines = []
  // The line table has a header row containing both "Net Unit Price" and "Unit FET".
  // Find the first <tr> after the header row pattern; iterate <tr>s until we leave
  // the line table.
  const headerIdx = html.search(/Net Unit Price[\s\S]*?Unit FET/i)
  if (headerIdx < 0) return lines
  const after = html.slice(headerIdx)
  // Stop at the next <table> opener or aggregates header.
  const stopIdx = after.search(/(?:COUNTY TAX|STATE TAX|LOCAL TAX|TIRE FEE|<\/table>)/i)
  const region = stopIdx > 0 ? after.slice(0, stopIdx) : after
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/g
  let m
  while ((m = trRe.exec(region)) !== null) {
    const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/g
    const cells = []
    let tm
    while ((tm = tdRe.exec(m[1])) !== null) cells.push(clean(tm[1]))
    if (cells.length < 7) continue
    const productCode = cells[1]  // e.g. "M / 19901"
    const mspnMatch = productCode.match(/\/\s*([0-9A-Z]+)/)
    if (!mspnMatch) continue
    const qty = Number(cells[0])
    if (!Number.isFinite(qty) || qty <= 0) continue
    lines.push({
      mspn: mspnMatch[1],
      qty,
      unitPrice: parseMoney(cells[2]),
      discount: Math.abs(parseMoney(cells[3])),
      netUnitPrice: parseMoney(cells[4]),
      unitFet: parseMoney(cells[5]),
      extended: parseMoney(cells[6]),
    })
  }
  return lines
}

export function parseEfleetInvoice(html) {
  if (!html || typeof html !== 'string' || html.trim() === '') {
    throw new Error('parseEfleetInvoice: empty input')
  }
  const docNumber = findCellAfterLabel(html, 'Invoice')
  const dr = findCellAfterLabel(html, 'Cross Reference')
  if (!docNumber || !dr) {
    throw new Error('parseEfleetInvoice: malformed input - missing Invoice or Cross Reference')
  }
  const poNumber = findCellAfterLabel(html, 'PO#')
  const orderNumber = findCellAfterLabel(html, 'Order #')
  const docDate = parseDocDate(findCellAfterLabel(html, 'Document Date'))
  const invoiceDate = parseDocDate(findCellAfterLabel(html, '>Date<') || findCellAfterLabel(html, 'Date'))
  const lines = parseLines(html)
  if (lines.length === 0) {
    throw new Error('parseEfleetInvoice: malformed input - no invoice lines parsed')
  }
  const countyTax = findMoneyAfterLabel(html, 'COUNTY TAX')
  const localTax = findMoneyAfterLabel(html, 'LOCAL TAX')
  const stateTax = findMoneyAfterLabel(html, 'STATE TAX')
  const tireFee = findMoneyAfterLabel(html, 'TIRE FEE')
  const bonusTotal = findMoneyAfterLabel(html, 'Bonus Total')
  const nobonusTotal = findMoneyAfterLabel(html, 'No Bonus Total')
  const fetTotal = findMoneyAfterLabel(html, 'F.E.T. Total')
  const invoiceTotal = findMoneyAfterLabel(html, 'Invoice Total')
  return {
    docNumber: docNumber,
    invoiceDate,
    docDate,
    poNumber,
    orderNumber,
    dr,
    lines,
    countyTax,
    localTax,
    stateTax,
    tireFee,
    bonusTotal,
    nobonusTotal,
    fetTotal,
    invoiceTotal,
  }
}
```

- [ ] **Step 4: Verify pass**

`npx vitest run scripts/import-efleet-invoice.test.mjs` - all green.

- [ ] **Step 5: Commit**

```bash
git add scripts/import-efleet-invoice.mjs scripts/import-efleet-invoice.test.mjs scripts/__fixtures__/efleet-invoice-sample.html
git commit -m "$(cat <<'EOF'
feat(landed-cost): pure parser for Michelin eFleet invoice HTML

Pulls invoice doc number, DR, PO, order number, dates, per-line MSPN/
qty/unit price/discount/net unit price/unit FET/extended, and
aggregate tax + tire fee + totals. Robust to whitespace variation;
keys off stable column-header substrings rather than CSS classes.
EOF
)"
```

---

## Task 5: `applyOrderCostChange` shared recompute helper

**Files:**
- Create: `functions/applyOrderCostChange.js`
- Create: `functions/applyOrderCostChange.test.mjs`

The DJ delivery bump shipped `applyDeliveredByChange` which already does most of what we need (atomic transaction recomputing crew earnings against a different model on a single order). For invoice reconciles we need a parallel helper that switches the cost basis instead of the deliveredBy. Keep them parallel rather than merged - the inputs and audit trails differ.

- [ ] **Step 1: Failing tests**

Create `functions/applyOrderCostChange.test.mjs`:

```js
import { describe, expect, it, beforeEach } from 'vitest'
import { _testonly } from './applyOrderCostChange.js'

const { applyOrderCostChange } = _testonly

// Build a firestore mock that supports collection().doc().get/set/update,
// runTransaction, and subcollection writes. Mirror the pattern from
// orderDeliveredByEdit.test.mjs.

describe('applyOrderCostChange', () => {
  // Setup: order with paymentAmount $1164, estimatedLandedCostAtCompletion $881.40,
  // deliveredBy 'dj', deliveryBumpAtCompletion 0.05.
  // Crew doc with current member balances populated from a prior bumpCrewEarned run.
  // payoutConfig with the standard splits + taxes.

  it('moves the order from estimated to actual: shrinks the pool, debits crew', async () => {
    // newRealized $953.13 ($71.73 more than estimated)
    // poolDelta = -71.73
    // dj is bumped (+5pp): adjustedDjShare = 0.40
    // dj earnings delta = -71.73 * 0.40 = -28.69
    // alex/kyle similarly
    // After: actualLandedCost = 953.13, member balances dropped accordingly,
    //   adjustments pushed to each affected member with reason: 'invoice-reconcile',
    //   costAudit entry written with source: 'invoice-reconcile'
  })

  it('accumulates a second invoice line: oldRealized = current actualLandedCost', async () => {
    // First call sets actualLandedCost to $953.13.
    // Second call passes incremental cost (e.g. another line for the same order).
    // newRealized = 953.13 + 250 = 1203.13.
    // poolDelta = -(1203.13 - 953.13) = -250.
  })

  it('writes a costAudit entry every call', async () => {
    // costAudit subcollection has one entry per call with old/new estimated/actual values.
  })

  it('is a no-op when the new cost equals the current realized cost', async () => {
    // Returns { ok: true, noChange: true }; no writes.
  })

  it('clamps the resulting margin pool at >= 0', async () => {
    // If newRealized > paymentAmount, pool floors at 0; member earnings can't go below
    // their baseline computed at completion (defensive: per-member floor at 0 for the
    // delta or accept negative balances? Pick: accept negative deltas, but never let
    // totalEarned go below 0 for that single order's contribution).
  })

  it('handles deliveredBy null (no bump): all members share proportionally', async () => {
    // splits 0.35/0.35/0.30 applied to poolDelta directly.
  })
})
```

- [ ] **Step 2: Implement**

Create `functions/applyOrderCostChange.js`:

```js
const { FieldValue } = require('firebase-admin/firestore')
const { applyDeliveryBump, round2 } = require('./payoutConfig')

const SPLIT_KEYS = ['alex', 'dj', 'kyle']

/**
 * Atomic cost-change recompute. Used by importInvoice (auto-attach) and
 * attachInvoiceLine (manual attach).
 *
 * @param {object} args
 * @param {FirebaseFirestore.Firestore} args.firestore
 * @param {string} args.orderId
 * @param {number} args.incrementalActualCost  - the $ this attach contributes (per-line, post pro-rated tax + fee)
 * @param {string} args.invoiceLineRef         - 'invoices/{docNumber}#lineIndex' or similar
 * @param {string} args.actorId                - uid of the admin firing the attach
 * @param {string} args.source                 - 'invoice-reconcile' (could be 'admin-edit' for direct overrides)
 * @param {string | null} args.notes           - free-form audit note
 */
async function applyOrderCostChange({
  firestore, orderId, incrementalActualCost, invoiceLineRef, actorId, source, notes,
}) {
  if (!orderId) throw new Error('applyOrderCostChange: orderId required')
  const incremental = Number(incrementalActualCost)
  if (!Number.isFinite(incremental)) throw new Error('applyOrderCostChange: incrementalActualCost must be finite')

  const orderRef = firestore.collection('orders').doc(orderId)
  const crewRef = firestore.collection('meta').doc('crewEarnings')
  const cfgRef = firestore.collection('meta').doc('payoutConfig')

  const cfgSnap = await cfgRef.get()
  const cfg = cfgSnap.exists ? cfgSnap.data() || {} : {}
  const splits = (cfg && typeof cfg.splits === 'object') ? cfg.splits : { alex: 0.35, dj: 0.35, kyle: 0.30 }

  const result = await firestore.runTransaction(async (tx) => {
    const orderSnap = await tx.get(orderRef)
    if (!orderSnap.exists) throw new Error('Order not found')
    const order = orderSnap.data() || {}

    const oldActual = Number(order.actualLandedCost)
    const oldEstimated = Number(order.estimatedLandedCostAtCompletion)
    const oldRealized = Number.isFinite(oldActual) && oldActual >= 0
      ? oldActual
      : (Number.isFinite(oldEstimated) && oldEstimated >= 0 ? oldEstimated : 0)
    const newRealized = round2((Number.isFinite(oldActual) && oldActual >= 0 ? oldActual : 0) + incremental)
    if (newRealized === oldRealized) {
      return { ok: true, noChange: true }
    }

    const paymentAmount = Number(order.paymentAmount) || 0
    const oldPool = Math.max(0, paymentAmount - oldRealized)
    const newPool = Math.max(0, paymentAmount - newRealized)
    const poolDelta = newPool - oldPool

    const deliveredBy = order.deliveredBy || null
    const bumpAtCompletion = Number(order.deliveryBumpAtCompletion) || 0
    const adjusted = applyDeliveryBump(splits, bumpAtCompletion, deliveredBy)

    const crewSnap = await tx.get(crewRef)
    const crew = crewSnap.exists ? crewSnap.data() || {} : { members: {} }
    const members = { ...(crew.members || {}) }

    const memberDeltas = {}
    for (const k of SPLIT_KEYS) {
      const share = Number(adjusted[k]) || 0
      const delta = round2(poolDelta * share)
      memberDeltas[k] = delta
      const cur = members[k] || {
        totalEarned: 0, totalPaid: 0, balance: 0,
        totalDeliveryBumps: 0, deliveryBumpCount: 0,
        adjustments: [],
      }
      const newTotal = round2((Number(cur.totalEarned) || 0) + delta)
      const newBalance = round2((Number(cur.balance) || 0) + delta)
      const adjustments = Array.isArray(cur.adjustments) ? cur.adjustments.slice() : []
      if (delta !== 0) {
        adjustments.push({
          orderId,
          oldBalance: Number(cur.balance) || 0,
          newBalance,
          delta,
          reason: source,
          invoiceLineRef: invoiceLineRef || null,
          createdAt: FieldValue.serverTimestamp(),
          acknowledgedBy: null,
          acknowledgedAt: null,
        })
      }
      members[k] = {
        ...cur,
        totalEarned: Math.max(0, newTotal),
        balance: newBalance,
        adjustments,
      }
    }
    tx.set(crewRef, { ...crew, members }, { merge: true })

    tx.update(orderRef, {
      actualLandedCost: newRealized,
      invoiceLineRef: invoiceLineRef || order.invoiceLineRef || null,
    })

    const auditRef = orderRef.collection('costAudit').doc()
    tx.set(auditRef, {
      setBy: actorId,
      setAt: FieldValue.serverTimestamp(),
      oldEstimated: Number.isFinite(oldEstimated) ? oldEstimated : null,
      oldActual: Number.isFinite(oldActual) ? oldActual : null,
      newEstimated: Number.isFinite(oldEstimated) ? oldEstimated : null,
      newActual: newRealized,
      source,
      notes: notes || null,
    })

    return { ok: true, oldRealized, newRealized, poolDelta, memberDeltas }
  })

  return result
}

module.exports = {}
module.exports._testonly = { applyOrderCostChange }
module.exports.applyOrderCostChange = applyOrderCostChange
```

- [ ] **Step 3: Verify pass + commit**

```bash
npx vitest run functions/applyOrderCostChange.test.mjs
git add functions/applyOrderCostChange.js functions/applyOrderCostChange.test.mjs
git commit -m "$(cat <<'EOF'
feat(landed-cost): applyOrderCostChange shared recompute helper

Atomic Firestore transaction. Reads order, derives oldRealized
(actualLandedCost or estimatedLandedCostAtCompletion), accumulates
incrementalActualCost into newRealized, computes poolDelta against
paymentAmount, distributes via the bump-adjusted splits, writes
member deltas + adjustment entries (acknowledgedBy: null) to
meta/crewEarnings, updates the order's actualLandedCost +
invoiceLineRef, and appends an orders/{id}/costAudit entry.
Used by importInvoice and attachInvoiceLine.
EOF
)"
```

---

## Task 6: `importInvoice` callable

**Files:**
- Create: `functions/importInvoice.js`
- Create: `functions/importInvoice.test.mjs`
- Modify: `functions/index.js`

- [ ] **Step 1: Failing tests**

Create `functions/importInvoice.test.mjs` covering:
- unauthenticated -> HttpsError unauthenticated
- non-admin role -> HttpsError permission-denied
- duplicate docNumber -> HttpsError already-exists
- happy path: writes `invoices/{docNumber}` doc, auto-attaches lines whose DR matches an existing order, fires `applyOrderCostChange` once per attached line with `incrementalActualCost = line.extended + lineShareTax + lineShareTireFee`
- partial auto-attach: invoice with two lines, only one matches a portal order; other line stays in `attachedOrderId: null`, invoice `status: 'partial'`

- [ ] **Step 2: Implement**

Create `functions/importInvoice.js`:

```js
const { onCall, HttpsError } = require('firebase-functions/v2/https')
const admin = require('firebase-admin')
const { FieldValue } = require('firebase-admin/firestore')
const { applyOrderCostChange } = require('./applyOrderCostChange')
const { round2 } = require('./payoutConfig')

const SPLIT_KEYS = ['alex', 'dj', 'kyle']

function lineShareCost(line, invoiceTotals) {
  // Line carries: extended (= netUnit*qty + fet*qty), qty.
  // Invoice carries: bonusTotal (= sum of netUnit*qty across lines), countyTax + localTax + stateTax + tireFee.
  // We pro-rate tax by line's share of bonusTotal.
  const lineNet = Number(line.netUnitPrice) * Number(line.qty)  // close to but not == extended (extended includes FET)
  const totalNet = Number(invoiceTotals.bonusTotal) || 1
  const lineShareOfTax = totalNet > 0 ? lineNet / totalNet : 0
  const aggregateTax = (Number(invoiceTotals.countyTax) || 0)
    + (Number(invoiceTotals.localTax) || 0)
    + (Number(invoiceTotals.stateTax) || 0)
  const totalTires = Number(invoiceTotals.totalTires) || 1
  const lineTireFee = totalTires > 0
    ? (Number(invoiceTotals.tireFee) || 0) * (Number(line.qty) / totalTires)
    : 0
  return round2(Number(line.extended) + lineShareOfTax * aggregateTax + lineTireFee)
}

async function autoAttachByDr(firestore, invoice, line, lineIndex, actorId) {
  if (!invoice.dr) return null
  const candidates = await firestore
    .collection('orders')
    .where('dr', '==', invoice.dr)
    .where('status', '==', 'completed')
    .get()
  // Filter to orders that have at least one tire line matching this line's MSPN + qty.
  const match = candidates.docs.find((doc) => {
    const o = doc.data() || {}
    const tires = Array.isArray(o.tires) ? o.tires : []
    return tires.some((t) => String(t.mspn) === String(line.mspn) && Number(t.qty) === Number(line.qty))
  })
  return match ? match.id : null
}

exports.importInvoice = onCall(async (req) => {
  if (!req.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in required.')
  const firestore = admin.firestore()
  const userSnap = await firestore.collection('users').doc(req.auth.uid).get()
  if (String((userSnap.exists ? userSnap.data() : {})?.role || '') !== 'admin') {
    throw new HttpsError('permission-denied', 'Admin only.')
  }

  const invoice = req.data?.invoice
  if (!invoice || typeof invoice !== 'object' || !invoice.docNumber) {
    throw new HttpsError('invalid-argument', 'invoice payload required.')
  }
  const docId = String(invoice.docNumber)
  const ref = firestore.collection('invoices').doc(docId)
  const existing = await ref.get()
  if (existing.exists) throw new HttpsError('already-exists', `Invoice ${docId} already imported.`)

  const totalTires = (invoice.lines || []).reduce((acc, l) => acc + (Number(l.qty) || 0), 0)
  const totals = { ...invoice, totalTires }

  const lineRecords = []
  for (let i = 0; i < (invoice.lines || []).length; i += 1) {
    const line = invoice.lines[i]
    const attachedOrderId = await autoAttachByDr(firestore, invoice, line, i, req.auth.uid)
    lineRecords.push({
      ...line,
      attachedOrderId,
      attachedAt: attachedOrderId ? FieldValue.serverTimestamp() : null,
      attachedBy: attachedOrderId ? req.auth.uid : null,
    })
  }
  const status = lineRecords.every((l) => l.attachedOrderId)
    ? 'attached'
    : (lineRecords.some((l) => l.attachedOrderId) ? 'partial' : 'pending')

  await ref.set({
    ...invoice,
    lines: lineRecords,
    status,
    importedAt: FieldValue.serverTimestamp(),
    importedBy: req.auth.uid,
  })

  // Fire recompute for each attached line
  for (let i = 0; i < lineRecords.length; i += 1) {
    const l = lineRecords[i]
    if (!l.attachedOrderId) continue
    const cost = lineShareCost(l, totals)
    await applyOrderCostChange({
      firestore,
      orderId: l.attachedOrderId,
      incrementalActualCost: cost,
      invoiceLineRef: `invoices/${docId}#${i}`,
      actorId: req.auth.uid,
      source: 'invoice-reconcile',
      notes: null,
    })
  }

  return { ok: true, docId, status, attachedCount: lineRecords.filter((l) => l.attachedOrderId).length }
})
```

Register in `functions/index.js`:

```js
exports.importInvoice = require('./importInvoice').importInvoice
```

- [ ] **Step 3: Run + commit**

```bash
npx vitest run functions/importInvoice.test.mjs
git add functions/importInvoice.js functions/importInvoice.test.mjs functions/index.js
git commit -m "$(cat <<'EOF'
feat(landed-cost): importInvoice callable with hybrid auto-attach

Admin-only. Idempotent on docNumber. Writes invoices/{docNumber}
with per-line attach state. Auto-attach scans completed orders for
matching DR + MSPN + qty; fires applyOrderCostChange per attached
line with the line's pro-rated tax + tire fee folded in. Partial
attach marked status: 'partial'.
EOF
)"
```

---

## Task 7: `attachInvoiceLine` callable

**Files:**
- Create: `functions/attachInvoiceLine.js`
- Create: `functions/attachInvoiceLine.test.mjs`
- Modify: `functions/index.js`

- [ ] **Step 1: Failing tests**

Cover:
- unauthenticated, non-admin
- invalid invoiceId / lineIndex
- attaching an unattached line: writes attach state + fires recompute
- re-attaching to a different order: reverses the prior recompute (calls `applyOrderCostChange` on the prior order with negative incremental) and applies to the new order
- attaching to the same order again (idempotent): noChange
- attaching to an order whose DR doesn't match the invoice (allowed, with a warning logged but no block)

- [ ] **Step 2: Implement**

Create `functions/attachInvoiceLine.js`:

```js
const { onCall, HttpsError } = require('firebase-functions/v2/https')
const admin = require('firebase-admin')
const { FieldValue } = require('firebase-admin/firestore')
const { applyOrderCostChange } = require('./applyOrderCostChange')
const { round2 } = require('./payoutConfig')

function lineShareCost(line, invoice) {
  const totalTires = (invoice.lines || []).reduce((acc, l) => acc + (Number(l.qty) || 0), 0) || 1
  const lineNet = Number(line.netUnitPrice) * Number(line.qty)
  const totalNet = Number(invoice.bonusTotal) || 1
  const lineShareOfTax = totalNet > 0 ? lineNet / totalNet : 0
  const aggregateTax = (Number(invoice.countyTax) || 0) + (Number(invoice.localTax) || 0) + (Number(invoice.stateTax) || 0)
  const lineTireFee = (Number(invoice.tireFee) || 0) * (Number(line.qty) / totalTires)
  return round2(Number(line.extended) + lineShareOfTax * aggregateTax + lineTireFee)
}

exports.attachInvoiceLine = onCall(async (req) => {
  if (!req.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in required.')
  const firestore = admin.firestore()
  const userSnap = await firestore.collection('users').doc(req.auth.uid).get()
  if (String((userSnap.exists ? userSnap.data() : {})?.role || '') !== 'admin') {
    throw new HttpsError('permission-denied', 'Admin only.')
  }

  const invoiceId = String(req.data?.invoiceId || '').trim()
  const lineIndex = Number(req.data?.lineIndex)
  const targetOrderId = req.data?.orderId === null ? null : String(req.data?.orderId || '').trim() || null
  if (!invoiceId || !Number.isInteger(lineIndex)) {
    throw new HttpsError('invalid-argument', 'invoiceId + lineIndex required.')
  }

  const invRef = firestore.collection('invoices').doc(invoiceId)
  const invSnap = await invRef.get()
  if (!invSnap.exists) throw new HttpsError('not-found', 'Invoice not found.')
  const invoice = invSnap.data() || {}
  const lines = Array.isArray(invoice.lines) ? invoice.lines.slice() : []
  if (lineIndex < 0 || lineIndex >= lines.length) {
    throw new HttpsError('invalid-argument', 'lineIndex out of range.')
  }

  const line = { ...lines[lineIndex] }
  const priorOrderId = line.attachedOrderId || null
  if (priorOrderId === targetOrderId) {
    return { ok: true, noChange: true }
  }

  const cost = lineShareCost(line, invoice)

  // Reverse the prior attachment if any
  if (priorOrderId) {
    await applyOrderCostChange({
      firestore,
      orderId: priorOrderId,
      incrementalActualCost: -cost,
      invoiceLineRef: `invoices/${invoiceId}#${lineIndex}`,
      actorId: req.auth.uid,
      source: 'invoice-reconcile',
      notes: 'reverse prior attach',
    })
  }

  // Apply to the new target if any
  if (targetOrderId) {
    await applyOrderCostChange({
      firestore,
      orderId: targetOrderId,
      incrementalActualCost: cost,
      invoiceLineRef: `invoices/${invoiceId}#${lineIndex}`,
      actorId: req.auth.uid,
      source: 'invoice-reconcile',
      notes: null,
    })
  }

  line.attachedOrderId = targetOrderId
  line.attachedAt = targetOrderId ? FieldValue.serverTimestamp() : null
  line.attachedBy = targetOrderId ? req.auth.uid : null
  lines[lineIndex] = line

  const allAttached = lines.every((l) => l.attachedOrderId)
  const someAttached = lines.some((l) => l.attachedOrderId)
  await invRef.update({
    lines,
    status: allAttached ? 'attached' : (someAttached ? 'partial' : 'pending'),
  })

  return { ok: true, priorOrderId, newOrderId: targetOrderId }
})
```

Register: `exports.attachInvoiceLine = require('./attachInvoiceLine').attachInvoiceLine`

- [ ] **Step 3: Run + commit**

```bash
npx vitest run functions/attachInvoiceLine.test.mjs
git add functions/attachInvoiceLine.js functions/attachInvoiceLine.test.mjs functions/index.js
git commit -m "feat(landed-cost): attachInvoiceLine callable for manual attach + re-attach"
```

---

## Task 8: `acknowledgeAdjustment` callable

**Files:**
- Create: `functions/acknowledgeAdjustment.js`
- Create: `functions/acknowledgeAdjustment.test.mjs`
- Modify: `functions/index.js`

- [ ] **Step 1: Failing tests**

Cover:
- unauthenticated -> HttpsError
- crew member acks their OWN adjustment (mapped via `users/{uid}.crewKey` or similar; verify how the codebase maps uid to crew key) -> sets `acknowledgedBy: uid, acknowledgedAt: timestamp`
- crew member tries to ack someone else's adjustment -> permission-denied
- admin can ack any adjustment
- ack idempotent: re-ack-ing a previously-acked entry returns noChange

- [ ] **Step 2: Implement**

```js
const { onCall, HttpsError } = require('firebase-functions/v2/https')
const admin = require('firebase-admin')
const { FieldValue } = require('firebase-admin/firestore')

function uidToCrewKey(userDoc) {
  // Prefer explicit users/{uid}.crewKey; fall back to lowercased displayName matched against ['alex','dj','kyle'].
  // Implement based on the actual user-doc schema; verify before coding.
  const data = userDoc?.data?.() || {}
  if (typeof data.crewKey === 'string' && ['alex','dj','kyle'].includes(data.crewKey)) return data.crewKey
  const dn = String(data.displayName || data.name || '').toLowerCase()
  if (dn.includes('alex')) return 'alex'
  if (dn.includes('dj')) return 'dj'
  if (dn.includes('kyle')) return 'kyle'
  return null
}

exports.acknowledgeAdjustment = onCall(async (req) => {
  if (!req.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in required.')
  const firestore = admin.firestore()
  const userSnap = await firestore.collection('users').doc(req.auth.uid).get()
  const userData = userSnap.exists ? userSnap.data() : {}
  const role = String(userData?.role || '')
  const crewKey = uidToCrewKey(userSnap)

  const targetCrewKey = String(req.data?.crewKey || '').trim()
  const adjustmentId = String(req.data?.adjustmentId || '').trim()  // could be index into the array, or a stable id - decide at impl time
  if (!targetCrewKey || !['alex','dj','kyle'].includes(targetCrewKey)) {
    throw new HttpsError('invalid-argument', 'crewKey required.')
  }

  if (role !== 'admin' && crewKey !== targetCrewKey) {
    throw new HttpsError('permission-denied', 'Crew can only acknowledge their own adjustments.')
  }

  const crewRef = firestore.collection('meta').doc('crewEarnings')
  return await firestore.runTransaction(async (tx) => {
    const snap = await tx.get(crewRef)
    if (!snap.exists) throw new HttpsError('not-found', 'Crew earnings doc missing.')
    const data = snap.data() || {}
    const member = (data.members || {})[targetCrewKey]
    if (!member) throw new HttpsError('not-found', 'Crew member not found.')
    const adjustments = Array.isArray(member.adjustments) ? member.adjustments.slice() : []
    const idx = adjustments.findIndex((a) => String(a.adjustmentId || a.orderId) === adjustmentId)  // matches whatever id strategy is chosen
    if (idx < 0) throw new HttpsError('not-found', 'Adjustment not found.')
    if (adjustments[idx].acknowledgedBy) return { ok: true, noChange: true }
    adjustments[idx] = {
      ...adjustments[idx],
      acknowledgedBy: req.auth.uid,
      acknowledgedAt: FieldValue.serverTimestamp(),
    }
    const members = { ...(data.members || {}), [targetCrewKey]: { ...member, adjustments } }
    tx.set(crewRef, { ...data, members }, { merge: true })
    return { ok: true }
  })
})
```

Register in `functions/index.js`. Decide adjustmentId strategy at implementation time: either generate a uuid in `applyOrderCostChange` and write `adjustmentId` on the entry, OR rely on `(orderId + invoiceLineRef)` as the natural key. uuid is safer; add it.

- [ ] **Step 3: Commit**

```bash
git add functions/acknowledgeAdjustment.js functions/acknowledgeAdjustment.test.mjs functions/index.js
git commit -m "feat(landed-cost): acknowledgeAdjustment callable"
```

---

## Task 9: AdminEFleetInvoicesPage + InvoiceImportPanel + InvoiceLineReviewQueue

**Files:**
- Create: `src/pages/AdminEFleetInvoicesPage.jsx`
- Create: `src/components/admin/efleet/InvoiceImportPanel.jsx`
- Create: `src/components/admin/efleet/InvoiceImportPanel.test.jsx`
- Create: `src/components/admin/efleet/InvoiceLineReviewQueue.jsx`
- Create: `src/components/admin/efleet/InvoiceLineReviewQueue.test.jsx`
- Modify: `src/router.jsx` (or wherever routes are mounted)
- Modify: navigation entry for the admin section

- [ ] **Step 1: `InvoiceImportPanel.jsx` - drop zone + preview + commit**

Build with `<input type="file" accept=".html,.htm">` (no fancy drag-and-drop required for v1). On file pick:
1. Read file as text via `FileReader`.
2. Run `parseEfleetInvoice(html)` (re-export the parser via a small client-side wrapper - or inline a copy if importing from `scripts/` is awkward; mirror the pattern used for `import-efleet.mjs`).
3. Show a preview table: doc number, date, DR, lines, totals.
4. "Import" button calls `importInvoice` callable. On success, toast and route to the review queue.

Test: file pick parses + previews + commit-button-click invokes the callable mock.

- [ ] **Step 2: `InvoiceLineReviewQueue.jsx` - pending lines + ranked candidates**

Subscribes to `invoices` where `status in ('pending', 'partial')`. For each unattached line, query `orders` for candidates: completed orders within doc-date +/- 14 days, ranked by `(MSPN match, qty match, date proximity)`. Render line + top 3 candidates as buttons. Click attaches via `attachInvoiceLine` callable.

- [ ] **Step 3: Page composition + route**

`AdminEFleetInvoicesPage.jsx` stacks the import panel above the review queue. Route `/admin/efleet/invoices` admin-gated.

- [ ] **Step 4: Run vitest + lint + bundle**

```bash
npx vitest run src/components/admin/efleet/ src/pages/AdminEFleetInvoicesPage.test.jsx
npm run lint
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add -A src/
git commit -m "feat(landed-cost): AdminEFleetInvoicesPage with import + review queue"
```

---

## Task 10: PeopleEarningsPage + PendingAdjustmentsPanel

**Files:**
- Create: `src/pages/PeopleEarningsPage.jsx`
- Create: `src/components/people/PendingAdjustmentsPanel.jsx`
- Create: `src/components/people/PendingAdjustmentsPanel.test.jsx`
- Modify: `src/router.jsx` to mount `/people/earnings`
- Modify: navigation entry for People section

- [ ] **Step 1: `PendingAdjustmentsPanel.jsx`**

Props: `crewKey, currentUserRole`. Subscribes to `meta/crewEarnings` (or admin sees all members; non-admin sees just their own per Q5 visibility). Renders a list of unacked adjustments with "Acknowledge" buttons that fire the `acknowledgeAdjustment` callable.

Test: 
- renders pending adjustments
- ack button click fires the callable
- empty state when no pending entries

- [ ] **Step 2: `PeopleEarningsPage.jsx`**

For admins: tab per crew member. For non-admins: just their own member's view. Above the panel, show current balance + total earned + total paid.

- [ ] **Step 3: Run + commit**

```bash
npx vitest run src/components/people/ src/pages/PeopleEarningsPage.test.jsx
git add -A src/
git commit -m "feat(landed-cost): PeopleEarningsPage + PendingAdjustmentsPanel"
```

---

## Task 11: Slack `/owed` pending callout + adjustment DM

**Files:**
- Modify: `functions/financeSlackCommands.js`
- Modify: `functions/financeSlackCommands.test.mjs`
- Create: `functions/slackAdjustmentDm.js`
- Modify: `functions/applyOrderCostChange.js` (fire DM after the transaction commits)

- [ ] **Step 1: `/owed` callout - failing test**

Add to `functions/financeSlackCommands.test.mjs`:

```js
describe('crewMemberPendingAdjustmentsCallout', () => {
  it('returns empty string when no pending adjustments', () => {
    expect(crewMemberPendingAdjustmentsCallout({ adjustments: [] })).toBe('')
    expect(crewMemberPendingAdjustmentsCallout({})).toBe('')
  })
  it('counts only unacknowledged entries and sums net', () => {
    const m = { adjustments: [
      { delta: -12.45, acknowledgedBy: null },
      { delta: -10.00, acknowledgedBy: 'someone' },  // already acked, skip
      { delta: -16.95, acknowledgedBy: null },
    ] }
    const out = crewMemberPendingAdjustmentsCallout(m)
    expect(out).toContain('2 reconcile adjustments pending')
    expect(out).toContain('-$29.40')
  })
})
```

- [ ] **Step 2: Implement and wire into `/owed`**

```js
function crewMemberPendingAdjustmentsCallout(member) {
  const adjustments = Array.isArray(member?.adjustments) ? member.adjustments : []
  const pending = adjustments.filter((a) => !a.acknowledgedBy)
  if (pending.length === 0) return ''
  const net = pending.reduce((acc, a) => acc + (Number(a.delta) || 0), 0)
  const sign = net < 0 ? '-' : ''
  const abs = Math.abs(net).toFixed(2)
  return `\n   :warning: ${pending.length} reconcile adjustment${pending.length === 1 ? '' : 's'} pending (net ${sign}$${abs})`
}
```

Append to the existing per-member line.

- [ ] **Step 3: `slackAdjustmentDm.js`**

```js
const { sendSlackDm } = require('./_shared')  // verify the actual existing helper

async function postAdjustmentDm({ firestore, crewKey, delta, newBalance, orderId, invoiceDocNumber }) {
  // Look up users where crewKey matches; if user has slackUserId, post DM.
  const users = await firestore.collection('users').where('crewKey', '==', crewKey).get()
  for (const u of users.docs) {
    const data = u.data() || {}
    if (!data.slackUserId) continue
    const sign = delta < 0 ? '-' : '+'
    const abs = Math.abs(delta).toFixed(2)
    const msg = `Heads up - your balance was just adjusted by ${sign}$${abs} because order #${orderId} was reconciled against eFleet invoice ${invoiceDocNumber}. New balance: $${Number(newBalance).toFixed(2)}. Acknowledge in the portal.`
    await sendSlackDm(data.slackUserId, msg)
  }
}

module.exports = { postAdjustmentDm }
```

Verify the actual existing Slack DM helper before wiring.

- [ ] **Step 4: Wire into `applyOrderCostChange`**

After the transaction commits, for each member with a non-zero delta, call `postAdjustmentDm`. Fire-and-forget pattern (Promise.allSettled) so a Slack failure doesn't break the cost-change flow.

- [ ] **Step 5: Run + commit**

```bash
npx vitest run functions/
git add -u functions/
git commit -m "feat(landed-cost): /owed pending callout + Slack DM on adjustment"
```

---

## Task 12: Lint, bundle, full vitest, manual smoke

**Files:** none

- [ ] **Step 1: Lint**

`cd .claude/worktrees/landed-cost && npm run lint`

Expected: 0 errors.

- [ ] **Step 2: Bundle**

`npm run build && npx size-limit`

Expected: tires page chunk under 47 KB. Admin chunks slightly larger (invoice page + review queue land here); validate they don't blow any explicit cap.

- [ ] **Step 3: Full vitest**

`npx vitest run`

Expected: green. Existing 845 + new tests from this branch.

- [ ] **Step 4: Manual smoke (skip if no test backend)**

1. Sale flow: pick a tire, open Quote, verify "Buy (catalog)" shows the catalog price and the breakdown rows show FET / wholesale tax / CO tire fee. The bundle margin shifts down to reflect landed.
2. Complete a delivery order with a DR. Order doc has `dr` and `estimatedLandedCostAtCompletion`.
3. Visit `/admin/efleet/invoices`, upload one of the brainstorm-screenshot invoices. Auto-attach picks up the matching DR; the rest land in the review queue. Manual-attach a line. The matched orders' `actualLandedCost` updates and `meta/crewEarnings.members.{k}.adjustments` gains an entry per affected member.
4. Slack `/owed` shows the pending callout.
5. Visit `/people/earnings`, ack an adjustment. `/owed` callout decrements.
6. Slack DM lands when a new adjustment is written.

- [ ] **Step 5: HOLD for user direction on push**

Do NOT push without user confirmation.

---

## Verification checklist (final)

- All vitest green
- Lint clean
- Bundle within caps
- `tireLandedBuyNumber` agrees client + server case-for-case
- All consumers (Quote / TirePricingCard / MarginTable / opportunityScore / marginCalc) use landed
- `completeOrder` snapshots `estimatedLandedCostAtCompletion` and accepts `dr`
- `completedOrderMarginPool` priority order correct (actual > estimated > legacy)
- Invoice parser passes the fixture
- `applyOrderCostChange` shared helper works in both add-incremental and reverse modes
- `importInvoice` is idempotent on docNumber, auto-attaches by DR + MSPN + qty match
- `attachInvoiceLine` re-attaches cleanly (reverse + apply)
- `acknowledgeAdjustment` enforces self-only ack for non-admins
- `/admin/efleet/invoices` upload + review queue work end-to-end
- `/people/earnings` shows pending adjustments + ack flow
- `/owed` Slack callout present when adjustments are pending
- Slack DM fires on adjustment write

---

## Out of scope (deferred)

- Per-jurisdiction tax rates (CO-only for v1)
- Auto-import from email / Drive
- Vendors other than Michelin
- Backfill of historical orders
- Admin toggle UI for the Slack DM
- Multi-DR-per-invoice
