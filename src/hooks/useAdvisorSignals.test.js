// src/hooks/useAdvisorSignals.test.js
import { describe, it, expect } from 'vitest'
import {
  computeDaysSincePriceChange,
  computeAvgDaysToSell,
  buildEnrichedTires,
} from './useAdvisorSignals.js'

function ts(iso) {
  const ms = new Date(iso).getTime()
  return { toMillis: () => ms }
}

describe('computeDaysSincePriceChange', () => {
  it('returns days since latest priceIntel.sources entry (using `at`)', () => {
    const now = new Date('2026-04-22T00:00:00Z').getTime()
    const tire = {
      priceIntel: {
        sources: [
          { price: 300, at: ts('2026-01-01T00:00:00Z') },
          { price: 280, at: ts('2026-03-19T00:00:00Z') },
        ],
      },
    }
    expect(computeDaysSincePriceChange(tire, now)).toBe(34)
  })

  it('accepts `recordedAt` from the Slack writer path', () => {
    const now = new Date('2026-04-22T00:00:00Z').getTime()
    const tire = {
      priceIntel: {
        sources: [
          { price: 280, recordedAt: ts('2026-04-20T00:00:00Z') },
        ],
      },
    }
    expect(computeDaysSincePriceChange(tire, now)).toBe(2)
  })

  it('returns 0 when priceIntel.sources is missing or empty', () => {
    expect(computeDaysSincePriceChange({}, Date.now())).toBe(0)
    expect(computeDaysSincePriceChange({ priceIntel: {} }, Date.now())).toBe(0)
    expect(computeDaysSincePriceChange({ priceIntel: { sources: [] } }, Date.now())).toBe(0)
  })

  it('ignores entries with missing timestamps', () => {
    const now = new Date('2026-04-22T00:00:00Z').getTime()
    const tire = {
      priceIntel: {
        sources: [
          { price: 300, at: null },
          { price: 280, at: ts('2026-04-20T00:00:00Z') },
        ],
      },
    }
    expect(computeDaysSincePriceChange(tire, now)).toBe(2)
  })
})

describe('computeAvgDaysToSell', () => {
  it('joins orders to tires by mspn and averages completedAt - tire.createdAt per size+LR', () => {
    const tires = [
      { id: 'AAA', mspn: 'AAA', size: '265/70R17', lr: 'E', createdAt: ts('2026-01-01') },
      { id: 'BBB', mspn: 'BBB', size: '265/70R17', lr: 'E', createdAt: ts('2026-02-01') },
      { id: 'CCC', mspn: 'CCC', size: '235/75R15', lr: 'D', createdAt: ts('2026-01-01') },
    ]
    const orders = [
      { status: 'completed', mspn: 'AAA', completedAt: ts('2026-01-11') },
      { status: 'completed', mspn: 'BBB', completedAt: ts('2026-02-21') },
      { status: 'completed', mspn: 'CCC', completedAt: ts('2026-01-31') },
    ]
    const result = computeAvgDaysToSell(orders, tires)
    expect(result['265/70R17|E']).toEqual({ avgDaysToSell: 15, sampleSize: 2 })
    expect(result['235/75R15|D']).toEqual({ avgDaysToSell: 30, sampleSize: 1 })
  })

  it('filters out non-completed orders', () => {
    const tires = [{ id: 'AAA', mspn: 'AAA', size: '265/70R17', lr: 'E', createdAt: ts('2026-01-01') }]
    const orders = [
      { status: 'pending', mspn: 'AAA', completedAt: ts('2026-01-11') },
      { status: 'cancelled', mspn: 'AAA', completedAt: ts('2026-01-11') },
    ]
    expect(computeAvgDaysToSell(orders, tires)).toEqual({})
  })

  it('skips orders whose tire has no createdAt or whose order has no completedAt', () => {
    const tires = [
      { id: 'AAA', mspn: 'AAA', size: '265/70R17', lr: 'E' },
      { id: 'BBB', mspn: 'BBB', size: '265/70R17', lr: 'E', createdAt: ts('2026-01-01') },
    ]
    const orders = [
      { status: 'completed', mspn: 'AAA', completedAt: ts('2026-01-11') },
      { status: 'completed', mspn: 'BBB', completedAt: null },
    ]
    expect(computeAvgDaysToSell(orders, tires)).toEqual({})
  })

  it('skips orders with no matching tire in the tire list', () => {
    const tires = [{ id: 'AAA', mspn: 'AAA', size: '265/70R17', lr: 'E', createdAt: ts('2026-01-01') }]
    const orders = [{ status: 'completed', mspn: 'ZZZ', completedAt: ts('2026-01-11') }]
    expect(computeAvgDaysToSell(orders, tires)).toEqual({})
  })
})

describe('buildEnrichedTires', () => {
  it('attaches daysInStock, daysSincePriceChange, velocity, margin, missingPlatformCount', () => {
    const now = new Date('2026-04-22T00:00:00Z').getTime()
    const tires = [
      {
        id: 't1',
        mspn: 't1',
        size: '265/70R17',
        lr: 'E',
        price: 180, // canonical buy cost per AGENTS.md
        mountCost: 10,
        deliveryCost: 5,
        otherCost: 5,
        createdAt: ts('2026-01-22T00:00:00Z'), // 90 days before now
        priceIntel: {
          retailPrice: 300,
          sources: [{ price: 300, at: ts('2026-03-22T00:00:00Z') }],
        },
        platformListings: {
          facebook: { lastPostedAt: ts('2026-04-20T00:00:00Z') }, // active (2 days ago)
          // offerup + craigslist absent -> missing
        },
      },
    ]
    const velocityBySize = { '265/70R17|E': { avgDaysToSell: 18, sampleSize: 6 } }
    const [enriched] = buildEnrichedTires(tires, velocityBySize, now)
    expect(enriched.daysInStock).toBe(90)
    expect(enriched.daysSincePriceChange).toBe(31)
    expect(enriched.avgDaysToSell).toBe(18)
    expect(enriched.velocitySampleSize).toBe(6)
    expect(enriched.missingPlatformCount).toBe(2)
    // margin: (300 retail - 180 buy - 20 overhead) / 300 = 100 / 300 = 0.3333
    expect(enriched.marginHeadroomPct).toBeCloseTo(0.3333, 3)
  })

  it('treats stale listings (> 7 days) as missing', () => {
    const now = new Date('2026-04-22T00:00:00Z').getTime()
    const tires = [
      {
        id: 't1',
        platformListings: {
          facebook: { lastPostedAt: ts('2026-04-10T00:00:00Z') }, // 12 days ago -> stale
          offerup: { lastPostedAt: ts('2026-04-21T00:00:00Z') }, // 1 day ago -> active
        },
      },
    ]
    const [enriched] = buildEnrichedTires(tires, {}, now)
    // facebook stale + craigslist never = 2 missing; offerup active = not missing
    expect(enriched.missingPlatformCount).toBe(2)
  })

  it('returns margin 0 when retail is not researched yet', () => {
    const tires = [{ id: 't1', price: 180 }] // no priceIntel.retailPrice
    const [enriched] = buildEnrichedTires(tires, {}, Date.now())
    expect(enriched.marginHeadroomPct).toBe(0)
  })

  it('defaults missing velocity to null + 0 sample size', () => {
    const tires = [{ id: 't1', size: '999', lr: 'Z', price: 50 }]
    const [enriched] = buildEnrichedTires(tires, {}, Date.now())
    expect(enriched.avgDaysToSell).toBe(null)
    expect(enriched.velocitySampleSize).toBe(0)
  })

  it('preserves doNotList and kyleFrozen flags', () => {
    const tires = [{ id: 't1', doNotList: true, kyleFrozen: true }]
    const [enriched] = buildEnrichedTires(tires, {}, Date.now())
    expect(enriched.doNotList).toBe(true)
    expect(enriched.kyleFrozen).toBe(true)
  })

  it('defaults daysInStock to 0 when tire has no createdAt', () => {
    const tires = [{ id: 't1' }]
    const [enriched] = buildEnrichedTires(tires, {}, Date.now())
    expect(enriched.daysInStock).toBe(0)
  })
})
