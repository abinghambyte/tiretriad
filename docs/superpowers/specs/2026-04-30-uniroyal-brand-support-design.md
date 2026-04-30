# Uniroyal brand support — design spec

**Date:** 2026-04-30
**Branch:** `uniroyal-import`
**Status:** Design approved (in-session brainstorm); awaiting plan generation.

## Goal

Extend the existing Michelin eFleet HTML importer (`scripts/import-efleet-categories.mjs`, to be renamed `scripts/import-efleet.mjs`) so that in addition to writing `meta/categoryMap`, it also creates and updates tire docs in the `tires` Firestore collection. This makes the eFleet HTML the single source of truth for both categorization AND inventory across all three brands the Loveland account carries (Michelin, BFGoodrich, Uniroyal). The immediate business win is **adding ~120+ Uniroyal SKUs to the catalog** — the brand the portal renders correctly today but has zero data for.

## Background

Comparison of `scripts/tires.csv` (1,160 SKUs) against the Michelin eFleet HTML report (1,385 SKUs, dated 2026-04-19) revealed:

- **Pricing parity is exact** across all 817 overlapping MSPNs (\$0.00 average delta) — the eFleet HTML's "Price" column is the canonical buy cost Skedaddle pays for each brand under the Loveland program
- **Uniroyal is in the eFleet HTML** alongside Michelin and BFGoodrich (~120+ SKUs across Laredo AT, Laredo HT, Tiger Paw Touring A/S, Power Paw A/S)
- **Portal has zero Uniroyal SKUs.** The brand color token `--color-brand-uniroyal: #2e7d4a` already exists in `src/index.css`; the portal's existing brand-color treatment will pick it up automatically when Uniroyal rows render
- **The CSV importer (`scripts/import-tires-csv.mjs`)** is the historical seed path for tires.csv. It stays as a manual override path, not deprecated, but the eFleet importer becomes the primary monthly source

`tire.price` is the canonical BUY cost per `AGENTS.md` and `src/utils/tireCatalogBuy.js`. `tire.priceIntel.retailPrice` is the Gemini-researched consumer retail layer (separate cron, untouched by this importer). The eFleet HTML's "Price" column maps directly to `tire.price`.

## Non-goals

- Admin upload UI for eFleet HTML (deferred — Later tier)
- Override admin UI for category corrections (deferred)
- Customer-facing buy/retail visibility (internal tool only)
- Brand-specific overhead rules (Uniroyal will use the same overhead model as Michelin/BFG; revisit if margin patterns reveal mis-calibration)
- Backfill `firstSeenInEfleetAt` on existing CSV-seeded docs (semantic is "imported from eFleet, this run")
- Auto-trigger Gemini retail research on insert (existing cron picks up new docs on its next run)
- Tire-photo seeding for new SKUs (eFleet HTML doesn't include images)
- Reporting/analytics changes for the brand expansion (existing dashboards consume whatever brands exist)
- Migration from CSV to eFleet as the canonical path (CSV stays as manual override)

## Architecture

```
                    ┌──────────────────────────────────┐
                    │  scripts/import-efleet.mjs       │
                    │  (renamed from -categories.mjs)  │
                    │                                  │
                    │  npm run import:efleet -- *.html │
                    │    [--dry-run] [--yes]           │
                    │    [--apply-updates] [--quiet]   │
                    │    [--verbose]                   │
                    │    [--allow-mass-offprogram]     │
                    └────────────────┬─────────────────┘
                                     │
                                     ▼
                    ┌──────────────────────────────────┐
                    │  parseEfleetCatalog(html)        │
                    │  returns:                        │
                    │   { categoryMap,                 │
                    │     tireRecords[],               │
                    │     account, sourceReportDate,   │
                    │     totalParsed,                 │
                    │     warnings[] }                 │
                    │                                  │
                    │  tireRecords[i] = {              │
                    │    mspn, brand, tread, desc,     │
                    │    lr, fet, price, category,     │
                    │  }                               │
                    └────────────────┬─────────────────┘
                                     │
                                     ▼
                    ┌──────────────────────────────────┐
                    │  planTirePhases(                 │
                    │    existingDocs, tireRecords)    │
                    │  returns:                        │
                    │   { inserts[],                   │
                    │     offProgramSets[],            │
                    │     offProgramClears[],          │
                    │     fieldDiffs[],                │
                    │     brandConflicts[] }           │
                    └────────────────┬─────────────────┘
                                     │
                                     ▼
                    ┌──────────────────────────────────┐
                    │  Four Firestore write phases     │
                    │  (in order, atomic per phase)    │
                    │                                  │
                    │  1. meta/categoryMapStaging      │
                    │     → meta/categoryMap           │
                    │     (existing behavior)          │
                    │                                  │
                    │  2. tires/{new MSPN} INSERTS     │
                    │     batched, set({merge:true})   │
                    │                                  │
                    │  3. tires/{existing} OFF-PROG    │
                    │     set offProgramAt or clear it │
                    │                                  │
                    │  4. tires/{existing} UPDATES     │
                    │     ONLY when --apply-updates    │
                    │     diff logged + capped output  │
                    │     otherwise                    │
                    └──────────────────────────────────┘
```

Three-layer flow:
1. **Parse (offline, pure):** HTML → `{ categoryMap, tireRecords[], …, warnings }`. No I/O.
2. **Plan (offline, pure):** `(existingFirestoreDocs, tireRecords) → plan`. Decides which phase each row falls into. No I/O.
3. **Write (Firestore admin SDK):** Four phases, in order. Phase 4 gated by `--apply-updates`.

Why pure parse + pure plan + impure write:
- Pure functions are unit-testable without Firestore
- The plan's decisions (insert vs off-program-set vs off-program-clear vs diff vs skip) are the riskiest logic, so they're isolated
- The writer is thin orchestration

## Field mapping

### Per-row eFleet HTML → tire doc

```js
{
  // From the HTML row's <td> cells:
  mspn:        '11111',                        // MSPN cell (monospace)
  tread:       'XPS RIB',                      // Tread/Model cell
  description: 'LT245/75R16 XPS RIB LRE',      // Description cell
  lr:          'E',                            // LR cell ('—' coerced to '')
  fet:         0.00,                           // FET ('$0.00' → 0, number)
  price:       291.20,                         // Price ('$291.20' → 291.20, number)
                                               //   = canonical buy cost

  // Derived from the parent brand-section:
  brand:       'MICHELIN',                     // <div class="brand-title …">
                                               //   bfg→BFGOODRICH
                                               //   mich→MICHELIN
                                               //   uni→UNIROYAL

  // Derived from the parent cat-section:
  category:    'lightTruck',                   // already extracted today

  // Set by the writer (NOT in the HTML):
  firstSeenInEfleetAt: <serverTimestamp>,      // on insert ONLY; never updated

  // The Gemini retail cron populates these later, untouched by importer:
  priceIntel: { /* … */ },
}
```

### Brand inference

Brand comes from the CSS class on `<div class="brand-title …">`:

```js
const BRAND_CLASS_MAP = {
  bfg:  'BFGOODRICH',
  mich: 'MICHELIN',
  uni:  'UNIROYAL',
}
```

Asserts on what doesn't drift. Visible text (`Michelin®`, `Michelin North America`, etc.) might be reformatted; CSS classes are stable identifiers.

### Per-cell coercions

| Cell | Coercion |
|---|---|
| LR `—` | `''` (matches existing CSV convention) |
| LR `E` (or any single letter) | upper-case string |
| FET `$0.00` | `0` (number) |
| FET `$25.23` | `25.23` (number) |
| Price `$291.20` | `291.20` (number) |
| Price `PQL` (price quoted locally) | **row skipped**, warning logged |
| Description with stray HTML entities | normalized via existing whitespace/entity logic |

### Edge cases in mapping

| Edge | Behavior |
|---|---|
| Brand-section with no recognized CSS class | Skip the entire brand-section, log warning |
| Duplicate MSPN appearing in multiple cat-sections | Last-seen wins; flagged in returned warnings list |
| Cell missing in HTML row | Insert with reasonable default + warning (LR `''`, FET `0`, tread `''`, description `''`) |
| MSPN missing in row | Row skipped entirely |

## Update behavior for existing docs (Mode C — diff-only)

The script never auto-updates fields on existing tire docs. It logs a diff during Mode 2 (default safe write) and only writes the diff when Mode 3 (`--apply-updates`) is invoked.

### Phase decisions per MSPN

| State in Firestore | State in HTML | Phase |
|---|---|---|
| Doc exists, no `archivedAt` | MSPN present | Phase 4: diff fields if any drift; logged or applied per flag |
| No doc | MSPN present | Phase 2: insert as new tire doc |
| Doc exists, no `archivedAt` | MSPN absent | Phase 3: set `offProgramAt: serverTimestamp()` (only if not already set) |
| Doc exists with `offProgramAt` | MSPN present | Phase 3: delete the `offProgramAt` field (re-emergence) |
| Doc has `archivedAt` | (any) | Skip entirely — archived rows aren't part of any phase |

### Off-program tagging rules

| Scenario | Behavior |
|---|---|
| MSPN in Firestore, NOT in HTML, no existing `offProgramAt` | Set `offProgramAt: serverTimestamp()` |
| MSPN in Firestore, NOT in HTML, already has `offProgramAt` | **No write.** Don't refresh the timestamp on every run. |
| MSPN in Firestore WITH `offProgramAt`, AND in HTML this run | Delete the `offProgramAt` field (Michelin re-added it) |
| New MSPN being inserted | Doc has no `offProgramAt` field |

### `firstSeenInEfleetAt` rules

| Scenario | Behavior |
|---|---|
| New MSPN, doc inserted by importer | Set `firstSeenInEfleetAt: serverTimestamp()` |
| Existing doc (CSV-seeded), now appears in HTML | **Don't backfill.** Field semantic is "the eFleet importer was the source of truth that created this doc." |
| Re-run on same HTML | No-op |

### Override fields the importer NEVER touches

Even with `--apply-updates`:

| Field | Why preserved |
|---|---|
| `categoryOverride` | Admin manual category correction |
| `priceIntel.*` (entire subobject) | Gemini cron's territory |
| `priceIntel.activeBuyPrice` | Admin buy-price override (preferred by `tireCatalogBuyNumber` over `price`) |
| `archivedAt` | Soft-delete state |
| `notes`, `tags`, any non-eFleet-sourced field | User-edited metadata |

Importer's update phase touches **only** `price`, `fet`, `description`, `lr`, `tread`, `brand`, `offProgramAt` (importer-managed), `firstSeenInEfleetAt` (importer-managed, on insert only).

### Brand-mismatch handling

| Scenario | Behavior |
|---|---|
| MSPN exists in Firestore as `MICHELIN`, eFleet HTML shows `UNIROYAL` for same MSPN | Hard warning logged. Does NOT auto-rebrand without `--apply-updates`. Brand changes are rare and almost always indicate data error. |
| Same MSPN in two brand-sections within one HTML | Last-seen wins for both `brand` and `categoryMap` entry; warning logged |

## CLI flags + workflow modes

| Flag | Effect |
|---|---|
| `--dry-run` / `-n` | Parse + print full diff. **No writes.** No credentials needed. |
| `--yes` | Skip confirm prompt. Required to actually write. |
| `--apply-updates` | Phase 4 also runs (sync existing docs). Default off. |
| `--quiet` | Suppress per-MSPN diff output (just summary counts). For automation. |
| `--verbose` | Print full diff regardless of length. (Default caps to first 30 changed docs.) |
| `--allow-mass-offprogram` | Override the safety check that aborts when Phase 3 would tag >10% of all tire docs. |
| Unknown flag | Reject with usage message + exit 1 |

### Modes

**Mode 1 — Dry run (no writes):**
```bash
npm run import:efleet -- catalog.html --dry-run
```
Parse + print. No `GOOGLE_APPLICATION_CREDENTIALS` required.

**Mode 2 — Default safe write:**
```bash
npm run import:efleet -- catalog.html --yes
```
Phases 1, 2, 3 run. Phase 4 logs diff but doesn't apply.

**Mode 3 — Apply updates:**
```bash
npm run import:efleet -- catalog.html --yes --apply-updates
```
All four phases run. Use after reviewing Mode 2's diff.

**Mode 4 — Apply quiet (CI/automation):**
```bash
npm run import:efleet -- catalog.html --yes --apply-updates --quiet
```
Skips interactive prompts. For the future scheduled monthly import (Later-tier roadmap item).

### Phase 3 mass-off-program safety

If Phase 3 would tag more than 10% of all existing tire docs as off-program, abort with warning. Operator must pass `--allow-mass-offprogram` to override. Catches the case where the HTML is partially exported (some sections missing) and the script would otherwise silently mark hundreds of in-stock SKUs off-program.

### Diff output cap (Mode 2)

Mode 2's existing-doc diff is printed inline. To prevent a wall of text on the first run:
- First 30 changed docs printed in full
- Then summary: `… and 47 more existing docs differ. Use --verbose to see all, or --apply-updates to commit.`

## Data model

### Firestore: `tires/{tireId}` (existing collection — additive fields)

```js
{
  // Existing fields (untouched semantics):
  brand:        'UNIROYAL',
  tread:        'LAREDO AT',
  mspn:         '62707',
  description:  '225/65R17 102H LAREDO AT',
  lr:           '',
  fet:          0,
  price:        145.20,                 // = buy cost (canonical, per AGENTS.md)
  // ... other existing fields untouched

  // Optional, set on tire docs created by the importer ONLY:
  firstSeenInEfleetAt: <Timestamp>,    // OPTIONAL; only on importer-created docs

  // Optional, set on existing tire docs whose MSPN dropped out of eFleet:
  offProgramAt: <Timestamp>,            // OPTIONAL; cleared on re-emergence

  // (Existing fields the importer NEVER touches:)
  categoryOverride:           'lightTruck',         // OPTIONAL
  priceIntel:                 { /* ... */ },        // OPTIONAL
  archivedAt:                 <Timestamp>,           // OPTIONAL
  // ... etc.
}
```

No migration. Existing docs (1,160) remain unchanged unless they appear in the eFleet HTML; even then, only get diffed (Mode 2) or updated (Mode 3 with `--apply-updates`).

### Firestore: `meta/categoryMap` (existing — unchanged)

```js
{
  version: 1,
  importedAt: <Timestamp>,
  sourceFile: 'Michelin_eFleet_Catalog_2026-04-19.html',
  sourceReportDate: '2026-04-19',
  account: '1580951 SKEDADDLE INC LOVELAND',
  totalParsed: 1385,
  mspns: { '13712': 'truck', '76025': 'lightTruck', /* ... */ },
}
```

The categoryMap doc shape is unchanged. Phase 1 still writes it exactly as today.

### Pure-function contracts

```js
parseEfleetCatalog(html: string): {
  mspns: Record<string, 'passenger' | 'lightTruck' | 'truck'>,
  tireRecords: Array<{
    mspn: string,
    brand: 'MICHELIN' | 'BFGOODRICH' | 'UNIROYAL',
    tread: string,
    description: string,
    lr: string,
    fet: number,
    price: number,
    category: 'passenger' | 'lightTruck' | 'truck',
  }>,
  account: string | null,
  sourceReportDate: string | null,
  totalParsed: number,
  warnings: Array<{ kind: string, message: string, mspn?: string }>,
}

planTirePhases(
  existingDocs: Array<{ id: string, /* tire fields */ }>,
  tireRecords: Array<{ /* from parser */ }>
): {
  inserts: Array<{ /* tire doc to write with set({merge:true}) */ }>,
  offProgramSets: Array<{ id: string }>,           // MSPNs to tag
  offProgramClears: Array<{ id: string }>,         // MSPNs whose offProgramAt to delete
  fieldDiffs: Array<{
    id: string,
    mspn: string,
    changes: Array<{ field: string, from: any, to: any }>,
  }>,
  brandConflicts: Array<{ mspn: string, existingBrand: string, htmlBrand: string }>,
  skipped: Array<{ id: string, reason: 'archivedAt' | 'pql' | 'malformed' }>,
}
```

## Testing strategy

### Pure-function tests (vitest)

| Test | File | Asserts |
|---|---|---|
| Parser returns `tireRecords[]` with all fields | `scripts/import-efleet-categories.test.mjs` | Per-row mspn, brand, tread, description, lr, fet, price, category populated |
| Brand inference from CSS class | same | bfg→BFGOODRICH, mich→MICHELIN, uni→UNIROYAL; unrecognized class → row skipped |
| Per-cell coercion | same | LR `—`→`''`, FET `$0.00`→`0`, Price `$291.20`→`291.20`, PQL → skip |
| Duplicate MSPN handling | same | Last-seen wins; warning in returned warnings list |
| Brand mismatch detection | same | Cross-brand-section MSPN flagged |
| `planTirePhases` insert path | new test | New MSPN → goes to `inserts[]` with full record |
| `planTirePhases` off-program set | new test | Existing doc, MSPN absent from HTML → `offProgramSets[]` |
| `planTirePhases` off-program clear (re-emergence) | new test | Doc with `offProgramAt`, MSPN present → `offProgramClears[]` |
| `planTirePhases` field diff | new test | Existing doc, drift in price/fet/etc → `fieldDiffs[]` with exact change list |
| `planTirePhases` archived skip | new test | Doc with `archivedAt` → `skipped[]` regardless of HTML state |
| `planTirePhases` preserves overrides | new test | `priceIntel.activeBuyPrice` present + price drift → `fieldDiffs` does NOT include `price` change for that doc |
| `planTirePhases` brand conflict | new test | Existing brand differs from HTML brand → `brandConflicts[]` |
| `planTirePhases` first-seen | new test | Insert plan includes `firstSeenInEfleetAt`; existing-doc plan does NOT backfill it |

### Fixture HTML extension

`scripts/__fixtures__/efleet-sample.html` grows from 6 SKUs to ~12 SKUs covering:
- Each brand × each category (3 × 3 = 9 base rows)
- One PQL row (skipped)
- One row with `—` LR
- One row with missing tread

### Integration tests

Skipped for v1. The Firestore writer is thin orchestration around `db.doc().set()`. The planning layer is fully unit-tested. Manual integration verification on production substitutes for the missing emulator setup.

### Manual verification (post-import on prod)

- [ ] Refresh `/tires` — Uniroyal SKUs visible (~120+ rows, Brand column shows `UNIROYAL`)
- [ ] Filter by Brand=Uniroyal works
- [ ] CategoryTabs counts shift to reflect Uniroyal additions in Passenger/Light Truck splits
- [ ] Brand-color row accent on Uniroyal rows uses `--color-brand-uniroyal: #2e7d4a`
- [ ] Hidden Gems / Top Sellers / Dashboard widgets keep working (no broken queries)
- [ ] `priceIntel.retailPrice` for new Uniroyal SKUs starts blank → Gemini cron fills it in over the next 24h
- [ ] No tire docs got `offProgramAt` accidentally set (would mean a Michelin/BFG MSPN was missing from HTML — investigate if so)
- [ ] All ~120 Uniroyal docs carry `firstSeenInEfleetAt`; no Michelin/BFG existing docs got the field

## Risks & mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| First-run produces a 1,160-row diff because every Michelin/BFG existing doc differs slightly from current eFleet | High | Low (informational only — no auto-write in Mode 2) | Mode 2's diff cap (first 30 + summary) keeps console manageable; operator reviews before `--apply-updates` |
| Brand-section CSS classes change in a future Michelin export | Low (over time) | Medium (parser breaks) | Parser asserts on cover-page sentinels; add similar assertion that ≥1 brand-section per cat-section was found, fail loud if zero |
| Phase 2 partial failure leaves some Uniroyal docs inserted, others not | Low | Low | Firestore batch writes (500-doc cap, multiple batches if needed). If a batch fails, prior batches remain. Re-run is idempotent. |
| Phase 3 off-program flood (HTML missing many MSPNs that ARE actually still active, e.g., partial export) | Medium | Medium | Sanity check: if Phase 3 would tag >10% of all Firestore tire docs, abort with warning. `--allow-mass-offprogram` to override. |
| Brand mismatch scenarios | Low | Medium | Hard warning logged; brand stays unchanged unless `--apply-updates`. |
| `priceIntel.activeBuyPrice` override gets ignored | None | None | Importer never touches `priceIntel.*`. The selector `tireCatalogBuyNumber` already prefers `priceIntel.activeBuyPrice` when set. |
| Re-run on same HTML | Low | None | Re-run idempotent by design — categoryMap full replace, inserts skip existing, off-program writes are no-op when already set, updates are gated by flag |
| `priceIntel.retailPrice` cron doesn't pick up new Uniroyal SKUs | Low | Medium | Cron queries all tire docs; new Uniroyal docs land in the same collection. Verify in manual check. |
| `meta/categoryMap` doc missing on first deploy of importer | None | None | Already populated via prior import (1,385 entries). The new tire-write logic is additive on top of existing categoryMap behavior. |

## Out of scope (deferred to ROADMAP.md)

These are documented in the roadmap for future work:

- **Admin upload UI for eFleet HTML** (Later) — drag-and-drop replacement for the CLI
- **Override admin UI for category corrections** (Later) — inline UI to set `tire.categoryOverride`
- **Multi-source categorization (BFG / Uniroyal native catalogs)** (Later) — if BFG/Uniroyal ever publish their own structured catalogs
- **Automatic monthly catalog import** (Later) — Cloud Function scheduled task wrapping this script
- **FET audit endpoint** (Next) — separate problem (mismatched FET on existing docs); bundled with eFleet diff view
- **Side-by-side eFleet diff view** (Next) — admin UI for the diff this script produces in console
- **Surface eFleet account number in admin** (Next) — read-side UI for what the importer captures
- **Brand stats card row above catalog** (Next) — pure UI render that benefits from Uniroyal's data
- **Brand-tier hero strip on Dashboard** (Next) — same UI render
- **Sidewall tag pills on rows** (Now bundle) — independent feature
- **Listing generator** (Next) — independent feature

## Open questions

None at spec time. Implementation may surface clarifications (e.g., Firestore batch sizing, exact diff color codes) — addressed inline during plan/implementation phases.
