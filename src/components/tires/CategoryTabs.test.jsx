/** @vitest-environment jsdom */
globalThis.IS_REACT_ACT_ENVIRONMENT = true

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { CategoryTabs } from './CategoryTabs.jsx'

afterEach(() => cleanup())

const baseCounts = { all: 1160, passenger: 490, lightTruck: 502, truck: 168 }

describe('CategoryTabs', () => {
  it('renders all four tabs with their labels and counts', () => {
    render(<CategoryTabs selected="all" counts={baseCounts} onSelect={() => {}} />)
    expect(screen.getByRole('tab', { name: /All — 1160/i })).toBeTruthy()
    expect(screen.getByRole('tab', { name: /Passenger — 490/i })).toBeTruthy()
    expect(screen.getByRole('tab', { name: /Light Truck — 502/i })).toBeTruthy()
    expect(screen.getByRole('tab', { name: /Truck — 168/i })).toBeTruthy()
  })

  it('marks the selected tab with aria-selected="true"', () => {
    render(<CategoryTabs selected="passenger" counts={baseCounts} onSelect={() => {}} />)
    expect(screen.getByRole('tab', { name: /Passenger — 490/i }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('tab', { name: /All — 1160/i }).getAttribute('aria-selected')).toBe('false')
  })

  it('emits onSelect with the right value when a tab is clicked', () => {
    const onSelect = vi.fn()
    render(<CategoryTabs selected="all" counts={baseCounts} onSelect={onSelect} />)
    fireEvent.click(screen.getByRole('tab', { name: /Light Truck — 502/i }))
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith('lightTruck')
  })

  it('renders gracefully when counts are zero or missing', () => {
    render(<CategoryTabs selected="all" counts={{ all: 0, passenger: 0, lightTruck: 0, truck: 0 }} onSelect={() => {}} />)
    expect(screen.getByRole('tab', { name: /^All — 0$/i })).toBeTruthy()
    expect(screen.getByRole('tab', { name: /^Truck — 0$/i })).toBeTruthy()
  })

  it('each tab is at least 44 pixels tall (WCAG 2.5.5 AAA)', () => {
    render(<CategoryTabs selected="all" counts={baseCounts} onSelect={() => {}} />)
    const tabs = screen.getAllByRole('tab')
    tabs.forEach((t) => {
      expect(t.className).toMatch(/min-h-\[44px\]/)
    })
  })

  it('only the active tab has tabIndex 0; others are -1 (roving tabindex)', () => {
    render(<CategoryTabs selected="passenger" counts={baseCounts} onSelect={() => {}} />)
    const tabs = screen.getAllByRole('tab')
    const tabIndexes = tabs.map((t) => t.getAttribute('tabindex'))
    // Order is all, passenger, lightTruck, truck — passenger is index 1
    expect(tabIndexes).toEqual(['-1', '0', '-1', '-1'])
  })

  it('arrow keys navigate between tabs and call onSelect', () => {
    const onSelect = vi.fn()
    render(<CategoryTabs selected="all" counts={baseCounts} onSelect={onSelect} />)
    const allTab = screen.getByRole('tab', { name: /All — 1160/i })

    fireEvent.keyDown(allTab, { key: 'ArrowRight' })
    expect(onSelect).toHaveBeenLastCalledWith('passenger')

    fireEvent.keyDown(allTab, { key: 'ArrowLeft' })
    expect(onSelect).toHaveBeenLastCalledWith('truck')

    fireEvent.keyDown(allTab, { key: 'End' })
    expect(onSelect).toHaveBeenLastCalledWith('truck')

    fireEvent.keyDown(allTab, { key: 'Home' })
    expect(onSelect).toHaveBeenLastCalledWith('all')
  })
})
