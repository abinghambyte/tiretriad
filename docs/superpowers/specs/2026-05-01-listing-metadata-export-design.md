# Listing metadata export — design

**Status:** approved 2026-05-01 (auto mode)
**Branch target:** `listing-metadata-export`
**Roadmap entry shipped:** *Listing generator (replaces sticker idea)* (Next).

## Goal

Add structured-metadata export to the existing `<ListingGenerator>` modal so that selected tires can flow into platform APIs (eBay sell-side, future automation) without retyping. The current modal produces text-only `{title, description}` scripts for human copy-paste; this work adds a parallel JSON / CSV export that an automated publisher can consume directly.

## Non-goals

- Building the eBay publisher itself. That's a separate roadmap item; this work produces the input it will consume.
- Changing the existing per-platform copy generation. The text scripts that already power the FB/OfferUp/Craigslist flow stay exactly as they are.
- Server-side export endpoint. Exports are client-side; the operator clicks a button and gets clipboard JSON or a downloaded CSV.
- Photo upload pipeline. Exports include photo URLs from the existing `tire.photos` field; nothing about the image-capture flow changes.

## Architecture

```
src/utils/listingMetadata.js          NEW   pure builder, no I/O
src/utils/listingMetadata.test.js     NEW   covers shape + edge cases
src/components/tires/ListingGenerator.jsx  MODIFY  add Export section + buttons
```

### `buildListingMetadata` contract

```js
/**
 * @typedef {Object} ListingEntry
 * @property {string} sku                // tire.mspn — canonical SKU
 * @property {string} brand              // canonical uppercase
 * @property {string} mpn                // manufacturer part number (== sku for v1)
 * @property {'new'} condition           // hardcoded for v1
 * @property {number} qty
 * @property {number} price              // dollars per tire
 * @property {'passenger' | 'lightTruck' | 'truck' | null} category
 * @property {string | null} sizeSpec    // e.g. 'P255/55R18 109V' from parseDescription
 * @property {string} treadFamily        // tire.tread or parsed; '' if unknown
 * @property {string[]} sidewallTags     // ['XL', 'MS'] from derivedUseTags filter
 * @property {string[]} photos           // photo URLs (or empty)
 * @property {{
 *   facebook: { title: string, description: string },
 *   offerup:  { title: string, description: string },
 *   craigslist: { title: string, description: string },
 * }} copy
 */

/**
 * @param {Array<{ tire: Tire, qty: number, pricePer: number }>} entries
 * @returns {Array<ListingEntry>}
 */
export function buildListingMetadata(entries)
```

The utility consumes the same `(tire, qty, pricePer)` triple the existing modal already manages. For each entry it:

1. Pulls structured fields directly off the tire (`mspn`, `brand`, `category`, `tread`, `photos`, `derivedUseTags`).
2. Calls `parseDescription(tire.description)` for `sizeSpec`. Falls back to the raw description when the parser returns `parseKind: 'raw'`.
3. Calls `buildListingScript({tire, qty, pricePer, platform})` once per platform (`'Facebook Marketplace' | 'OfferUp' | 'Craigslist'`) and stores the resulting `{title, description}` under the lowercase platform key.
4. Filters `tire.derivedUseTags` to the sidewall set (`['XL', 'MS']`) for `sidewallTags`.

Pure function: no `useMemo`, no Firestore, no clipboard. Component layer wires it to the export buttons.

### `ListingGenerator` modifications

The existing modal renders a per-tire grid of generated platform scripts (after the operator clicks "Generate scripts"). Once `generated.length > 0`, render an "Export metadata" section beneath the grid:

```jsx
<section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
  <h3>Export structured metadata</h3>
  <p>JSON for API consumers (eBay publisher), CSV for sheet workflows.</p>
  <button onClick={copyJson}>Copy JSON</button>
  <button onClick={downloadCsv}>Download CSV</button>
</section>
```

`copyJson` builds `JSON.stringify(buildListingMetadata(entries), null, 2)` and writes it via the existing `copyToClipboard` helper, with toast feedback on success/failure.

`downloadCsv` builds the metadata, projects to a flat row shape (one tire per row; `copy.<platform>.title` and `copy.<platform>.description` become per-platform columns; `photos` becomes a `;`-joined column), serializes via a small inline `toCsv` helper (RFC 4180 quoting — wrap any field containing `,`, `"`, or newlines in double-quotes; double up internal `"`), and triggers download via a synthetic `<a download>` click.

### CSV column order

```
sku, brand, mpn, condition, qty, price, category, sizeSpec, treadFamily, sidewallTags, photos,
fb_title, fb_description, ou_title, ou_description, cl_title, cl_description
```

`sidewallTags` and `photos` use `;` as the within-cell separator (not `,`, since CSV columns are comma-delimited).

## Data flow

1. Operator opens `<ListingGenerator>` from the bulk-select toolbar with N tires selected.
2. Operator sets qty/price per tire, clicks "Generate scripts".
3. Existing modal renders per-tire platform scripts.
4. NEW: operator clicks "Copy JSON" or "Download CSV" in the Export section.
5. Output reflects exactly the same data the operator just visually confirmed in the script grid.

## Edge cases

- **Empty selection** — modal already gates "Generate scripts" on `tires.length > 0`. Export buttons render only after `generated.length > 0`, so they can't fire on empty input.
- **Tire with no photos** — `photos: []` in JSON; empty CSV cell.
- **Tire with no `derivedUseTags`** — `sidewallTags: []` in JSON; empty CSV cell.
- **Description that fails to parse** — `sizeSpec: null` in JSON; CSV cell falls back to the raw description string so the row is still useful.
- **Description with embedded commas / newlines** — RFC 4180 quoting in `toCsv`; tested.
- **Brand string is lowercase or `bfg`** — same `normalizeBrand` helper that powers `useBrandAggregates` ensures `BFGOODRICH` canonical form.
- **Clipboard API unavailable** (older browsers, file://) — `copyToClipboard` already handles fallback; toast surfaces the error.

## Testing

### `listingMetadata.test.js`

- Empty `entries` array → `[]`.
- Single tire, full fields → entry shape matches type, including all three platform copies.
- Tire with `description: 'GARBAGE'` → `sizeSpec: null`, `treadFamily` falls back to `tire.tread || ''`.
- Tire with `derivedUseTags: ['XL', 'MS', 'AT', 'HT']` → `sidewallTags: ['XL', 'MS']` (other tags filtered out).
- Tire with no photos → `photos: []`.
- Brand normalization: `tire.brand: 'bfg'` → `entry.brand: 'BFGOODRICH'`.
- Multiple tires → array preserves input order.

### CSV serialization

`toCsv` lives inline in the component but is testable through a small extracted helper if it grows. For v1, a single component-level test asserts:
- A tire whose description contains a comma renders correctly (field is quoted).
- A tire whose description contains a quote renders correctly (`"` doubled).
- A tire whose description contains `\n` renders correctly (whole field quoted; raw newline preserved inside).

If the inline helper is more than ~15 LOC, extract to `src/utils/csvSerialize.js` with its own test file.

## Risks

- **Bundle size.** New pure utility ~30 LOC, no new imports. Component grows by ~50 LOC. Tires page is currently 38.92 KB / 42 cap; expect <1 KB gzipped impact.
- **Schema drift if eBay changes its API.** The `ListingEntry` shape isn't eBay-specific (per the brainstorming decision); when the eBay publisher lands, it adapts entries to eBay's shape. No coupling here.
- **Operator mistake: exports outdated qty/price.** The export uses the same in-memory entries the modal already shows; if the operator edits qty/price after exporting, they must re-export. Document in the Export section's helper text.

## Out of scope

- Per-platform polling / status checks
- Server-side scheduled batch publish
- Photo uploads / image sourcing changes
- eBay publisher itself
- Listing copy quality improvements (separate roadmap item if revisited)
