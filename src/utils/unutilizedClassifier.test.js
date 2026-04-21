import { describe, expect, it } from 'vitest'
import { PLATFORMS, isUnutilized, unutilizedReasons } from './unutilizedClassifier'

/**
 * A baseline tire that should qualify: researched retail (high confidence),
 * positive opportunity, no active listing anywhere, no open research queue,
 * not terminally archived.
 */
function qualifyingTire(overrides = {}) {
  return {
    price: 100,
    mountCost: 10,
    deliveryCost: 5,
    otherCost: 5,
    priceIntel: {
      retailPrice: 200,
      sources: [{ source: 'gemini_retail_search', price: 200 }],
    },
    platformListings: {},
    researchQueue: null,
    ...overrides,
  }
}

/** An active listing payload stamped "now" so it is fresher than the 7-day threshold. */
function activeListing() {
  return { lastPostedAt: Date.now() }
}

describe('PLATFORMS', () => {
  it('lists the three currently-integrated platforms without eBay', () => {
    expect(PLATFORMS).toEqual(['facebook', 'offerup', 'craigslist'])
    expect(PLATFORMS).not.toContain('ebay')
  })
})

describe('isUnutilized', () => {
  it('returns true for a qualifying tire', () => {
    expect(isUnutilized(qualifyingTire())).toBe(true)
  })

  it('returns false when opportunity is not positive (no buy means no opportunity)', () => {
    expect(isUnutilized(qualifyingTire({ price: 0 }))).toBe(false)
  })

  it('returns false when confidence is estimated (low)', () => {
    const estimated = qualifyingTire({
      priceIntel: {
        retailPrice: 200,
        sources: [{ source: 'estimated_from_catalog_median', price: 200 }],
      },
    })
    expect(isUnutilized(estimated)).toBe(false)
  })

  it('returns false when confidence is none (no retail)', () => {
    expect(isUnutilized(qualifyingTire({ priceIntel: undefined }))).toBe(false)
  })

  for (const platform of ['facebook', 'offerup', 'craigslist']) {
    it(`returns false when there is an active listing on ${platform}`, () => {
      const tire = qualifyingTire({
        platformListings: { [platform]: activeListing() },
      })
      expect(isUnutilized(tire)).toBe(false)
    })
  }

  it('still qualifies when a platform listing is stale (not active)', () => {
    const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000
    const tire = qualifyingTire({
      platformListings: { facebook: { lastPostedAt: eightDaysAgo } },
    })
    expect(isUnutilized(tire)).toBe(true)
  })

  it('returns false when researchQueue has an open entry', () => {
    const tire = qualifyingTire({
      researchQueue: { at: Date.now(), by: 'kyle', reason: 'below-margin-floor', resolvedAt: null },
    })
    expect(isUnutilized(tire)).toBe(false)
  })

  it('still qualifies when researchQueue entry is resolved', () => {
    const tire = qualifyingTire({
      researchQueue: {
        at: Date.now() - 86400000,
        by: 'kyle',
        reason: 'below-margin-floor',
        resolvedAt: Date.now(),
      },
    })
    expect(isUnutilized(tire)).toBe(true)
  })

  it('returns false when marginConfirmed is true (terminal archive)', () => {
    expect(isUnutilized(qualifyingTire({ marginConfirmed: true }))).toBe(false)
  })

  it('returns false for null / non-object input', () => {
    expect(isUnutilized(null)).toBe(false)
    expect(isUnutilized(undefined)).toBe(false)
  })

  it('combined exclusions still return false', () => {
    const tire = qualifyingTire({
      marginConfirmed: true,
      researchQueue: { at: Date.now(), resolvedAt: null },
      platformListings: { facebook: activeListing() },
    })
    expect(isUnutilized(tire)).toBe(false)
  })
})

describe('unutilizedReasons', () => {
  it('tags a researched tire as high opportunity', () => {
    const reasons = unutilizedReasons(qualifyingTire())
    expect(reasons).toContain('high opportunity')
  })

  it('produces opportunity tags aligned with the confidence tier', () => {
    // Current data model only emits 'high' or 'estimated' as a researched
    // retail tier; 'medium' is reserved for a future manual-entry path. The
    // tag output tracks the tier, so high-confidence tires get
    // 'high opportunity' and nothing for the lower tiers.
    const highTire = qualifyingTire()
    expect(unutilizedReasons(highTire)).toContain('high opportunity')
  })

  it('reports "never listed" when no platform has ever been posted', () => {
    const reasons = unutilizedReasons(qualifyingTire())
    expect(reasons).toContain('never listed')
  })

  it('reports stale counts when some platforms have stale listings', () => {
    const staleTs = Date.now() - 8 * 24 * 60 * 60 * 1000
    const tire = qualifyingTire({
      platformListings: {
        facebook: { lastPostedAt: staleTs },
        offerup: { lastPostedAt: staleTs },
      },
    })
    const reasons = unutilizedReasons(tire)
    expect(reasons).toContain('2 stale')
    expect(reasons).toContain('1 never')
  })

  it('keeps every tag lowercase and under 20 chars', () => {
    const staleTs = Date.now() - 8 * 24 * 60 * 60 * 1000
    const tire = qualifyingTire({
      platformListings: {
        facebook: { lastPostedAt: staleTs },
        offerup: { lastPostedAt: staleTs },
        craigslist: { lastPostedAt: staleTs },
      },
    })
    const reasons = unutilizedReasons(tire)
    for (const tag of reasons) {
      expect(tag).toBe(tag.toLowerCase())
      expect(tag.length).toBeLessThan(20)
    }
  })
})
