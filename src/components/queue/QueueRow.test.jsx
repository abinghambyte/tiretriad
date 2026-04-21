/** @vitest-environment jsdom */

globalThis.IS_REACT_ACT_ENVIRONMENT = true

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { QueueRow } from './QueueRow.jsx'

function fixture(overrides = {}) {
  return {
    id: 'tire-1',
    mspn: 'ABC12',
    description: '11R22.5 steer',
    price: 180,
    priceIntel: { retailPrice: 240 },
    researchQueue: { at: Date.now(), by: 'system', reason: 'below-margin-floor', resolvedAt: null },
    ...overrides,
  }
}

describe('QueueRow', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders MSPN, description, and below-floor chip', () => {
    render(<QueueRow tire={fixture()} onResolve={vi.fn()} />)
    expect(screen.getByText('ABC12')).toBeTruthy()
    expect(screen.getByText('11R22.5 steer')).toBeTruthy()
    expect(screen.getByText('BELOW FLOOR')).toBeTruthy()
  })

  it('renders needs-research chip for unutilized reason', () => {
    render(
      <QueueRow
        tire={fixture({ researchQueue: { reason: 'unutilized-needs-research', resolvedAt: null } })}
        onResolve={vi.fn()}
      />,
    )
    expect(screen.getByText('NEEDS RESEARCH')).toBeTruthy()
  })

  it('punt dispatches onResolve with punt outcome immediately', async () => {
    const onResolve = vi.fn().mockResolvedValue(undefined)
    render(<QueueRow tire={fixture()} onResolve={onResolve} />)
    fireEvent.click(screen.getByRole('button', { name: 'Punt' }))
    expect(onResolve).toHaveBeenCalledWith('punt', undefined)
  })

  it('confirm-archive opens modal and dispatches on confirm', async () => {
    const onResolve = vi.fn().mockResolvedValue(undefined)
    render(<QueueRow tire={fixture()} onResolve={onResolve} />)
    fireEvent.click(screen.getByRole('button', { name: 'Confirm and archive' }))
    expect(
      screen.getByText(/This will archive ABC12 as permanently sub-floor/),
    ).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }))
    expect(onResolve).toHaveBeenCalledWith('confirm-archive', undefined)
  })

  it('retail-wrong form validates input must be a positive finite number', async () => {
    const onResolve = vi.fn().mockResolvedValue(undefined)
    render(<QueueRow tire={fixture()} onResolve={onResolve} />)
    fireEvent.click(screen.getByRole('button', { name: 'Retail was wrong' }))
    const input = screen.getByLabelText('Corrected retail')
    fireEvent.change(input, { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: 'Update retail' }))
    expect(onResolve).not.toHaveBeenCalled()
    expect(screen.getByText('Enter a positive number.')).toBeTruthy()

    fireEvent.change(input, { target: { value: '-5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Update retail' }))
    expect(onResolve).not.toHaveBeenCalled()

    fireEvent.change(input, { target: { value: 'abc' } })
    fireEvent.click(screen.getByRole('button', { name: 'Update retail' }))
    expect(onResolve).not.toHaveBeenCalled()
  })

  it('retail-wrong form dispatches retail-wrong with numeric new retail', async () => {
    const onResolve = vi.fn().mockResolvedValue(undefined)
    render(<QueueRow tire={fixture()} onResolve={onResolve} />)
    fireEvent.click(screen.getByRole('button', { name: 'Retail was wrong' }))
    const input = screen.getByLabelText('Corrected retail')
    fireEvent.change(input, { target: { value: '289.50' } })
    fireEvent.click(screen.getByRole('button', { name: 'Update retail' }))
    expect(onResolve).toHaveBeenCalledWith('retail-wrong', { newRetail: 289.5 })
  })

  it('readOnly mode hides action buttons and shows resolved-by label when provided', () => {
    render(
      <QueueRow tire={fixture()} onResolve={vi.fn()} readOnly resolvedBy="kyle" />,
    )
    expect(screen.queryByRole('button', { name: 'Punt' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Retail was wrong' })).toBeNull()
    expect(screen.getByText(/Resolved by kyle/)).toBeTruthy()
  })

  it('renders a placeholder when MSPN is missing', () => {
    render(<QueueRow tire={{ id: 'x', researchQueue: { reason: 'below-margin-floor' } }} onResolve={vi.fn()} />)
    const dashes = screen.getAllByText('—')
    expect(dashes.length).toBeGreaterThan(0)
  })
})
