/** @vitest-environment jsdom */
import { describe, expect, it, vi, afterEach } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import { DiffStateTabs } from './DiffStateTabs.jsx'

afterEach(cleanup)

const counts = { mismatched: 12, invOnly: 47, eFleetOnly: 203, aligned: 1366, total: 1628 }

describe('DiffStateTabs', () => {
  it('renders the four states with counts', () => {
    const { container } = render(<DiffStateTabs counts={counts} active="mismatched" onChange={() => {}} />)
    const tabs = container.querySelectorAll('[role="tab"]')
    expect(tabs).toHaveLength(4)
    expect(tabs[0].textContent).toContain('Mismatched')
    expect(tabs[0].textContent).toContain('12')
    expect(tabs[1].textContent).toContain('47')
    expect(tabs[2].textContent).toContain('203')
    expect(tabs[3].textContent).toContain('1366')
  })

  it('marks the active tab aria-selected=true', () => {
    const { container } = render(<DiffStateTabs counts={counts} active="invOnly" onChange={() => {}} />)
    const tabs = container.querySelectorAll('[role="tab"]')
    expect(tabs[0].getAttribute('aria-selected')).toBe('false')
    expect(tabs[1].getAttribute('aria-selected')).toBe('true')
  })

  it('clicking a tab calls onChange with that state key', () => {
    const spy = vi.fn()
    const { container } = render(<DiffStateTabs counts={counts} active="mismatched" onChange={spy} />)
    const tabs = container.querySelectorAll('[role="tab"]')
    fireEvent.click(tabs[2])
    expect(spy).toHaveBeenCalledWith('eFleetOnly')
  })

  it('clicking the active tab does NOT call onChange', () => {
    const spy = vi.fn()
    const { container } = render(<DiffStateTabs counts={counts} active="mismatched" onChange={spy} />)
    const tabs = container.querySelectorAll('[role="tab"]')
    fireEvent.click(tabs[0])
    expect(spy).not.toHaveBeenCalled()
  })

  it('uses role=tablist on the container', () => {
    const { container } = render(<DiffStateTabs counts={counts} active="mismatched" onChange={() => {}} />)
    expect(container.querySelector('[role="tablist"]')).not.toBeNull()
  })
})
