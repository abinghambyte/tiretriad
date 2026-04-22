/** @vitest-environment jsdom */

globalThis.IS_REACT_ACT_ENVIRONMENT = true

import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { TopSellersCard } from './TopSellersCard.jsx'

const sellers = [
  { rank: 1, sku: 'AAA', description: 'A-tire', category: 'all-season', salesCount: 14 },
  { rank: 2, sku: 'BBB', description: 'B-tire', category: 'winter', salesCount: 9 },
]

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('TopSellersCard', () => {
  it('renders rank, sold count, SKU, description and SOLD caption for the current slot', () => {
    render(<TopSellersCard sellers={sellers} />)
    expect(screen.getByText('1')).toBeTruthy()
    expect(screen.getByText('14')).toBeTruthy()
    expect(screen.getByText('AAA')).toBeTruthy()
    expect(screen.getByText('A-tire')).toBeTruthy()
    expect(screen.getByText(/SOLD/i)).toBeTruthy()
  })

  it('renders an empty state when sellers is empty', () => {
    render(<TopSellersCard sellers={[]} />)
    expect(screen.getByText(/no sales yet/i)).toBeTruthy()
  })

  it('cycles to the next seller after the interval elapses', () => {
    vi.useFakeTimers()
    render(<TopSellersCard sellers={sellers} intervalMs={3000} />)
    expect(screen.getByText('AAA')).toBeTruthy()
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(screen.getByText('BBB')).toBeTruthy()
  })

  it('pauses cycling while hovered', () => {
    vi.useFakeTimers()
    const { container } = render(<TopSellersCard sellers={sellers} intervalMs={3000} />)
    fireEvent.mouseEnter(container.firstChild)
    act(() => {
      vi.advanceTimersByTime(9000)
    })
    expect(screen.getByText('AAA')).toBeTruthy()
  })
})
