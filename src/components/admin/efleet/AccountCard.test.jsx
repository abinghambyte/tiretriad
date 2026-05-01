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
