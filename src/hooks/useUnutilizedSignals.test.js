import { describe, expect, it } from 'vitest'
import { deriveUnutilizedSignals } from './useUnutilizedSignals'

const NOW = 1_700_000_000_000
const DAY = 24 * 60 * 60 * 1000

/**
 * Baseline qualifying tire (researched retail + positive opportunity + no
 * active listings + no open queue + not confirmed).
 */
function qualifyingTire(overrides = {}) {
  return {
    id: 'base',
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

describe('deriveUnutilizedSignals - rows', () => {
  it('includes a qualifying tire in rows', () => {
    const tire = qualifyingTire()
    const { rows } = deriveUnutilizedSignals([tire], NOW)
    expect(rows).toHaveLength(1)
    expect(rows[0].tire).toBe(tire)
    expect(rows[0].reasons.length).toBeGreaterThan(0)
    expect(rows[0].score.opportunity).toBeGreaterThan(0)
  })

  it('excludes every dimension individually', () => {
    const lowConfidence = qualifyingTire({
      id: 'lowConf',
      priceIntel: {
        retailPrice: 200,
        sources: [{ source: 'estimated_from_catalog_median', price: 200 }],
      },
    })
    const nonPositive = qualifyingTire({ id: 'nonPos', price: 1000 })
    // `listingStatus` reads wall-clock `Date.now()`, so active fixtures must
    // be anchored there rather than the synthetic NOW used for footer math.
    const activeTs = Date.now() - DAY
    const activeFacebook = qualifyingTire({
      id: 'activeFb',
      platformListings: { facebook: { lastPostedAt: activeTs } },
    })
    const activeOfferup = qualifyingTire({
      id: 'activeOu',
      platformListings: { offerup: { lastPostedAt: activeTs } },
    })
    const activeCraigslist = qualifyingTire({
      id: 'activeCl',
      platformListings: { craigslist: { lastPostedAt: activeTs } },
    })
    const openQueue = qualifyingTire({
      id: 'queue',
      researchQueue: { at: NOW - DAY, by: 'kyle', reason: 'below-margin-floor', resolvedAt: null },
    })
    const archived = qualifyingTire({ id: 'archived', marginConfirmed: true })
    const qualifying = qualifyingTire({ id: 'keeper' })

    const { rows } = deriveUnutilizedSignals(
      [
        lowConfidence,
        nonPositive,
        activeFacebook,
        activeOfferup,
        activeCraigslist,
        openQueue,
        archived,
        qualifying,
      ],
      NOW,
    )

    const ids = rows.map((r) => r.tire.id)
    expect(ids).toEqual(['keeper'])
  })

  it('sorts rows by opportunity descending', () => {
    // Higher retail -> higher net -> higher opportunity (weight is the same).
    const low = qualifyingTire({
      id: 'low',
      priceIntel: { retailPrice: 180, sources: [{ source: 'gemini_retail_search' }] },
    })
    const high = qualifyingTire({
      id: 'high',
      priceIntel: { retailPrice: 400, sources: [{ source: 'gemini_retail_search' }] },
    })
    const mid = qualifyingTire({
      id: 'mid',
      priceIntel: { retailPrice: 260, sources: [{ source: 'gemini_retail_search' }] },
    })

    const { rows } = deriveUnutilizedSignals([low, high, mid], NOW)
    expect(rows.map((r) => r.tire.id)).toEqual(['high', 'mid', 'low'])
  })

  it('caps rows at 25', () => {
    const many = Array.from({ length: 40 }, (_, i) =>
      qualifyingTire({
        id: `t${i}`,
        priceIntel: {
          retailPrice: 200 + i,
          sources: [{ source: 'gemini_retail_search' }],
        },
      }),
    )
    const { rows } = deriveUnutilizedSignals(many, NOW)
    expect(rows).toHaveLength(25)
  })
})

describe('deriveUnutilizedSignals - footerCounts', () => {
  it('counts inResearchThisWeek within the last 7 days across any reason', () => {
    const recent = qualifyingTire({
      id: 'recent',
      researchQueue: { at: NOW - 2 * DAY, reason: 'below-margin-floor', resolvedAt: null },
    })
    const old = qualifyingTire({
      id: 'old',
      researchQueue: { at: NOW - 10 * DAY, reason: 'below-margin-floor', resolvedAt: null },
    })
    const noQueue = qualifyingTire({ id: 'noQ' })
    const { footerCounts } = deriveUnutilizedSignals([recent, old, noQueue], NOW)
    expect(footerCounts.inResearchThisWeek).toBe(1)
  })

  it('counts listedThisWeek when ANY platform was posted in the last 7 days', () => {
    const recent = qualifyingTire({
      id: 'recent',
      platformListings: { facebook: { lastPostedAt: NOW - 2 * DAY } },
    })
    const stale = qualifyingTire({
      id: 'stale',
      platformListings: { facebook: { lastPostedAt: NOW - 10 * DAY } },
    })
    const never = qualifyingTire({ id: 'never' })
    const { footerCounts } = deriveUnutilizedSignals([recent, stale, never], NOW)
    expect(footerCounts.listedThisWeek).toBe(1)
  })

  it('handles Firestore timestamp objects via toMillis', () => {
    const tire = qualifyingTire({
      id: 'ts',
      platformListings: {
        facebook: { lastPostedAt: { toMillis: () => NOW - DAY } },
      },
      researchQueue: {
        at: { toMillis: () => NOW - DAY },
        reason: 'below-margin-floor',
        resolvedAt: null,
      },
    })
    const { footerCounts } = deriveUnutilizedSignals([tire], NOW)
    expect(footerCounts.inResearchThisWeek).toBe(1)
    expect(footerCounts.listedThisWeek).toBe(1)
  })

  it('tolerates non-array input', () => {
    const { rows, footerCounts } = deriveUnutilizedSignals(undefined, NOW)
    expect(rows).toEqual([])
    expect(footerCounts).toEqual({ inResearchThisWeek: 0, listedThisWeek: 0 })
  })
})
