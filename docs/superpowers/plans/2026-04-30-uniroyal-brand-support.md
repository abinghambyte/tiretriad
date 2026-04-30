# Uniroyal brand support — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing Michelin eFleet HTML importer so that in addition to writing `meta/categoryMap`, it creates and updates tire docs in the `tires` Firestore collection. The eFleet HTML becomes the single source of truth for both categorization AND inventory across Michelin, BFGoodrich, and Uniroyal. Immediate business outcome: ~120+ Uniroyal SKUs land in the catalog.

**Architecture:** Pure parser + pure planner + thin Firestore writer. `parseEfleetCatalog(html)` returns `{ categoryMap, tireRecords[], warnings }` (no I/O). `planTirePhases(existingDocs, tireRecords)` returns the four phases of writes (no I/O). The CLI orchestrates: write categoryMap (Phase 1), insert new tire docs (Phase 2), set/clear `offProgramAt` flag (Phase 3), and only with `--apply-updates`, sync drifted fields on existing docs (Phase 4). All four phases are idempotent.

**Tech Stack:** Node 20 ESM modules in `scripts/`. Vitest for unit tests. Firebase Admin SDK (`firebase-admin/app`, `firebase-admin/firestore`). Plain `expect` assertions (no jest-dom). Reuses existing `migrate-tire-fet-tag.mjs` patterns: `requireCredentials`, `parseArgs`, `isExecutedDirectly`, confirmation prompt.

**Spec:** `docs/superpowers/specs/2026-04-30-uniroyal-brand-support-design.md`

---

## Task 1: Rename script + extend parser to return tireRecords

Renames `import-efleet-categories.mjs` → `import-efleet.mjs`, updates the npm script, and extends the parser to return per-row tire data alongside the existing `mspns` map. Brand inferred from `<div class="brand-title …">` CSS class.

**Files:**
- Move: `scripts/import-efleet-categories.mjs` → `scripts/import-efleet.mjs`
- Move: `scripts/import-efleet-categories.test.mjs` → `scripts/import-efleet.test.mjs`
- Modify: `package.json` (npm script path)
- Modify: `scripts/__fixtures__/efleet-sample.html` (extend to ~12 SKUs)

- [ ] **Step 1: Rename the script files**

```bash
git mv scripts/import-efleet-categories.mjs scripts/import-efleet.mjs
git mv scripts/import-efleet-categories.test.mjs scripts/import-efleet.test.mjs
```

- [ ] **Step 2: Update the test's import path**

In `scripts/import-efleet.test.mjs`, change:

```js
import { parseEfleetCatalog } from './import-efleet-categories.mjs'
```

to:

```js
import { parseEfleetCatalog } from './import-efleet.mjs'
```

- [ ] **Step 3: Update package.json npm script**

In `package.json`, the existing `"import:efleet"` script:

```json
"import:efleet": "node scripts/import-efleet-categories.mjs"
```

becomes:

```json
"import:efleet": "node scripts/import-efleet.mjs"
```

- [ ] **Step 4: Run rename verification (existing tests still pass)**

```bash
npm run test -- scripts/import-efleet.test.mjs --run
```

Expected: 5/5 pass (the existing parser tests). No code changed yet — just file rename + import path update.

- [ ] **Step 5: Extend the fixture HTML to cover 12 SKUs across all 3 brands × 3 categories**

Replace the contents of `scripts/__fixtures__/efleet-sample.html` with a fixture that has all three brands in each of the three category sections, plus one PQL row, one row with `—` LR, and one row with missing tread. The full content is below (use exactly this).

Note: this is a longer fixture but the structure is just the existing sample repeated for BFG and Uniroyal sections, plus a few edge cases. Indent doesn't matter (single-line in the file is fine; this is shown formatted for readability in the plan).

```html
<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Sample</title></head><body>
<table><tr><td>Account:</td><td>Ship To: 1580951 SKEDADDLE INC LOVELAND</td></tr><tr><td>Report Date:</td><td>April 19, 2026</td></tr></table>

<div class="cat-section"><div class="cat-header"><div class="cat-header-text"><div class="cat-header-title">Light Truck</div></div></div>
<div class="brand-section"><div class="brand-title mich">Michelin</div>
<table class="product-table"><tr><th>MSPN</th><th>Tread/Model</th><th>Description</th><th>LR</th><th>FET</th><th>Price</th></tr>
<tr><td style="font-family:monospace;font-weight:700;color:#003399">11111</td><td style="font-weight:600;color:#444">XPS RIB</td><td>LT245/75R16 XPS RIB LRE</td><td style="text-align:center;font-weight:600">E</td><td style="text-align:right;color:#999">$0.00</td><td style="text-align:right;font-weight:700;color:#1a5c1a">$291.20</td></tr>
</table></div>
<div class="brand-section"><div class="brand-title bfg">BFGoodrich</div>
<table class="product-table"><tr><th>MSPN</th><th>Tread/Model</th><th>Description</th><th>LR</th><th>FET</th><th>Price</th></tr>
<tr><td style="font-family:monospace;font-weight:700;color:#003399">22222</td><td style="font-weight:600;color:#444">KO2</td><td>LT235/85R16 KO2 LRE</td><td style="text-align:center;font-weight:600">E</td><td style="text-align:right;color:#999">$0.00</td><td style="text-align:right;font-weight:700;color:#1a5c1a">$310.40</td></tr>
</table></div>
<div class="brand-section"><div class="brand-title uni">Uniroyal</div>
<table class="product-table"><tr><th>MSPN</th><th>Tread/Model</th><th>Description</th><th>LR</th><th>FET</th><th>Price</th></tr>
<tr><td style="font-family:monospace;font-weight:700;color:#003399">33333</td><td style="font-weight:600;color:#444">LAREDO AT</td><td>LT225/75R16 LAREDO AT LRE</td><td style="text-align:center;font-weight:600">E</td><td style="text-align:right;color:#999">$0.00</td><td style="text-align:right;font-weight:700;color:#1a5c1a">$220.80</td></tr>
</table></div>
</div>

<div class="cat-section"><div class="cat-header"><div class="cat-header-text"><div class="cat-header-title">Passenger</div></div></div>
<div class="brand-section"><div class="brand-title mich">Michelin</div>
<table class="product-table"><tr><th>MSPN</th><th>Tread/Model</th><th>Description</th><th>LR</th><th>FET</th><th>Price</th></tr>
<tr><td style="font-family:monospace;font-weight:700;color:#003399">44444</td><td style="font-weight:600;color:#444">DEFENDER2</td><td>215/55R17 98V XL DEFENDER2</td><td style="text-align:center;color:#ccc">—</td><td style="text-align:right;color:#999">$0.00</td><td style="text-align:right;font-weight:700;color:#1a5c1a">$235.80</td></tr>
<tr><td style="font-family:monospace;font-weight:700;color:#003399">99999</td><td style="font-weight:600;color:#444"></td><td>215/60R17 96H NO TREAD MI</td><td style="text-align:center;color:#ccc">—</td><td style="text-align:right;color:#999">$0.00</td><td style="text-align:right;font-weight:700;color:#1a5c1a">$245.60</td></tr>
</table></div>
<div class="brand-section"><div class="brand-title bfg">BFGoodrich</div>
<table class="product-table"><tr><th>MSPN</th><th>Tread/Model</th><th>Description</th><th>LR</th><th>FET</th><th>Price</th></tr>
<tr><td style="font-family:monospace;font-weight:700;color:#003399">55555</td><td style="font-weight:600;color:#444">ADVANTAGE</td><td>215/60R17 96H ADVANTAGE</td><td style="text-align:center;color:#ccc">—</td><td style="text-align:right;color:#999">$0.00</td><td style="text-align:right;font-weight:700;color:#1a5c1a">$155.60</td></tr>
</table></div>
<div class="brand-section"><div class="brand-title uni">Uniroyal</div>
<table class="product-table"><tr><th>MSPN</th><th>Tread/Model</th><th>Description</th><th>LR</th><th>FET</th><th>Price</th></tr>
<tr><td style="font-family:monospace;font-weight:700;color:#003399">66666</td><td style="font-weight:600;color:#444">TIGER PAW</td><td>185/65R14 86H TPTOURINAS</td><td style="text-align:center;color:#ccc">—</td><td style="text-align:right;color:#999">$0.00</td><td style="text-align:right;font-weight:700;color:#1a5c1a">$93.75</td></tr>
<tr><td style="font-family:monospace;font-weight:700;color:#003399">77777</td><td style="font-weight:600;color:#444">PQL ITEM</td><td>995/85R20 PQL EXAMPLE</td><td style="text-align:center;color:#ccc">—</td><td style="text-align:right;color:#999">$0.00</td><td style="text-align:right;font-weight:700;color:#c0392b">PQL</td></tr>
</table></div>
</div>

<div class="cat-section"><div class="cat-header"><div class="cat-header-text"><div class="cat-header-title">Truck</div></div></div>
<div class="brand-section"><div class="brand-title mich">Michelin</div>
<table class="product-table"><tr><th>MSPN</th><th>Tread/Model</th><th>Description</th><th>LR</th><th>FET</th><th>Price</th></tr>
<tr><td style="font-family:monospace;font-weight:700;color:#003399">88888</td><td style="font-weight:600;color:#444">XZE2</td><td>11R22.5 XZE2 LRG</td><td style="text-align:center;font-weight:600">G</td><td style="text-align:right;color:#666">$25.23</td><td style="text-align:right;font-weight:700;color:#1a5c1a">$613.60</td></tr>
</table></div>
<div class="brand-section"><div class="brand-title bfg">BFGoodrich</div>
<table class="product-table"><tr><th>MSPN</th><th>Tread/Model</th><th>Description</th><th>LR</th><th>FET</th><th>Price</th></tr>
<tr><td style="font-family:monospace;font-weight:700;color:#003399">10101</td><td style="font-weight:600;color:#444">DR454</td><td>11R22.5 DR454 LRG</td><td style="text-align:center;font-weight:600">G</td><td style="text-align:right;color:#666">$25.23</td><td style="text-align:right;font-weight:700;color:#1a5c1a">$534.24</td></tr>
</table></div>
<div class="brand-section"><div class="brand-title uni">Uniroyal</div>
<table class="product-table"><tr><th>MSPN</th><th>Tread/Model</th><th>Description</th><th>LR</th><th>FET</th><th>Price</th></tr>
<tr><td style="font-family:monospace;font-weight:700;color:#003399">12121</td><td style="font-weight:600;color:#444">LD3</td><td>11R22.5 LD3 LRG</td><td style="text-align:center;font-weight:600">G</td><td style="text-align:right;color:#666">$25.23</td><td style="text-align:right;font-weight:700;color:#1a5c1a">$498.40</td></tr>
</table></div>
</div>

</body></html>
```

After saving, save as a single line (or with whatever whitespace; the parser is whitespace-tolerant). The fixture now has 11 valid rows + 1 PQL row that should be skipped:
- Light Truck: 11111 (Michelin), 22222 (BFG), 33333 (Uniroyal)
- Passenger: 44444 (Michelin), 99999 (Michelin, missing tread), 55555 (BFG), 66666 (Uniroyal)
- Truck: 88888 (Michelin), 10101 (BFG), 12121 (Uniroyal)
- PQL skipped: 77777

- [ ] **Step 6: Verify existing tests still pass with the new fixture**

```bash
npm run test -- scripts/import-efleet.test.mjs --run
```

Expected: existing 5 tests still pass. Note that the "extracts MSPNs grouped by category" test asserts an exact mspns object — that assertion will need updating since the fixture now has many more MSPNs. The test should be updated to match the new fixture's expected output:

```js
it('extracts MSPNs grouped by category from a well-formed report', () => {
  const result = parseEfleetCatalog(fixture)
  expect(result.mspns).toEqual({
    '11111': 'lightTruck',
    '22222': 'lightTruck',
    '33333': 'lightTruck',
    '44444': 'passenger',
    '99999': 'passenger',
    '55555': 'passenger',
    '66666': 'passenger',
    '88888': 'truck',
    '10101': 'truck',
    '12121': 'truck',
  })
})
```

(Note: 77777 is the PQL row, which the parser skips, so it's absent.)

The "captures cover-page metadata" test's `totalParsed` value will also need updating from `6` to `10` (10 valid MSPNs after PQL is skipped).

```js
it('captures cover-page metadata', () => {
  const result = parseEfleetCatalog(fixture)
  expect(result.account).toBe('1580951 SKEDADDLE INC LOVELAND')
  expect(result.sourceReportDate).toBe('2026-04-19')
  expect(result.totalParsed).toBe(10)
})
```

The "handles unknown category titles" test should also be reviewed — the count of MSPNs after replacing "Light Truck" changes from `4` to `7`:

```js
it('handles unknown category titles by ignoring them', () => {
  const odd = fixture.replace('Light Truck', 'Mystery Bucket')
  const result = parseEfleetCatalog(odd)
  // 3 Light Truck SKUs (11111, 22222, 33333) get dropped
  expect(Object.keys(result.mspns).length).toBe(7)
  expect(result.mspns['11111']).toBeUndefined()
  expect(result.mspns['44444']).toBe('passenger')
})
```

After updating the existing tests, run them again:

```bash
npm run test -- scripts/import-efleet.test.mjs --run
```

Expected: 5/5 still pass.

- [ ] **Step 7: Write failing tests for `tireRecords[]` extraction**

Append to `scripts/import-efleet.test.mjs`:

```js
describe('parseEfleetCatalog tireRecords', () => {
  it('returns one tireRecord per non-PQL row with all fields populated', () => {
    const result = parseEfleetCatalog(fixture)
    expect(Array.isArray(result.tireRecords)).toBe(true)
    expect(result.tireRecords.length).toBe(10)
  })

  it('infers brand from CSS class (mich/bfg/uni)', () => {
    const result = parseEfleetCatalog(fixture)
    const byMspn = Object.fromEntries(result.tireRecords.map(r => [r.mspn, r]))
    expect(byMspn['11111'].brand).toBe('MICHELIN')
    expect(byMspn['22222'].brand).toBe('BFGOODRICH')
    expect(byMspn['33333'].brand).toBe('UNIROYAL')
  })

  it('coerces LR cell — to empty string', () => {
    const result = parseEfleetCatalog(fixture)
    const byMspn = Object.fromEntries(result.tireRecords.map(r => [r.mspn, r]))
    expect(byMspn['44444'].lr).toBe('')
    expect(byMspn['11111'].lr).toBe('E')
  })

  it('coerces FET and Price strings to numbers', () => {
    const result = parseEfleetCatalog(fixture)
    const byMspn = Object.fromEntries(result.tireRecords.map(r => [r.mspn, r]))
    expect(byMspn['44444'].fet).toBe(0)
    expect(byMspn['44444'].price).toBe(235.80)
    expect(byMspn['88888'].fet).toBe(25.23)
    expect(byMspn['88888'].price).toBe(613.60)
  })

  it('skips PQL rows and adds a warning', () => {
    const result = parseEfleetCatalog(fixture)
    const mspns = result.tireRecords.map(r => r.mspn)
    expect(mspns).not.toContain('77777')
    expect(result.warnings.some(w => w.kind === 'pql' && w.mspn === '77777')).toBe(true)
  })

  it('rows missing tread are inserted with empty tread + warning', () => {
    const result = parseEfleetCatalog(fixture)
    const byMspn = Object.fromEntries(result.tireRecords.map(r => [r.mspn, r]))
    expect(byMspn['99999'].tread).toBe('')
    expect(result.warnings.some(w => w.kind === 'missingTread' && w.mspn === '99999')).toBe(true)
  })

  it('each tireRecord carries its category from the parent cat-section', () => {
    const result = parseEfleetCatalog(fixture)
    const byMspn = Object.fromEntries(result.tireRecords.map(r => [r.mspn, r]))
    expect(byMspn['11111'].category).toBe('lightTruck')
    expect(byMspn['44444'].category).toBe('passenger')
    expect(byMspn['88888'].category).toBe('truck')
  })

  it('returns warnings array even when empty', () => {
    const minimalHtml = fixture.replace(/77777[\s\S]*?<\/tr>/, '').replace(/99999[\s\S]*?<\/tr>/, '')
    const result = parseEfleetCatalog(minimalHtml)
    expect(Array.isArray(result.warnings)).toBe(true)
  })
})
```

- [ ] **Step 8: Run, verify fail**

```bash
npm run test -- scripts/import-efleet.test.mjs --run
```

Expected: 8 new tests fail (`tireRecords` is undefined / not yet returned).

- [ ] **Step 9: Implement parser extension**

Open `scripts/import-efleet.mjs`. Find the `parseEfleetCatalog` function. Replace with the extended version:

```js
const BRAND_CLASS_MAP = {
  bfg: 'BFGOODRICH',
  mich: 'MICHELIN',
  uni: 'UNIROYAL',
}

/**
 * @param {string} html
 * @returns {{
 *   mspns: Record<string, 'passenger' | 'lightTruck' | 'truck'>,
 *   tireRecords: Array<{
 *     mspn: string,
 *     brand: 'MICHELIN' | 'BFGOODRICH' | 'UNIROYAL',
 *     tread: string,
 *     description: string,
 *     lr: string,
 *     fet: number,
 *     price: number,
 *     category: 'passenger' | 'lightTruck' | 'truck',
 *   }>,
 *   account: string | null,
 *   sourceReportDate: string | null,
 *   totalParsed: number,
 *   warnings: Array<{ kind: string, message: string, mspn?: string }>,
 * }}
 */
export function parseEfleetCatalog(html) {
  if (!html || typeof html !== 'string' || html.trim() === '') {
    throw new Error('parseEfleetCatalog: empty input')
  }
  const tables = html.match(/<table class="product-table">[\s\S]*?<\/table>/g) || []
  const catBlocks = html.split(/class="cat-section"/)
  if (tables.length === 0 || catBlocks.length < 2) {
    throw new Error(
      'parseEfleetCatalog: malformed input — no product-table or no cat-section blocks found',
    )
  }

  const mspns = {}
  const tireRecords = []
  const warnings = []

  for (let i = 1; i < catBlocks.length; i++) {
    const block = catBlocks[i]
    const titleM = block.match(/class="cat-header-title">([^<]+)/)
    const title = titleM ? titleM[1].trim() : ''
    let cat = null
    if (/light truck/i.test(title)) cat = 'lightTruck'
    else if (/passenger/i.test(title)) cat = 'passenger'
    else if (/^truck\b/i.test(title)) cat = 'truck'
    if (!cat) continue

    // Walk each brand-section inside this cat-section.
    const brandBlocks = block.split(/class="brand-section"/)
    for (let j = 1; j < brandBlocks.length; j++) {
      const bblock = brandBlocks[j]
      const brandTitleM = bblock.match(/class="brand-title\s+(\w+)"/)
      const brandKey = brandTitleM ? brandTitleM[1].toLowerCase() : null
      const brand = brandKey ? BRAND_CLASS_MAP[brandKey] : null
      if (!brand) {
        warnings.push({ kind: 'unknownBrand', message: `Unrecognized brand class: ${brandKey}` })
        continue
      }

      // Each <tr> inside this brand's product-table is a row to parse.
      const rowRe = /<tr>[\s\S]*?<\/tr>/g
      const rows = bblock.match(rowRe) || []
      for (const row of rows) {
        // Skip header row (has <th>, not <td>)
        if (row.includes('<th')) continue
        const mspnM = row.match(/<td[^>]*style="[^"]*font-family:monospace[^"]*"[^>]*>([0-9]{4,7})<\/td>/)
        if (!mspnM) continue
        const mspn = mspnM[1]

        // Extract remaining cells via greedy <td>(content)</td> walk
        const cellsRe = /<td[^>]*>([\s\S]*?)<\/td>/g
        const cells = []
        let cm
        while ((cm = cellsRe.exec(row)) !== null) {
          cells.push(cm[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim())
        }
        // Expected order: MSPN, Tread, Description, LR, FET, Price
        if (cells.length < 6) {
          warnings.push({ kind: 'malformedRow', message: 'Row had fewer than 6 cells', mspn })
          continue
        }
        const tread = cells[1]
        const description = cells[2]
        const lrRaw = cells[3]
        const fetRaw = cells[4]
        const priceRaw = cells[5]

        // PQL = price quoted locally, can't be priced from HTML.
        if (/^PQL$/i.test(priceRaw)) {
          warnings.push({ kind: 'pql', message: 'Price quoted locally; row skipped', mspn })
          continue
        }

        const lr = lrRaw === '—' ? '' : lrRaw.toUpperCase()
        const fet = Number(String(fetRaw).replace(/[^0-9.]/g, '')) || 0
        const priceCleaned = String(priceRaw).replace(/[^0-9.]/g, '')
        const price = Number(priceCleaned)
        if (!Number.isFinite(price) || price <= 0) {
          warnings.push({ kind: 'invalidPrice', message: `Invalid price: ${priceRaw}`, mspn })
          continue
        }

        if (!tread) {
          warnings.push({ kind: 'missingTread', message: 'Tread cell empty', mspn })
        }

        mspns[mspn] = cat
        tireRecords.push({
          mspn,
          brand,
          tread,
          description,
          lr,
          fet,
          price,
          category: cat,
        })
      }
    }
  }

  if (Object.keys(mspns).length === 0) {
    throw new Error(
      'parseEfleetCatalog: malformed input — no MSPNs extracted (parser regex may need updating for new HTML format)',
    )
  }

  const acctM = html.match(/Ship To: ([^<]+)/)
  const account = acctM ? acctM[1].trim() : null

  const dateM = html.match(/Report Date:<\/td><td>([^<]+)/)
  let sourceReportDate = null
  if (dateM) {
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ]
    const dm = dateM[1].match(/(\w+)\s+(\d{1,2}),\s+(\d{4})/)
    if (dm) {
      const idx = months.findIndex((mn) => mn.toLowerCase() === dm[1].toLowerCase())
      if (idx >= 0) {
        const mm = String(idx + 1).padStart(2, '0')
        const dd = String(parseInt(dm[2], 10)).padStart(2, '0')
        sourceReportDate = `${dm[3]}-${mm}-${dd}`
      }
    }
  }

  return {
    mspns,
    tireRecords,
    account,
    sourceReportDate,
    totalParsed: tireRecords.length,
    warnings,
  }
}
```

(Note: `totalParsed` now means count of `tireRecords` (= valid rows excluding PQL/invalid). The existing test that asserted `totalParsed: 10` matches this.)

- [ ] **Step 10: Run all tests, verify pass**

```bash
npm run test -- scripts/import-efleet.test.mjs --run
```

Expected: 13 tests pass total (5 existing + 8 new).

- [ ] **Step 11: Lint**

```bash
npm run lint
```

Expected: 0 errors.

- [ ] **Step 12: Commit**

```bash
git add scripts/import-efleet.mjs scripts/import-efleet.test.mjs scripts/__fixtures__/efleet-sample.html package.json
git commit -m "feat(tires): rename eFleet importer + extract per-row tire records with brand"
```

---

## Task 2: planTirePhases — pure decision function

A pure function that takes existing Firestore tire docs and the parsed `tireRecords[]`, and decides which phase each MSPN falls into: insert, off-program-set, off-program-clear, field-diff, or skip.

**Files:**
- Modify: `scripts/import-efleet.mjs` (add `planTirePhases` export)
- Modify: `scripts/import-efleet.test.mjs` (add new describe block)

- [ ] **Step 1: Write failing tests for `planTirePhases`**

Append to `scripts/import-efleet.test.mjs`:

```js
import { planTirePhases } from './import-efleet.mjs'

describe('planTirePhases', () => {
  function makeRecord(overrides = {}) {
    return {
      mspn: '12345',
      brand: 'MICHELIN',
      tread: 'XZE2',
      description: '11R22.5 XZE2 LRG',
      lr: 'G',
      fet: 25.23,
      price: 613.60,
      category: 'truck',
      ...overrides,
    }
  }
  function makeDoc(overrides = {}) {
    return {
      id: '12345',
      mspn: '12345',
      brand: 'MICHELIN',
      tread: 'XZE2',
      description: '11R22.5 XZE2 LRG',
      lr: 'G',
      fet: 25.23,
      price: 613.60,
      ...overrides,
    }
  }

  it('inserts new MSPNs that have no Firestore doc', () => {
    const plan = planTirePhases([], [makeRecord({ mspn: 'NEW-1' })])
    expect(plan.inserts).toHaveLength(1)
    expect(plan.inserts[0].mspn).toBe('NEW-1')
    expect(plan.inserts[0].firstSeenInEfleetAt).toBe('SERVER_TIMESTAMP_SENTINEL')
    expect(plan.offProgramSets).toEqual([])
    expect(plan.offProgramClears).toEqual([])
    expect(plan.fieldDiffs).toEqual([])
  })

  it('flags existing docs whose MSPN is absent from records as offProgramSets', () => {
    const plan = planTirePhases(
      [makeDoc({ id: 'GONE-1' })],
      [makeRecord({ mspn: 'OTHER-1' })],
    )
    expect(plan.offProgramSets).toEqual([{ id: 'GONE-1' }])
  })

  it('does not re-set offProgramAt when the doc already has it', () => {
    const plan = planTirePhases(
      [makeDoc({ id: 'GONE-1', offProgramAt: { _seconds: 1 } })],
      [makeRecord({ mspn: 'OTHER-1' })],
    )
    expect(plan.offProgramSets).toEqual([])
  })

  it('clears offProgramAt when an off-program MSPN reappears in the HTML', () => {
    const plan = planTirePhases(
      [makeDoc({ id: 'BACK-1', offProgramAt: { _seconds: 1 } })],
      [makeRecord({ mspn: 'BACK-1' })],
    )
    expect(plan.offProgramClears).toEqual([{ id: 'BACK-1' }])
    expect(plan.offProgramSets).toEqual([])
  })

  it('detects field drift between existing doc and record', () => {
    const plan = planTirePhases(
      [makeDoc({ id: 'DRIFT-1', price: 600.00, fet: 24.00 })],
      [makeRecord({ mspn: 'DRIFT-1', price: 613.60, fet: 25.23 })],
    )
    expect(plan.fieldDiffs).toHaveLength(1)
    expect(plan.fieldDiffs[0].id).toBe('DRIFT-1')
    expect(plan.fieldDiffs[0].changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'price', from: 600.00, to: 613.60 }),
        expect.objectContaining({ field: 'fet', from: 24.00, to: 25.23 }),
      ]),
    )
  })

  it('does not include fields where doc and record agree', () => {
    const plan = planTirePhases([makeDoc({ id: 'SAME-1' })], [makeRecord({ mspn: 'SAME-1' })])
    expect(plan.fieldDiffs).toEqual([])
  })

  it('skips docs with archivedAt regardless of HTML state', () => {
    const plan = planTirePhases(
      [makeDoc({ id: 'ARCH-1', archivedAt: { _seconds: 1 } })],
      [makeRecord({ mspn: 'ARCH-1', price: 999 })],
    )
    expect(plan.skipped).toEqual([{ id: 'ARCH-1', reason: 'archivedAt' }])
    expect(plan.fieldDiffs).toEqual([])
    expect(plan.offProgramSets).toEqual([])
  })

  it('flags brand conflicts (existing brand differs from HTML brand)', () => {
    const plan = planTirePhases(
      [makeDoc({ id: 'BRAND-1', brand: 'BFGOODRICH' })],
      [makeRecord({ mspn: 'BRAND-1', brand: 'MICHELIN' })],
    )
    expect(plan.brandConflicts).toEqual([
      { mspn: 'BRAND-1', existingBrand: 'BFGOODRICH', htmlBrand: 'MICHELIN' },
    ])
  })

  it('does not include `firstSeenInEfleetAt` in field diffs for existing docs', () => {
    const plan = planTirePhases(
      [makeDoc({ id: 'FSE-1' })],
      [makeRecord({ mspn: 'FSE-1', price: 999 })],
    )
    const fieldNames = plan.fieldDiffs[0]?.changes.map((c) => c.field) || []
    expect(fieldNames).not.toContain('firstSeenInEfleetAt')
  })

  it('only diffs the eFleet-sourced fields (price, fet, description, lr, tread, brand)', () => {
    const plan = planTirePhases(
      [
        makeDoc({
          id: 'ALL-FIELDS-1',
          price: 100,
          fet: 5,
          description: 'OLD',
          lr: 'F',
          tread: 'OLD-TREAD',
          brand: 'BFGOODRICH',
          // Fields that should NOT be diffed:
          notes: 'DO NOT TOUCH',
          tags: ['user-edit'],
          priceIntel: { activeBuyPrice: 95 },
        }),
      ],
      [
        makeRecord({
          mspn: 'ALL-FIELDS-1',
          price: 200,
          fet: 10,
          description: 'NEW',
          lr: 'G',
          tread: 'NEW-TREAD',
          brand: 'MICHELIN',
        }),
      ],
    )
    const fields = plan.fieldDiffs[0].changes.map((c) => c.field).sort()
    expect(fields).toEqual(['description', 'fet', 'lr', 'price', 'tread'])
    // Brand conflict reported separately, not in fieldDiffs
    expect(plan.brandConflicts).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run, verify fail**

```bash
npm run test -- scripts/import-efleet.test.mjs --run
```

Expected: 10 new tests fail (`planTirePhases` not exported).

- [ ] **Step 3: Implement `planTirePhases`**

Append to `scripts/import-efleet.mjs` (after `parseEfleetCatalog` but before the imports/CLI section):

```js
const SERVER_TIMESTAMP_SENTINEL = 'SERVER_TIMESTAMP_SENTINEL'

const EFLEET_SOURCED_FIELDS = ['price', 'fet', 'description', 'lr', 'tread']

/**
 * Plan the four-phase Firestore writes for an import.
 * Pure function — no I/O. Caller materializes the plan into actual writes.
 *
 * @param {Array<{ id: string, [key: string]: unknown }>} existingDocs
 * @param {Array<{ mspn: string, brand: string, tread: string, description: string, lr: string, fet: number, price: number, category: string }>} tireRecords
 * @returns {{
 *   inserts: Array<object>,
 *   offProgramSets: Array<{ id: string }>,
 *   offProgramClears: Array<{ id: string }>,
 *   fieldDiffs: Array<{ id: string, mspn: string, changes: Array<{ field: string, from: unknown, to: unknown }> }>,
 *   brandConflicts: Array<{ mspn: string, existingBrand: string, htmlBrand: string }>,
 *   skipped: Array<{ id: string, reason: string }>,
 * }}
 */
export function planTirePhases(existingDocs, tireRecords) {
  const inserts = []
  const offProgramSets = []
  const offProgramClears = []
  const fieldDiffs = []
  const brandConflicts = []
  const skipped = []

  const docsByMspn = new Map()
  for (const doc of existingDocs) {
    const key = String(doc?.mspn ?? doc?.id ?? '').trim()
    if (key) docsByMspn.set(key, doc)
  }
  const recordsByMspn = new Map(tireRecords.map((r) => [String(r.mspn).trim(), r]))

  for (const record of tireRecords) {
    const mspn = String(record.mspn).trim()
    const doc = docsByMspn.get(mspn)

    if (!doc) {
      // Phase 2: Insert.
      inserts.push({
        ...record,
        firstSeenInEfleetAt: SERVER_TIMESTAMP_SENTINEL,
      })
      continue
    }

    if (doc.archivedAt) {
      skipped.push({ id: doc.id, reason: 'archivedAt' })
      continue
    }

    // Re-emergence: doc has offProgramAt but the MSPN is in this HTML now.
    if (doc.offProgramAt) {
      offProgramClears.push({ id: doc.id })
    }

    // Brand conflict (logged separately; brand is not auto-rebranded in field diff).
    if (doc.brand && doc.brand !== record.brand) {
      brandConflicts.push({
        mspn,
        existingBrand: doc.brand,
        htmlBrand: record.brand,
      })
    }

    // Field-level diff for the eFleet-sourced fields only.
    const changes = []
    for (const field of EFLEET_SOURCED_FIELDS) {
      const before = doc[field]
      const after = record[field]
      if (before !== after) {
        changes.push({ field, from: before, to: after })
      }
    }
    if (changes.length > 0) {
      fieldDiffs.push({ id: doc.id, mspn, changes })
    }
  }

  // Phase 3 set: docs in Firestore whose MSPN is absent from this HTML.
  for (const doc of existingDocs) {
    const mspn = String(doc?.mspn ?? doc?.id ?? '').trim()
    if (!mspn) continue
    if (doc.archivedAt) continue
    if (recordsByMspn.has(mspn)) continue
    if (doc.offProgramAt) continue
    offProgramSets.push({ id: doc.id })
  }

  return {
    inserts,
    offProgramSets,
    offProgramClears,
    fieldDiffs,
    brandConflicts,
    skipped,
  }
}
```

- [ ] **Step 4: Run, verify pass**

```bash
npm run test -- scripts/import-efleet.test.mjs --run
```

Expected: 23 tests pass total (13 from Task 1 + 10 new).

- [ ] **Step 5: Lint**

```bash
npm run lint
```

Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add scripts/import-efleet.mjs scripts/import-efleet.test.mjs
git commit -m "feat(tires): planTirePhases pure function for insert/off-program/diff phases"
```

---

## Task 3: Wire planning + Phase 2 inserts into the CLI

Replace the current single-purpose `main()` (writes only `meta/categoryMap`) with a four-phase orchestrator. This task wires Phase 1 (existing) + Phase 2 (new tire-doc inserts). Phases 3 and 4 land in subsequent tasks.

**Files:**
- Modify: `scripts/import-efleet.mjs`

- [ ] **Step 1: Add imports for the planner and a Firestore tire-collection helper**

Inside `scripts/import-efleet.mjs`, the existing imports already cover what's needed (`firebase-admin/firestore` exposes `FieldValue` for `serverTimestamp()`). No new top-level imports.

- [ ] **Step 2: Add a fetch helper for existing tire docs**

Above `main()`, add:

```js
async function fetchExistingTireDocs(db) {
  const snap = await db.collection('tires').get()
  const docs = []
  snap.forEach((d) => {
    docs.push({ id: d.id, ...d.data() })
  })
  return docs
}
```

- [ ] **Step 3: Add a Phase 2 writer**

Above `main()`, add:

```js
async function writeTireInserts(db, inserts) {
  if (inserts.length === 0) return 0
  // Firestore batch cap is 500 writes per batch.
  const BATCH_SIZE = 400
  let written = 0
  for (let i = 0; i < inserts.length; i += BATCH_SIZE) {
    const slice = inserts.slice(i, i + BATCH_SIZE)
    const batch = db.batch()
    for (const record of slice) {
      const ref = db.collection('tires').doc(String(record.mspn))
      const payload = {
        mspn: record.mspn,
        brand: record.brand,
        tread: record.tread,
        description: record.description,
        lr: record.lr,
        fet: record.fet,
        price: record.price,
        firstSeenInEfleetAt: FieldValue.serverTimestamp(),
      }
      batch.set(ref, payload, { merge: true })
    }
    await batch.commit()
    written += slice.length
  }
  return written
}
```

- [ ] **Step 4: Wire planner + Phase 2 into `main()`**

Find `main()` in `scripts/import-efleet.mjs`. Replace it with the extended version:

```js
async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!args.htmlPath) {
    console.error(
      'Usage: npm run import:efleet -- path/to/efleet.html [--dry-run] [--yes]',
    )
    process.exit(1)
  }
  const html = readFileSync(resolve(args.htmlPath), 'utf8')
  console.log(`Parsing ${args.htmlPath}…`)
  const parsed = parseEfleetCatalog(html)
  console.log(`  Source date: ${parsed.sourceReportDate || '(unknown)'}`)
  console.log(`  Account: ${parsed.account || '(unknown)'}`)
  console.log(`  Total parsed: ${parsed.totalParsed}`)
  const cats = {}
  for (const v of Object.values(parsed.mspns)) cats[v] = (cats[v] || 0) + 1
  console.log(`    Light Truck: ${cats.lightTruck || 0}`)
  console.log(`    Passenger:   ${cats.passenger || 0}`)
  console.log(`    Truck:       ${cats.truck || 0}`)
  if (parsed.warnings.length > 0) {
    console.log(`  Warnings: ${parsed.warnings.length}`)
    for (const w of parsed.warnings.slice(0, 10)) {
      console.log(`    - ${w.kind}${w.mspn ? ` (mspn=${w.mspn})` : ''}: ${w.message}`)
    }
    if (parsed.warnings.length > 10) {
      console.log(`    … and ${parsed.warnings.length - 10} more`)
    }
  }

  if (args.dryRun) {
    console.log('\n--dry-run: skipping Firestore credentials check; planning offline-only.')
    // Without credentials we can't fetch existing docs, so the plan is "all new"
    const plan = planTirePhases([], parsed.tireRecords)
    console.log(`\nPlanned (vs empty Firestore — for dry-run sample):`)
    console.log(`  Inserts:           ${plan.inserts.length}`)
    console.log(`  Off-program sets:  ${plan.offProgramSets.length}`)
    console.log(`  Off-program clears:${plan.offProgramClears.length}`)
    console.log(`  Field diffs:       ${plan.fieldDiffs.length}`)
    console.log(`  Brand conflicts:   ${plan.brandConflicts.length}`)
    console.log(`  Skipped:           ${plan.skipped.length}`)
    process.exit(0)
  }

  const sa = requireCredentials()
  if (!getApps().length) initializeApp({ credential: cert(sa), projectId: sa.project_id })
  const db = getFirestore()
  const projectId = db.app?.options?.projectId || sa.project_id || '(unknown)'
  console.log(`\nTarget Firestore project: ${projectId}`)

  // Phase 1: meta/categoryMap (existing behavior, unchanged).
  const ref = db.doc('meta/categoryMap')
  const stagingRef = db.doc('meta/categoryMapStaging')
  const prior = (await ref.get()).data() || null

  const payload = {
    version: 1,
    importedAt: FieldValue.serverTimestamp(),
    sourceFile: args.htmlPath,
    sourceReportDate: parsed.sourceReportDate,
    account: parsed.account,
    totalParsed: parsed.totalParsed,
    mspns: parsed.mspns,
  }

  const diff = diffMaps(prior?.mspns, parsed.mspns)
  console.log('\nDiff vs prior import (categoryMap):')
  console.log(`  + ${diff.added.length} new MSPNs categorized`)
  console.log(`  - ${diff.removed.length} MSPNs removed`)
  console.log(`  ~ ${diff.changed.length} MSPNs changed category`)
  if (diff.changed.length > 0 && diff.changed.length <= 20) {
    diff.changed.forEach((c) => console.log(`    ${c.mspn}: ${c.from} → ${c.to}`))
  }

  // Phase 2 planning: read existing tire docs and plan.
  console.log('\nFetching existing tire docs for planning…')
  const existingDocs = await fetchExistingTireDocs(db)
  console.log(`  Existing tire docs: ${existingDocs.length}`)

  const plan = planTirePhases(existingDocs, parsed.tireRecords)
  console.log(`\nTire-doc plan:`)
  console.log(`  Inserts:            ${plan.inserts.length}`)
  console.log(`  Off-program sets:   ${plan.offProgramSets.length}`)
  console.log(`  Off-program clears: ${plan.offProgramClears.length}`)
  console.log(`  Field diffs:        ${plan.fieldDiffs.length} (will NOT apply unless --apply-updates is set)`)
  console.log(`  Brand conflicts:    ${plan.brandConflicts.length}`)
  console.log(`  Skipped (archived): ${plan.skipped.length}`)

  if (!args.yes) {
    const rl = readline.createInterface({ input, output })
    const answer = await rl.question('\nContinue? [y/N] ')
    rl.close()
    if (answer.trim().toLowerCase() !== 'y') {
      console.log('Aborted.')
      process.exit(0)
    }
  }

  // Phase 1 atomic write.
  await stagingRef.set(payload)
  await ref.set(payload)
  console.log(`\n✓ Phase 1: wrote meta/categoryMap (${parsed.totalParsed} entries)`)

  // Phase 2: insert new tire docs.
  const inserted = await writeTireInserts(db, plan.inserts)
  console.log(`✓ Phase 2: inserted ${inserted} tire docs`)

  console.log('\nDone.')
}
```

- [ ] **Step 5: Verify parser tests still pass (no regression)**

```bash
npm run test -- scripts/import-efleet.test.mjs --run
```

Expected: 23/23 still pass.

- [ ] **Step 6: Verify CLI dry-run on the fixture**

```bash
node scripts/import-efleet.mjs scripts/__fixtures__/efleet-sample.html --dry-run
```

Expected output mentions `Total parsed: 10`, lists category counts, prints the off-line plan summary, and exits 0.

- [ ] **Step 7: Lint**

```bash
npm run lint
```

Expected: 0 errors.

- [ ] **Step 8: Commit**

```bash
git add scripts/import-efleet.mjs
git commit -m "feat(tires): wire planTirePhases + Phase 2 inserts into eFleet importer"
```

---

## Task 4: Phase 3 wiring — off-program tagging (set + clear)

Adds the `offProgramAt` set/clear writes after Phase 2.

**Files:**
- Modify: `scripts/import-efleet.mjs`

- [ ] **Step 1: Add Phase 3 writers**

In `scripts/import-efleet.mjs`, above `main()` and below `writeTireInserts`, add:

```js
async function writeOffProgramSets(db, sets) {
  if (sets.length === 0) return 0
  const BATCH_SIZE = 400
  let written = 0
  for (let i = 0; i < sets.length; i += BATCH_SIZE) {
    const slice = sets.slice(i, i + BATCH_SIZE)
    const batch = db.batch()
    for (const { id } of slice) {
      const ref = db.collection('tires').doc(id)
      batch.set(ref, { offProgramAt: FieldValue.serverTimestamp() }, { merge: true })
    }
    await batch.commit()
    written += slice.length
  }
  return written
}

async function writeOffProgramClears(db, clears) {
  if (clears.length === 0) return 0
  const BATCH_SIZE = 400
  let written = 0
  for (let i = 0; i < clears.length; i += BATCH_SIZE) {
    const slice = clears.slice(i, i + BATCH_SIZE)
    const batch = db.batch()
    for (const { id } of slice) {
      const ref = db.collection('tires').doc(id)
      batch.update(ref, { offProgramAt: FieldValue.delete() })
    }
    await batch.commit()
    written += slice.length
  }
  return written
}
```

- [ ] **Step 2: Add the mass-off-program safety check + flag**

Update `parseArgs` in `scripts/import-efleet.mjs` to recognize `--allow-mass-offprogram`:

```js
function parseArgs(argv) {
  const out = {
    dryRun: false,
    yes: false,
    htmlPath: null,
    allowMassOffProgram: false,
  }
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--dry-run' || a === '-n') out.dryRun = true
    else if (a === '--yes') out.yes = true
    else if (a === '--allow-mass-offprogram') out.allowMassOffProgram = true
    else if (a.startsWith('-')) {
      console.error(`Unknown flag: ${a}`)
      console.error(
        'Usage: npm run import:efleet -- path/to/efleet.html [--dry-run] [--yes] [--allow-mass-offprogram]',
      )
      process.exit(1)
    } else out.htmlPath = a
  }
  return out
}
```

- [ ] **Step 3: Wire Phase 3 into `main()`**

In `main()`, after the Phase 2 inserts log line and before `console.log('\nDone.')`, add:

```js
  // Mass-off-program safety: abort if Phase 3 would tag >10% of tire docs.
  const offProgPct =
    existingDocs.length > 0
      ? (plan.offProgramSets.length / existingDocs.length) * 100
      : 0
  if (offProgPct > 10 && !args.allowMassOffProgram) {
    console.error(
      `\n✗ Aborting: Phase 3 would tag ${plan.offProgramSets.length} of ${existingDocs.length} tire docs ` +
        `(${offProgPct.toFixed(1)}%) as off-program. This usually means a partial HTML export.`,
    )
    console.error('Pass --allow-mass-offprogram to override.')
    process.exit(1)
  }

  const offProgSet = await writeOffProgramSets(db, plan.offProgramSets)
  const offProgCleared = await writeOffProgramClears(db, plan.offProgramClears)
  console.log(`✓ Phase 3: tagged ${offProgSet} off-program; cleared ${offProgCleared} re-emergence`)
```

- [ ] **Step 4: Verify tests still pass**

```bash
npm run test -- scripts/import-efleet.test.mjs --run
```

Expected: 23/23 pass.

- [ ] **Step 5: Verify CLI dry-run still works (no regression)**

```bash
node scripts/import-efleet.mjs scripts/__fixtures__/efleet-sample.html --dry-run
```

- [ ] **Step 6: Verify CLI rejects an unknown flag**

```bash
node scripts/import-efleet.mjs scripts/__fixtures__/efleet-sample.html --bogus-flag
```

Expected: `Unknown flag: --bogus-flag` + exit 1.

- [ ] **Step 7: Lint**

```bash
npm run lint
```

Expected: 0 errors.

- [ ] **Step 8: Commit**

```bash
git add scripts/import-efleet.mjs
git commit -m "feat(tires): wire Phase 3 off-program set/clear with mass-off-program safety"
```

---

## Task 5: Phase 4 wiring — diff logging + --apply-updates

Adds the `--apply-updates`, `--quiet`, `--verbose` flags and the diff-logging / gated update logic.

**Files:**
- Modify: `scripts/import-efleet.mjs`

- [ ] **Step 1: Update `parseArgs` to recognize the new flags**

Replace `parseArgs` again:

```js
function parseArgs(argv) {
  const out = {
    dryRun: false,
    yes: false,
    htmlPath: null,
    allowMassOffProgram: false,
    applyUpdates: false,
    quiet: false,
    verbose: false,
  }
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--dry-run' || a === '-n') out.dryRun = true
    else if (a === '--yes') out.yes = true
    else if (a === '--apply-updates') out.applyUpdates = true
    else if (a === '--quiet') out.quiet = true
    else if (a === '--verbose') out.verbose = true
    else if (a === '--allow-mass-offprogram') out.allowMassOffProgram = true
    else if (a.startsWith('-')) {
      console.error(`Unknown flag: ${a}`)
      console.error(
        'Usage: npm run import:efleet -- path/to/efleet.html [--dry-run] [--yes]\n' +
          '       [--apply-updates] [--quiet] [--verbose] [--allow-mass-offprogram]',
      )
      process.exit(1)
    } else out.htmlPath = a
  }
  return out
}
```

- [ ] **Step 2: Add a diff printer**

Above `main()`:

```js
function printFieldDiffs(plan, args) {
  if (plan.fieldDiffs.length === 0) {
    if (!args.quiet) console.log('  (no field drift detected)')
    return
  }
  if (args.quiet) return

  const cap = args.verbose ? plan.fieldDiffs.length : Math.min(30, plan.fieldDiffs.length)
  console.log(`  Showing ${cap} of ${plan.fieldDiffs.length}:`)
  for (let i = 0; i < cap; i++) {
    const d = plan.fieldDiffs[i]
    console.log(`  ~ tires/${d.id} (${d.mspn})`)
    for (const c of d.changes) {
      console.log(`      ${c.field}: ${JSON.stringify(c.from)} → ${JSON.stringify(c.to)}`)
    }
  }
  if (cap < plan.fieldDiffs.length) {
    console.log(
      `  … and ${plan.fieldDiffs.length - cap} more existing docs differ. Use --verbose to see all, or --apply-updates to commit.`,
    )
  }
}
```

- [ ] **Step 3: Add the Phase 4 writer**

```js
async function writeFieldUpdates(db, fieldDiffs) {
  if (fieldDiffs.length === 0) return 0
  const BATCH_SIZE = 400
  let written = 0
  for (let i = 0; i < fieldDiffs.length; i += BATCH_SIZE) {
    const slice = fieldDiffs.slice(i, i + BATCH_SIZE)
    const batch = db.batch()
    for (const d of slice) {
      const ref = db.collection('tires').doc(d.id)
      const payload = {}
      for (const c of d.changes) {
        payload[c.field] = c.to
      }
      batch.set(ref, payload, { merge: true })
    }
    await batch.commit()
    written += slice.length
  }
  return written
}
```

- [ ] **Step 4: Wire Phase 4 + diff log into `main()`**

In `main()`, after the Phase 3 success line and before `console.log('\nDone.')`, add:

```js
  // Phase 4: existing-doc field updates.
  console.log(`\nField-drift diff (${plan.fieldDiffs.length} docs):`)
  printFieldDiffs(plan, args)
  if (args.applyUpdates) {
    const updated = await writeFieldUpdates(db, plan.fieldDiffs)
    console.log(`✓ Phase 4: applied ${updated} field updates`)
  } else if (plan.fieldDiffs.length > 0) {
    console.log('  (Phase 4 skipped — pass --apply-updates to commit field-drift updates)')
  }

  if (plan.brandConflicts.length > 0) {
    console.log(`\n⚠ ${plan.brandConflicts.length} brand conflicts (NOT auto-corrected):`)
    for (const c of plan.brandConflicts.slice(0, 10)) {
      console.log(`  ${c.mspn}: existing=${c.existingBrand} html=${c.htmlBrand}`)
    }
  }
```

- [ ] **Step 5: Verify tests still pass**

```bash
npm run test -- scripts/import-efleet.test.mjs --run
```

Expected: 23/23 pass.

- [ ] **Step 6: Verify all flag modes via dry-run**

```bash
node scripts/import-efleet.mjs scripts/__fixtures__/efleet-sample.html --dry-run --quiet
node scripts/import-efleet.mjs scripts/__fixtures__/efleet-sample.html --dry-run --verbose
node scripts/import-efleet.mjs scripts/__fixtures__/efleet-sample.html --dry-run --apply-updates
```

Each should run cleanly and exit 0.

- [ ] **Step 7: Lint**

```bash
npm run lint
```

Expected: 0 errors.

- [ ] **Step 8: Commit**

```bash
git add scripts/import-efleet.mjs
git commit -m "feat(tires): wire Phase 4 field-drift logging and gated --apply-updates writes"
```

---

## Task 6: Final verification + push

- [ ] **Step 1: Run full lint**

```bash
npm run lint
```

Expected: 0 errors.

- [ ] **Step 2: Run full test suite**

```bash
npm run test -- --run
```

Expected: All tests pass; new tests added by Tasks 1 + 2 (~18 new) included in total.

- [ ] **Step 3: Run production build**

```bash
npm run build
```

Expected: green.

- [ ] **Step 4: Run CLI dry-run end-to-end**

```bash
node scripts/import-efleet.mjs scripts/__fixtures__/efleet-sample.html --dry-run
```

Expected: parses 10 SKUs, prints category split (3/4/3), brand split implicit, exits 0 without requiring credentials.

- [ ] **Step 5: Push branch**

```bash
git push -u origin uniroyal-import
```

- [ ] **Step 6: Production import smoke test**

When the branch merges and lands on main, run against the real Michelin eFleet HTML:

```powershell
cd "C:\Users\Alex\Desktop\skedaddle-portal"
$env:GOOGLE_APPLICATION_CREDENTIALS = "C:\Users\Alex\.firebase\skedaddle-inventory-firebase-adminsdk-fbsvc-35df096561.json"
npm run import:efleet -- ".claude\worktrees\tires-hiddengems-redesign\Michelin_catalog.html" --yes
```

Verify the output reports:
- Phase 1: meta/categoryMap (1,385 entries)
- Phase 2: ~225 inserts (~120 Uniroyal + ~100 Michelin/BFG that were in eFleet but not in tires.csv)
- Phase 3: 0 off-program sets (the existing CSV-seeded docs all have eFleet matches), some clears if any prior off-program tags exist
- Phase 4: diff for ~800 existing docs may show drift; review then re-run with `--apply-updates` if accepted

Then refresh `/tires` in the portal:
- [ ] Brand=Uniroyal filter shows ~120 SKUs
- [ ] CategoryTabs counts updated (e.g. Passenger now ~610, Light Truck ~620)
- [ ] Brand-color row accent on Uniroyal rows uses `--color-brand-uniroyal: #2e7d4a`
- [ ] No tire docs accidentally tagged `offProgramAt`

---

## Verification summary

After all tasks complete:
- Lint: 0 errors (warnings unchanged from main baseline)
- Tests: all green; ~18 new tests added across parser extension and `planTirePhases`
- Build: green
- CLI dry-run on fixture: parses 10 SKUs cleanly
- Production import (manual smoke test): adds Uniroyal SKUs without false off-program tags

Once those are green, follow `superpowers:finishing-a-development-branch` to merge or open a PR.
