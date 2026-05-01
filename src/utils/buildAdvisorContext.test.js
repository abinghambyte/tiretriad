import { describe, expect, it } from 'vitest'
import { buildAdvisorContext } from './buildAdvisorContext.js'

const mkAggregates = () => ({
  total: 100,
  brands: [
    { brand: 'MICHELIN', count: 60, avgListingMarginPct: 22, avgResearchedRetail: 200, offProgramCount: 0, missingRetailResearchCount: 5 },
  ],
  missingBrands: [],
})

describe('buildAdvisorContext', () => {
  it('returns a stable empty-ish shape with no inputs', () => {
    const out = buildAdvisorContext({ brandAggregates: null, revenueStats: null, selectedTire: null })
    expect(out).toEqual({
      brandAggregates: { total: 0, brands: [], missingBrands: [] },
      revenueStats: null,
      selectedTire: null,
    })
  })

  it('passes brandAggregates through', () => {
    const out = buildAdvisorContext({ brandAggregates: mkAggregates(), revenueStats: null, selectedTire: null })
    expect(out.brandAggregates.total).toBe(100)
    expect(out.brandAggregates.brands[0].brand).toBe('MICHELIN')
  })

  it('serializes revenueStats keys we care about', () => {
    const out = buildAdvisorContext({
      brandAggregates: mkAggregates(),
      revenueStats: { mtdRevenue: 1, ytdRevenue: 2, completedCount30d: 3, completedCount90d: 4, extraField: 'noise' },
      selectedTire: null,
    })
    expect(out.revenueStats).toEqual({ mtdRevenue: 1, ytdRevenue: 2, completedCount30d: 3, completedCount90d: 4 })
  })

  it('serializes selectedTire to a tight shape', () => {
    const tire = {
      mspn: '12345',
      brand: 'MICHELIN',
      description: 'P255/55R18 109V',
      category: 'passenger',
      price: 100,
      priceIntel: { retailPrice: 200, sources: [{ source: 'gemini_retail_search' }] },
      listingMargin: 50,
      randomNoise: 'ignored',
    }
    const out = buildAdvisorContext({ brandAggregates: mkAggregates(), revenueStats: null, selectedTire: tire })
    expect(out.selectedTire).toEqual({
      mspn: '12345',
      brand: 'MICHELIN',
      description: 'P255/55R18 109V',
      category: 'passenger',
      price: 100,
      retailPrice: 200,
      listingMarginPct: 50,
    })
  })

  it('selectedTire retailPrice is null when no priceIntel.retailPrice', () => {
    const tire = { mspn: '1', brand: 'MICHELIN', description: '...', category: 'passenger', price: 100, priceIntel: {} }
    const out = buildAdvisorContext({ brandAggregates: mkAggregates(), revenueStats: null, selectedTire: tire })
    expect(out.selectedTire.retailPrice).toBeNull()
  })
})
