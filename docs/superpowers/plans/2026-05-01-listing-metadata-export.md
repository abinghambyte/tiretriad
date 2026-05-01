# Listing metadata export — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add structured-metadata export (JSON clipboard + CSV download) to the existing `<ListingGenerator>` modal so selected tires can flow into platform APIs without retyping.

**Architecture:** New pure utility `src/utils/listingMetadata.js` exposes `buildListingMetadata(entries)` returning an array of platform-agnostic `ListingEntry` objects. Each entry contains universal tire fields plus a per-platform `copy` map. `<ListingGenerator>` grows an "Export metadata" section with two buttons that consume the utility's output.

**Tech Stack:** React 19, Tailwind v4, Vitest. No Firestore writes, no Cloud Functions, no new dependencies.

**Spec:** `docs/superpowers/specs/2026-05-01-listing-metadata-export-design.md`

**Worktree:** `.claude/worktrees/listing-metadata-export` (branch `listing-metadata-export`)

---

## File map

| File | Change | Responsibility |
|---|---|---|
| `src/utils/listingMetadata.js` | Create | Pure builder + small `toCsv` helper |
| `src/utils/listingMetadata.test.js` | Create | Builder shape + CSV-quoting tests |
| `src/components/tires/ListingGenerator.jsx` | Modify | Add Export section with Copy JSON + Download CSV buttons |

---

## Task 1: `buildListingMetadata` utility + `toCsv` helper

**Files:**
- Create: `src/utils/listingMetadata.js`
- Create: `src/utils/listingMetadata.test.js`

- [ ] **Step 1: Write the failing tests**

Create `src/utils/listingMetadata.test.js`:

```js
import { describe, expect, it } from 'vitest'
import { buildListingMetadata, toCsv } from './listingMetadata.js'

const mkTire = (overrides) => ({
  id: 'T1',
  mspn: '12345',
  brand: 'MICHELIN',
  description: 'P255/55R18 109V Pilot Sport AS 4',
  tread: 'Pilot Sport AS 4',
  category: 'passenger',
  photos: ['https://example.com/a.jpg', 'https://example.com/b.jpg'],
  derivedUseTags: ['XL', 'AT'],
  ...overrides,
})

describe('buildListingMetadata', () => {
  it('returns [] for empty input', () => {
    expect(buildListingMetadata([])).toEqual([])
  })

  it('builds a full entry from a fully-populated tire', () => {
    const out = buildListingMetadata([{ tire: mkTire(), qty: 4, pricePer: 199 }])
    expect(out).toHaveLength(1)
    const e = out[0]
    expect(e).toMatchObject({
      sku: '12345',
      brand: 'MICHELIN',
      mpn: '12345',
      condition: 'new',
      qty: 4,
      price: 199,
      category: 'passenger',
      treadFamily: 'Pilot Sport AS 4',
    })
    expect(typeof e.sizeSpec).toBe('string')
    expect(e.sizeSpec).toMatch(/255/)
    expect(e.sidewallTags).toEqual(['XL'])
    expect(e.photos).toEqual(['https://example.com/a.jpg', 'https://example.com/b.jpg'])
    expect(e.copy.facebook).toMatchObject({ title: expect.any(String), description: expect.any(String) })
    expect(e.copy.offerup).toMatchObject({ title: expect.any(String), description: expect.any(String) })
    expect(e.copy.craigslist).toMatchObject({ title: expect.any(String), description: expect.any(String) })
  })

  it('normalizes brand: bfg -> BFGOODRICH, lowercase -> uppercase', () => {
    const a = buildListingMetadata([{ tire: mkTire({ brand: 'bfg' }), qty: 1, pricePer: 100 }])
    expect(a[0].brand).toBe('BFGOODRICH')
    const b = buildListingMetadata([{ tire: mkTire({ brand: 'michelin' }), qty: 1, pricePer: 100 }])
    expect(b[0].brand).toBe('MICHELIN')
  })

  it('falls back gracefully when description fails to parse', () => {
    const out = buildListingMetadata([{ tire: mkTire({ description: 'GARBAGE-NO-SIZE' }), qty: 1, pricePer: 100 }])
    expect(out[0].sizeSpec).toBeNull()
    expect(out[0].treadFamily).toBe('Pilot Sport AS 4') // tire.tread fallback
  })

  it('filters derivedUseTags to sidewall set (XL, MS)', () => {
    const out = buildListingMetadata([{ tire: mkTire({ derivedUseTags: ['XL', 'MS', 'AT', 'HT', 'All-Season'] }), qty: 1, pricePer: 100 }])
    expect(out[0].sidewallTags).toEqual(['XL', 'MS'])
  })

  it('returns empty arrays for missing photos / tags', () => {
    const out = buildListingMetadata([{ tire: mkTire({ photos: undefined, derivedUseTags: undefined }), qty: 1, pricePer: 100 }])
    expect(out[0].photos).toEqual([])
    expect(out[0].sidewallTags).toEqual([])
  })

  it('preserves input order across multiple tires', () => {
    const tires = [
      mkTire({ id: 'A', mspn: 'A' }),
      mkTire({ id: 'B', mspn: 'B' }),
      mkTire({ id: 'C', mspn: 'C' }),
    ]
    const out = buildListingMetadata(tires.map((t) => ({ tire: t, qty: 1, pricePer: 100 })))
    expect(out.map((e) => e.sku)).toEqual(['A', 'B', 'C'])
  })
})

describe('toCsv', () => {
  it('serializes a flat array of objects with header row', () => {
    const csv = toCsv([{ a: 1, b: 'hello' }, { a: 2, b: 'world' }])
    expect(csv).toBe('a,b\n1,hello\n2,world')
  })

  it('quotes fields that contain commas', () => {
    const csv = toCsv([{ a: 'foo,bar', b: 'x' }])
    expect(csv).toBe('a,b\n"foo,bar",x')
  })

  it('quotes and doubles internal double-quotes', () => {
    const csv = toCsv([{ a: 'she said "hi"', b: 'x' }])
    expect(csv).toBe('a,b\n"she said ""hi""",x')
  })

  it('quotes fields containing newlines', () => {
    const csv = toCsv([{ a: 'line1\nline2', b: 'x' }])
    expect(csv).toBe('a,b\n"line1\nline2",x')
  })

  it('emits empty cells for null/undefined', () => {
    const csv = toCsv([{ a: null, b: undefined, c: 0 }])
    expect(csv).toBe('a,b,c\n,,0')
  })

  it('returns just the header row for empty input when columns are provided', () => {
    expect(toCsv([], ['a', 'b'])).toBe('a,b')
  })

  it('returns empty string for empty input with no columns hint', () => {
    expect(toCsv([])).toBe('')
  })
})
```

- [ ] **Step 2: Verify failure**

`cd .claude/worktrees/listing-metadata-export && npx vitest run src/utils/listingMetadata.test.js`

- [ ] **Step 3: Implement the utility**

Create `src/utils/listingMetadata.js`:

```js
import { buildListingScript } from './listingGenerator.js'
import { parseDescription } from './parseTireDescription.js'

const SIDEWALL_PILL_KEYS = new Set(['XL', 'MS'])

const PLATFORMS = [
  { key: 'facebook',   label: 'Facebook Marketplace' },
  { key: 'offerup',    label: 'OfferUp' },
  { key: 'craigslist', label: 'Craigslist' },
]

function normalizeBrand(raw) {
  const s = String(raw ?? '').trim().toUpperCase()
  if (!s) return ''
  if (s === 'BFG') return 'BFGOODRICH'
  return s
}

function buildSizeSpec(tire) {
  const desc = String(tire?.description ?? '').trim()
  if (!desc) return null
  const parsed = parseDescription(desc)
  if (parsed.parseKind === 'raw') return null
  const loadParts = []
  if (parsed.loadIndex != null) loadParts.push(String(parsed.loadIndex))
  if (parsed.speedRating) loadParts.push(parsed.speedRating)
  if (parsed.parseKind === 'flotation' && parsed.width != null && parsed.flotationMid != null && parsed.rimDiameter != null) {
    const ltSuffix = parsed.trailingLt ? 'LT' : ''
    const size = `${parsed.width}X${parsed.flotationMid}R${parsed.rimDiameter}${ltSuffix}`
    return loadParts.length ? `${size} ${loadParts.join(' ')}` : size
  }
  if (parsed.parseKind === 'metric' && parsed.width != null && parsed.aspectRatio != null && parsed.rimDiameter != null) {
    const construction = String(parsed.construction || '').toUpperCase()
    const lt = parsed.ltPrefixedMetric ? 'LT' : ''
    const size = `${lt}${parsed.width}/${parsed.aspectRatio}${construction}${parsed.rimDiameter}`
    return loadParts.length ? `${size} ${loadParts.join(' ')}` : size
  }
  return null
}

/**
 * @typedef {Object} ListingEntry
 * @property {string} sku
 * @property {string} brand
 * @property {string} mpn
 * @property {'new'} condition
 * @property {number} qty
 * @property {number} price
 * @property {string | null} category
 * @property {string | null} sizeSpec
 * @property {string} treadFamily
 * @property {string[]} sidewallTags
 * @property {string[]} photos
 * @property {{ facebook: { title, description }, offerup: { ... }, craigslist: { ... } }} copy
 */

/**
 * Build platform-agnostic listing entries from selected tires.
 *
 * @param {Array<{ tire: Record<string, unknown>, qty: number, pricePer: number }>} entries
 * @returns {Array<ListingEntry>}
 */
export function buildListingMetadata(entries) {
  const out = []
  for (const e of Array.isArray(entries) ? entries : []) {
    const tire = e?.tire || {}
    const qty = Math.max(1, Number(e?.qty) || 1)
    const price = Math.max(0, Number(e?.pricePer) || 0)
    const sku = String(tire.mspn ?? '').trim()
    const sidewallTags = Array.isArray(tire.derivedUseTags)
      ? tire.derivedUseTags.filter((t) => SIDEWALL_PILL_KEYS.has(t))
      : []
    const photos = Array.isArray(tire.photos)
      ? tire.photos.map((p) => String(p ?? '')).filter(Boolean)
      : []
    const copy = {}
    for (const { key, label } of PLATFORMS) {
      copy[key] = buildListingScript({ tire, qty, pricePer: price, platform: label })
    }
    out.push({
      sku,
      brand: normalizeBrand(tire.brand),
      mpn: sku,
      condition: 'new',
      qty,
      price,
      category: tire.category ?? null,
      sizeSpec: buildSizeSpec(tire),
      treadFamily: String(tire.tread ?? '').trim(),
      sidewallTags,
      photos,
      copy,
    })
  }
  return out
}

/**
 * Minimal RFC-4180-compliant CSV serializer. Wraps any field containing
 * `,`, `"`, `\n`, or `\r` in double-quotes; doubles internal double-quotes.
 *
 * Empty input + columns hint -> header row only.
 * Empty input + no columns hint -> empty string.
 *
 * @param {Array<Record<string, unknown>>} rows
 * @param {Array<string>} [columns]
 * @returns {string}
 */
export function toCsv(rows, columns) {
  const cols = columns || (rows.length > 0 ? Object.keys(rows[0]) : null)
  if (!cols) return ''
  const lines = [cols.join(',')]
  for (const row of rows) {
    lines.push(cols.map((c) => csvCell(row[c])).join(','))
  }
  return lines.join('\n')
}

function csvCell(v) {
  if (v == null) return ''
  const s = String(v)
  if (s === '') return ''
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}
```

- [ ] **Step 4: Re-run tests**

`cd .claude/worktrees/listing-metadata-export && npx vitest run src/utils/listingMetadata.test.js`

Expected: all 14 tests pass.

- [ ] **Step 5: Commit**

```bash
cd .claude/worktrees/listing-metadata-export
git add src/utils/listingMetadata.js src/utils/listingMetadata.test.js
git commit -m "feat(utils): listingMetadata builder + CSV serializer

Pure builder buildListingMetadata({tires, qty, pricePer}[]) ->
ListingEntry[]. Each entry carries universal tire fields plus a
copy map keyed by platform (facebook / offerup / craigslist) so a
downstream publisher (eBay sell-side, future automation) can adapt.

Includes a small RFC-4180 CSV serializer for the modal's Download
CSV button.

Spec: docs/superpowers/specs/2026-05-01-listing-metadata-export-design.md"
```

---

## Task 2: Wire Export section into `<ListingGenerator>`

**Files:**
- Modify: `src/components/tires/ListingGenerator.jsx`

- [ ] **Step 1: Add imports + helpers near the top of the file**

After the existing imports, add:

```jsx
import { buildListingMetadata, toCsv } from '../../utils/listingMetadata.js'
```

Inside the `ListingGenerator` function, after the existing `lines` / `generated` state declarations, add a helper that builds the export-shaped entries from the current line state:

```jsx
function buildExportEntries() {
  return tires.map((t) => {
    const line = lines[t.id] || { qty: 1, price: 0 }
    return {
      tire: t,
      qty: Math.max(1, Number(line.qty) || 1),
      pricePer: Math.max(0, Number(line.price) || 0),
    }
  })
}

async function copyJson() {
  const data = buildListingMetadata(buildExportEntries())
  const ok = await copyToClipboard(JSON.stringify(data, null, 2))
  if (ok) {
    toast(`Copied ${data.length} tire metadata entr${data.length === 1 ? 'y' : 'ies'} as JSON`, 'success')
  } else {
    toast('Copy failed. Check clipboard permissions.', 'error')
  }
}

function downloadCsv() {
  const data = buildListingMetadata(buildExportEntries())
  const rows = data.map((e) => ({
    sku: e.sku,
    brand: e.brand,
    mpn: e.mpn,
    condition: e.condition,
    qty: e.qty,
    price: e.price,
    category: e.category ?? '',
    sizeSpec: e.sizeSpec ?? '',
    treadFamily: e.treadFamily,
    sidewallTags: e.sidewallTags.join(';'),
    photos: e.photos.join(';'),
    fb_title: e.copy.facebook.title,
    fb_description: e.copy.facebook.description,
    ou_title: e.copy.offerup.title,
    ou_description: e.copy.offerup.description,
    cl_title: e.copy.craigslist.title,
    cl_description: e.copy.craigslist.description,
  }))
  const csv = toCsv(rows, [
    'sku', 'brand', 'mpn', 'condition', 'qty', 'price', 'category',
    'sizeSpec', 'treadFamily', 'sidewallTags', 'photos',
    'fb_title', 'fb_description',
    'ou_title', 'ou_description',
    'cl_title', 'cl_description',
  ])
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `listings-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  toast(`Downloaded ${data.length} tire metadata entr${data.length === 1 ? 'y' : 'ies'} as CSV`, 'success')
}
```

(`copyToClipboard` and `toast` are already in scope via existing imports.)

- [ ] **Step 2: Render the Export section**

Find the existing `{generated.length > 0 ? (...)` block in the modal body. Just AFTER that block (still inside the modal, before the closing tags), add:

```jsx
{generated.length > 0 ? (
  <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 sm:p-5">
    <h3 className="text-sm font-semibold text-zinc-100">Export structured metadata</h3>
    <p className="mt-1 text-xs text-zinc-400">
      JSON for API consumers (eBay publisher, custom scripts). CSV for
      sheet-based workflows. Edits to qty or price after exporting require
      a fresh export.
    </p>
    <div className="mt-3 flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => void copyJson()}
        className="inline-flex min-h-[40px] items-center rounded-lg border border-zinc-600 px-3 py-1.5 text-sm font-medium text-zinc-100 hover:border-amber-600/40 hover:bg-zinc-800/80"
      >
        Copy JSON
      </button>
      <button
        type="button"
        onClick={downloadCsv}
        className="inline-flex min-h-[40px] items-center rounded-lg border border-zinc-600 px-3 py-1.5 text-sm font-medium text-zinc-100 hover:border-amber-600/40 hover:bg-zinc-800/80"
      >
        Download CSV
      </button>
    </div>
  </section>
) : null}
```

(The check `generated.length > 0` matches the existing gate so the Export section appears alongside the per-tire script grid.)

- [ ] **Step 3: Run vitest**

`cd .claude/worktrees/listing-metadata-export && npx vitest run src/`

Expected: green. Some snapshot tests touching `ListingGenerator` may need regeneration via `npx vitest run -u`; expected diff is the new `<section>` markup.

- [ ] **Step 4: Manual smoke test**

`npm run dev` → Tires → select 2-3 rows → Generate listings → set qty/price → click Generate scripts → confirm Export section renders → click Copy JSON → paste into a text editor and confirm shape → click Download CSV → open the file in a sheet and confirm columns + values.

- [ ] **Step 5: Commit**

```bash
cd .claude/worktrees/listing-metadata-export
git add src/components/tires/ListingGenerator.jsx
git commit -m "feat(tires): export structured metadata from ListingGenerator

Adds an Export section beneath the per-tire script grid with
'Copy JSON' and 'Download CSV' buttons. Output uses
buildListingMetadata so the same data the operator sees in the
script grid is what the downstream consumer gets."
```

---

## Task 3: Lint, bundle, full vitest

**Files:** none

- [ ] **Step 1: Lint**

`cd .claude/worktrees/listing-metadata-export && npm run lint`

Expected: 0 errors.

- [ ] **Step 2: Bundle**

`cd .claude/worktrees/listing-metadata-export && npm run build && npx size-limit`

Expected: tires page chunk under 42 KB. New code adds ~2 KB gzipped.

- [ ] **Step 3: Full vitest**

`cd .claude/worktrees/listing-metadata-export && npx vitest run src/`

Expected: green.

- [ ] **Step 4: Push branch (HOLD until user confirms)**

Do NOT push without user direction. Stop here, report status, and wait.

---

## Verification checklist (final)

- All vitest tests green
- Lint clean
- Bundle within caps
- `<ListingGenerator>` Export section renders only after Generate scripts
- Copy JSON puts a valid JSON array on the clipboard
- Download CSV produces a UTF-8 CSV with the documented columns
- Brand normalization works (`bfg` → `BFGOODRICH`)
- Sidewall tags filtered to XL / MS only
- Empty descriptions degrade to `sizeSpec: null` cleanly

---

## Out of scope

- Per-platform polling / status checks
- Server-side scheduled batch publish
- Photo uploads / image sourcing changes
- eBay publisher itself
- Listing copy quality improvements
