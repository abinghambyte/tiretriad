# eFleet admin tools — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** New `/admin/efleet` route with three tabs (Account, FET audit, Diff) backed by an extended `meta/categoryMap.records` field. Surfaces eFleet import results so data-quality issues are visible before they bite.

**Architecture:** Importer writes a `records: { mspn → { fet, price, brand, description, lr, tread } }` field to `meta/categoryMap`. New `useEFleetDiff` selector buckets each MSPN into `mismatched`, `invOnly`, `eFleetOnly`, or `aligned`. Three tab components consume the selector. All read-only.

**Tech Stack:** React 19, Tailwind v4, Vitest + `@testing-library/react`, Firestore Web SDK on client, Firebase Admin SDK in importer script.

**Spec:** `docs/superpowers/specs/2026-05-01-efleet-admin-tools-design.md`

**Worktree:** `.claude/worktrees/efleet-admin-tools` (branch `efleet-admin-tools`)

---

## File map

| File | Change | Responsibility |
|---|---|---|
| `scripts/import-efleet.mjs` | Modify | Build + write the `records` map alongside the existing `mspns` write |
| `scripts/import-efleet.test.mjs` | Modify | Cover the new `records` shape |
| `src/hooks/useEFleetDiff.js` | Create | Bucket selector |
| `src/hooks/useEFleetDiff.test.js` | Create | Selector tests |
| `src/components/admin/efleet/AccountCard.jsx` | Create | Tab 1: metadata |
| `src/components/admin/efleet/AccountCard.test.jsx` | Create | Component test |
| `src/components/admin/efleet/FetAuditTable.jsx` | Create | Tab 2: FET-focused mismatches |
| `src/components/admin/efleet/FetAuditTable.test.jsx` | Create | Component test |
| `src/components/admin/efleet/DiffStateTabs.jsx` | Create | Sub-tab strip with colored headers |
| `src/components/admin/efleet/DiffStateTabs.test.jsx` | Create | Component test |
| `src/components/admin/efleet/EFleetDiffView.jsx` | Create | Tab 3 wrapper + per-state tables |
| `src/components/admin/efleet/EFleetDiffView.test.jsx` | Create | Component test |
| `src/pages/AdminEFleetPage.jsx` | Create | Route component |
| `src/App.jsx` | Modify | Register the new route |
| `src/pages/AdminPage.jsx` | Modify | Add "eFleet tools →" entry card |
| `ROADMAP.md` | Modify (after merge) | Move 3 entries to Resolved |

---

## Task 1: Importer writes `records` field

**Files:**
- Modify: `scripts/import-efleet.mjs`
- Modify: `scripts/import-efleet.test.mjs`

- [ ] **Step 1: Write the failing test**

Append to `scripts/import-efleet.test.mjs` inside the `describe('parseEfleetCatalog', ...)` block (or wherever the parser tests live):

```js
  it('tireRecords carry every field the categoryMap.records map needs', () => {
    const html = readFileSync(SAMPLE_HTML, 'utf8')
    const out = parseEfleetCatalog(html)
    expect(out.tireRecords.length).toBeGreaterThan(0)
    for (const r of out.tireRecords) {
      // Required fields for meta/categoryMap.records:
      expect(typeof r.mspn).toBe('string')
      expect(r.mspn.length).toBeGreaterThan(0)
      expect(typeof r.fet).toBe('number')
      expect(typeof r.price).toBe('number')
      expect(typeof r.brand).toBe('string')
      expect(typeof r.description).toBe('string')
      expect(typeof r.lr).toBe('string')
      expect(typeof r.tread).toBe('string')
    }
  })
```

(`SAMPLE_HTML` is the existing fixture; reuse whatever path the file already uses.)

- [ ] **Step 2: Run tests**

`cd .claude/worktrees/efleet-admin-tools && npx vitest run scripts/import-efleet.test.mjs`

Expected: tireRecord shape test passes today (parser already produces these fields). If it fails, parser output is missing a field — diagnose before continuing.

- [ ] **Step 3: Add the `records` map to the categoryMap payload**

In `scripts/import-efleet.mjs`, find the payload assembly around line 531:

```js
  const payload = {
    version: 1,
    importedAt: FieldValue.serverTimestamp(),
    sourceFile: args.htmlPath,
    sourceReportDate: parsed.sourceReportDate,
    account: parsed.account,
    totalParsed: parsed.totalParsed,
    mspns: parsed.mspns,
  }
```

Replace with:

```js
  // Build records map for the /admin/efleet diff view. Each entry is the
  // eFleet truth for that MSPN: fet, price, brand, description, lr, tread.
  // Brand-conflict MSPNs are included verbatim; the planner refuses to
  // overwrite the tire doc, but the diff view needs to see what eFleet says.
  const records = {}
  for (const r of parsed.tireRecords) {
    records[r.mspn] = {
      fet: r.fet,
      price: r.price,
      brand: r.brand,
      description: r.description,
      lr: r.lr,
      tread: r.tread,
    }
  }

  // Records-payload safety net: warn if approaching the 1MB Firestore doc
  // ceiling. ~5KB of overhead + ~200B per record means ~5,000 records is the
  // soft limit. Today's catalog is ~1,628 records (~325 KB).
  const recordsBytes = JSON.stringify(records).length
  if (recordsBytes > 800_000) {
    console.warn(
      `WARNING: meta/categoryMap.records payload is ${recordsBytes} bytes ` +
      `(approaching Firestore's 1MB doc limit). Consider switching storage.`,
    )
  }

  const payload = {
    version: 2,
    importedAt: FieldValue.serverTimestamp(),
    sourceFile: args.htmlPath,
    sourceReportDate: parsed.sourceReportDate,
    account: parsed.account,
    totalParsed: parsed.totalParsed,
    mspns: parsed.mspns,
    records,
  }
```

(Note `version` bumped 1 → 2; consumers can use this to detect old docs without `records`.)

- [ ] **Step 4: Add a unit test for the payload shape**

In `scripts/import-efleet.test.mjs`, add a new test (anywhere alongside other planner tests):

```js
  it('builds a records map keyed by MSPN with eFleet-sourced fields', () => {
    // Mirror the inline build inside import-efleet.mjs — if both use
    // tireRecords, this test serves as a contract pin.
    const html = readFileSync(SAMPLE_HTML, 'utf8')
    const out = parseEfleetCatalog(html)
    const records = {}
    for (const r of out.tireRecords) {
      records[r.mspn] = {
        fet: r.fet,
        price: r.price,
        brand: r.brand,
        description: r.description,
        lr: r.lr,
        tread: r.tread,
      }
    }
    const sample = records[Object.keys(records)[0]]
    expect(sample).toEqual(expect.objectContaining({
      fet: expect.any(Number),
      price: expect.any(Number),
      brand: expect.any(String),
      description: expect.any(String),
      lr: expect.any(String),
      tread: expect.any(String),
    }))
  })
```

- [ ] **Step 5: Run vitest**

`cd .claude/worktrees/efleet-admin-tools && npx vitest run scripts/`

Expected: all green.

- [ ] **Step 6: Commit**

```bash
cd .claude/worktrees/efleet-admin-tools
git add scripts/import-efleet.mjs scripts/import-efleet.test.mjs
git commit -m "feat(import-efleet): write records map to meta/categoryMap

Adds a per-MSPN records map ({ fet, price, brand, description, lr,
tread }) alongside the existing mspns category mapping. The
/admin/efleet diff view consumes this to surface mismatches between
the live tires/* docs and the latest eFleet export.

Includes a soft-warning when the payload approaches Firestore's 1MB
doc limit (current catalog: ~325KB). Bumps version to 2 so consumers
can detect old docs without records."
```

---

## Task 2: `useEFleetDiff` selector

**Files:**
- Create: `src/hooks/useEFleetDiff.js`
- Create: `src/hooks/useEFleetDiff.test.js`

- [ ] **Step 1: Write the failing tests**

Create `src/hooks/useEFleetDiff.test.js`:

```jsx
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useEFleetDiff } from './useEFleetDiff.js'

const mkTire = (overrides) => ({
  id: '12345',
  mspn: '12345',
  brand: 'MICHELIN',
  description: 'P255/55R18 109V PILOT SPORT',
  fet: 0,
  price: 100,
  lr: '',
  tread: 'PILOT SPORT',
  ...overrides,
})

const mkRecord = (overrides) => ({
  fet: 0,
  price: 100,
  brand: 'MICHELIN',
  description: 'P255/55R18 109V PILOT SPORT',
  lr: '',
  tread: 'PILOT SPORT',
  ...overrides,
})

describe('useEFleetDiff', () => {
  it('returns empty buckets for empty inputs', () => {
    const { result } = renderHook(() => useEFleetDiff([], {}))
    expect(result.current.mismatched).toEqual([])
    expect(result.current.invOnly).toEqual([])
    expect(result.current.eFleetOnly).toEqual([])
    expect(result.current.aligned).toEqual([])
    expect(result.current.counts.total).toBe(0)
  })

  it('aligns tires that exactly match the eFleet record', () => {
    const tires = [mkTire({ id: '1', mspn: '1' })]
    const records = { '1': mkRecord() }
    const { result } = renderHook(() => useEFleetDiff(tires, records))
    expect(result.current.aligned).toHaveLength(1)
    expect(result.current.mismatched).toEqual([])
  })

  it('flags price mismatch as mismatched with a price delta', () => {
    const tires = [mkTire({ id: '1', mspn: '1', price: 100 })]
    const records = { '1': mkRecord({ price: 150 }) }
    const { result } = renderHook(() => useEFleetDiff(tires, records))
    expect(result.current.mismatched).toHaveLength(1)
    const entry = result.current.mismatched[0]
    expect(entry.mspn).toBe('1')
    expect(entry.deltas).toContainEqual({ field: 'price', before: 100, after: 150 })
  })

  it('flags fet mismatch and lists multi-field deltas', () => {
    const tires = [mkTire({ id: '1', mspn: '1', fet: 3, price: 100 })]
    const records = { '1': mkRecord({ fet: 0, price: 95 }) }
    const { result } = renderHook(() => useEFleetDiff(tires, records))
    const entry = result.current.mismatched[0]
    const fields = entry.deltas.map((d) => d.field).sort()
    expect(fields).toEqual(['fet', 'price'])
  })

  it('marks brand mismatches with isBrandConflict', () => {
    const tires = [mkTire({ id: '1', mspn: '1', brand: 'BFGOODRICH' })]
    const records = { '1': mkRecord({ brand: 'MICHELIN' }) }
    const { result } = renderHook(() => useEFleetDiff(tires, records))
    const entry = result.current.mismatched[0]
    expect(entry.isBrandConflict).toBe(true)
  })

  it('inv-only when tire exists but no record', () => {
    const tires = [mkTire({ id: '1', mspn: '1' })]
    const { result } = renderHook(() => useEFleetDiff(tires, {}))
    expect(result.current.invOnly).toHaveLength(1)
    expect(result.current.invOnly[0].mspn).toBe('1')
  })

  it('inv-only carries isOffProgram when tire.offProgramAt set', () => {
    const tires = [mkTire({ id: '1', mspn: '1', offProgramAt: 'ts' })]
    const { result } = renderHook(() => useEFleetDiff(tires, {}))
    expect(result.current.invOnly[0].isOffProgram).toBe(true)
  })

  it('efleet-only when record exists but no tire', () => {
    const records = { '1': mkRecord() }
    const { result } = renderHook(() => useEFleetDiff([], records))
    expect(result.current.eFleetOnly).toHaveLength(1)
    expect(result.current.eFleetOnly[0].mspn).toBe('1')
  })

  it('excludes archived tires from all buckets', () => {
    const tires = [mkTire({ id: '1', mspn: '1', archivedAt: 'ts' })]
    const records = { '1': mkRecord({ price: 999 }) }
    const { result } = renderHook(() => useEFleetDiff(tires, records))
    expect(result.current.mismatched).toEqual([])
    expect(result.current.invOnly).toEqual([])
    expect(result.current.aligned).toEqual([])
    // The record's MSPN is reachable from records but its tire is excluded;
    // since the tire was excluded, the MSPN should land in eFleetOnly so the
    // operator sees that the eFleet has this SKU but the active inventory
    // does not.
    expect(result.current.eFleetOnly).toHaveLength(1)
  })

  it('counts populate accurately', () => {
    const tires = [
      mkTire({ id: '1', mspn: '1', price: 100 }),                   // aligned
      mkTire({ id: '2', mspn: '2', price: 100 }),                   // mismatched
      mkTire({ id: '3', mspn: '3' }),                               // inv-only
    ]
    const records = {
      '1': mkRecord({ price: 100 }),
      '2': mkRecord({ price: 999 }),
      '4': mkRecord(),                                              // efleet-only
    }
    const { result } = renderHook(() => useEFleetDiff(tires, records))
    expect(result.current.counts).toEqual({
      mismatched: 1,
      invOnly: 1,
      eFleetOnly: 1,
      aligned: 1,
      total: 4,
    })
  })

  it('regression: 54802-shaped row (brand conflict + price + fet deltas)', () => {
    const tires = [
      mkTire({
        id: '54802',
        mspn: '54802',
        brand: 'BFGOODRICH',
        description: '42X14.50R17LT 128Q MDTRTA KM3 D',
        price: 686.40,
        fet: 4.44,
        lr: 'E',
        tread: 'MDTRTA KM3',
      }),
    ]
    const records = {
      '54802': {
        brand: 'MICHELIN',
        description: '275/65R18 116T PRIMACY XC',
        price: 237.90,
        fet: 0,
        lr: '',
        tread: 'PRIMACY XC',
      },
    }
    const { result } = renderHook(() => useEFleetDiff(tires, records))
    expect(result.current.mismatched).toHaveLength(1)
    const e = result.current.mismatched[0]
    expect(e.isBrandConflict).toBe(true)
    const fields = e.deltas.map((d) => d.field).sort()
    expect(fields).toEqual(['description', 'fet', 'lr', 'price', 'tread'])
  })
})
```

- [ ] **Step 2: Verify failure**

`cd .claude/worktrees/efleet-admin-tools && npx vitest run src/hooks/useEFleetDiff.test.js`

- [ ] **Step 3: Implement the selector**

Create `src/hooks/useEFleetDiff.js`:

```jsx
import { useMemo } from 'react'

const EFLEET_SOURCED_FIELDS = ['price', 'fet', 'description', 'lr', 'tread']

/**
 * @typedef {Object} EFleetRecord
 * @property {number} fet
 * @property {number} price
 * @property {string} brand
 * @property {string} description
 * @property {string} lr
 * @property {string} tread
 */

/**
 * @typedef {Object} DiffEntry
 * @property {string} mspn
 * @property {string} brand
 * @property {string} description
 * @property {boolean} isOffProgram
 * @property {boolean} isBrandConflict
 * @property {Array<{ field: string, before: unknown, after: unknown }>} deltas
 */

/**
 * Bucket each MSPN into {mismatched, invOnly, eFleetOnly, aligned} relative
 * to the latest eFleet snapshot.
 *
 * Soft-archived tires (`archivedAt` set) are excluded entirely; the operator
 * already removed them from active inventory. If the eFleet has a record for
 * an archived tire's MSPN, the MSPN lands in `eFleetOnly` (eFleet sees it,
 * active inventory does not).
 *
 * @param {Array<Record<string, unknown>>} tires
 * @param {Record<string, EFleetRecord>} records
 * @returns {{
 *   mismatched: Array<DiffEntry>,
 *   invOnly: Array<DiffEntry>,
 *   eFleetOnly: Array<DiffEntry>,
 *   aligned: Array<DiffEntry>,
 *   counts: { mismatched: number, invOnly: number, eFleetOnly: number, aligned: number, total: number },
 * }}
 */
export function useEFleetDiff(tires, records) {
  return useMemo(() => {
    const out = { mismatched: [], invOnly: [], eFleetOnly: [], aligned: [] }
    const recordsObj = records && typeof records === 'object' ? records : {}
    const tireByMspn = new Map()
    for (const t of Array.isArray(tires) ? tires : []) {
      if (t?.archivedAt) continue
      const key = String(t?.mspn ?? t?.id ?? '').trim()
      if (!key) continue
      tireByMspn.set(key, t)
    }

    const seen = new Set()
    for (const [mspn, tire] of tireByMspn) {
      seen.add(mspn)
      const record = recordsObj[mspn]
      if (!record) {
        out.invOnly.push({
          mspn,
          brand: String(tire.brand ?? ''),
          description: String(tire.description ?? ''),
          isOffProgram: !!tire.offProgramAt,
          isBrandConflict: false,
          deltas: [],
        })
        continue
      }
      const deltas = []
      if (String(tire.brand ?? '') !== String(record.brand ?? '')) {
        deltas.push({ field: 'brand', before: tire.brand, after: record.brand })
      }
      for (const f of EFLEET_SOURCED_FIELDS) {
        if (tire[f] !== record[f]) {
          deltas.push({ field: f, before: tire[f], after: record[f] })
        }
      }
      const entry = {
        mspn,
        brand: String(tire.brand ?? ''),
        description: String(tire.description ?? ''),
        isOffProgram: !!tire.offProgramAt,
        isBrandConflict: String(tire.brand ?? '') !== String(record.brand ?? ''),
        // Strip the synthetic 'brand' delta from the public list — brand
        // conflict has its own pill; deltas should only carry eFleet-sourced
        // fields the importer would normally update.
        deltas: deltas.filter((d) => d.field !== 'brand'),
      }
      if (deltas.length > 0) {
        out.mismatched.push(entry)
      } else {
        out.aligned.push(entry)
      }
    }

    for (const mspn of Object.keys(recordsObj)) {
      if (seen.has(mspn)) continue
      const record = recordsObj[mspn]
      out.eFleetOnly.push({
        mspn,
        brand: String(record.brand ?? ''),
        description: String(record.description ?? ''),
        isOffProgram: false,
        isBrandConflict: false,
        deltas: [],
      })
    }

    const counts = {
      mismatched: out.mismatched.length,
      invOnly: out.invOnly.length,
      eFleetOnly: out.eFleetOnly.length,
      aligned: out.aligned.length,
      total: out.mismatched.length + out.invOnly.length + out.eFleetOnly.length + out.aligned.length,
    }
    return { ...out, counts }
  }, [tires, records])
}
```

- [ ] **Step 4: Re-run tests**

`cd .claude/worktrees/efleet-admin-tools && npx vitest run src/hooks/useEFleetDiff.test.js`

Expected: all 11 cases pass.

- [ ] **Step 5: Commit**

```bash
cd .claude/worktrees/efleet-admin-tools
git add src/hooks/useEFleetDiff.js src/hooks/useEFleetDiff.test.js
git commit -m "feat(hooks): useEFleetDiff bucket selector

Single-pass O(n+m) selector returning mismatched / invOnly /
eFleetOnly / aligned entries plus a counts summary. Soft-archived
tires excluded entirely. Brand mismatches surface as mismatched +
isBrandConflict flag (the synthetic 'brand' delta is stripped from
the public deltas list since brand conflict carries its own pill).

Spec: docs/superpowers/specs/2026-05-01-efleet-admin-tools-design.md"
```

---

## Task 3: `AccountCard` component

**Files:**
- Create: `src/components/admin/efleet/AccountCard.jsx`
- Create: `src/components/admin/efleet/AccountCard.test.jsx`

- [ ] **Step 1: Write the failing tests**

Create `src/components/admin/efleet/AccountCard.test.jsx`:

```jsx
/** @vitest-environment jsdom */
import { describe, expect, it, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { AccountCard } from './AccountCard.jsx'

afterEach(cleanup)

const sample = {
  account: '1580951 SKEDADDLE INC LOVELAND',
  importedAt: { toMillis: () => 1714560000000 },
  sourceReportDate: '2026-04-29',
  sourceFile: 'Michelin_catalog.html',
  records: { '1': {}, '2': {}, '3': {} },
}

const counts = { mismatched: 12, invOnly: 47, eFleetOnly: 203, aligned: 1366, total: 1628 }

describe('AccountCard', () => {
  it('renders the account ship-to string', () => {
    const { container } = render(<AccountCard categoryMap={sample} diffCounts={counts} />)
    expect(container.textContent).toContain('1580951 SKEDADDLE INC LOVELAND')
  })

  it('renders the source report date', () => {
    const { container } = render(<AccountCard categoryMap={sample} diffCounts={counts} />)
    expect(container.textContent).toContain('2026-04-29')
  })

  it('renders all four diff counts', () => {
    const { container } = render(<AccountCard categoryMap={sample} diffCounts={counts} />)
    expect(container.textContent).toContain('12')
    expect(container.textContent).toContain('47')
    expect(container.textContent).toContain('203')
    expect(container.textContent).toContain('1366')
  })

  it('renders total parsed equal to records key count', () => {
    const { container } = render(<AccountCard categoryMap={sample} diffCounts={counts} />)
    expect(container.textContent).toContain('3')
  })

  it('renders -- when fields are missing', () => {
    const empty = { account: null, importedAt: null, sourceReportDate: null, sourceFile: null, records: {} }
    const { container } = render(<AccountCard categoryMap={empty} diffCounts={{ mismatched: 0, invOnly: 0, eFleetOnly: 0, aligned: 0, total: 0 }} />)
    expect(container.textContent).toContain('--')
  })
})
```

- [ ] **Step 2: Verify failure**

`cd .claude/worktrees/efleet-admin-tools && npx vitest run src/components/admin/efleet/AccountCard.test.jsx`

- [ ] **Step 3: Implement**

Create `src/components/admin/efleet/AccountCard.jsx`:

```jsx
function fmtDate(ts) {
  if (!ts || typeof ts.toMillis !== 'function') return null
  const ms = ts.toMillis()
  if (!Number.isFinite(ms)) return null
  return new Date(ms).toISOString().slice(0, 19).replace('T', ' ') + ' UTC'
}

function dl(label, value) {
  return (
    <div className="flex items-baseline gap-3 border-b border-zinc-800/60 py-1.5 last:border-b-0">
      <dt className="w-44 shrink-0 text-xs uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className="font-mono text-sm text-zinc-200">{value || '--'}</dd>
    </div>
  )
}

/**
 * Tab 1 of /admin/efleet: a single card listing the latest categoryMap
 * metadata + diff counts. Operator sanity-checks "did the right import land
 * against the right account?" without leaving the page.
 */
export function AccountCard({ categoryMap, diffCounts }) {
  const totalParsed = categoryMap?.records ? Object.keys(categoryMap.records).length : 0
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 sm:p-6">
      <h2 className="mb-3 text-lg font-semibold text-white">eFleet account &amp; import</h2>
      <dl className="text-sm">
        {dl('Account (Ship-To)', categoryMap?.account || null)}
        {dl('Last imported', fmtDate(categoryMap?.importedAt))}
        {dl('Source report date', categoryMap?.sourceReportDate)}
        {dl('Source file', categoryMap?.sourceFile)}
        {dl('Total parsed (records)', totalParsed > 0 ? String(totalParsed) : null)}
        {dl('Mismatched', String(diffCounts.mismatched))}
        {dl('Inventory only', String(diffCounts.invOnly))}
        {dl('eFleet only', String(diffCounts.eFleetOnly))}
        {dl('Aligned', String(diffCounts.aligned))}
      </dl>
    </section>
  )
}
```

- [ ] **Step 4: Re-run tests + commit**

```bash
cd .claude/worktrees/efleet-admin-tools
npx vitest run src/components/admin/efleet/AccountCard.test.jsx
git add src/components/admin/efleet/AccountCard.jsx src/components/admin/efleet/AccountCard.test.jsx
git commit -m "feat(admin): AccountCard for /admin/efleet

Single card listing meta/categoryMap account, last import, source
report date, source file, total parsed, plus the four diff counts.
Pure presentational; falls back to -- on missing fields."
```

---

## Task 4: `DiffStateTabs` sub-tab strip

**Files:**
- Create: `src/components/admin/efleet/DiffStateTabs.jsx`
- Create: `src/components/admin/efleet/DiffStateTabs.test.jsx`

- [ ] **Step 1: Write the failing tests**

Create `src/components/admin/efleet/DiffStateTabs.test.jsx`:

```jsx
/** @vitest-environment jsdom */
import { describe, expect, it, vi, afterEach } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import { DiffStateTabs } from './DiffStateTabs.jsx'

afterEach(cleanup)

const counts = { mismatched: 12, invOnly: 47, eFleetOnly: 203, aligned: 1366, total: 1628 }

describe('DiffStateTabs', () => {
  it('renders the four states with counts', () => {
    const { container } = render(<DiffStateTabs counts={counts} active="mismatched" onChange={() => {}} />)
    const tabs = container.querySelectorAll('[role="tab"]')
    expect(tabs).toHaveLength(4)
    expect(tabs[0].textContent).toContain('Mismatched')
    expect(tabs[0].textContent).toContain('12')
    expect(tabs[1].textContent).toContain('47')
    expect(tabs[2].textContent).toContain('203')
    expect(tabs[3].textContent).toContain('1366')
  })

  it('marks the active tab aria-selected=true', () => {
    const { container } = render(<DiffStateTabs counts={counts} active="invOnly" onChange={() => {}} />)
    const tabs = container.querySelectorAll('[role="tab"]')
    expect(tabs[0].getAttribute('aria-selected')).toBe('false')
    expect(tabs[1].getAttribute('aria-selected')).toBe('true')
  })

  it('clicking a tab calls onChange with that state key', () => {
    const spy = vi.fn()
    const { container } = render(<DiffStateTabs counts={counts} active="mismatched" onChange={spy} />)
    const tabs = container.querySelectorAll('[role="tab"]')
    fireEvent.click(tabs[2])
    expect(spy).toHaveBeenCalledWith('eFleetOnly')
  })

  it('clicking the active tab does NOT call onChange', () => {
    const spy = vi.fn()
    const { container } = render(<DiffStateTabs counts={counts} active="mismatched" onChange={spy} />)
    const tabs = container.querySelectorAll('[role="tab"]')
    fireEvent.click(tabs[0])
    expect(spy).not.toHaveBeenCalled()
  })

  it('uses role=tablist on the container', () => {
    const { container } = render(<DiffStateTabs counts={counts} active="mismatched" onChange={() => {}} />)
    expect(container.querySelector('[role="tablist"]')).not.toBeNull()
  })
})
```

- [ ] **Step 2: Verify failure**

`cd .claude/worktrees/efleet-admin-tools && npx vitest run src/components/admin/efleet/DiffStateTabs.test.jsx`

- [ ] **Step 3: Implement**

Create `src/components/admin/efleet/DiffStateTabs.jsx`:

```jsx
const STATES = [
  { key: 'mismatched',  label: 'Mismatched',  active: 'border-red-500 bg-red-950/30 text-red-200',     idle: 'border-transparent text-red-400/60 hover:text-red-300' },
  { key: 'invOnly',     label: 'Inv only',    active: 'border-amber-500 bg-amber-950/30 text-amber-200', idle: 'border-transparent text-amber-400/60 hover:text-amber-300' },
  { key: 'eFleetOnly',  label: 'eFleet only', active: 'border-blue-500 bg-blue-950/30 text-blue-200',   idle: 'border-transparent text-blue-400/60 hover:text-blue-300' },
  { key: 'aligned',     label: 'Aligned',     active: 'border-emerald-500 bg-emerald-950/30 text-emerald-200', idle: 'border-transparent text-emerald-400/60 hover:text-emerald-300' },
]

/**
 * Sub-tab strip for /admin/efleet > Diff. Each tab is keyed to a diff bucket
 * with state-specific color tokens (red/amber/blue/emerald). Click on the
 * active tab is a no-op. Counts render as part of the label.
 */
export function DiffStateTabs({ counts, active, onChange }) {
  return (
    <div role="tablist" aria-label="Diff state" className="flex flex-wrap gap-2 border-b border-zinc-800 pb-2">
      {STATES.map((s) => {
        const selected = s.key === active
        return (
          <button
            key={s.key}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => {
              if (!selected) onChange(s.key)
            }}
            className={`inline-flex items-center gap-2 rounded-t-lg border-b-2 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors ${
              selected ? s.active : s.idle
            }`}
          >
            <span>{s.label}</span>
            <span className="font-mono tabular-nums text-[11px] opacity-90">{counts[s.key] ?? 0}</span>
          </button>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 4: Re-run tests + commit**

```bash
cd .claude/worktrees/efleet-admin-tools
npx vitest run src/components/admin/efleet/DiffStateTabs.test.jsx
git add src/components/admin/efleet/DiffStateTabs.jsx src/components/admin/efleet/DiffStateTabs.test.jsx
git commit -m "feat(admin): DiffStateTabs colored sub-tab strip

Four state tabs (mismatched / invOnly / eFleetOnly / aligned) with
state-specific color tokens (red / amber / blue / emerald). Click
contract matches CategoryTabs/BrandStatsRow: clicking the active tab
is a no-op."
```

---

## Task 5: `EFleetDiffView` (Tab 3 body)

**Files:**
- Create: `src/components/admin/efleet/EFleetDiffView.jsx`
- Create: `src/components/admin/efleet/EFleetDiffView.test.jsx`

- [ ] **Step 1: Write the failing tests**

Create `src/components/admin/efleet/EFleetDiffView.test.jsx`:

```jsx
/** @vitest-environment jsdom */
import { describe, expect, it, vi, afterEach } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import { EFleetDiffView } from './EFleetDiffView.jsx'

afterEach(cleanup)

const baseDiff = {
  mismatched: [
    { mspn: '54802', brand: 'BFGOODRICH', description: 'BFG MDTRTA KM3', isOffProgram: false, isBrandConflict: true, deltas: [{ field: 'price', before: 686.4, after: 237.9 }, { field: 'fet', before: 4.44, after: 0 }] },
  ],
  invOnly: [
    { mspn: '99001', brand: 'MICHELIN', description: 'aged stock row', isOffProgram: false, isBrandConflict: false, deltas: [] },
    { mspn: '99002', brand: 'BFGOODRICH', description: 'off program row', isOffProgram: true, isBrandConflict: false, deltas: [] },
  ],
  eFleetOnly: [
    { mspn: '25822', brand: 'UNIROYAL', description: 'TPTOURI', isOffProgram: false, isBrandConflict: false, deltas: [] },
  ],
  aligned: [
    { mspn: '12345', brand: 'MICHELIN', description: 'aligned row', isOffProgram: false, isBrandConflict: false, deltas: [] },
  ],
  counts: { mismatched: 1, invOnly: 2, eFleetOnly: 1, aligned: 1, total: 5 },
}

describe('EFleetDiffView', () => {
  it('defaults to the mismatched tab and renders the brand-conflict pill', () => {
    const { container } = render(<EFleetDiffView diff={baseDiff} initialState="mismatched" onStateChange={() => {}} />)
    expect(container.textContent).toContain('54802')
    expect(container.textContent).toContain('BRAND CONFLICT')
  })

  it('switching to invOnly renders the off-program pill', () => {
    const spy = vi.fn()
    const { container } = render(<EFleetDiffView diff={baseDiff} initialState="invOnly" onStateChange={spy} />)
    expect(container.textContent).toContain('99001')
    expect(container.textContent).toContain('OFF-PROGRAM')
  })

  it('eFleetOnly tab renders price+fet hint per row', () => {
    const { container } = render(<EFleetDiffView diff={baseDiff} initialState="eFleetOnly" onStateChange={() => {}} />)
    expect(container.textContent).toContain('25822')
  })

  it('clicking another sub-tab fires onStateChange', () => {
    const spy = vi.fn()
    const { container } = render(<EFleetDiffView diff={baseDiff} initialState="mismatched" onStateChange={spy} />)
    const tabs = container.querySelectorAll('[role="tab"]')
    fireEvent.click(tabs[1])
    expect(spy).toHaveBeenCalledWith('invOnly')
  })

  it('renders an empty state when the active bucket has zero rows', () => {
    const empty = { ...baseDiff, mismatched: [], counts: { ...baseDiff.counts, mismatched: 0 } }
    const { container } = render(<EFleetDiffView diff={empty} initialState="mismatched" onStateChange={() => {}} />)
    expect(container.textContent).toContain('No rows')
  })
})
```

- [ ] **Step 2: Verify failure**

`cd .claude/worktrees/efleet-admin-tools && npx vitest run src/components/admin/efleet/EFleetDiffView.test.jsx`

- [ ] **Step 3: Implement**

Create `src/components/admin/efleet/EFleetDiffView.jsx`:

```jsx
import { DiffStateTabs } from './DiffStateTabs.jsx'

function fmtCurrency(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return String(n ?? '')
  return `$${n.toFixed(2)}`
}

function DeltaList({ deltas }) {
  if (!deltas || deltas.length === 0) return null
  return (
    <ul className="font-mono text-[11px] text-zinc-300">
      {deltas.map((d) => {
        const before = d.field === 'price' || d.field === 'fet' ? fmtCurrency(d.before) : String(d.before ?? '')
        const after = d.field === 'price' || d.field === 'fet' ? fmtCurrency(d.after) : String(d.after ?? '')
        return (
          <li key={d.field}>
            <span className="text-zinc-500">{d.field}:</span> {before}{' '}
            <span className="text-zinc-500">→</span> <span className="text-red-300">{after}</span>
          </li>
        )
      })}
    </ul>
  )
}

function MismatchedTable({ rows }) {
  return (
    <table className="min-w-full text-left text-sm">
      <thead className="sticky top-0 bg-zinc-900/95 text-xs uppercase tracking-wide text-zinc-400">
        <tr>
          <th className="px-3 py-2">MSPN</th>
          <th className="px-3 py-2">Brand</th>
          <th className="px-3 py-2">Description</th>
          <th className="px-3 py-2">Deltas</th>
          <th className="px-3 py-2">Notes</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.mspn} className="border-t border-zinc-800/60">
            <td className="px-3 py-2 font-mono text-zinc-300">{r.mspn}</td>
            <td className="px-3 py-2 text-zinc-300">{r.brand}</td>
            <td className="px-3 py-2 text-zinc-400">{r.description}</td>
            <td className="px-3 py-2"><DeltaList deltas={r.deltas} /></td>
            <td className="px-3 py-2">
              {r.isBrandConflict ? (
                <span className="rounded bg-red-950/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-300">
                  BRAND CONFLICT
                </span>
              ) : null}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function InvOnlyTable({ rows }) {
  return (
    <table className="min-w-full text-left text-sm">
      <thead className="sticky top-0 bg-zinc-900/95 text-xs uppercase tracking-wide text-zinc-400">
        <tr>
          <th className="px-3 py-2">MSPN</th>
          <th className="px-3 py-2">Brand</th>
          <th className="px-3 py-2">Description</th>
          <th className="px-3 py-2">Notes</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.mspn} className="border-t border-zinc-800/60">
            <td className="px-3 py-2 font-mono text-zinc-300">{r.mspn}</td>
            <td className="px-3 py-2 text-zinc-300">{r.brand}</td>
            <td className="px-3 py-2 text-zinc-400">{r.description}</td>
            <td className="px-3 py-2">
              {r.isOffProgram ? (
                <span className="rounded bg-amber-950/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-300">
                  OFF-PROGRAM
                </span>
              ) : null}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function EFleetOnlyTable({ rows }) {
  return (
    <table className="min-w-full text-left text-sm">
      <thead className="sticky top-0 bg-zinc-900/95 text-xs uppercase tracking-wide text-zinc-400">
        <tr>
          <th className="px-3 py-2">MSPN</th>
          <th className="px-3 py-2">Brand</th>
          <th className="px-3 py-2">Description</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.mspn} className="border-t border-zinc-800/60">
            <td className="px-3 py-2 font-mono text-zinc-300">{r.mspn}</td>
            <td className="px-3 py-2 text-zinc-300">{r.brand}</td>
            <td className="px-3 py-2 text-zinc-400">{r.description}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function AlignedTable({ rows }) {
  return (
    <table className="min-w-full text-left text-sm">
      <thead className="sticky top-0 bg-zinc-900/95 text-xs uppercase tracking-wide text-zinc-400">
        <tr>
          <th className="px-3 py-2">MSPN</th>
          <th className="px-3 py-2">Brand</th>
          <th className="px-3 py-2">Description</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.mspn} className="border-t border-zinc-800/40">
            <td className="px-3 py-2 font-mono text-zinc-500">{r.mspn}</td>
            <td className="px-3 py-2 text-zinc-500">{r.brand}</td>
            <td className="px-3 py-2 text-zinc-600">{r.description}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/**
 * Tab 3 of /admin/efleet: sub-tabs + per-state tables.
 *
 * Stateless WRT the active state — receives `initialState` + `onStateChange`
 * so AdminEFleetPage can sync the URL `?state=` param.
 */
export function EFleetDiffView({ diff, initialState, onStateChange }) {
  const active = initialState
  const rowsByState = {
    mismatched: diff.mismatched,
    invOnly: diff.invOnly,
    eFleetOnly: diff.eFleetOnly,
    aligned: diff.aligned,
  }
  const rows = rowsByState[active] || []
  const TableForState = {
    mismatched: MismatchedTable,
    invOnly: InvOnlyTable,
    eFleetOnly: EFleetOnlyTable,
    aligned: AlignedTable,
  }[active]
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-2 sm:p-3">
      <DiffStateTabs counts={diff.counts} active={active} onChange={onStateChange} />
      <div className="mt-3 max-h-[60vh] overflow-y-auto">
        {rows.length > 0 && TableForState ? (
          <TableForState rows={rows} />
        ) : (
          <div className="px-3 py-12 text-center text-sm text-zinc-500">
            No rows in this state.
          </div>
        )}
      </div>
    </section>
  )
}
```

- [ ] **Step 4: Re-run tests + commit**

```bash
cd .claude/worktrees/efleet-admin-tools
npx vitest run src/components/admin/efleet/EFleetDiffView.test.jsx
git add src/components/admin/efleet/EFleetDiffView.jsx src/components/admin/efleet/EFleetDiffView.test.jsx
git commit -m "feat(admin): EFleetDiffView with per-state tables

Stateless tab body — accepts initialState + onStateChange so the
parent page can sync URL ?state= params. Four per-state tables:
Mismatched (deltas + brand-conflict pill), Inv only (off-program
pill), eFleet only (compact), Aligned (dimmed). Empty-state fallback
when the active bucket is empty."
```

---

## Task 6: `FetAuditTable` component

**Files:**
- Create: `src/components/admin/efleet/FetAuditTable.jsx`
- Create: `src/components/admin/efleet/FetAuditTable.test.jsx`

- [ ] **Step 1: Write the failing tests**

Create `src/components/admin/efleet/FetAuditTable.test.jsx`:

```jsx
/** @vitest-environment jsdom */
import { describe, expect, it, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { FetAuditTable } from './FetAuditTable.jsx'

afterEach(cleanup)

const sample = {
  mismatched: [
    { mspn: 'A', brand: 'MICHELIN', description: 'price-only mismatch', deltas: [{ field: 'price', before: 100, after: 150 }] },
    { mspn: 'B', brand: 'BFGOODRICH', description: 'fet mismatch', deltas: [{ field: 'fet', before: 3, after: 0 }] },
    { mspn: 'C', brand: 'BFGOODRICH', description: 'big fet jump', deltas: [{ field: 'fet', before: 0, after: 32 }] },
  ],
  invOnly: [],
  eFleetOnly: [],
  aligned: [],
}

describe('FetAuditTable', () => {
  it('only shows mismatches that include a fet delta', () => {
    const { container } = render(<FetAuditTable diff={sample} />)
    expect(container.textContent).toContain('B')
    expect(container.textContent).toContain('C')
    expect(container.textContent).not.toContain('price-only mismatch')
  })

  it('sorts by absolute fet delta descending', () => {
    const { container } = render(<FetAuditTable diff={sample} />)
    const rows = container.querySelectorAll('tbody tr')
    expect(rows[0].textContent).toContain('C')   // |0 - 32| = 32 (largest)
    expect(rows[1].textContent).toContain('B')   // |3 - 0| = 3
  })

  it('renders an empty state when no fet mismatches exist', () => {
    const empty = { ...sample, mismatched: [{ mspn: 'X', brand: 'M', description: 'no-fet', deltas: [{ field: 'price', before: 1, after: 2 }] }] }
    const { container } = render(<FetAuditTable diff={empty} />)
    expect(container.textContent).toContain('No FET mismatches')
  })
})
```

- [ ] **Step 2: Verify failure**

`cd .claude/worktrees/efleet-admin-tools && npx vitest run src/components/admin/efleet/FetAuditTable.test.jsx`

- [ ] **Step 3: Implement**

Create `src/components/admin/efleet/FetAuditTable.jsx`:

```jsx
function fmtCurrency(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return String(n ?? '')
  return `$${n.toFixed(2)}`
}

/**
 * Tab 2 of /admin/efleet: tax-compliance focus on FET deltas.
 *
 * Filters diff.mismatched to entries with a FET delta. Sorts by absolute
 * delta descending so the biggest tax-compliance risks float to the top.
 * Read-only — operator follows up by editing the tire doc directly or
 * running a one-off script.
 */
export function FetAuditTable({ diff }) {
  const rows = (diff.mismatched || [])
    .map((m) => {
      const fetDelta = m.deltas.find((d) => d.field === 'fet')
      if (!fetDelta) return null
      const before = Number(fetDelta.before) || 0
      const after = Number(fetDelta.after) || 0
      return {
        ...m,
        portalFet: before,
        eFleetFet: after,
        absDelta: Math.abs(after - before),
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.absDelta - a.absDelta)

  if (rows.length === 0) {
    return (
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 text-center">
        <p className="text-sm text-zinc-400">No FET mismatches between portal and eFleet. Tax compliance is clean.</p>
      </section>
    )
  }

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-2 sm:p-3">
      <table className="min-w-full text-left text-sm">
        <thead className="sticky top-0 bg-zinc-900/95 text-xs uppercase tracking-wide text-zinc-400">
          <tr>
            <th className="px-3 py-2">MSPN</th>
            <th className="px-3 py-2">Brand</th>
            <th className="px-3 py-2">Description</th>
            <th className="px-3 py-2 text-right">Portal FET</th>
            <th className="px-3 py-2 text-right">eFleet FET</th>
            <th className="px-3 py-2 text-right">Δ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.mspn} className="border-t border-zinc-800/60">
              <td className="px-3 py-2 font-mono text-zinc-300">{r.mspn}</td>
              <td className="px-3 py-2 text-zinc-300">{r.brand}</td>
              <td className="px-3 py-2 text-zinc-400">{r.description}</td>
              <td className="px-3 py-2 text-right font-mono text-zinc-300">{fmtCurrency(r.portalFet)}</td>
              <td className="px-3 py-2 text-right font-mono text-red-300">{fmtCurrency(r.eFleetFet)}</td>
              <td className="px-3 py-2 text-right font-mono font-bold text-red-300">{fmtCurrency(r.absDelta)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
```

- [ ] **Step 4: Re-run tests + commit**

```bash
cd .claude/worktrees/efleet-admin-tools
npx vitest run src/components/admin/efleet/FetAuditTable.test.jsx
git add src/components/admin/efleet/FetAuditTable.jsx src/components/admin/efleet/FetAuditTable.test.jsx
git commit -m "feat(admin): FetAuditTable for tax-compliance focus

Filters diff.mismatched to FET-only deltas, sorts by absolute delta
descending. Empty state when nothing flagged. Surfaces the tax-risk
slice without forcing the operator to scroll the full diff table."
```

---

## Task 7: `AdminEFleetPage` route + entry card on AdminPage

**Files:**
- Create: `src/pages/AdminEFleetPage.jsx`
- Modify: `src/App.jsx`
- Modify: `src/pages/AdminPage.jsx`

- [ ] **Step 1: Implement the page**

Create `src/pages/AdminEFleetPage.jsx`:

```jsx
import { useEffect, useState } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useUserProfile } from '../hooks/useUserProfile'
import { useTires } from '../hooks/useTires'
import { useEFleetDiff } from '../hooks/useEFleetDiff'
import { ModuleSubheader } from '../components/layout/ModuleSubheader.jsx'
import Spinner from '../components/ui/Spinner.jsx'
import { AccountCard } from '../components/admin/efleet/AccountCard.jsx'
import { FetAuditTable } from '../components/admin/efleet/FetAuditTable.jsx'
import { EFleetDiffView } from '../components/admin/efleet/EFleetDiffView.jsx'

const TAB_KEYS = ['account', 'fet', 'diff']
const STATE_KEYS = ['mismatched', 'invOnly', 'eFleetOnly', 'aligned']

export function AdminEFleetPage() {
  const { profile, loading: profileLoading } = useUserProfile()
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = TAB_KEYS.includes(searchParams.get('tab')) ? searchParams.get('tab') : 'account'
  const state = STATE_KEYS.includes(searchParams.get('state')) ? searchParams.get('state') : 'mismatched'

  const { tires, loading: tiresLoading } = useTires()
  const [categoryMap, setCategoryMap] = useState(null)
  const [mapLoading, setMapLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const snap = await getDoc(doc(db, 'meta', 'categoryMap'))
        if (cancelled) return
        setCategoryMap(snap.exists() ? snap.data() : null)
      } catch (err) {
        console.error('AdminEFleetPage categoryMap read', err)
      } finally {
        if (!cancelled) setMapLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const records = categoryMap?.records || {}
  const diff = useEFleetDiff(tires, records)

  if (!profileLoading && profile && String(profile.role || '') !== 'admin') {
    return <Navigate to="/dashboard?notice=access" replace />
  }

  function setTab(next) {
    const params = new URLSearchParams(searchParams)
    params.set('tab', next)
    if (next !== 'diff') params.delete('state')
    setSearchParams(params, { replace: true })
  }

  function setDiffState(next) {
    const params = new URLSearchParams(searchParams)
    params.set('tab', 'diff')
    params.set('state', next)
    setSearchParams(params, { replace: true })
  }

  const loading = profileLoading || tiresLoading || mapLoading

  const tabs = [
    { id: 'account', label: 'Account' },
    { id: 'fet', label: 'FET audit' },
    { id: 'diff', label: 'Diff' },
  ].map((t) => ({ ...t, active: t.id === tab, onClick: () => setTab(t.id) }))

  const showEmpty = !loading && (!categoryMap || !categoryMap.records)

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <ModuleSubheader
        title="eFleet tools"
        subtitle="FET audit, inventory diff, and import metadata"
        tabs={tabs}
        maxWidthClass="max-w-6xl"
      />
      <main className="mx-auto max-w-6xl space-y-4 px-6 py-8 sm:py-10">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-zinc-400">
            <Spinner className="h-4 w-4" />
            Loading…
          </div>
        ) : showEmpty ? (
          <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 text-center">
            <p className="text-sm text-zinc-400">
              No eFleet import yet. Run <code className="font-mono text-cyan-300">node scripts/import-efleet.mjs</code> from a machine
              with `GOOGLE_APPLICATION_CREDENTIALS` set, then refresh this page.
            </p>
          </section>
        ) : tab === 'account' ? (
          <AccountCard categoryMap={categoryMap} diffCounts={diff.counts} />
        ) : tab === 'fet' ? (
          <FetAuditTable diff={diff} />
        ) : (
          <EFleetDiffView diff={diff} initialState={state} onStateChange={setDiffState} />
        )}
      </main>
    </div>
  )
}
```

- [ ] **Step 2: Register the route in App.jsx**

In `src/App.jsx`, find the existing `AdminPage` lazy import and route. Add a parallel entry below it:

```jsx
const AdminEFleetPage = lazy(() => import('./pages/AdminEFleetPage').then((m) => ({ default: m.AdminEFleetPage })))
```

Then in the routes section, add a route alongside the existing `/admin` route:

```jsx
<Route
  path="/admin/efleet"
  element={
    <ProtectedRoute>
      <AdminEFleetPage />
    </ProtectedRoute>
  }
/>
```

(Match whatever `ProtectedRoute` / route-element pattern the existing `/admin` route uses; the role gate is also enforced inside the page.)

- [ ] **Step 3: Add the entry card on AdminPage**

In `src/pages/AdminPage.jsx`, just below the Growth Lab section, add:

```jsx
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-white">eFleet tools</h2>
          <p className="mt-2 text-sm text-zinc-400">
            Account info, FET audit, and side-by-side diff against the latest <code className="font-mono text-cyan-300">meta/categoryMap</code> import.
            Read-only diagnostic view; surfaces mismatches operators should reconcile before the next eFleet run.
          </p>
          <Link
            to="/admin/efleet"
            className="mt-4 inline-flex min-h-[44px] items-center rounded-lg border border-zinc-600 px-4 py-2 text-sm font-medium text-zinc-100 transition-colors hover:border-amber-600/40 hover:bg-zinc-800/80 sm:min-h-0"
          >
            Open eFleet tools →
          </Link>
        </section>
```

- [ ] **Step 4: Run vitest**

`cd .claude/worktrees/efleet-admin-tools && npx vitest run src/`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
cd .claude/worktrees/efleet-admin-tools
git add src/pages/AdminEFleetPage.jsx src/App.jsx src/pages/AdminPage.jsx
git commit -m "feat(admin): /admin/efleet route with three tabs

AdminEFleetPage hosts the Account / FET audit / Diff tab strip,
gates on role==='admin', and reads meta/categoryMap once via getDoc.
Empty state when no import has run yet. URL state via ?tab= and
?state=. AdminPage gets an 'Open eFleet tools' entry card."
```

---

## Task 8: Lint, bundle, full vitest, manual eye-check

**Files:** none

- [ ] **Step 1: Lint**

`cd .claude/worktrees/efleet-admin-tools && npm run lint`

Expected: 0 errors.

- [ ] **Step 2: Bundle**

`cd .claude/worktrees/efleet-admin-tools && npm run build && npx size-limit`

Expected: all caps pass. New code lands in `AdminEFleetPage` chunk and adds ~5 KB gzipped.

- [ ] **Step 3: Full vitest**

`cd .claude/worktrees/efleet-admin-tools && npx vitest run src/ scripts/`

Expected: green.

- [ ] **Step 4: Manual eye-check**

`npm run dev`, sign in as admin. Visit `/admin` — confirm new "eFleet tools" entry card. Click through to `/admin/efleet`.

- **Account tab:** loads with metadata + counts. Numbers match what you'd expect from the latest import.
- **FET audit tab:** lists FET mismatches sorted by delta. Empty state if nothing flagged.
- **Diff tab:** opens on Mismatched. Counts on each sub-tab match the Account tab. Click to other states; URL `?state=` updates. Brand-conflict pill renders on 54802 / 61309 (those are still in the data).
- **URL state:** `/admin/efleet?tab=diff&state=invOnly` deep-links correctly on a fresh page load.
- **Non-admin gate:** sign in as a viewer → redirected to `/dashboard?notice=access`.

- [ ] **Step 5: Commit any final tweaks (or skip)**

If anything was tweaked in the eye-check, commit. Otherwise no commit.

---

## Verification checklist (final)

- All vitest tests green (`npx vitest run src/ scripts/`)
- Lint clean (`npm run lint`)
- Bundle within caps (`npx size-limit`)
- `/admin/efleet` reachable, three tabs work
- Account tab shows ship-to + import metadata
- FET audit tab filters to FET deltas, sorts by abs delta
- Diff tab sub-tabs cycle correctly; counts match across views
- Brand-conflict pill renders on the two known conflicts
- Off-program pill renders on inv-only rows when `tire.offProgramAt` is set
- Empty state shows when `meta/categoryMap` lacks `records` or doc is missing
- Importer writes the new `records` field and version bumps to 2
- URL state survives page refresh

---

## Out of scope (per spec)

- Inline / bulk fix actions
- Drift over time / history charts
- Brand-conflict resolution UI
- Customer-facing surfaces
