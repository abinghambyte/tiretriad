---
patch: 620
title: Tier 4 — Sold-price intel (eBay / GovDeals / state contracts)
status: outline-only
priority: P2 — unique angle most resellers don't have
depends_on: [619]
spec: docs/superpowers/specs/2026-04-25-tire-retail-backfill-design.md
batch: pricing-architecture
---

# patch-620 — Tier 4 sold-price intel (outline)

**Outline only.** Three sub-sources, each with its own integration. Pick top-1 to ship first; the others can layer on independently.

## Sub-source A — Apify ebay-sold-listings actor (recommended first)

- $5–20/mo, ships in days not weeks
- Returns last-90-day completed sales by GTIN/EPID across 8 marketplaces, with average, median, and recommended listing price
- Wraps a public actor; we don't operate eBay infrastructure ourselves
- New Cloud Scheduler weekly job → calls Apify API → writes `tires/{mspn}.soldPriceIntel`

Field shape (per spec):
```js
soldPriceIntel: {
  avgSoldPrice: number,
  medianSoldPrice: number,
  sampleSize: number,
  timeWindow: '90d',
  source: 'apify-ebay-sold',
  asOf: Timestamp,
}
```

Resolver consumes when `sampleSize >= 10`.

## Sub-source B — eBay Marketplace Insights API

- Same data, official channel
- Gated behind business-level approval; submit application in parallel with shipping (A)
- Once approved, swap `source: 'ebay-marketplace-insights'`; everything else stays the same
- Reference: see `memory/reference_ebay_developer_program.md` for what we already know about eBay's growth gates

## Sub-source C — GovDeals + state procurement

- Public records, free
- Skews to military/commercial SKUs (XML / XZL / XFZL family in our catalog)
- Implementation: scrape closed auction pages on a schedule; parse hammer prices
- Lower priority unless the commercial half of the catalog is generating real listings

## Decision log

- Apify-first because: cheapest, fastest, no contractual gate
- GovDeals deferred until commercial-tire activity justifies the scrape infrastructure
- All three write to the same `soldPriceIntel` field; `source` provenance distinguishes them

## Acceptance (per sub-source)

- [ ] A: Apify integration writing valid `soldPriceIntel` for at least 30% of catalog (eBay coverage of military/commercial SKUs is sparse)
- [ ] A: Resolver (patch-619) consumes the new data correctly when `sampleSize >= 10`
- [ ] B: eBay business-approval submitted (not a code task; tracking only)
- [ ] C: skipped until commercial-tire revenue makes it worthwhile

## Notes for the agent

- This patch is layered. Ship A standalone first; B and C are follow-ups.
- The Apify API key is a secret — store via Firebase Secret Manager, NEVER in a committed env file.
- Validate the actor's output schema before trusting it; Apify actors can be community-maintained and unstable.
