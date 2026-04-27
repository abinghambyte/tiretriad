---
patch: 619
title: Tier 3 — Resolver + confidence scoring on existing Gemini cascade
status: ready-to-dispatch (after 617)
priority: P0 — without the resolver, baseline/MAP/live data never reaches the UI
depends_on: [617]
spec: docs/superpowers/specs/2026-04-25-tire-retail-backfill-design.md
batch: pricing-architecture
---

# patch-619 — Tier 3 retail resolver + confidence scoring

## Goal

Wire the resolver: deterministically compute `tires/{mspn}.retail` from the highest-confidence available pricing tier. Stamp `retailSource` for provenance. Respect `retailLockedAt` (manual edits never get clobbered).

Also: extend the existing nightly Gemini cascade in `functions/tirePriceResearch.js` to produce confidence scores and `priceIntel.asOf` so the resolver can reject stale or single-source data.

## What ships

### 1. Confidence scoring on the cascade

In `functions/tirePriceResearch.js`, after Gemini returns retail observations, compute a `priceIntel.confidence`:

- `'high'` — 3+ retailer sources agreed within ±5% on a price
- `'medium'` — 2 sources agreed within ±10% OR 1 source from a high-trust list (Tire Rack, SimpleTire)
- `'low'` — 1 source from anywhere else, OR price disagreement > 10% across sources

Stamp `priceIntel.asOf: serverTimestamp()` on every cascade write.

### 2. Resolver Cloud Function

New file: `functions/resolveTireRetail.js`. Triggered by:

- `onUpdate` of `tires/{mspn}` when `priceIntel`, `mapPrice`, `baselinePrice`, or `soldPriceIntel` changes
- Manual via callable for backfill

Resolver implementation:

```js
function resolveRetail(tire, payoutConfig) {
  // 1. Manual lock
  if (tire.retailLockedAt) return { retail: tire.retail, retailSource: 'manual' }

  // 2. Sold-price reality (Tier 4) — only when sample size justifies it
  const sold = tire.soldPriceIntel
  if (sold && sold.sampleSize >= 10 && sold.medianSoldPrice > 0) {
    return { retail: sold.medianSoldPrice, retailSource: 'sold-price-intel' }
  }

  // 3. Live retail (Tier 3) — confidence + recency gates
  const intel = tire.priceIntel || {}
  const intelAsOfMs = intel.asOf?.toMillis?.() || 0
  const intelAge = Date.now() - intelAsOfMs
  const intelFresh = intelAge < 30 * 86400_000  // 30 days
  const intelConfident = intel.confidence === 'high' || intel.confidence === 'medium'
  if (intel.retailPrice > 0 && intelFresh && intelConfident) {
    return { retail: intel.retailPrice, retailSource: 'priceIntel' }
  }

  // 4. MAP (Tier 2) — accept if not too stale
  const mapAsOfMs = tire.mapAsOf?.toMillis?.() || 0
  const mapFresh = (Date.now() - mapAsOfMs) < 90 * 86400_000  // 90 days
  if (tire.mapPrice > 0 && mapFresh) {
    return { retail: tire.mapPrice, retailSource: 'mapPrice' }
  }

  // 5. Manufacturer baseline (Tier 1) — never stales out
  if (tire.baselinePrice > 0) {
    return { retail: tire.baselinePrice, retailSource: 'baselinePrice-derived' }
  }

  // 6. Last-resort floor: buy * (1 + targetMargin/100)
  const targetMargin = Number(payoutConfig?.targetMarginPct) || 30
  const buy = Number(tire.price) || 0
  return {
    retail: Math.round(buy * (1 + targetMargin / 100)),
    retailSource: 'derived-buy-margin',
  }
}
```

### 3. Backfill script

`scripts/backfill-tire-retail-resolver.mjs` — runs the resolver against every tire once. Default dry-run; `--apply` writes. Used after patch-617 lands to populate the resolved `retail` field for every tire.

### 4. Tests

- `functions/resolveTireRetail.test.js` — unit-test the resolver across all 6 priority branches with synthetic tire data
- `scripts/backfill-tire-retail-resolver.test.mjs` — mock Firestore, assert dry-run reports correct counts per source

## Acceptance

- [ ] Resolver Cloud Function deployed and triggered correctly on `tires/{mspn}` writes
- [ ] Backfill ran against production: every tire has `retail` + `retailSource` set
- [ ] Resolver test suite covers all 6 branches
- [ ] HaggleSheet stops showing `Current sell: $0.00` for any tire that has at least baseline data
- [ ] Manual edit via MarginTable inline editor (existing UI) sets `retailLockedAt`; resolver doesn't clobber on next nightly cascade run

## Notes for the agent

- The resolver is the LOAD-BEARING piece of the pricing architecture. Test it thoroughly before deploying.
- Watch for trigger-loop risk: the resolver writes back to `tires/{mspn}.retail`, which is itself in the same doc. Use `merge: true` and skip the trigger when the only field changed is `retail` / `retailSource` (use a `_resolverWrite: true` sentinel and ignore in the trigger filter).
- Don't change the `meta/payoutConfig` doc shape. If `targetMarginPct` doesn't exist there yet, add it as an optional field that defaults to 30 in the resolver.
- `priceIntel.confidence` extension to the cascade can ship in the same PR or a separate one. Either is fine; the resolver tolerates a missing field by treating it as `'low'`.
