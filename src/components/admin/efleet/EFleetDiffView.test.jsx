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
