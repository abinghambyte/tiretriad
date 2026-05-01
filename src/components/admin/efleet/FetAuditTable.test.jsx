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
