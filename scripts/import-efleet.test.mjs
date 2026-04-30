/** @vitest-environment node */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseEfleetCatalog, planTirePhases } from './import-efleet.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const fixture = readFileSync(resolve(here, '__fixtures__/efleet-sample.html'), 'utf8')

describe('parseEfleetCatalog', () => {
  it('extracts MSPNs grouped by category from a well-formed report', () => {
    const result = parseEfleetCatalog(fixture)
    expect(result.mspns).toEqual({
      '11111': 'lightTruck',
      '22222': 'lightTruck',
      '33333': 'lightTruck',
      '44444': 'passenger',
      '99999': 'passenger',
      '13131': 'passenger',
      '55555': 'passenger',
      '66666': 'passenger',
      '88888': 'truck',
      '10101': 'truck',
      '12121': 'truck',
    })
  })

  it('captures cover-page metadata', () => {
    const result = parseEfleetCatalog(fixture)
    expect(result.account).toBe('1580951 SKEDADDLE INC LOVELAND')
    expect(result.sourceReportDate).toBe('2026-04-19')
    expect(result.totalParsed).toBe(11)
  })

  it('rejects empty or malformed input', () => {
    expect(() => parseEfleetCatalog('')).toThrow(/empty|malformed/i)
    expect(() => parseEfleetCatalog('<html></html>')).toThrow(/no.*product.*tables|no.*cat-section/i)
  })

  it('handles unknown category titles by ignoring them', () => {
    const odd = fixture.replace('Light Truck', 'Mystery Bucket')
    const result = parseEfleetCatalog(odd)
    expect(Object.keys(result.mspns).length).toBe(8)
    expect(result.mspns['11111']).toBeUndefined()
    expect(result.mspns['44444']).toBe('passenger')
  })

  it('throws when cat-section blocks exist but no MSPNs match (regex drift safety net)', () => {
    // Construct an HTML with cat-sections but with the MSPN <td>s missing the
    // font-family:monospace style — the regex won't match, so we expect a throw
    // rather than a silent empty result that would wipe production data.
    const broken = `
      <table><tr><td>Account:</td><td>Ship To: TEST</td></tr></table>
      <div class="cat-section"><div class="cat-header-title">Passenger</div>
      <table class="product-table"><tr><th>MSPN</th></tr>
      <tr><td>11111</td></tr></table></div>
    `
    expect(() => parseEfleetCatalog(broken)).toThrow(/no mspns extracted|regex|malformed/i)
  })
})

describe('parseEfleetCatalog tireRecords', () => {
  it('returns one tireRecord per non-PQL row with all fields populated', () => {
    const result = parseEfleetCatalog(fixture)
    expect(Array.isArray(result.tireRecords)).toBe(true)
    expect(result.tireRecords.length).toBe(11)
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

  it('preserves spacing when description has inline tags like <sup>', () => {
    const result = parseEfleetCatalog(fixture)
    const byMspn = Object.fromEntries(result.tireRecords.map(r => [r.mspn, r]))
    // 13131 has '<sup>XL</sup>' between 91W and PRIMACY 4 in the fixture.
    // Tag-strip should not run words together.
    expect(byMspn['13131'].description).toBe('225/45R17 91W XL PRIMACY 4')
  })

  it('returns warnings array even when empty', () => {
    const minimalHtml = fixture.replace(/77777[\s\S]*?<\/tr>/, '').replace(/99999[\s\S]*?<\/tr>/, '')
    const result = parseEfleetCatalog(minimalHtml)
    expect(Array.isArray(result.warnings)).toBe(true)
  })
})

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

  it('only diffs the eFleet-sourced fields (price, fet, description, lr, tread) on brand-matched rows', () => {
    const plan = planTirePhases(
      [
        makeDoc({
          id: 'ALL-FIELDS-1',
          price: 100,
          fet: 5,
          description: 'OLD',
          lr: 'F',
          tread: 'OLD-TREAD',
          brand: 'MICHELIN',
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
    expect(plan.brandConflicts).toEqual([])
  })

  it('skips ALL field diffs when brand conflicts (vendor-side MSPN duplication guard)', () => {
    // Regression for the 2026-04-29 production import: MSPNs 54802 and 61309
    // appeared under both BFGoodrich and Michelin sections of the eFleet HTML.
    // The importer correctly refused to auto-rebrand, but the description /
    // price / fet still got overwritten by the wrong-brand product, producing
    // junk rows. Now the entire field-diff for a brand-mismatched row is
    // suppressed so nothing changes until the operator manually reconciles.
    const plan = planTirePhases(
      [
        makeDoc({
          id: '54802',
          brand: 'BFGOODRICH',
          description: '42X14.50R17LT 128Q MDTRTA KM3 D',
          price: 686.4,
          fet: 4.44,
          lr: 'E',
          tread: 'MDTRTA KM3',
        }),
      ],
      [
        makeRecord({
          mspn: '54802',
          brand: 'MICHELIN',
          description: '275/65R18 116T PRIMACY XC',
          price: 237.9,
          fet: 0,
          lr: '',
          tread: 'PRIMACY XC',
        }),
      ],
    )
    expect(plan.brandConflicts).toEqual([
      { mspn: '54802', existingBrand: 'BFGOODRICH', htmlBrand: 'MICHELIN' },
    ])
    expect(plan.fieldDiffs).toEqual([])
  })
})
