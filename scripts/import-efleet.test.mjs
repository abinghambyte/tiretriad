/** @vitest-environment node */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseEfleetCatalog } from './import-efleet.mjs'

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
