import { describe, expect, it } from 'vitest'
import {
  computeFloor,
  computeNetPerTire,
  computeOpportunityScore,
  confidenceTier,
  confidenceWeight,
  retailConfidenceTier,
} from './opportunityScore'

const researchedTire = {
  price: 100,
  priceIntel: {
    retailPrice: 200,
    sources: [{ source: 'gemini_retail_search', price: 200 }],
  },
}

const estimatedTire = {
  price: 100,
  priceIntel: {
    retailPrice: 200,
    sources: [{ source: 'estimated_from_catalog_median', price: 200 }],
  },
}

describe('retailConfidenceTier', () => {
  it('returns high for primary Gemini researched retail', () => {
    expect(retailConfidenceTier(researchedTire)).toBe('high')
  })

  it('returns estimated for catalog-median fallback', () => {
    expect(retailConfidenceTier(estimatedTire)).toBe('estimated')
  })

  it('returns none when there is no retail at all', () => {
    expect(retailConfidenceTier({ price: 100 })).toBe('none')
  })

  it('keeps the old confidenceTier export as an alias', () => {
    expect(confidenceTier).toBe(retailConfidenceTier)
  })
})

describe('confidenceWeight', () => {
  it('maps each tier to a known weight', () => {
    expect(confidenceWeight('high')).toBe(1)
    expect(confidenceWeight('medium')).toBe(0.85)
    expect(confidenceWeight('estimated')).toBe(0.4)
    expect(confidenceWeight('none')).toBe(0)
  })
})

describe('computeFloor', () => {
  it('returns buy + overhead + fet', () => {
    expect(
      computeFloor({ price: 100, mountCost: 10, deliveryCost: 5, otherCost: 5, fet: 3 }),
    ).toBe(123)
  })

  it('returns null when buy is missing or zero', () => {
    expect(computeFloor({})).toBeNull()
    expect(computeFloor({ price: 0 })).toBeNull()
  })
})

describe('computeNetPerTire', () => {
  it('uses default 10% haggle when none provided', () => {
    // retail 200 * 0.9 = 180, minus buy 100, minus overhead 20, minus fet 0 = 60
    const tire = {
      price: 100,
      mountCost: 10,
      deliveryCost: 5,
      otherCost: 5,
      priceIntel: { retailPrice: 200, sources: [{ source: 'gemini_retail_search' }] },
    }
    expect(computeNetPerTire(tire)).toBe(60)
  })

  it('returns null when retail is missing', () => {
    expect(computeNetPerTire({ price: 100 })).toBeNull()
  })

  it('returns null when buy is missing', () => {
    expect(computeNetPerTire({ priceIntel: { retailPrice: 200 } })).toBeNull()
  })
})

describe('computeOpportunityScore', () => {
  it('returns a fully populated result for a researched tire', () => {
    const r = computeOpportunityScore(researchedTire, { haggleDiscount: 0.1 })
    expect(r.confidence).toBe('high')
    expect(r.confidenceWeight).toBe(1)
    expect(r.retail).toBe(200)
    expect(r.buy).toBe(100)
    expect(r.overhead).toBe(0)
    expect(r.fet).toBe(0)
    expect(r.walkawayPrice).toBeCloseTo(180, 6)
    // retail 200 * 0.9 - 100 buy = 80
    expect(r.netPerTire).toBeCloseTo(80, 6)
    expect(r.floor).toBe(100)
    expect(r.opportunity).toBeCloseTo(80, 6)
  })

  it('multiplies opportunity by 0.40 for estimated retail', () => {
    const r = computeOpportunityScore(estimatedTire, { haggleDiscount: 0.1 })
    expect(r.confidence).toBe('estimated')
    expect(r.confidenceWeight).toBe(0.4)
    expect(r.netPerTire).toBeCloseTo(80, 6)
    expect(r.opportunity).toBeCloseTo(32, 6)
  })

  it('reserves medium confidence for a non-researched, non-estimated retail path', () => {
    // Medium is a future-proofing hook. `tireRetailIsResearched` returns
    // true for any non-zero `priceIntel.retailPrice`, and the catalog has
    // no other code path today that yields a positive retail. The weight
    // mapping is still wired up for the day a new pipeline stamps a
    // retail outside the researched flag, so the contract deserves a test.
    expect(confidenceWeight('medium')).toBe(0.85)
    // Sanity: real catalog shapes never land in medium from the classifier.
    expect(retailConfidenceTier({ priceIntel: { retailPrice: 0 } })).toBe('none')
  })

  it('returns floor but null net/walkaway/opportunity when retail is missing', () => {
    const r = computeOpportunityScore({ price: 100, mountCost: 5 })
    expect(r.retail).toBeNull()
    expect(r.walkawayPrice).toBeNull()
    expect(r.netPerTire).toBeNull()
    expect(r.opportunity).toBeNull()
    expect(r.floor).toBe(105)
    expect(r.confidence).toBe('none')
    expect(r.confidenceWeight).toBe(0)
  })

  it('returns a null floor when buy is missing', () => {
    const r = computeOpportunityScore({ priceIntel: { retailPrice: 200, sources: [{ source: 'gemini_retail_search' }] } })
    expect(r.buy).toBeNull()
    expect(r.floor).toBeNull()
    expect(r.netPerTire).toBeNull()
    expect(r.opportunity).toBeNull()
  })

  it('returns a null floor when buy is zero', () => {
    const r = computeOpportunityScore({ price: 0, priceIntel: { retailPrice: 200 } })
    expect(r.buy).toBeNull()
    expect(r.floor).toBeNull()
  })

  it('clamps haggleDiscount above 0.30 to 0.30', () => {
    // retail 200 at 30% haggle = 140 walkaway, 140 - 100 buy = 40 net
    const r = computeOpportunityScore(researchedTire, { haggleDiscount: 0.5 })
    expect(r.walkawayPrice).toBeCloseTo(140, 6)
    expect(r.netPerTire).toBeCloseTo(40, 6)
  })

  it('defaults to a 10% haggle when opts is undefined', () => {
    const r = computeOpportunityScore(researchedTire)
    expect(r.walkawayPrice).toBeCloseTo(180, 6)
    expect(r.netPerTire).toBeCloseTo(80, 6)
  })

  it('subtracts overhead from the net and adds it to the floor', () => {
    const base = computeOpportunityScore(researchedTire, { haggleDiscount: 0.1 })
    const withOverhead = computeOpportunityScore(
      { ...researchedTire, mountCost: 10, deliveryCost: 5, otherCost: 5 },
      { haggleDiscount: 0.1 },
    )
    expect(withOverhead.floor - base.floor).toBe(20)
    expect(base.netPerTire - withOverhead.netPerTire).toBe(20)
  })

  it('treats FET as a separate cost in both floor and net', () => {
    const tire = { ...researchedTire, fet: 12 }
    const r = computeOpportunityScore(tire, { haggleDiscount: 0.1 })
    // floor = 100 + 0 + 12 = 112
    expect(r.floor).toBe(112)
    // net = 200 * 0.9 - 100 - 0 - 12 = 68
    expect(r.netPerTire).toBe(68)
  })

  it('returns a negative net gracefully when buy exceeds discounted retail', () => {
    const tire = {
      price: 300,
      priceIntel: { retailPrice: 200, sources: [{ source: 'gemini_retail_search' }] },
    }
    const r = computeOpportunityScore(tire, { haggleDiscount: 0.1 })
    // 200 * 0.9 - 300 = -120
    expect(r.netPerTire).toBeCloseTo(-120, 6)
    expect(r.opportunity).toBeCloseTo(-120, 6)
    expect(r.floor).toBe(300)
  })

  it('zeroes the opportunity contribution for a no-retail tire', () => {
    const r = computeOpportunityScore({ price: 100 })
    expect(r.opportunity).toBeNull()
    expect(r.confidenceWeight).toBe(0)
  })

  it('treats a non-finite haggleDiscount as the default 10%', () => {
    const r = computeOpportunityScore(researchedTire, { haggleDiscount: Number.NaN })
    expect(r.walkawayPrice).toBeCloseTo(180, 6)
    expect(r.netPerTire).toBeCloseTo(80, 6)
  })

  it('clamps negative haggleDiscount to zero', () => {
    const r = computeOpportunityScore(researchedTire, { haggleDiscount: -0.2 })
    expect(r.walkawayPrice).toBe(200)
    expect(r.netPerTire).toBe(100)
  })
})
