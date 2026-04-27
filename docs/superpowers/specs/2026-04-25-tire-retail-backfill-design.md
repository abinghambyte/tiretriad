# Tire pricing architecture — design spec (STORMED 2026-04-27)

**Status:** Stormed. Scope expanded from "backfill the `retail` field" (the original 2026-04-25 framing) to "build a defensible 5-tier canonical-pricing model." Implementation plan splits into patch-617 through patch-621.

## Problem (original framing — still true)

All 1,160 tires in the catalog have estimated retail prices, not real ones. The yellow `EST` indicator next to every retail price reflects this.

- HaggleSheet shows `Current sell: $0.00` because there's no real `retail` field
- Quote and bundle margin math is unreliable on actual deals
- Listing Generator has nothing concrete to compare its AI-suggested price against
- Margin column in the Tires catalog is computed against estimates

## Why "fix the `retail` field" wasn't the right frame

A single `retail` field can't represent the truth because retail isn't one number. It's a band defined by:

- What the manufacturer sets as MSRP (the floor of "we are not undercharging")
- What the manufacturer-enforced MAP allows advertisers to charge (the legal floor for advertising)
- What retailers ARE charging today (the live market)
- What buyers actually paid in the last 90 days (sold-price reality)
- Whether a manufacturer rebate is currently active (a real, time-bounded discount event)

Without that structure, every other system in the portal — HaggleSheet's "current sell" anchor, Listing Advisor's AI rec explanation, Analytics revenue, the Tires margin column — is forced to fight over a single field whose meaning shifts depending on context.

## The 5-tier architecture

```
tires/{mspn}: {
  // Tier 1 — manufacturer baseline (canonical, rarely drifts)
  baselinePrice: number,
  baselineSource: 'tire-sku-pricing-research-2026-04' | 'michelin-efleet-catalog' | ...,
  baselineEffectiveDate: Timestamp,

  // Tier 2 — Minimum Advertised Price (contract floor; quarterly)
  mapPrice: number | null,
  mapSource: 'tireweb' | 'gemini-extracted' | 'manual',
  mapAsOf: Timestamp,

  // Tier 3 — current retail observed in market
  // (extends existing priceIntel.retailPrice from the nightly Gemini cascade)
  priceIntel: {
    retailPrice: number,
    sources: [{ source: 'gemini_retail_search', at: Timestamp, ... }],
    confidence: 'high' | 'medium' | 'low',
  },

  // Tier 4 — sold-price reality
  soldPriceIntel: {
    avgSoldPrice: number,
    medianSoldPrice: number,
    sampleSize: number,
    timeWindow: '90d' | '30d',
    source: 'ebay-marketplace-insights' | 'apify-ebay-sold' | 'govdeals' | 'state-contract',
    asOf: Timestamp,
  } | null,

  // Tier 5 — active promo events (cross-referenced from a sibling collection)
  activePromoIds: string[],   // doc IDs in pricingEvents

  // Effective `retail` (the value HaggleSheet/Quote/etc. actually read)
  // Computed at write-time by the resolver, with provenance:
  retail: number,
  retailSource: 'manual' | 'sold-price-intel' | 'priceIntel' | 'mapPrice' | 'baselinePrice-derived',
  retailLockedAt: Timestamp | null,  // manual-edit lock; bulk derives skip
}

pricingEvents/{id}: {
  manufacturer: 'michelin' | 'bfgoodrich' | ...,
  type: 'rebate' | 'price-increase' | 'promo-stack',
  startsAt: Timestamp,
  endsAt: Timestamp,
  rebateValueUsd: number | null,
  appliesToTreads: string[] | 'all',  // treadname filter
  excludedRetailers: string[],         // e.g. ['Costco', 'Sam's Club', 'BJ's']
  notes: string,
  pressReleaseUrl: string,
}
```

### Resolver priority

`tires/{mspn}.retail` is computed by a deterministic resolver that picks the highest-confidence available signal:

```
manual (retailLockedAt set)
  > soldPriceIntel.medianSoldPrice (if sample size ≥ 10)
  > priceIntel.retailPrice (if confidence ≥ 'medium' and asOf < 30d)
  > mapPrice (if asOf < 90d)
  > baselinePrice
  > buy * (1 + payoutConfig.targetMarginPct / 100)  // last-resort floor
```

### How active promos affect rendered price

The `retail` field stays at the resolved canonical value. The UI separately reads `activePromoIds` and surfaces "$80 Visa rebate active through May 23" as a chip below the price — it does NOT subtract from `retail`. Listing Advisor uses `activePromoIds` to explain WHY a recommended listing price might be lower this week than next.

## Implementation tiers (patch sequence)

Each tier is independently shippable. The dispatch order matches user's "Tier 1 first, costs $0" priority.

### patch-617 — Tier 1: Baseline ingest from manufacturer PDF

**File:** `docs/handoffs/patch-617-baseline-price-ingest.md` (separate brief)

Parse `Tire SKU Pricing Research.pdf` (located at `C:\Users\Alex\Downloads\Tire SKU Pricing Research.pdf`, NOT in the repo). Extract MSPN → MSRP rows. Bulk-update `tires/{mspn}.baselinePrice` + `baselineSource` + `baselineEffectiveDate`.

Cost: $0. Highest leverage move. Ship first.

### patch-618 — Tier 2: MAP feed

Three options, decide before drafting:
1. Pay for Tireweb Library (~$200-500/mo per industry quotes)
2. Use the nightly Gemini cascade to extract MAP from product pages where it's published
3. Defer indefinitely

If we go (2), it's a small extension to `functions/tirePriceResearch.js` to add MAP extraction to the existing prompt and write `mapPrice` separately from `priceIntel.retailPrice`. ~half day's work.

### patch-619 — Tier 3: Live retail (already exists, formalize)

The nightly Gemini cascade in `functions/tirePriceResearch.js` already populates `priceIntel.retailPrice`. This patch:
1. Adds confidence scoring to the cascade output (high/medium/low based on source agreement count)
2. Stamps `priceIntel.asOf` so the resolver can reject stale data
3. Wires the resolver to copy `priceIntel.retailPrice` → `retail` when other tiers are absent

### patch-620 — Tier 4: Sold-price intel

Three sub-sources, pick top-1 first:

1. **eBay Marketplace Insights API** — gated, needs business approval, ideal long-term
2. **Apify ebay-sold-listings actor** — $5-20/mo, ships next week
3. **GovDeals + state procurement** — public records, free, skews to military/commercial SKUs

Likely sequence: ship Apify first (fastest path to a number), submit eBay business app in parallel, GovDeals later as a per-SKU validator for the commercial half of the catalog (XML/XZL/XFZL).

### patch-621 — Tier 5: pricingEvents collection + rebate calendar

New `pricingEvents` Firestore collection. Seeded from manufacturer press releases (Michelin promotions page, BFG promotions page) on a weekly Cloud Scheduler trigger. When an event opens or closes, post to `#fleet-ops` Slack and update affected tires' `activePromoIds`.

Initial seed includes the events explicitly named in the research PDF:
- Michelin/BFG $80 Visa rebate, 2026-03-26 to 2026-05-23, four-tire eligibility, excludes warehouse clubs
- 7.5% France surcharge as a separate line item (kept un-rolled per portfolio so tariff news = clean event)
- Spring / back-to-school / fall winter rebate windows from the calendar in the PDF

UI surface: a small chip below the price in HaggleSheet / Listing Generator / MarginTable when an active promo applies. Listing Advisor's narrative explanation pulls from this collection.

## Resolver implementation note

The resolver runs in two places:

1. **At write time** — when `priceIntel.retailPrice`, `mapPrice`, or any tier-input updates, a Cloud Function recomputes `retail` and `retailSource`. Single source of truth, deterministic.
2. **In the inline editor** — when admin overrides `retail` via MarginTable inline edit, set `retailLockedAt: serverTimestamp()`. The resolver respects the lock and never overwrites manual edits unless explicitly cleared.

## What this kills from earlier framing

- **Option A (one-shot CSV import as the canonical source)** — replaced by structured tiers
- **Option D (uniform `buy * 1.30` derive)** — kept only as the last-resort floor when all 4 tiers are absent
- **Option E (manual MarginTable edit campaign for 1,160 rows)** — replaced by inline edits as the verification escalation, not the primary path

## Operating constraints (informed by storm session)

- **Manual verification is the bottleneck.** Neither admin nor Kyle can confidently price 1,160 SKUs by hand. So every tier needs to feed the resolver automatically; manual is for spot-fixes, not bulk.
- **Discount Tire blocks scraping; SimpleTire / Tire Rack / Priority Tire / Walmart / independents fetch fine.** This is why Tier 3 (Gemini cascade) needs source-agreement scoring — single-source = low confidence.
- **Prices move ~biweekly.** Resolver staleness windows: Tier 3 < 30d, Tier 2 < 90d, Tier 1 unbounded (with manual portfolio-refresh trigger on Michelin's announced 3.8% Jan 2026 increase).
- **Apify ebay-sold-listings actor** is probably the fastest cheapest unlock for Tier 4 sold-price data. Worth a same-week trial.

## Open decisions parked for later (not blockers)

- Tier 2 paid feed vs. Gemini-extracted (decide based on Tier 3 confidence after patch-619 ships)
- Whether the resolver runs as a Cloud Function or client-side (lean: Cloud Function for write atomicity)
- Whether `retailLockedAt` should expire after N days to force re-verification (debate)
- How activePromoIds should affect the Listing Advisor's AI rec explanation copy (depends on patch-501)

## Decision log from this storm session

- **Source-of-truth hierarchy:** structured tiers, not flat priority list. Resolver picks per-confidence + recency.
- **Master spreadsheet status:** the user's research reports are *additional verification input*, not canonical truth. Verification cost is the bottleneck.
- **Manufacturer baseline (Tier 1) IS canonical truth** — straight from the OEM. Different from "live market retail" which fluctuates.
- **MAP is contractually defined** — not the same as live retail. Worth a separate field.
- **Sold-price reality (Tier 4) is the unique angle** — most resellers don't tap it. eBay Marketplace Insights + GovDeals + state contracts.
- **pricingEvents collection** — promotional cadence is predictable and matters for the Listing Advisor's narrative explanation.

## Next step

Dispatch patch-617 (Tier 1 baseline ingest) first. Other tiers ship in any order after, but recommended sequence is 619 → 621 → 620 → 618 (live retail formalization → events → sold-price intel → MAP).
