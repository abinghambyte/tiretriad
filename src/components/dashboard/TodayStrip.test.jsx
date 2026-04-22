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

function renderStrip(props = {}) {
  return render(
    <MemoryRouter>
      <TodayStrip
        pendingOrders={3}
        topSellers={sellers}
        todayRevenue={1234.56}
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
    expect(screen.getByText(/today revenue/i)).toBeTruthy()
    expect(screen.getByText(/total profit/i)).toBeTruthy()
  })

  it('renders the hero-revenue test id with formatted currency', () => {
    renderStrip()
    const hero = screen.getByTestId('hero-revenue')
    expect(hero).toBeTruthy()
    expect(hero.textContent).toMatch(/\$1,234\.56/)
  })

  it('falls back to $0.00 when todayRevenue is nullish', () => {
    renderStrip({ todayRevenue: null })
    expect(screen.getByTestId('hero-revenue').textContent).toMatch(/\$0\.00/)
  })

  it('renders loading skeletons when loading', () => {
    const { container } = renderStrip({ loading: true })
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
  })

  it('marks hero revenue hot when today exceeds the rolling average', () => {
    renderStrip({ todayRevenue: 2000, rollingAverageRevenue: 1000 })
    expect(screen.getByTestId('hero-revenue').dataset.hot).toBe('true')
  })

  it('leaves hero cool when today does not exceed the rolling average', () => {
    renderStrip({ todayRevenue: 500, rollingAverageRevenue: 1000 })
    expect(screen.getByTestId('hero-revenue').dataset.hot).toBe('false')
  })

  it('leaves hero cool when rollingAverageRevenue is null (warmup)', () => {
    renderStrip({ todayRevenue: 5000, rollingAverageRevenue: null })
    expect(screen.getByTestId('hero-revenue').dataset.hot).toBe('false')
  })
})
