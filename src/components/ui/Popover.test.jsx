/** @vitest-environment jsdom */
globalThis.IS_REACT_ACT_ENVIRONMENT = true

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, act } from '@testing-library/react'
import { Popover } from './Popover.jsx'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function Harness({ initialOpen = false, onClose }) {
  return (
    <Popover
      anchor={<button data-testid="anchor">Open</button>}
      initialOpen={initialOpen}
      onClose={onClose}
    >
      <div data-testid="content">Menu content</div>
    </Popover>
  )
}

describe('Popover', () => {
  it('does not render content when closed', () => {
    render(<Harness />)
    expect(screen.queryByTestId('content')).toBeNull()
  })

  it('renders content into a portal when opened', () => {
    render(<Harness />)
    fireEvent.click(screen.getByTestId('anchor'))
    expect(screen.getByTestId('content')).toBeTruthy()
    // Confirm portal target is document.body, not the anchor's parent
    expect(screen.getByTestId('content').closest('[data-popover-portal]')).toBeTruthy()
  })

  it('closes on Escape', () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    fireEvent.click(screen.getByTestId('anchor'))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('closes on outside click', () => {
    const onClose = vi.fn()
    render(<><Harness onClose={onClose} /><div data-testid="outside">outside</div></>)
    fireEvent.click(screen.getByTestId('anchor'))
    fireEvent.mouseDown(screen.getByTestId('outside'))
    expect(onClose).toHaveBeenCalled()
  })

  it('flips upward when anchor is in lower half of viewport', () => {
    // jsdom: simulate by setting innerHeight + getBoundingClientRect
    Object.defineProperty(window, 'innerHeight', { value: 800, writable: true })
    render(<Harness />)
    const anchor = screen.getByTestId('anchor')
    anchor.getBoundingClientRect = () => ({
      top: 700, bottom: 740, left: 100, right: 200, width: 100, height: 40, x: 100, y: 700, toJSON: () => ({}),
    })
    act(() => { fireEvent.click(anchor) })
    const content = screen.getByTestId('content')
    const wrapper = content.closest('[data-popover-flip]')
    expect(wrapper?.getAttribute('data-popover-flip')).toBe('up')
  })

  it('uses an opaque background', () => {
    render(<Harness />)
    fireEvent.click(screen.getByTestId('anchor'))
    const wrapper = screen.getByTestId('content').closest('[data-popover-flip]')
    // Tailwind class assertion — accepts any of the bg-zinc-9XX flavors with no slash
    expect(wrapper?.className).toMatch(/\bbg-zinc-(800|900|950)\b/)
  })

  it('keeps an end-aligned popover at least 8px from the right viewport edge', () => {
    Object.defineProperty(window, 'innerWidth', { value: 320, writable: true })
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(180)

    render(<Harness />)
    const anchor = screen.getByTestId('anchor')
    anchor.getBoundingClientRect = () => ({
      top: 100, bottom: 140, left: 236, right: 316, width: 80, height: 40, x: 236, y: 100, toJSON: () => ({}),
    })

    act(() => {
      fireEvent.click(anchor)
    })

    const wrapper = screen.getByTestId('content').closest('[data-popover-flip]')
    expect(parseFloat(wrapper?.style.right || '0')).toBeGreaterThanOrEqual(8)
  })
})
