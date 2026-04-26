# Tire retail backfill — design spec (DRAFT — needs admin brainstorm)

**Status:** Draft. Surfaced from 2026-04-25 evening production observations. Needs admin input before any code is written.

## Problem

All 1,160 tires in the catalog have estimated retail prices, not real ones. The yellow `EST` indicator next to every retail price reflects this. Practical impact:

- HaggleSheet shows `Current sell: $0.00` because there's no real `retail` field
- Quote and bundle margin math is unreliable on actual deals (we caught a related FET regression in PR #154 only because the test fixture had real FET data)
- Listing Generator has nothing concrete to compare its AI-suggested price against
- Margin column in the Tires catalog is computed against estimates, not real prices, so the 22.6% margin warnings may be inaccurate

## Why it's a "Tier 0" data problem

Without real retail prices, every other pricing-aware feature in the portal (HaggleSheet, QuoteCalculator, Listing Advisor, Analytics revenue) is computing on estimates. The deeper layers we build (Batch 8 desktop polish, Batch 10 refactors, photo libraries, quote sheets) all sit on top of this foundation. Bad foundation = bad results, even with great code on top.

## Options to consider (NOT a recommendation; the brainstorm picks the path)

### Option A — One-shot CSV import from a master spreadsheet

If admin has (or can compile) a spreadsheet of tire MSPN → retail price, write a script `scripts/import-tire-retail-csv.mjs` that reads the CSV and bulk-updates `tires.{mspn}.retail` across Firestore.

**Pro:** Real data, one-pass.
**Con:** Requires admin to compile the spreadsheet first.

### Option B — Auto-derive from existing platform listings

If tires are listed on Facebook Marketplace / OfferUp / Craigslist, scrape (or pull from a stored cache) the listed prices and write them to `retail`.

**Pro:** Self-healing — as listings update, retail updates.
**Con:** Requires platform credentials and scrape infrastructure that doesn't currently exist. Big lift.

### Option C — Auto-derive from `priceIntel.activeRetailPrice` (if it exists)

The codebase has a `priceIntel` field on tires populated by Kyle's research queue. If that field has a `activeRetailPrice` or similar, just copy it to `retail` for every tire that has it.

**Pro:** Uses data Kyle has already entered.
**Con:** Only works for tires Kyle has researched; doesn't help with the long tail.

### Option D — Auto-derive `retail = buy * (1 + targetMargin/100)`

For every tire, compute a default retail = `buy * 1.30` (or whatever the target margin is) and stamp it as `retail`. Mark these clearly as "auto-derived" so they can be overridden later.

**Pro:** Trivial to ship; gets the catalog into a usable state immediately.
**Con:** Not real prices. Would only be a stop-gap until A or C ships.

### Option E — Manual MarginTable inline-edit campaign

The MarginTable already has an inline CTS editor. Extend it to also edit the retail price inline. Admin sits down and edits 1,160 rows. At ~5 sec each = ~90 min of focused work.

**Pro:** Real data, no infrastructure needed.
**Con:** 90 minutes of tedious work. Has to be repeated as new tires are imported.

## Hybrid that probably wins (admin to confirm)

C → D → E in that order:
1. **C first**: copy `priceIntel.activeRetailPrice` to `retail` for every tire that has it (instant, automated)
2. **D for the gap**: for tires without priceIntel, set `retail = buy * 1.30` and mark `retail.source = 'derived'`
3. **E ongoing**: as the admin uses the catalog, override individual rows with real data via the MarginTable inline editor; mark `retail.source = 'manual'`

This gets the catalog usable in hours and gradually heals to real data over weeks.

## Decisions needed before any code

1. **Do we have a master spreadsheet?** (If yes, Option A wins.)
2. **What target margin should the derive formula use?** (1.30? 1.40? `payoutConfig.targetMarginPct`?)
3. **Do we want to track `retail.source` ('priceIntel' / 'derived' / 'manual') so the UI can warn when displaying derived prices?**
4. **Should the inline editor also let the admin set "this is a final retail" so future bulk-derives don't overwrite it?**

## Out of scope for this spec

- Listing platform scraping (separate effort if we go Option B)
- Sale price vs. listed retail vs. negotiated final — those are downstream of having ANY real retail anchor

## Next step

Admin brainstorm session: pick the hybrid path, answer the four decisions, then write the implementation plan.
