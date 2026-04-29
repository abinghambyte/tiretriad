/** @vitest-environment jsdom */
globalThis.IS_REACT_ACT_ENVIRONMENT = true

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useRef, useState } from 'react'
import { TiresFilterOverlay } from './TiresFilterOverlay.jsx'

afterEach(() => cleanup())

function StaticHarness({ open = true, onClose = () => {} }) {
  const toolbarRef = useRef(null)
  return (
    <div>
      <div ref={toolbarRef} data-testid="toolbar">toolbar</div>
      <TiresFilterOverlay toolbarRef={toolbarRef} open={open} onClose={onClose}>
        <div data-testid="filters-body">body</div>
      </TiresFilterOverlay>
    </div>
  )
}

function StatefulHarness() {
  const toolbarRef = useRef(null)
  const [open, setOpen] = useState(true)
  return (
    <div>
      <div ref={toolbarRef}>toolbar</div>
      <TiresFilterOverlay
        toolbarRef={toolbarRef}
        open={open}
        onClose={() => setOpen(false)}
      >
        <div>body</div>
      </TiresFilterOverlay>
    </div>
  )
}

describe('TiresFilterOverlay', () => {
  beforeEach(() => {
    Element.prototype.getBoundingClientRect = vi.fn(() => ({
      bottom: 200, top: 100, left: 0, right: 1000, width: 1000, height: 100,
      x: 0, y: 100, toJSON: () => ({}),
    }))
  })

  it('anchors overlay 4px below the toolbar bottom edge', () => {
    render(<StaticHarness open />)
    const panel = screen.getByRole('dialog', { name: /filter tires/i })
    expect(panel.style.top).toBe('204px')
  })

  it('closes overlay when the in-panel close button is clicked', () => {
    render(<StatefulHarness />)
    const closeBtn = screen.getByRole('button', { name: /close filters/i })
    fireEvent.click(closeBtn)
    expect(screen.queryByRole('dialog', { name: /filter tires/i })).toBeNull()
  })

  it('re-measures overlay top on window scroll', () => {
    render(<StaticHarness open />)
    const panel = screen.getByRole('dialog', { name: /filter tires/i })
    expect(panel.style.top).toBe('204px')
    Element.prototype.getBoundingClientRect = vi.fn(() => ({
      bottom: 400, top: 300, left: 0, right: 1000, width: 1000, height: 100,
      x: 0, y: 300, toJSON: () => ({}),
    }))
    act(() => {
      window.dispatchEvent(new Event('scroll'))
    })
    expect(panel.style.top).toBe('404px')
  })
})
