import { describe, expect, it } from 'vitest'
import { computeMargin, computeListingMargin, computeBundleQuote, marginPercent } from './marginCalc'

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

describe('computeBundleQuote (Quote modal math)', () => {
  it('computes totals and margin % for a standard set of 4 at $299', () => {
    // 4 tires × $299 sale = $1196 revenue
    // 4 × ($150 buy + $30 overhead) = $720 cost (FET omitted, already in buy)
    // profit = $476, margin = 476 / 1196 ≈ 39.80%
    const r = computeBundleQuote({
      qty: 4,
      salePrice: 299,
      buyPerTire: 150,
      overheadPerTire: 30,
    })
    expect(r.qty).toBe(4)
    expect(r.salePrice).toBe(299)
    expect(r.buyTotal).toBe(600)
    expect(r.overheadTotal).toBe(120)
    expect(r.fetTotal).toBe(0)
    expect(r.costTotal).toBe(720)
    expect(r.revenueTotal).toBe(1196)
    expect(r.profitTotal).toBe(476)
    expect(r.marginPct).toBeCloseTo(39.799, 2)
  })

  it('treats FET as a separate line when the caller opts into it', () => {
    const r = computeBundleQuote({
      qty: 2,
      salePrice: 200,
      buyPerTire: 100,
      overheadPerTire: 20,
      fetPerTire: 5,
    })
    expect(r.fetTotal).toBe(10)
    expect(r.costTotal).toBe(250) // 2 × (100 + 20 + 5)
    expect(r.revenueTotal).toBe(400)
    expect(r.profitTotal).toBe(150)
    expect(r.marginPct).toBe(37.5)
  })

  it('returns null marginPct when revenue is zero so the UI can render a dash', () => {
    const r = computeBundleQuote({
      qty: 4,
      salePrice: 0,
      buyPerTire: 150,
      overheadPerTire: 30,
    })
    expect(r.revenueTotal).toBe(0)
    expect(r.marginPct).toBeNull()
  })

  it('allows negative margin when sale price is below all-in cost', () => {
    const r = computeBundleQuote({
      qty: 1,
      salePrice: 100,
      buyPerTire: 120,
      overheadPerTire: 30,
    })
    // profit = 100 - 150 = -50, margin = -50/100 = -50%
    expect(r.profitTotal).toBe(-50)
    expect(r.marginPct).toBe(-50)
  })

  it('coerces non-numeric / negative inputs to zero so totals stay finite', () => {
    const r = computeBundleQuote({
      qty: -2,
      salePrice: 'nope',
      buyPerTire: undefined,
      overheadPerTire: null,
    })
    expect(r.qty).toBe(0)
    expect(r.salePrice).toBe(0)
    expect(r.buyTotal).toBe(0)
    expect(r.revenueTotal).toBe(0)
    expect(r.marginPct).toBeNull()
  })
})
