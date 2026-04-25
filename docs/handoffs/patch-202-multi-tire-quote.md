---
id: 202
title: Multi-tire Quote sheet (bundle margin + per-tire qty)
branch: multi-tire-quote
depends_on:
  - 201
touches_shared:
  - src/components/tires/HaggleSheet.jsx
  - src/components/tires/TiresDashboard.jsx
frontend_only: true
---

# Patch 202 — Multi-tire Quote

Today's HaggleSheet works for exactly one tire. Customers regularly want different sizes for front vs rear (truck/SUV setups), so the Quote button must accept N tires. Extend HaggleSheet to a bundle quote: per-tire quantity, blended margin across the whole bundle, single test-offer that applies to the bundle total.

## Branch

`multi-tire-quote`

## Scope

**Modify:**
- `src/components/tires/HaggleSheet.jsx` — accept `tires: Array` (current single `tire` becomes a length-1 list)
- `src/components/tires/HaggleSheet.test.jsx` — extend tests for multi-tire math
- `src/components/tires/TiresDashboard.jsx` — pass selected tires array (not just one) when opening the sheet

## Design

### Props change

Old:
```jsx
<HaggleSheet tire={haggleTire} floorPct={floorPct} onClose={...} onAccept={...} />
```

New:
```jsx
<HaggleSheet tires={haggleTires} floorPct={floorPct} onClose={...} onAccept={...} />
// `tires` is always an array; length 1 = single-tire quote, length N = bundle
```

`onAccept(testOffer)` is unchanged — receives the bundle test offer total.

### Per-tire row

For each tire, render:
- Description (truncated 1 line)
- Qty stepper: `[-]  2  [+]` (defaults to 1, min 1, max 99)
- Per-tire computed numbers: `Buy: $412.50 · Sell: $599 · Margin: 31%` (right-aligned)

### Bundle totals (above the test-offer input)

```
Bundle:
  Quantity:    6 tires
  Revenue:     $3,594.00     (sum of qty × retail across tires)
  Cost:        $2,475.00     (sum of qty × buyAllIn across tires)
  Profit:      $1,119.00
  Margin:      31.1%         (= profit / revenue)
```

### Test offer = bundle total

The single `Test offer: $___` input represents the customer's offer for the whole bundle. Recomputed margin:

```js
const testMargin = testOffer > 0 ? ((testOffer - bundleCost) / testOffer) * 100 : 0
```

Floor warning fires on `testMargin < floorPct`. Counter-offer at the floor:

```js
const counterOffer = floorPct < 100 ? bundleCost / (1 - floorPct / 100) : null
```

Color states for the margin readout: same as before (emerald >= floor, amber 0..floor, rose <= 0).

### Single-tire fallback

When `tires.length === 1`, the sheet renders cleanly without the per-tire qty stepper feeling overwrought — just show the qty stepper inline next to the single tire's description. The bundle totals row collapses or hides since they'd duplicate the single-tire numbers.

Two options for this:
- **(a)** keep the same UI for both — single-tire just looks like a 1-row bundle. Simpler.
- **(b)** branch on `tires.length === 1` and render the original sheet layout. More polish but duplicate logic.

Use (a). Single-tire users see a slightly more verbose sheet but the math is identical.

## Math helpers

Add a small selector:

```js
function bundleMath(tires, qtyByMspn, floorPct, testOffer) {
  let revenue = 0
  let cost = 0
  for (const t of tires) {
    const qty = Math.max(1, Number(qtyByMspn[t.mspn]) || 1)
    const buy = Number(t.buy || 0) + Number(t.cts || 0) + Number(t.fet || 0)
    const sell = Number(t.retail || 0)
    revenue += sell * qty
    cost += buy * qty
  }
  const profit = revenue - cost
  const margin = revenue > 0 ? (profit / revenue) * 100 : 0
  const testOfferNum = Number(testOffer) || 0
  const testProfit = testOfferNum - cost
  const testMargin = testOfferNum > 0 ? (testProfit / testOfferNum) * 100 : 0
  const counterOffer = floorPct < 100 ? cost / (1 - floorPct / 100) : null
  return { revenue, cost, profit, margin, testProfit, testMargin, counterOffer }
}
```

Export this as a named function from a shared util (`src/utils/bundleMath.js`) so it can be unit-tested independently of the React component.

## Tests

### `src/utils/bundleMath.test.js` (new)

- Single tire, qty 1 → matches the existing single-tire HaggleSheet math
- Two tires, different qty → revenue and cost sum correctly
- Test offer at exactly floor → margin equals floor (within float tolerance)
- Test offer below floor → counter-offer math correct
- Empty tires array → all numbers are 0

### `HaggleSheet.test.jsx` extensions

- Renders qty stepper for each tire in the list
- Stepper increment/decrement updates the bundle totals
- Bundle totals row visible when tires.length > 1
- Multi-tire accept calls onAccept with the bundle test offer

## Out of scope

- Renaming HaggleSheet to QuoteSheet (the user's preferred term) — bigger touch, do in a follow-up if desired
- Sending the quote to the customer (Slack / SMS / etc.) — separate concern
- Saving quotes to Firestore for later reference — separate concern

## Validation

```
npm run lint
npm run test
npm run build
```

Plus visual smoke at desktop and mobile.

## PR title

`Multi-tire Quote: HaggleSheet handles bundles with per-tire qty`

Execute this brief exactly. Branch from main, run all validation commands before opening the PR, and stop after the PR is open.
