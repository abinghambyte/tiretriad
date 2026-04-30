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
    expect(Object.keys(result.mspns).length).toBe(4)
    expect(result.mspns['11111']).toBeUndefined()
    expect(result.mspns['33333']).toBe('passenger')
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
