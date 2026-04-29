/** @vitest-environment jsdom */
globalThis.IS_REACT_ACT_ENVIRONMENT = true

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { TiresFilterOverlay } from './TiresFilterOverlay.jsx'

afterEach(() => cleanup())

function StatefulHarness() {
  const [open, setOpen] = useState(true)
  return (
    <TiresFilterOverlay open={open} onClose={() => setOpen(false)}>
      <div data-testid="filters-body">body</div>
    </TiresFilterOverlay>
  )
}

describe('TiresFilterOverlay', () => {
  it('renders nothing when closed', () => {
    render(<TiresFilterOverlay open={false} onClose={() => {}}>body</TiresFilterOverlay>)
    expect(screen.queryByRole('region', { name: /filter tires/i })).toBeNull()
  })

  it('renders inline panel with children when open', () => {
    render(
      <TiresFilterOverlay open onClose={() => {}}>
        <div data-testid="filters-body">body</div>
      </TiresFilterOverlay>,
    )
    const panel = screen.getByRole('region', { name: /filter tires/i })
    expect(panel).toBeTruthy()
    expect(screen.getByTestId('filters-body')).toBeTruthy()
    // Inline rendering: no fixed positioning, no inline `top` style.
    expect(panel.style.position).toBe('')
    expect(panel.style.top).toBe('')
  })

  it('closes when the in-panel close button is clicked', () => {
    render(<StatefulHarness />)
    const closeBtn = screen.getByRole('button', { name: /close filters/i })
    fireEvent.click(closeBtn)
    expect(screen.queryByRole('region', { name: /filter tires/i })).toBeNull()
  })
})
