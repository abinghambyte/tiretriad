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

  it('surfaces over-applied FET on inventory-only rows (tireFet > 0, no eFleet record)', () => {
    const diff = {
      mismatched: [],
      invOnly: [
        { mspn: 'OA1', brand: 'MICHELIN', description: 'over-applied fet row', deltas: [], tireFet: 3, tirePrice: 100, recordFet: null, recordPrice: null, isOffProgram: false, isBrandConflict: false },
      ],
      eFleetOnly: [],
      aligned: [],
    }
    const { container } = render(<FetAuditTable diff={diff} />)
    expect(container.textContent).toContain('OA1')
    expect(container.textContent).toContain('OVER-APPLIED')
  })

  it('does NOT flag inv-only rows where tireFet is 0', () => {
    const diff = {
      mismatched: [],
      invOnly: [
        { mspn: 'NO_FET', brand: 'M', description: 'no fet on inv-only', deltas: [], tireFet: 0, tirePrice: 50, recordFet: null, recordPrice: null, isOffProgram: false, isBrandConflict: false },
      ],
      eFleetOnly: [],
      aligned: [],
    }
    const { container } = render(<FetAuditTable diff={diff} />)
    expect(container.textContent).toContain('No FET mismatches')
  })

  it('combined sort: mismatched and over-applied rows interleave by abs fet amount', () => {
    const diff = {
      mismatched: [
        { mspn: 'M5', brand: 'M', description: 'mismatch 5', deltas: [{ field: 'fet', before: 0, after: 5 }] },
      ],
      invOnly: [
        { mspn: 'OA10', brand: 'M', description: 'over-applied 10', deltas: [], tireFet: 10, tirePrice: 100, recordFet: null, recordPrice: null, isOffProgram: false, isBrandConflict: false },
        { mspn: 'OA2', brand: 'M', description: 'over-applied 2', deltas: [], tireFet: 2, tirePrice: 100, recordFet: null, recordPrice: null, isOffProgram: false, isBrandConflict: false },
      ],
      eFleetOnly: [],
      aligned: [],
    }
    const { container } = render(<FetAuditTable diff={diff} />)
    const rows = container.querySelectorAll('tbody tr')
    expect(rows[0].textContent).toContain('OA10')   // 10 (largest)
    expect(rows[1].textContent).toContain('M5')     // 5
    expect(rows[2].textContent).toContain('OA2')    // 2
  })
})
