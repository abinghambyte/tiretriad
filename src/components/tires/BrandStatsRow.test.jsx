/** @vitest-environment jsdom */
import { describe, expect, it, vi, afterEach } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import { BrandStatsRow } from './BrandStatsRow.jsx'

afterEach(cleanup)

const sample = {
  total: 1228,
  brands: [
    { brand: 'MICHELIN', count: 627, avgListingMarginPct: 22.6, avgResearchedRetail: 280, offProgramCount: 0, missingRetailResearchCount: 12 },
    { brand: 'BFGOODRICH', count: 390, avgListingMarginPct: 19.4, avgResearchedRetail: 230, offProgramCount: 0, missingRetailResearchCount: 8 },
    { brand: 'UNIROYAL', count: 211, avgListingMarginPct: 17.1, avgResearchedRetail: 110, offProgramCount: 0, missingRetailResearchCount: 5 },
  ],
}

describe('BrandStatsRow', () => {
  it('renders the All pill plus a pill per brand', () => {
    const { container } = render(
      <BrandStatsRow brands={sample.brands} total={sample.total} selectedBrand={null} onBrandChange={() => {}} />
    )
    const pills = container.querySelectorAll('[role="tab"]')
    expect(pills).toHaveLength(4)
    expect(pills[0].textContent).toContain('All')
    expect(pills[0].textContent).toContain('1228')
  })

  it('marks the All pill aria-selected when selectedBrand is null', () => {
    const { container } = render(
      <BrandStatsRow brands={sample.brands} total={sample.total} selectedBrand={null} onBrandChange={() => {}} />
    )
    const pills = container.querySelectorAll('[role="tab"]')
    expect(pills[0].getAttribute('aria-selected')).toBe('true')
    expect(pills[1].getAttribute('aria-selected')).toBe('false')
  })

  it('marks the matching brand pill aria-selected when selectedBrand is set', () => {
    const { container } = render(
      <BrandStatsRow brands={sample.brands} total={sample.total} selectedBrand="BFGOODRICH" onBrandChange={() => {}} />
    )
    const pills = container.querySelectorAll('[role="tab"]')
    expect(pills[0].getAttribute('aria-selected')).toBe('false')
    const bfg = [...pills].find((p) => p.textContent.includes('BFGOODRICH'))
    expect(bfg.getAttribute('aria-selected')).toBe('true')
  })

  it('clicking a brand pill calls onBrandChange with the brand name', () => {
    const spy = vi.fn()
    const { container } = render(
      <BrandStatsRow brands={sample.brands} total={sample.total} selectedBrand={null} onBrandChange={spy} />
    )
    const michelin = [...container.querySelectorAll('[role="tab"]')]
      .find((p) => p.textContent.includes('MICHELIN'))
    fireEvent.click(michelin)
    expect(spy).toHaveBeenCalledWith('MICHELIN')
  })

  it('clicking the All pill calls onBrandChange(null)', () => {
    const spy = vi.fn()
    const { container } = render(
      <BrandStatsRow brands={sample.brands} total={sample.total} selectedBrand="MICHELIN" onBrandChange={spy} />
    )
    const all = container.querySelector('[role="tab"]')
    fireEvent.click(all)
    expect(spy).toHaveBeenCalledWith(null)
  })

  it('clicking the already-selected pill does NOT call onBrandChange', () => {
    const spy = vi.fn()
    const { container } = render(
      <BrandStatsRow brands={sample.brands} total={sample.total} selectedBrand="MICHELIN" onBrandChange={spy} />
    )
    const michelin = [...container.querySelectorAll('[role="tab"]')]
      .find((p) => p.textContent.includes('MICHELIN'))
    fireEvent.click(michelin)
    expect(spy).not.toHaveBeenCalled()
  })

  it('uses role=tablist on the container', () => {
    const { container } = render(
      <BrandStatsRow brands={sample.brands} total={sample.total} selectedBrand={null} onBrandChange={() => {}} />
    )
    expect(container.querySelector('[role="tablist"]')).not.toBeNull()
  })
})
