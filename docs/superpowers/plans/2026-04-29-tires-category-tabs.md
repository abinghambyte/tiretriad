# Tires catalog category tabs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `[All] [Passenger] [Light Truck] [Truck]` sub-tabs above the Tires catalog toolbar, with category derived authoritatively from a Firestore `meta/categoryMap` doc populated by parsing the Michelin eFleet HTML, plus a size+LR fallback heuristic and a per-tire `categoryOverride` escape hatch.

**Architecture:** A Node CLI script parses the eFleet HTML into a `{mspn → category}` map and writes it to `meta/categoryMap`. The dashboard hook loads the doc once on mount. A pure `selectCategoryForTire(tire, categoryMap)` selector resolves category in priority order (override → eFleet → heuristic). `<CategoryTabs>` is a small presentational component fed counts derived from a single-pass `categorizedRows` memo in `TiresDashboard`. Tab state lives in `selectedCategory` synced to the URL via `?cat=`. Filters reset on tab switch; search/sort/selection persist.

**Tech Stack:** React 19, Vite, Tailwind v4, Vitest + @testing-library/react (no `userEvent`, no `jest-dom` matchers — use `fireEvent` and plain DOM assertions, matching this codebase's tests). Firebase Web SDK on the client (`getDoc`/`onSnapshot` via existing `db` export). Firebase Admin SDK in scripts (mirroring `scripts/migrate-tire-fet-tag.mjs`).

**Spec:** `docs/superpowers/specs/2026-04-29-tires-category-tabs-design.md`

---

## Task 1: Category selectors

Pure functions added to the existing `useDashboardSignals.js` selectors block (next to `selectHiddenGems`). New test file alongside.

**Files:**
- Modify: `src/hooks/useDashboardSignals.js` (add two exports near the top with the other selectors, around line 30)
- Test: `src/hooks/useDashboardSignals.test.js` (NEW — does not exist yet)

- [ ] **Step 1: Write failing tests for `fallbackHeuristic`**

Create `src/hooks/useDashboardSignals.test.js`:

```js
/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest'
import { fallbackHeuristic, selectCategoryForTire } from './useDashboardSignals'

describe('fallbackHeuristic', () => {
  it('returns truck for wheel diameter ≥ 22.5"', () => {
    expect(fallbackHeuristic({ desc: '11R22.5 X INCITY Z LRH', lr: 'H' })).toBe('truck')
    expect(fallbackHeuristic({ desc: '275/80R22.5 XDA ENERGY', lr: '' })).toBe('truck')
    expect(fallbackHeuristic({ desc: '11R24.5 XDN2 LRH', lr: 'H' })).toBe('truck')
  })

  it('returns truck for heavy load range (H/J/L/M) regardless of wheel', () => {
    expect(fallbackHeuristic({ desc: '24R21 XZL 176G', lr: 'H' })).toBe('truck')
    expect(fallbackHeuristic({ desc: '455/55R22.5 X1LGD', lr: 'L' })).toBe('truck')
    expect(fallbackHeuristic({ desc: '215/75R17.5 XMT2', lr: 'J' })).toBe('truck')
  })

  it('returns lightTruck for LT prefix', () => {
    expect(fallbackHeuristic({ desc: 'LT245/75R16 XPS RIB', lr: 'E' })).toBe('lightTruck')
    expect(fallbackHeuristic({ desc: 'LT225/75R16 LTX A/T2', lr: '' })).toBe('lightTruck')
  })

  it('returns lightTruck for medium load range (C/D/E/F/G)', () => {
    expect(fallbackHeuristic({ desc: '12.00R20 XML', lr: 'G' })).toBe('lightTruck')
    expect(fallbackHeuristic({ desc: '215/75R17.5 XMZ', lr: 'G' })).toBe('lightTruck')
  })

  it('returns passenger for everything else (default)', () => {
    expect(fallbackHeuristic({ desc: '215/55R17 98V XL DEFENDER2', lr: '' })).toBe('passenger')
    expect(fallbackHeuristic({ desc: '235/55R19 105HXL PA5 SUV', lr: '' })).toBe('passenger')
  })

  it('handles missing/empty fields without throwing', () => {
    expect(fallbackHeuristic({})).toBe('passenger')
    expect(fallbackHeuristic({ desc: '', lr: '' })).toBe('passenger')
    expect(fallbackHeuristic(null)).toBe('passenger')
  })

  it('locks current 19.5" edge-case behavior (LRG → lightTruck, LRH → truck)', () => {
    expect(fallbackHeuristic({ desc: '225/70R19.5 AGILIS HD Z LRG', lr: 'G' })).toBe('lightTruck')
    expect(fallbackHeuristic({ desc: '245/70R19.5 AGILIS HD Z LRH', lr: 'H' })).toBe('truck')
  })
})
```

- [ ] **Step 2: Run, verify fail**

```bash
npm run test -- src/hooks/useDashboardSignals.test.js --run
```

Expected: FAIL — `fallbackHeuristic is not exported`.

- [ ] **Step 3: Implement `fallbackHeuristic`**

Open `src/hooks/useDashboardSignals.js`. Find the existing `export function selectHiddenGems` (around line 31). Add immediately above it:

```js
/**
 * Pure fallback heuristic for SKUs that aren't in the eFleet authoritative
 * map. Looks at description size pattern + LR field. Used by
 * {@link selectCategoryForTire} when the map is missing or doesn't cover
 * the tire (typically the ~243 portal-only off-program Michelin SKUs).
 *
 * @param {object | null | undefined} tire
 * @returns {'passenger' | 'lightTruck' | 'truck'}
 */
export function fallbackHeuristic(tire) {
  const desc = String(tire?.desc || '').toUpperCase().trim()
  const lr = String(tire?.lr || '').toUpperCase().trim()
  const m = desc.match(/R([0-9]+(?:\.[0-9]+)?)/)
  const wheel = m ? parseFloat(m[1]) : null

  if ((wheel !== null && wheel >= 22.5) || ['H', 'J', 'L', 'M'].includes(lr)) {
    return 'truck'
  }
  if (desc.startsWith('LT') || ['C', 'D', 'E', 'F', 'G'].includes(lr)) {
    return 'lightTruck'
  }
  return 'passenger'
}
```

- [ ] **Step 4: Run, verify pass**

```bash
npm run test -- src/hooks/useDashboardSignals.test.js --run
```

Expected: 7/7 fallbackHeuristic tests pass.

- [ ] **Step 5: Add failing test for `selectCategoryForTire`**

Append to the same test file:

```js
describe('selectCategoryForTire', () => {
  const map = { mspns: { '13712': 'truck', '76025': 'lightTruck' } }

  it('returns categoryOverride when set (regardless of map)', () => {
    expect(selectCategoryForTire({ mspn: '13712', categoryOverride: 'passenger' }, map))
      .toBe('passenger')
  })

  it('returns map value when MSPN is in the map and no override', () => {
    expect(selectCategoryForTire({ mspn: '13712', desc: '11R22.5 ...' }, map))
      .toBe('truck')
    expect(selectCategoryForTire({ mspn: '76025', desc: '24R21 ...' }, map))
      .toBe('lightTruck')
  })

  it('falls back to heuristic when MSPN is not in the map', () => {
    expect(selectCategoryForTire({ mspn: '99999', desc: '215/55R17 DEFENDER2', lr: '' }, map))
      .toBe('passenger')
    expect(selectCategoryForTire({ mspn: '99999', desc: '11R22.5 XZE2', lr: 'G' }, map))
      .toBe('truck')
  })

  it('falls back to heuristic when map is null/undefined', () => {
    expect(selectCategoryForTire({ mspn: '13712', desc: '11R22.5 X INCITY Z', lr: 'H' }, null))
      .toBe('truck')
    expect(selectCategoryForTire({ mspn: '13712', desc: '11R22.5 X INCITY Z', lr: 'H' }, undefined))
      .toBe('truck')
  })

  it('falls back to heuristic when map has no mspns field', () => {
    expect(selectCategoryForTire({ mspn: '13712', desc: '215/55R17', lr: '' }, {}))
      .toBe('passenger')
  })

  it('coerces mspn to string and trims whitespace', () => {
    expect(selectCategoryForTire({ mspn: 13712 /* number */, desc: '215/55R17', lr: '' }, map))
      .toBe('truck')
    expect(selectCategoryForTire({ mspn: ' 13712 ', desc: '215/55R17', lr: '' }, map))
      .toBe('truck')
  })

  it('handles null tire safely', () => {
    expect(selectCategoryForTire(null, map)).toBe('passenger')
  })
})
```

- [ ] **Step 6: Run, verify fail**

```bash
npm run test -- src/hooks/useDashboardSignals.test.js --run -t "selectCategoryForTire"
```

Expected: FAIL — `selectCategoryForTire is not exported`.

- [ ] **Step 7: Implement `selectCategoryForTire`**

Append to `src/hooks/useDashboardSignals.js` immediately below `fallbackHeuristic`:

```js
/**
 * Resolve the category for a tire in priority order:
 *   1. tire.categoryOverride (admin manual correction)
 *   2. categoryMap.mspns[tire.mspn] (Michelin eFleet authoritative)
 *   3. fallbackHeuristic(tire) (size+LR rule for off-program SKUs)
 *
 * @param {object | null | undefined} tire
 * @param {{ mspns?: Record<string, 'passenger' | 'lightTruck' | 'truck'> } | null | undefined} categoryMap
 * @returns {'passenger' | 'lightTruck' | 'truck'}
 */
export function selectCategoryForTire(tire, categoryMap) {
  if (tire?.categoryOverride) {
    const v = String(tire.categoryOverride)
    if (v === 'passenger' || v === 'lightTruck' || v === 'truck') return v
  }
  const mspn = String(tire?.mspn ?? '').trim()
  const mapped = categoryMap?.mspns?.[mspn]
  if (mapped === 'passenger' || mapped === 'lightTruck' || mapped === 'truck') {
    return mapped
  }
  return fallbackHeuristic(tire)
}
```

- [ ] **Step 8: Run all tests, verify pass**

```bash
npm run test -- src/hooks/useDashboardSignals.test.js --run
```

Expected: All tests pass (7 fallbackHeuristic + 7 selectCategoryForTire = 14 total).

- [ ] **Step 9: Lint**

```bash
npm run lint
```

Expected: 0 errors.

- [ ] **Step 10: Commit**

```bash
git add src/hooks/useDashboardSignals.js src/hooks/useDashboardSignals.test.js
git commit -m "feat(tires): add selectCategoryForTire selector with fallback heuristic"
```

---

## Task 2: eFleet HTML parser (pure function + tests)

Build the parser in isolation. Wire to Firestore in Task 3.

**Files:**
- Create: `scripts/import-efleet-categories.mjs` (parser only for now; CLI shell empty)
- Create: `scripts/__fixtures__/efleet-sample.html` (small fixture with 1 cat-section + 2 brand-sections, ~6 SKUs across categories)
- Test: `scripts/import-efleet-categories.test.mjs`

- [ ] **Step 1: Create the fixture HTML**

Create `scripts/__fixtures__/efleet-sample.html`:

```html
<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Sample</title></head><body>
<table><tr><td>Account:</td><td>Ship To: 1580951 SKEDADDLE INC LOVELAND</td></tr><tr><td>Report Date:</td><td>April 19, 2026</td></tr></table>
<div class="cat-section"><div class="cat-header"><div class="cat-header-text"><div class="cat-header-title">Light Truck</div></div></div>
<div class="brand-section"><div class="brand-title mich">Michelin</div>
<table class="product-table"><tr><th>MSPN</th><th>Tread/Model</th><th>Description</th><th>LR</th><th>FET</th><th>Price</th></tr>
<tr><td style="font-family:monospace;font-weight:700;color:#003399">11111</td><td style="font-weight:600;color:#444">XPS RIB</td><td>LT245/75R16 XPS RIB LRE</td><td style="text-align:center;font-weight:600">E</td><td style="text-align:right;color:#999">$0.00</td><td style="text-align:right;font-weight:700;color:#1a5c1a">$291.20</td></tr>
<tr><td style="font-family:monospace;font-weight:700;color:#003399">22222</td><td style="font-weight:600;color:#444">XPS RIB</td><td>LT235/85R16 XPS RIB LRE</td><td style="text-align:center;font-weight:600">E</td><td style="text-align:right;color:#999">$0.00</td><td style="text-align:right;font-weight:700;color:#1a5c1a">$294.40</td></tr>
</table></div></div>
<div class="cat-section"><div class="cat-header"><div class="cat-header-text"><div class="cat-header-title">Passenger</div></div></div>
<div class="brand-section"><div class="brand-title mich">Michelin</div>
<table class="product-table"><tr><th>MSPN</th><th>Tread/Model</th><th>Description</th><th>LR</th><th>FET</th><th>Price</th></tr>
<tr><td style="font-family:monospace;font-weight:700;color:#003399">33333</td><td style="font-weight:600;color:#444">DEFENDER2</td><td>215/55R17 98V XL DEFENDER2</td><td style="text-align:center;color:#ccc">—</td><td style="text-align:right;color:#999">$0.00</td><td style="text-align:right;font-weight:700;color:#1a5c1a">$235.80</td></tr>
<tr><td style="font-family:monospace;font-weight:700;color:#003399">44444</td><td style="font-weight:600;color:#444">DEFENDER2</td><td>215/60R17 96H DEFENDER2 MI</td><td style="text-align:center;color:#ccc">—</td><td style="text-align:right;color:#999">$0.00</td><td style="text-align:right;font-weight:700;color:#1a5c1a">$245.60</td></tr>
</table></div></div>
<div class="cat-section"><div class="cat-header"><div class="cat-header-text"><div class="cat-header-title">Truck</div></div></div>
<div class="brand-section"><div class="brand-title mich">Michelin</div>
<table class="product-table"><tr><th>MSPN</th><th>Tread/Model</th><th>Description</th><th>LR</th><th>FET</th><th>Price</th></tr>
<tr><td style="font-family:monospace;font-weight:700;color:#003399">55555</td><td style="font-weight:600;color:#444">XZE2</td><td>11R22.5 XZE2 LRG</td><td style="text-align:center;font-weight:600">G</td><td style="text-align:right;color:#666">$25.23</td><td style="text-align:right;font-weight:700;color:#1a5c1a">$613.60</td></tr>
<tr><td style="font-family:monospace;font-weight:700;color:#003399">66666</td><td style="font-weight:600;color:#444">XZE2</td><td>11R24.5 XZE2 LRH</td><td style="text-align:center;font-weight:600">H</td><td style="text-align:right;color:#666">$32.51</td><td style="text-align:right;font-weight:700;color:#1a5c1a">$640.80</td></tr>
</table></div></div>
</body></html>
```

- [ ] **Step 2: Write failing tests**

Create `scripts/import-efleet-categories.test.mjs`:

```js
/** @vitest-environment node */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseEfleetCatalog } from './import-efleet-categories.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const fixture = readFileSync(resolve(here, '__fixtures__/efleet-sample.html'), 'utf8')

describe('parseEfleetCatalog', () => {
  it('extracts MSPNs grouped by category from a well-formed report', () => {
    const result = parseEfleetCatalog(fixture)
    expect(result.mspns).toEqual({
      '11111': 'lightTruck',
      '22222': 'lightTruck',
      '33333': 'passenger',
      '44444': 'passenger',
      '55555': 'truck',
      '66666': 'truck',
    })
  })

  it('captures cover-page metadata', () => {
    const result = parseEfleetCatalog(fixture)
    expect(result.account).toBe('1580951 SKEDADDLE INC LOVELAND')
    expect(result.sourceReportDate).toBe('2026-04-19')
    expect(result.totalParsed).toBe(6)
  })

  it('rejects empty or malformed input', () => {
    expect(() => parseEfleetCatalog('')).toThrow(/empty|malformed/i)
    expect(() => parseEfleetCatalog('<html></html>')).toThrow(/no.*product.*tables|no.*cat-section/i)
  })

  it('handles unknown category titles by ignoring them', () => {
    const odd = fixture.replace('Light Truck', 'Mystery Bucket')
    const result = parseEfleetCatalog(odd)
    // The Mystery Bucket section is dropped; only 4 of 6 SKUs remain.
    expect(Object.keys(result.mspns).length).toBe(4)
    expect(result.mspns['11111']).toBeUndefined()
    expect(result.mspns['33333']).toBe('passenger')
  })
})
```

- [ ] **Step 3: Run, verify fail**

```bash
npm run test -- scripts/import-efleet-categories.test.mjs --run
```

Expected: FAIL — module does not exist.

- [ ] **Step 4: Create the parser stub**

Create `scripts/import-efleet-categories.mjs`:

```js
/**
 * Parse a Michelin eFleet HTML report into a map of MSPN → category.
 * Pure function — no Firestore writes here. Wiring lives in the CLI
 * entry point at the bottom of this file.
 *
 * Run: npm run import:efleet -- path/to/efleet.html
 */

/**
 * @param {string} html
 * @returns {{
 *   mspns: Record<string, 'passenger' | 'lightTruck' | 'truck'>,
 *   account: string | null,
 *   sourceReportDate: string | null,
 *   totalParsed: number,
 * }}
 */
export function parseEfleetCatalog(html) {
  if (!html || typeof html !== 'string' || html.trim() === '') {
    throw new Error('parseEfleetCatalog: empty input')
  }
  const tables = html.match(/<table class=\"product-table\">[\s\S]*?<\/table>/g) || []
  const catBlocks = html.split(/class=\"cat-section\"/)
  if (tables.length === 0 || catBlocks.length < 2) {
    throw new Error('parseEfleetCatalog: malformed input — no product-table or no cat-section blocks found')
  }

  const mspns = {}

  for (let i = 1; i < catBlocks.length; i++) {
    const block = catBlocks[i]
    const titleM = block.match(/class=\"cat-header-title\">([^<]+)/)
    const title = titleM ? titleM[1].trim() : ''
    let cat = null
    if (/light truck/i.test(title)) cat = 'lightTruck'
    else if (/passenger/i.test(title)) cat = 'passenger'
    else if (/^truck\b/i.test(title)) cat = 'truck'
    if (!cat) continue // unknown category title — skip

    const mspnRe = /<td style=\"font-family:monospace[^>]*>([0-9]{4,7})<\/td>/g
    let m
    while ((m = mspnRe.exec(block)) !== null) {
      mspns[m[1]] = cat
    }
  }

  // Cover page metadata
  const acctM = html.match(/Ship To: ([^<]+)/)
  const account = acctM ? acctM[1].trim() : null

  const dateM = html.match(/Report Date:<\/td><td>([^<]+)/)
  let sourceReportDate = null
  if (dateM) {
    // "April 19, 2026" → "2026-04-19"
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December']
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
    account,
    sourceReportDate,
    totalParsed: Object.keys(mspns).length,
  }
}

// CLI entry — implemented in Task 3.
// (export { } stays empty for now; importers only need parseEfleetCatalog.)
```

- [ ] **Step 5: Run, verify pass**

```bash
npm run test -- scripts/import-efleet-categories.test.mjs --run
```

Expected: 4/4 tests pass.

- [ ] **Step 6: Verify against the real eFleet file**

```bash
node -e "
import('./scripts/import-efleet-categories.mjs').then(({ parseEfleetCatalog }) => {
  const html = require('node:fs').readFileSync('Michelin_catalog.html', 'utf8')
  const r = parseEfleetCatalog(html)
  console.log('Total parsed:', r.totalParsed)
  console.log('Account:', r.account)
  console.log('Source date:', r.sourceReportDate)
  const cats = {}
  for (const v of Object.values(r.mspns)) cats[v] = (cats[v]||0)+1
  console.log('By category:', cats)
})
"
```

Expected output:
```
Total parsed: ~1285 (close to that — exact number depends on duplicate handling)
Account: 1580951 SKEDADDLE INC LOVELAND
Source date: 2026-04-19
By category: { lightTruck: 567, passenger: 627, truck: 191 }
```

(Note: `Michelin_catalog.html` exists in the worktree root from the earlier comparison work; it is `.gitignore`d and won't be committed.)

- [ ] **Step 7: Lint**

```bash
npm run lint
```

Expected: 0 errors.

- [ ] **Step 8: Commit**

```bash
git add scripts/import-efleet-categories.mjs scripts/import-efleet-categories.test.mjs scripts/__fixtures__/efleet-sample.html
git commit -m "feat(tires): parse Michelin eFleet HTML into MSPN→category map"
```

---

## Task 3: Import script Firestore writer + CLI

Wire the parser into a runnable Node CLI that authenticates to Firestore, applies a staged write, and atomic-moves to `meta/categoryMap`. Mirror `scripts/migrate-tire-fet-tag.mjs` patterns.

**Files:**
- Modify: `scripts/import-efleet-categories.mjs` (add CLI shell, Firestore writer; the parser stays unchanged)
- Modify: `package.json` (add `import:efleet` npm script)

- [ ] **Step 1: Add npm script**

Open `package.json`. Find the `"scripts"` block. Add:

```json
"import:efleet": "node scripts/import-efleet-categories.mjs"
```

(Insert alphabetically between existing `import:` or `migrate:` entries if they exist; otherwise after `import-tires-csv` if it has a script entry, or at the end of the scripts block.)

- [ ] **Step 2: Append CLI to the script**

Open `scripts/import-efleet-categories.mjs`. After the existing `parseEfleetCatalog` export, append:

```js
import { existsSync, readFileSync } from 'node:fs'
import readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'

function parseArgs(argv) {
  const out = { dryRun: false, yes: false, htmlPath: null }
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--dry-run' || a === '-n') out.dryRun = true
    else if (a === '--yes') out.yes = true
    else if (!a.startsWith('-')) out.htmlPath = a
  }
  return out
}

function requireCredentials() {
  const raw = process.env.GOOGLE_APPLICATION_CREDENTIALS
  if (!raw || !String(raw).trim()) {
    console.error('Missing GOOGLE_APPLICATION_CREDENTIALS. Set it to the path of your service account JSON key file.')
    console.error('Generate a key: Firebase Console -> Settings -> Service accounts -> Generate new private key.')
    process.exit(1)
  }
  if (!existsSync(raw)) {
    console.error(`Service account file not found: ${raw}`)
    process.exit(1)
  }
  return JSON.parse(readFileSync(raw, 'utf8'))
}

function diffMaps(prev, next) {
  const added = []
  const removed = []
  const changed = []
  const prevKeys = prev ? Object.keys(prev) : []
  const nextKeys = Object.keys(next)
  const prevSet = new Set(prevKeys)
  const nextSet = new Set(nextKeys)
  for (const k of nextKeys) if (!prevSet.has(k)) added.push(k)
  for (const k of prevKeys) if (!nextSet.has(k)) removed.push(k)
  for (const k of nextKeys) if (prevSet.has(k) && prev[k] !== next[k]) changed.push({ mspn: k, from: prev[k], to: next[k] })
  return { added, removed, changed }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!args.htmlPath) {
    console.error('Usage: npm run import:efleet -- path/to/efleet.html [--dry-run] [--yes]')
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

  if (args.dryRun) {
    console.log('\n--dry-run: skipping Firestore write.')
    process.exit(0)
  }

  const sa = requireCredentials()
  if (!getApps().length) initializeApp({ credential: cert(sa) })
  const db = getFirestore()

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

  // Diff
  const diff = diffMaps(prior?.mspns, parsed.mspns)
  console.log('\nDiff vs prior import:')
  console.log(`  + ${diff.added.length} new MSPNs categorized`)
  console.log(`  - ${diff.removed.length} MSPNs removed`)
  console.log(`  ~ ${diff.changed.length} MSPNs changed category`)
  if (diff.changed.length > 0 && diff.changed.length <= 20) {
    diff.changed.forEach((c) => console.log(`    ${c.mspn}: ${c.from} → ${c.to}`))
  }

  if (!args.yes) {
    const rl = readline.createInterface({ input, output })
    const answer = await rl.question('\nContinue? [y/N] ')
    rl.close()
    if (answer.trim().toLowerCase() !== 'y') {
      console.log('Aborted.')
      process.exit(0)
    }
  }

  // Stage first, then atomic move (Firestore docs are atomic per-doc;
  // writing staging then ref preserves prior on staging-write failure).
  await stagingRef.set(payload)
  await ref.set(payload)
  console.log(`\n✓ Wrote meta/categoryMap (${parsed.totalParsed} entries)`)
  console.log('Done.')
}

// Only run main when invoked directly via the CLI, not when imported by tests.
if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` ||
    fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
```

- [ ] **Step 3: Verify parser tests still pass (no regression)**

```bash
npm run test -- scripts/import-efleet-categories.test.mjs --run
```

Expected: 4/4 still pass. The CLI imports must not break the pure-function exports.

- [ ] **Step 4: Verify the CLI rejects missing args**

```bash
node scripts/import-efleet-categories.mjs
```

Expected stderr: `Usage: npm run import:efleet -- path/to/efleet.html [--dry-run] [--yes]`. Exit code 1.

- [ ] **Step 5: Verify the CLI dry-runs against the fixture**

```bash
node scripts/import-efleet-categories.mjs scripts/__fixtures__/efleet-sample.html --dry-run
```

Expected output mentions `Total parsed: 6`, splits `lightTruck: 2 / passenger: 2 / truck: 2`, then `--dry-run: skipping Firestore write.` Exit code 0.

- [ ] **Step 6: Lint**

```bash
npm run lint
```

Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add scripts/import-efleet-categories.mjs package.json
git commit -m "feat(tires): wire eFleet parser into Firestore import CLI"
```

---

## Task 4: Hook loads `meta/categoryMap`

Modify `useDashboardSignals` to fetch the doc on mount alongside the existing `meta/revenueStats` load.

**Files:**
- Modify: `src/hooks/useDashboardSignals.js`

- [ ] **Step 1: Find the existing `meta/revenueStats` load**

Open `src/hooks/useDashboardSignals.js`. Locate the line `const revenueSnap = await getDoc(doc(db, 'meta', 'revenueStats'))` (around line 535 — it's inside a `useEffect` that hydrates dashboard signal counters).

- [ ] **Step 2: Add a `categoryMap` state above the effect**

Find the existing state declarations near the top of the `useDashboardSignals` function body (search for `const [revenueStatsDoc, setRevenueStatsDoc] = useState(null)` or similar). Add immediately after:

```jsx
const [categoryMap, setCategoryMap] = useState(null)
```

- [ ] **Step 3: Load `meta/categoryMap` inside the same effect**

Inside the same effect that loads `meta/revenueStats` (the one whose try block ends with `setRevenueStatsDoc(revenueDocData)` around line 543), append a parallel block immediately after:

```jsx
let categoryMapDocData = null
try {
  const catMapSnap = await getDoc(doc(db, 'meta', 'categoryMap'))
  if (catMapSnap.exists()) {
    categoryMapDocData = catMapSnap.data() || null
  }
} catch (e) {
  console.error('dashboard categoryMap read', e)
}
if (!cancelled) setCategoryMap(categoryMapDocData)
```

- [ ] **Step 4: Expose `categoryMap` from the hook return**

Find the hook's `return {` block (the one that exposes `topSellers`, `hiddenGems`, etc — around line 645). Add `categoryMap,` to the returned object.

- [ ] **Step 5: Verify the existing test suite still passes**

```bash
npm run test -- src/hooks/useDashboardSignals.test.js --run
```

Expected: 14/14 (all selector tests still green). The hook itself isn't unit-tested (it's network-bound) — its smoke comes from existing dashboard integration via `npm run test`.

```bash
npm run test -- --run 2>&1 | tail -5
```

Expected: total tests increase by 14 vs main; 0 failures.

- [ ] **Step 6: Lint**

```bash
npm run lint
```

Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useDashboardSignals.js
git commit -m "feat(tires): load meta/categoryMap in useDashboardSignals"
```

---

## Task 5: `<CategoryTabs>` component + tests

Small presentational component. Mirrors the `<SelectAllToggle>` extraction pattern from the prior branch.

**Files:**
- Create: `src/components/tires/CategoryTabs.jsx`
- Create: `src/components/tires/CategoryTabs.test.jsx`

- [ ] **Step 1: Write failing tests**

Create `src/components/tires/CategoryTabs.test.jsx`:

```jsx
/** @vitest-environment jsdom */
globalThis.IS_REACT_ACT_ENVIRONMENT = true

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { CategoryTabs } from './CategoryTabs.jsx'

afterEach(() => cleanup())

const baseCounts = { all: 1160, passenger: 490, lightTruck: 502, truck: 168 }

describe('CategoryTabs', () => {
  it('renders all four tabs with their labels and counts', () => {
    render(<CategoryTabs selected="all" counts={baseCounts} onSelect={() => {}} />)
    expect(screen.getByRole('tab', { name: /All 1160/i })).toBeTruthy()
    expect(screen.getByRole('tab', { name: /Passenger 490/i })).toBeTruthy()
    expect(screen.getByRole('tab', { name: /Light Truck 502/i })).toBeTruthy()
    expect(screen.getByRole('tab', { name: /Truck 168/i })).toBeTruthy()
  })

  it('marks the selected tab with aria-selected="true"', () => {
    render(<CategoryTabs selected="passenger" counts={baseCounts} onSelect={() => {}} />)
    expect(screen.getByRole('tab', { name: /Passenger 490/i }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('tab', { name: /All 1160/i }).getAttribute('aria-selected')).toBe('false')
  })

  it('emits onSelect with the right value when a tab is clicked', () => {
    const onSelect = vi.fn()
    render(<CategoryTabs selected="all" counts={baseCounts} onSelect={onSelect} />)
    fireEvent.click(screen.getByRole('tab', { name: /Light Truck 502/i }))
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith('lightTruck')
  })

  it('renders gracefully when counts are zero or missing', () => {
    render(<CategoryTabs selected="all" counts={{ all: 0, passenger: 0, lightTruck: 0, truck: 0 }} onSelect={() => {}} />)
    expect(screen.getByRole('tab', { name: /All 0/i })).toBeTruthy()
    expect(screen.getByRole('tab', { name: /Truck 0/i })).toBeTruthy()
  })

  it('each tab is at least 44 pixels tall (WCAG 2.5.5 AAA)', () => {
    render(<CategoryTabs selected="all" counts={baseCounts} onSelect={() => {}} />)
    const tabs = screen.getAllByRole('tab')
    tabs.forEach((t) => {
      // h-11 sm:h-auto resolves to min-h-[44px] on mobile.
      expect(t.className).toMatch(/min-h-\[44px\]/)
    })
  })
})
```

- [ ] **Step 2: Run, verify fail**

```bash
npm run test -- src/components/tires/CategoryTabs.test.jsx --run
```

Expected: FAIL — `CategoryTabs` does not exist.

- [ ] **Step 3: Implement the component**

Create `src/components/tires/CategoryTabs.jsx`:

```jsx
/**
 * Sub-navigation tabs for the Tires catalog. Sits above the existing
 * Filters/Select/Sort toolbar row. Categories are derived elsewhere
 * (see `selectCategoryForTire` in useDashboardSignals); this component
 * is purely presentational.
 *
 * Active-tab styling matches the existing Catalog/Orders top-level
 * tab treatment (amber underline). Each tab is 44x44 minimum on
 * mobile per WCAG 2.5.5 AAA.
 *
 * @typedef {'all' | 'passenger' | 'lightTruck' | 'truck'} CategoryKey
 */

const TABS = [
  { key: 'all',         label: 'All' },
  { key: 'passenger',   label: 'Passenger' },
  { key: 'lightTruck',  label: 'Light Truck' },
  { key: 'truck',       label: 'Truck' },
]

/**
 * @param {object} props
 * @param {CategoryKey} props.selected
 * @param {Record<CategoryKey, number>} props.counts
 * @param {(cat: CategoryKey) => void} props.onSelect
 */
export function CategoryTabs({ selected, counts, onSelect }) {
  return (
    <div
      role="tablist"
      aria-label="Tire category"
      className="flex gap-1 overflow-x-auto border-b border-zinc-800/80 px-1"
    >
      {TABS.map((tab) => {
        const active = selected === tab.key
        const count = counts?.[tab.key] ?? 0
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(tab.key)}
            className={`min-h-[44px] whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors sm:min-h-0 ${
              active
                ? 'border-amber-400 text-amber-100'
                : 'border-transparent text-zinc-400 hover:border-zinc-600 hover:text-zinc-200'
            }`}
          >
            {tab.label} {count}
          </button>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 4: Run, verify pass**

```bash
npm run test -- src/components/tires/CategoryTabs.test.jsx --run
```

Expected: 5/5 pass.

- [ ] **Step 5: Lint**

```bash
npm run lint
```

Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/tires/CategoryTabs.jsx src/components/tires/CategoryTabs.test.jsx
git commit -m "feat(tires): add CategoryTabs presentational sub-nav"
```

---

## Task 6: Wire it all into `TiresDashboard`

The integration task. Adds `selectedCategory` state, URL sync, the `categorizedRows` memo, and renders `<CategoryTabs>` above the existing toolbar. Filters reset on tab switch; search/sort/selection persist.

**Files:**
- Modify: `src/components/tires/TiresDashboard.jsx`

- [ ] **Step 1: Add imports**

Open `src/components/tires/TiresDashboard.jsx`. Near the existing imports (top of file), add:

```jsx
import { CategoryTabs } from './CategoryTabs.jsx'
import { selectCategoryForTire } from '../../hooks/useDashboardSignals'
```

(There may already be an import from `useDashboardSignals` — if so, add `selectCategoryForTire` to its destructured imports rather than introducing a duplicate.)

- [ ] **Step 2: Pull `categoryMap` from the hook**

Find the existing `useDashboardSignals()` hook call. Add `categoryMap` to its destructured return:

```jsx
const { /* existing */ categoryMap } = useDashboardSignals()
```

- [ ] **Step 3: Add `selectedCategory` state synced to URL**

After the existing `useState` declarations near the top of the component body (around the `filtersOpen` state), add:

```jsx
const [selectedCategory, setSelectedCategoryState] = useState(() => {
  if (typeof window === 'undefined') return 'all'
  const fromUrl = new URLSearchParams(window.location.search).get('cat')
  return ['passenger', 'lightTruck', 'truck'].includes(fromUrl) ? fromUrl : 'all'
})

const setSelectedCategory = useCallback(
  (cat) => {
    setSelectedCategoryState(cat)
    // Reset filters on tab switch (within-category filter scope).
    setBrand('')
    setUseTagFilters([])
    setLrFilters([])
    setMinMargin(0)
    setNeedsReposting(false)
    // Sync URL (replace, not push, so back/forward feels natural).
    const params = new URLSearchParams(window.location.search)
    if (cat === 'all') params.delete('cat')
    else params.set('cat', cat)
    const next = params.toString()
    const url = window.location.pathname + (next ? `?${next}` : '')
    window.history.replaceState(null, '', url)
  },
  [setBrand, setUseTagFilters, setLrFilters, setMinMargin, setNeedsReposting],
)
```

(If any of those filter setter names differ, use whatever the local state names are. If a setter doesn't exist for a given filter, omit it — the goal is to clear the filters that exist.)

- [ ] **Step 4: Add the `categorizedRows` memo**

Find the existing `enriched` or filtered-rows memo (the source for `sortedRows`). Add immediately above it (before any other filtering happens):

```jsx
const categorizedRows = useMemo(() => {
  const buckets = { all: [], passenger: [], lightTruck: [], truck: [] }
  if (loading || !Array.isArray(enriched)) return buckets
  for (const t of enriched) {
    const cat = selectCategoryForTire(t, categoryMap)
    buckets.all.push(t)
    buckets[cat].push(t)
  }
  return buckets
}, [enriched, loading, categoryMap])
```

(If the upstream array is named something other than `enriched`, use that. The point is to bucket the same input array the existing filter pipeline already consumes.)

- [ ] **Step 5: Feed the selected bucket into the existing filter pipeline**

Locate the line where the filter+sort pipeline currently consumes `enriched` (something like `const filtered = enriched.filter(...)`). Replace its source with `categorizedRows[selectedCategory]`:

```jsx
const filtered = categorizedRows[selectedCategory].filter(/* existing filter chain unchanged */)
```

- [ ] **Step 6: Render `<CategoryTabs>` above the toolbar**

Find the JSX where the catalog toolbar starts (look for the sticky toolbar div with `sticky top-[92px]` or for `<MarginFilters>` — `<CategoryTabs>` goes immediately ABOVE that). Insert:

```jsx
<CategoryTabs
  selected={selectedCategory}
  counts={{
    all:        categorizedRows.all.length,
    passenger:  categorizedRows.passenger.length,
    lightTruck: categorizedRows.lightTruck.length,
    truck:      categorizedRows.truck.length,
  }}
  onSelect={setSelectedCategory}
/>
```

- [ ] **Step 7: Run lint and full test suite**

```bash
npm run lint
npm run test -- --run 2>&1 | tail -8
```

Expected: 0 lint errors. All tests pass (the count includes Tasks 1–5 additions).

- [ ] **Step 8: Run the production build**

```bash
npm run build
```

Expected: build succeeds; no Tailwind purge regressions.

- [ ] **Step 9: Commit**

```bash
git add src/components/tires/TiresDashboard.jsx
git commit -m "feat(tires): wire CategoryTabs into TiresDashboard with URL sync"
```

---

## Task 7: Empty-state banner + freshness badge

Surface two states defined in the spec:
1. `meta/categoryMap` doc missing → banner "Categorization data unavailable; using fallback heuristic for all SKUs."
2. `importedAt` is older than 30 days → amber freshness chip in the catalog header.

**Files:**
- Modify: `src/components/tires/TiresDashboard.jsx`

- [ ] **Step 1: Add a helper for staleness**

Near the top of the file (or alongside the other utility functions), add:

```jsx
function categoryMapAgeStatus(map) {
  if (!map) return 'missing'
  const ts = map.importedAt
  // Firestore Timestamp has toMillis(); JS Date has getTime(); accept either.
  let importedMs = null
  if (ts && typeof ts.toMillis === 'function') importedMs = ts.toMillis()
  else if (ts instanceof Date) importedMs = ts.getTime()
  else if (typeof ts === 'string') importedMs = Date.parse(ts)
  if (!importedMs) return 'unknown'
  const ageDays = (Date.now() - importedMs) / (1000 * 60 * 60 * 24)
  return ageDays > 30 ? 'stale' : 'fresh'
}
```

- [ ] **Step 2: Render the banner / chip in the catalog area**

Locate the JSX where `<CategoryTabs>` was added. Immediately above it, insert:

```jsx
{(() => {
  const status = categoryMapAgeStatus(categoryMap)
  if (status === 'missing') {
    return (
      <div className="mb-2 rounded-lg border border-zinc-700 bg-zinc-900/60 px-3 py-2 text-xs text-zinc-300">
        Categorization data unavailable. Using fallback heuristic for all SKUs.{' '}
        <span className="text-zinc-500">
          Run <code className="font-mono text-zinc-300">npm run import:efleet</code> to populate.
        </span>
      </div>
    )
  }
  if (status === 'stale') {
    const importedMs = categoryMap?.importedAt?.toMillis?.() ?? Date.parse(categoryMap?.importedAt)
    const ageDays = Math.floor((Date.now() - importedMs) / (1000 * 60 * 60 * 24))
    return (
      <div className="mb-2 rounded-lg border border-amber-700/60 bg-amber-950/30 px-3 py-2 text-xs text-amber-200">
        Categorization data is {ageDays} days old. Refresh recommended.
      </div>
    )
  }
  return null
})()}
```

- [ ] **Step 3: Run lint and tests**

```bash
npm run lint
npm run test -- --run 2>&1 | tail -5
```

Expected: 0 lint errors; all tests pass.

- [ ] **Step 4: Build**

```bash
npm run build
```

Expected: green.

- [ ] **Step 5: Commit**

```bash
git add src/components/tires/TiresDashboard.jsx
git commit -m "feat(tires): banner + freshness chip when meta/categoryMap is missing or stale"
```

---

## Task 8: Final verification

- [ ] **Step 1: Run lint**

```bash
npm run lint
```

Expected: 0 errors.

- [ ] **Step 2: Run tests**

```bash
npm run test -- --run
```

Expected: all green; total count increased by ~14 (selectors) + 4 (parser) + 5 (CategoryTabs) = ~23 vs main.

- [ ] **Step 3: Run production build**

```bash
npm run build
```

Expected: green.

- [ ] **Step 4: Push branch**

```bash
git push -u origin tires-category-tabs
```

- [ ] **Step 5: Smoke test on Vercel preview**

When Vercel finishes building the preview from the PR:
- Land on `/tires` → CategoryTabs renders with counts
- Click each tab → counts stay correct, table contents change
- Set Brand=Michelin → switch tabs → filter clears
- Search "defender" → switch tabs → search persists
- Sort by Margin → switch tabs → sort persists
- Select 3 tires → switch tabs → selection persists, count badge unchanged
- URL `/tires?cat=truck` lands directly on Truck tab
- Browser back/forward navigates between tabs
- On mobile (<640px) tabs are tappable and scroll horizontally if overflowing

- [ ] **Step 6: Run import script against the real eFleet HTML to populate `meta/categoryMap`**

Production prerequisite — once the branch is merged but before users see the categorized view in production:

```bash
# Set GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa-key.json
npm run import:efleet -- "C:/Users/Alex/Desktop/skedaddle-portal/.claude/worktrees/tires-category-tabs/Michelin_catalog.html" --dry-run
# Verify the diff looks right, then:
npm run import:efleet -- "C:/Users/Alex/Desktop/skedaddle-portal/.claude/worktrees/tires-category-tabs/Michelin_catalog.html" --yes
```

After the import the banner should disappear and the splits in production should match the expected `Passenger: 490 / Light Truck: 502 / Truck: 168`.

---

## Verification summary

After all tasks are complete:
- Lint: 0 errors (warnings unchanged from main baseline)
- Tests: all green; ~23 new tests added across selectors, parser, CategoryTabs
- Build: green at production-quality bundle sizes (no Tailwind purge regressions)
- Manual: all checklist items in Task 8 Step 5 pass on Vercel preview
- Production: import script run against latest eFleet HTML; `meta/categoryMap` populated; banner gone

Once those are green, follow `superpowers:finishing-a-development-branch` to merge or open a PR.
