---
patch: 618
title: Tier 2 — MAP (Minimum Advertised Price) feed
status: outline-only
priority: P2 — gates "defensible advertised floor" claim
depends_on: [617]
spec: docs/superpowers/specs/2026-04-25-tire-retail-backfill-design.md
batch: pricing-architecture
---

# patch-618 — Tier 2 MAP feed (outline)

**Not ready to dispatch.** Needs a vendor decision first.

## Decision needed

Three paths, pick one before drafting the implementation:

1. **Pay for Tireweb Library** (industry quote: $200–500/mo). Returns MAP data via REST API. Hands-off, contractually clean.
2. **Extend the nightly Gemini cascade** to extract MAP from product pages where retailers publish it (often as "MAP" or "Minimum Advertised Price" in product details / dealer portals). ~half a day to implement; same operating cost as today.
3. **Defer indefinitely.** Skip Tier 2 for now; rely on Tier 1 (baseline) and Tier 3 (live retail) for the resolver. MAP becomes a future addition if/when contract enforcement matters for the business.

## Recommendation (informed by storm session)

Start with **(2) Gemini extraction**. It costs nothing extra, ships next week, and gives us a sample to evaluate signal quality. If the extracted MAP values look reliable, never pay for Tireweb. If they don't, switch to (1) with a real cost-benefit case.

## Implementation sketch (assuming path 2)

In `functions/tirePriceResearch.js`, extend the existing prompt to ask Gemini to return both `retailPrice` AND `mapPrice` per tire it finds. Write `mapPrice`, `mapSource: 'gemini-extracted'`, and `mapAsOf` separately from `priceIntel.retailPrice`.

Resolver consumes `mapPrice` between Tier 3 (live retail, recent) and Tier 1 (baseline) per the priority chain in the spec.

## Open questions

- How often do retailers publish MAP visibly? May be hidden in B2B portals only; Gemini can't access those.
- Quarterly cadence: is it worth a separate weekly job, or fold into the nightly?
- If admin opts for path (1) Tireweb later, does that displace path (2) entirely or layer on top?
