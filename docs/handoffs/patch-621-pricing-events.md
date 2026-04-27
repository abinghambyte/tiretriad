---
patch: 621
title: Tier 5 — pricingEvents collection + manufacturer rebate calendar
status: ready-to-dispatch (after 617)
priority: P1 — Listing Advisor's "WHY this price" depends on this
depends_on: [617]
spec: docs/superpowers/specs/2026-04-25-tire-retail-backfill-design.md
batch: pricing-architecture
---

# patch-621 — Tier 5 pricingEvents collection

## Goal

Build a structured `pricingEvents` Firestore collection that captures manufacturer promotional cadence (rebates, price increases, tariff surcharges, promo windows) so the Listing Advisor can explain WHY a recommended price is right this week and might be different next week.

The promo cadence is published, predictable, and tied to known seasons (spring rebate window, back-to-school, fall winter prep). Putting it in a collection means:

1. UI can show "active promo: $80 Visa rebate through May 23" as a chip below the price in HaggleSheet / MarginTable / Listing Generator
2. Listing Advisor's narrative explanation pulls live: "Recommended at $X this week — manufacturer is running a Visa rebate, so listing $5 lower expects to convert better"
3. Slack `#fleet-ops` gets a notification when an event opens or closes

## What ships

### 1. New Firestore collection: `pricingEvents/{id}`

Schema:

```js
{
  manufacturer: 'michelin' | 'bfgoodrich' | 'general' | ...,
  type: 'rebate' | 'price-increase' | 'promo-stack' | 'tariff-surcharge',
  startsAt: Timestamp,
  endsAt: Timestamp,
  rebateValueUsd: number | null,        // for type=rebate
  priceChangePct: number | null,         // for type=price-increase or tariff
  appliesToTreads: string[] | 'all',    // tread-name filter (e.g., ['XLEZ', 'XDS'])
  appliesToManufacturer: string | 'all',
  excludedRetailers: string[],           // e.g., ['Costco', 'Sam's Club', 'BJ's']
  notes: string,
  pressReleaseUrl: string,
  createdAt: Timestamp,
  createdBy: string | null,
  archived: boolean,
}
```

### 2. Initial seed

Seed from the events explicitly named in the research PDF:

- **Michelin/BFG $80 Visa rebate**, 2026-03-26 → 2026-05-23, four-tire eligibility (passenger or LT), excludes warehouse clubs
- **7.5% France surcharge** as a separate `tariff-surcharge` event with `endsAt: null` (open-ended until tariffs lifted)
- **Michelin 3.8% portfolio increase** effective 2026-01-01 (a one-time `price-increase` event; informational; baseline already reflects post-increase)

Ship in a `scripts/seed-pricing-events.mjs` file. Dry-run by default; `--apply` writes.

### 3. Cloud Scheduler weekly poll

`functions/checkManufacturerPromos.js` — runs weekly:

1. Fetches Michelin's promotions page + BFG's promotions page (HTML, parseable)
2. Asks Gemini to extract any new event records from the page text
3. Writes new `pricingEvents` entries (skipping duplicates by URL)
4. Posts to `#fleet-ops` Slack when a new event is detected or when an existing event opens/closes

### 4. Tire ↔ event correlation

When a `pricingEvents` doc is created or its dates change, run a small backfill that updates `tires/{mspn}.activePromoIds` for every matching tire (filter by `manufacturer` + `appliesToTreads`).

When a tire is rendered (HaggleSheet, MarginTable, Listing Generator), the UI joins on `activePromoIds` to fetch active event records and show chips.

### 5. UI surfaces (defer to a follow-up if scope creeps)

Initial UI: a single small chip below the price showing "Promo: $80 rebate active". Don't try to explain mechanics in chip — clicking opens a tooltip with full event details.

Defer the Listing Advisor's narrative-explanation integration to a separate patch once Listing Advisor is generally healthier (see patch-501).

## Tests

- `functions/checkManufacturerPromos.test.js` — fixture HTML pages, assert correct event extraction
- `scripts/seed-pricing-events.test.mjs` — assert seeded events match expected shape
- `pricingEvents` security rules: read-everyone, write-admin-only

## Acceptance

- [ ] `pricingEvents` collection exists with at least 3 seeded entries
- [ ] At least one tire (e.g., Michelin LTX) has `activePromoIds` populated correctly
- [ ] Cloud Scheduler weekly job deployed; first run completes without errors
- [ ] Slack `#fleet-ops` receives an event open/close notification at least once
- [ ] HaggleSheet / MarginTable / Listing Generator each render a chip when a tire has `activePromoIds.length > 0`

## Notes for the agent

- The manufacturer promo HTML pages can change format. The Gemini extraction step is brittle by design — log every extraction and let admin spot-check Slack notifications until the cadence is trusted.
- Don't auto-archive expired events — they're useful for historical analytics ("how many promo windows did we list during last year?"). Just stop matching `activePromoIds`.
- Tariff surcharge events have `endsAt: null` until the tariff is lifted. Listing Advisor copy needs to handle that gracefully.
- The 7.5% France surcharge is tracked SEPARATELY from MSRP per the spec — don't roll it into baseline. The point of the separate event is so we can react instantly when tariffs change.
