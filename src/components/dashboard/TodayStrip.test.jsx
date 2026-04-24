/** @vitest-environment jsdom */

globalThis.IS_REACT_ACT_ENVIRONMENT = true

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { TodayStrip } from './TodayStrip.jsx'

afterEach(() => {
  cleanup()
})

const sellers = [
  { rank: 1, sku: 'AAA', description: 'A-tire', category: 'all-season', salesCount: 14 },
]

const MS_PER_DAY = 86_400_000

function renderStrip(props = {}) {
  return render(
    <MemoryRouter>
      <TodayStrip
        pendingOrders={3}
        topSellers={sellers}
        lastSale={{ amount: 1234.56, completedAtMs: Date.now() - MS_PER_DAY }}
        allTimeMargin={50000}
        loading={false}
        {...props}
      />
    </MemoryRouter>,
  )
}

describe('TodayStrip', () => {
  it('renders all four labels', () => {
    renderStrip()
    expect(screen.getByText(/pending orders/i)).toBeTruthy()
    expect(screen.getByText(/top sellers/i)).toBeTruthy()
    expect(screen.getByText(/last sale/i)).toBeTruthy()
    expect(screen.getByText(/total profit/i)).toBeTruthy()
  })

  it('renders the last-sale hero with formatted currency', () => {
    renderStrip()
    const hero = screen.getByTestId('hero-last-sale')
    expect(hero.textContent).toMatch(/\$1,234\.56/)
  })

  it('falls back to an empty-state message when lastSale is nullish', () => {
    renderStrip({ lastSale: null })
    expect(screen.getByTestId('hero-last-sale').textContent).toMatch(/no sales/i)
  })

  it('falls back to an empty-state message when amount is null', () => {
    renderStrip({ lastSale: { amount: null, completedAtMs: null } })
    expect(screen.getByTestId('hero-last-sale').textContent).toMatch(/no sales/i)
  })

  it('renders loading skeletons when loading', () => {
    const { container } = renderStrip({ loading: true })
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
  })

  it('flags the hero as stale when the last sale is 7+ days old', () => {
    renderStrip({
      lastSale: { amount: 500, completedAtMs: Date.now() - 8 * MS_PER_DAY },
    })
    expect(screen.getByTestId('hero-last-sale').dataset.stale).toBe('true')
  })

  it('leaves the hero fresh when the last sale is recent', () => {
    renderStrip({
      lastSale: { amount: 500, completedAtMs: Date.now() - 2 * MS_PER_DAY },
    })
    expect(screen.getByTestId('hero-last-sale').dataset.stale).toBe('false')
  })

  it('renders a days-ago caption for recent sales', () => {
    const { container } = renderStrip({
      lastSale: { amount: 500, completedAtMs: Date.now() - 3 * MS_PER_DAY },
    })
    expect(container.textContent).toMatch(/3 days ago/)
  })
})
