// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useBrandAggregates } from './useBrandAggregates.js'

const mkTire = (overrides) => ({
  id: 'T1',
  brand: 'MICHELIN',
  category: 'passenger',
  priceIntel: { retailPrice: 200, retailSource: 'gemini' },
  price: 100,
  offProgramAt: null,
  ...overrides,
})

describe('useBrandAggregates', () => {
  it('returns empty shape for empty input', () => {
    const { result } = renderHook(() => useBrandAggregates([], null))
    expect(result.current.total).toBe(0)
    expect(result.current.brands).toEqual([])
    expect(result.current.missingBrands).toEqual([
      'MICHELIN', 'BFGOODRICH', 'UNIROYAL',
    ])
  })

  it('counts tires per brand and sorts by count descending', () => {
    const tires = [
      mkTire({ id: '1', brand: 'MICHELIN' }),
      mkTire({ id: '2', brand: 'MICHELIN' }),
      mkTire({ id: '3', brand: 'BFGOODRICH' }),
    ]
    const { result } = renderHook(() => useBrandAggregates(tires, null))
    expect(result.current.total).toBe(3)
    expect(result.current.brands.map((b) => b.brand)).toEqual([
      'MICHELIN', 'BFGOODRICH',
    ])
    expect(result.current.brands[0].count).toBe(2)
    expect(result.current.brands[1].count).toBe(1)
    expect(result.current.missingBrands).toEqual(['UNIROYAL'])
  })

  it('normalizes brand strings (uppercase + trim, BFG -> BFGOODRICH)', () => {
    const tires = [
      mkTire({ id: '1', brand: 'bfg' }),
      mkTire({ id: '2', brand: '  Michelin  ' }),
      mkTire({ id: '3', brand: 'BFGoodrich' }),
    ]
    const { result } = renderHook(() => useBrandAggregates(tires, null))
    const buckets = Object.fromEntries(result.current.brands.map((b) => [b.brand, b.count]))
    expect(buckets.MICHELIN).toBe(1)
    expect(buckets.BFGOODRICH).toBe(2)
  })

  it('avg listing margin uses researched-only retails', () => {
    const tires = [
      // Researched retail $200, buy $100 -> listing margin 50%
      mkTire({ id: '1', brand: 'MICHELIN', price: 100, priceIntel: { retailPrice: 200, retailSource: 'gemini' } }),
      // Estimated retail -- excluded from margin avg
      mkTire({ id: '2', brand: 'MICHELIN', price: 100, priceIntel: { retailPrice: 150, retailSource: 'estimate' } }),
      // Researched retail $300, buy $100 -> margin 66.67%
      mkTire({ id: '3', brand: 'MICHELIN', price: 100, priceIntel: { retailPrice: 300, retailSource: 'gemini' } }),
    ]
    const { result } = renderHook(() => useBrandAggregates(tires, null))
    const m = result.current.brands[0]
    expect(m.count).toBe(3)
    // (50 + 66.666...) / 2 ~= 58.33
    expect(m.avgListingMarginPct).toBeCloseTo(58.33, 1)
    expect(m.avgResearchedRetail).toBe(250)
  })

  it('reports null avgs when brand has zero researched retails', () => {
    const tires = [
      mkTire({ id: '1', brand: 'UNIROYAL', priceIntel: { retailPrice: null } }),
      mkTire({ id: '2', brand: 'UNIROYAL', priceIntel: {} }),
    ]
    const { result } = renderHook(() => useBrandAggregates(tires, null))
    const u = result.current.brands.find((b) => b.brand === 'UNIROYAL')
    expect(u.count).toBe(2)
    expect(u.avgListingMarginPct).toBeNull()
    expect(u.avgResearchedRetail).toBeNull()
  })

  it('counts off-program and missing-research per brand', () => {
    const tires = [
      mkTire({ id: '1', brand: 'MICHELIN', offProgramAt: 'ts', priceIntel: { retailPrice: 100, retailSource: 'gemini' } }),
      mkTire({ id: '2', brand: 'MICHELIN', priceIntel: { retailPrice: null } }),
      mkTire({ id: '3', brand: 'MICHELIN', priceIntel: { retailPrice: 100, retailSource: 'gemini' } }),
    ]
    const { result } = renderHook(() => useBrandAggregates(tires, null))
    const m = result.current.brands[0]
    expect(m.offProgramCount).toBe(1)
    expect(m.missingRetailResearchCount).toBe(1)
  })

  it('scopes by category when provided', () => {
    const tires = [
      mkTire({ id: '1', brand: 'MICHELIN', category: 'passenger' }),
      mkTire({ id: '2', brand: 'MICHELIN', category: 'truck' }),
      mkTire({ id: '3', brand: 'BFGOODRICH', category: 'passenger' }),
    ]
    const { result } = renderHook(() =>
      useBrandAggregates(tires, 'passenger'),
    )
    expect(result.current.total).toBe(2)
    expect(result.current.brands.find((b) => b.brand === 'MICHELIN').count).toBe(1)
    expect(result.current.brands.find((b) => b.brand === 'BFGOODRICH').count).toBe(1)
    expect(result.current.missingBrands).toEqual(['UNIROYAL'])
  })

  it('groups untyped/empty brand under (unknown) but only emits when count > 0', () => {
    const tires = [
      mkTire({ id: '1', brand: 'MICHELIN' }),
      mkTire({ id: '2', brand: '' }),
      mkTire({ id: '3', brand: null }),
    ]
    const { result } = renderHook(() => useBrandAggregates(tires, null))
    const unknown = result.current.brands.find((b) => b.brand === '(unknown)')
    expect(unknown.count).toBe(2)
  })
})
