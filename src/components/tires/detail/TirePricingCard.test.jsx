/** @vitest-environment jsdom */
import { describe, expect, it, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { TirePricingCard } from './TirePricingCard.jsx'

afterEach(cleanup)

const baseTire = {
  id: '12345',
  mspn: '12345',
  brand: 'MICHELIN',
  description: 'P255/55R18 109V',
  price: 100,
  fet: 0,
  priceIntel: { retailPrice: 200, sources: [{ source: 'gemini_retail_search' }] },
}

describe('TirePricingCard', () => {
  it('renders Buy / Retail / FET / Margin rows', () => {
    const { container } = render(<TirePricingCard tire={baseTire} efleetRecord={null} efleetDate={null} />)
    expect(container.textContent).toContain('Buy')
    expect(container.textContent).toContain('Retail')
    expect(container.textContent).toContain('FET')
    expect(container.textContent).toContain('Margin')
    expect(container.textContent).toMatch(/\$100/)
    expect(container.textContent).toMatch(/\$200/)
  })

  it('renders eFleet provenance when efleetRecord + efleetDate provided', () => {
    const ef = { fet: 0, price: 100, brand: 'MICHELIN', description: '...', lr: '', tread: '...' }
    const { container } = render(
      <TirePricingCard tire={baseTire} efleetRecord={ef} efleetDate="2026-04-29" />,
    )
    expect(container.textContent).toContain('Michelin eFleet')
    expect(container.textContent).toContain('2026-04-29')
  })

  it('renders the not-from-eFleet message when no efleetRecord', () => {
    const { container } = render(<TirePricingCard tire={baseTire} efleetRecord={null} efleetDate={null} />)
    expect(container.textContent).toMatch(/not from a known eFleet import/i)
  })

  it('renders a drift line when portal price differs from eFleet price', () => {
    const ef = { fet: 0, price: 150, brand: 'MICHELIN', description: '...', lr: '', tread: '...' }
    const { container } = render(
      <TirePricingCard tire={baseTire} efleetRecord={ef} efleetDate="2026-04-29" />,
    )
    expect(container.textContent).toMatch(/eFleet/)
    expect(container.textContent).toMatch(/disagrees/i)
  })

  it('renders Retail as -- when no priceIntel.retailPrice', () => {
    const tire = { ...baseTire, priceIntel: {} }
    const { container } = render(<TirePricingCard tire={tire} efleetRecord={null} efleetDate={null} />)
    expect(container.textContent).toMatch(/Retail.*--/s)
  })

  it('renders Margin as -- when no retail', () => {
    const tire = { ...baseTire, priceIntel: {} }
    const { container } = render(<TirePricingCard tire={tire} efleetRecord={null} efleetDate={null} />)
    expect(container.textContent).toMatch(/Margin.*--/s)
  })
})
