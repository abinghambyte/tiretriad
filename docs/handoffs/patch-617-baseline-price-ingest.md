---
patch: 617
title: Tier 1 — Ingest manufacturer baseline prices from research PDF
status: ready-to-dispatch
priority: P0 — gates trustworthy margin math everywhere
depends_on: []
spec: docs/superpowers/specs/2026-04-25-tire-retail-backfill-design.md
batch: pricing-architecture
---

# patch-617 — Tier 1 baseline price ingest

## Goal

Stamp every tire in `tires/{mspn}` with a `baselinePrice` field — the manufacturer's MSRP from the canonical research PDF. This is the single highest-leverage move in the pricing-architecture rollout: it costs $0, takes hours not days, and gives every other pricing tier a fixed reference point that doesn't drift with retail noise.

After this lands, HaggleSheet stops showing `Current sell: $0.00` for SKUs the resolver can fall back to baseline on. Margin math gets a real anchor for the long tail. Listing Advisor's AI explanation gets "this is X% above baseline" as a defensible framing.

## Source

`Tire SKU Pricing Research.pdf` — admin-supplied research file. **Not in the repo.** Located at `C:\Users\Alex\Downloads\Tire SKU Pricing Research.pdf` on the admin's machine. Coordinate with admin to upload the PDF to a project-internal Cloud Storage bucket (e.g., `gs://skedaddle-inventory-research/Tire_SKU_Pricing_Research.pdf`) so the ingest script reads from a stable URL, not a local path.

The PDF contains the official Michelin / BFGoodrich baseline price matrix per MSPN, sourced directly from the manufacturer. Per the admin: "That IS canonical truth, straight from the manufacturer."

## What ships

### 1. PDF → CSV extraction (one-time, manual review step)

Write `scripts/extract-pricing-pdf-to-csv.mjs`. It:

1. Reads the PDF (use `pdf-parse` npm package — already in the Node ecosystem)
2. Extracts every row that looks like `<MSPN> ... <price>` 
3. Writes `scripts/pricing-data/baseline-2026-04.csv` with columns: `mspn`, `brand`, `tread`, `description`, `baselinePrice`, `effectiveDate`
4. Does NOT touch Firestore — the CSV is for admin review before ingest

**Decision needed before running:** the PDF may have multiple price columns (MSRP, dealer cost, wholesale). Extract MSRP only. If column headers are ambiguous, the script should print all column-name candidates and ask the admin to pick before parsing rows.

### 2. CSV → Firestore ingest

Write `scripts/import-tire-baseline-csv.mjs`. It:

1. Reads `scripts/pricing-data/baseline-2026-04.csv`
2. For each row, looks up the matching tire by MSPN
3. Stamps:
   ```js
   {
     baselinePrice: <number>,
     baselineSource: 'tire-sku-pricing-research-2026-04',
     baselineEffectiveDate: <Timestamp from CSV row>,
   }
   ```
4. Defaults to dry-run; `--apply` writes; `--restore` clears the three fields. Same pattern as `scripts/archive-test-data.mjs`.
5. Reports MSPNs in the CSV that have no matching Firestore tire (these need manual review — typo? new SKU?)
6. Reports MSPNs in Firestore that have no CSV row (these don't have manufacturer baseline yet — Tier 2/3/4 fallbacks pick up).

### 3. Firestore schema notes

Three new fields per tire:
- `baselinePrice: number` (USD)
- `baselineSource: string` (provenance)
- `baselineEffectiveDate: Timestamp`

Coordinate with `functions/tirePriceResearch.js` (the nightly Gemini cascade): it should NOT overwrite `baselinePrice`. That field is set by this ingest only and refreshed manually when the manufacturer announces a portfolio increase (e.g., the 3.8% Jan 2026 increase noted in the research PDF).

### 4. Tests

- `scripts/extract-pricing-pdf-to-csv.test.mjs` (a small fixture PDF or mocked pdf-parse output, asserting MSPN+price extraction)
- `scripts/import-tire-baseline-csv.test.mjs` (mock Firestore, assert correct field writes, dry-run vs apply, restore)

### 5. Documentation

Update `docs/AI-CONTEXT.md`'s pricing model section:

```
## Pricing model (critical — do not get this wrong)
- price field = Kyle's buy price per tire from CSV. Already populated for all 1,160 tires.
- baselinePrice (NEW, Tier 1) = manufacturer MSRP from research PDF. Set once via
  scripts/import-tire-baseline-csv.mjs. Refreshed only when a manufacturer
  announces a portfolio price change. NEVER auto-updated by the nightly cascade.
- mapPrice (Tier 2) = manufacturer-enforced minimum advertised price. Quarterly.
- priceIntel.retailPrice (Tier 3) = current live retail observed by the nightly
  Gemini cascade across multiple retailer sources.
- soldPriceIntel (Tier 4) = what buyers actually paid. eBay/GovDeals/state contracts.
- retail = the resolver's chosen value. Read by HaggleSheet/Quote/MarginTable.
  Compute order: manual > soldPriceIntel.median (n>=10) > priceIntel.retailPrice
  (recent + medium+ confidence) > mapPrice > baselinePrice > buy*targetMargin.
- retailLockedAt: Timestamp = manual-edit lock. Resolver skips when set.
```

## Out of scope

- The resolver Cloud Function (separate patch — wire it up after at least 2 tiers exist)
- Tier 2/3/4/5 (separate patches: 618, 619, 620, 621)
- HaggleSheet UI changes to show provenance ("Baseline $X • MAP $Y • Live $Z") — defer until 3 tiers populated

## Acceptance

- [ ] `scripts/extract-pricing-pdf-to-csv.mjs` produces a CSV that the admin reviews and approves
- [ ] `scripts/import-tire-baseline-csv.mjs --apply` runs end-to-end against production after dry-run looks right
- [ ] At least 50% of the 1,160 catalog tires have `baselinePrice` set (the rest are SKUs the PDF didn't cover; that's expected and fine)
- [ ] `tires/{mspn}` for a sampled MSPN viewed in Firebase Console shows the three new fields with correct values
- [ ] `docs/AI-CONTEXT.md` updated
- [ ] Existing nightly Gemini cascade verified to NOT touch `baselinePrice` (manual code review of `functions/tirePriceResearch.js`)
- [ ] No regression in HaggleSheet, MarginTable, QuoteCalculator (visual + behavioral) — these still read from `retail`, which this patch doesn't touch yet (the resolver wiring comes in a later patch)

## Notes for the agent

- This is a **scripts-only patch**. No React component changes. No new functions in `functions/`. No new collections.
- Cost guard: PDF parsing happens once on the admin's machine, then the CSV is committed (or stored in a private bucket — admin's call). Don't run pdf-parse in production.
- If `pdf-parse` doesn't reliably extract the table structure, fall back to having the admin export the PDF to CSV via a desktop tool (Acrobat, Tabula, online converter) and skip step 1 entirely. The Firestore ingest is the only step that MUST run programmatically.
- The PDF is admin-confidential — Michelin pricing is contractual. Don't commit the PDF to the repo. Commit the extracted CSV only if admin approves; otherwise keep it in a private Cloud Storage bucket.
