import { describe, expect, it } from 'vitest'
import { computeMargin, computeListingMargin, marginPercent } from './marginCalc'

describe('computeMargin (headroom vs buy)', () => {
  it('returns (buy - overhead) / buy * 100', () => {
    expect(computeMargin({ price: 100, mountCost: 10, deliveryCost: 5, otherCost: 5 })).toBe(80)
  })

  it('returns 100% when overhead is zero (the dashboard-health case)', () => {
    expect(computeMargin({ price: 500 })).toBe(100)
  })

  it('returns null when there is no buy cost at all', () => {
    expect(computeMargin({})).toBeNull()
    expect(computeMargin({ price: 0 })).toBeNull()
  })

  it('allows negative headroom if overhead > buy (catalog data bug signal)', () => {
    expect(computeMargin({ price: 100, mountCost: 150 })).toBe(-50)
  })
})

describe('computeListingMargin (retail vs buy)', () => {
  const tireWithRetail = {
    price: 600,
    priceIntel: { retailPrice: 800 },
  }

  it('returns (retail - buy) / retail * 100 using researched retail', () => {
    // (800 - 600) / 800 = 0.25 -> 25%
    expect(computeListingMargin(tireWithRetail)).toBe(25)
  })

  it('returns null when researched retail is missing', () => {
    expect(computeListingMargin({ price: 600 })).toBeNull()
    expect(computeListingMargin({ price: 600, priceIntel: {} })).toBeNull()
    expect(computeListingMargin({ price: 600, priceIntel: { retailPrice: 0 } })).toBeNull()
  })

  it('returns null when buy cost is missing', () => {
    expect(computeListingMargin({ priceIntel: { retailPrice: 800 } })).toBeNull()
    expect(computeListingMargin({ price: 0, priceIntel: { retailPrice: 800 } })).toBeNull()
  })

  it('returns null when neither value is populated', () => {
    expect(computeListingMargin({})).toBeNull()
    expect(computeListingMargin(null)).toBeNull()
  })

  it('allows negative margin when retail is below buy (bad research hit / wrong match)', () => {
    expect(computeListingMargin({ price: 800, priceIntel: { retailPrice: 600 } })).toBeCloseTo(-33.33, 1)
  })

  it('uses priceIntel.activeBuyPrice when Kyle-confirmed', () => {
    const tire = {
      price: 600,
      priceIntel: { activeBuyPrice: 500, retailPrice: 800 },
    }
    // (800 - 500) / 800 = 0.375 -> 37.5%
    expect(computeListingMargin(tire)).toBe(37.5)
  })
})

describe('marginPercent helper', () => {
  it('returns ((ref - overhead) / ref) * 100', () => {
    expect(marginPercent(100, 20)).toBe(80)
  })

  it('returns null on invalid inputs', () => {
    expect(marginPercent(null, 20)).toBeNull()
    expect(marginPercent(100, null)).toBeNull()
    expect(marginPercent(NaN, 20)).toBeNull()
    expect(marginPercent(0, 20)).toBeNull()
    expect(marginPercent(-10, 20)).toBeNull()
  })
})
