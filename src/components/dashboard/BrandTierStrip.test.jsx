/** @vitest-environment jsdom */
import { describe, expect, it, vi, afterEach } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import { BrandTierStrip } from './BrandTierStrip.jsx'

afterEach(cleanup)

const aggregates = {
  total: 1228,
  brands: [
    { brand: 'MICHELIN', count: 627, avgListingMarginPct: 22.6, avgResearchedRetail: 280, offProgramCount: 0, missingRetailResearchCount: 12 },
    { brand: 'BFGOODRICH', count: 390, avgListingMarginPct: 19.4, avgResearchedRetail: 230, offProgramCount: 0, missingRetailResearchCount: 8 },
    { brand: 'UNIROYAL', count: 211, avgListingMarginPct: 17.1, avgResearchedRetail: 110, offProgramCount: 0, missingRetailResearchCount: 5 },
  ],
  missingBrands: [],
}

describe('BrandTierStrip', () => {
  it('renders one card per EXPECTED_BRAND', () => {
    const { container } = render(
      <BrandTierStrip aggregates={aggregates} navigate={() => {}} />
    )
    const cards = container.querySelectorAll('[data-brand-card]')
    expect(cards).toHaveLength(3)
  })

  it('renders a NOT STOCKED badge + zero-state styling on missing brands', () => {
    const empty = {
      total: 627,
      brands: [aggregates.brands[0]],
      missingBrands: ['BFGOODRICH', 'UNIROYAL'],
    }
    const { container } = render(
      <BrandTierStrip aggregates={empty} navigate={() => {}} />
    )
    const badges = container.querySelectorAll('[data-not-stocked]')
    expect(badges).toHaveLength(2)
    badges.forEach((b) => expect(b.textContent).toContain('NOT STOCKED'))
  })

  it('clicking a stocked card calls navigate with /tires?brand=<X>', () => {
    const spy = vi.fn()
    const { container } = render(
      <BrandTierStrip aggregates={aggregates} navigate={spy} />
    )
    const michelin = [...container.querySelectorAll('[data-brand-card]')]
      .find((c) => c.textContent.includes('MICHELIN'))
    fireEvent.click(michelin)
    expect(spy).toHaveBeenCalledWith('/tires?brand=MICHELIN')
  })
})
