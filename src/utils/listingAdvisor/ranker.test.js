// src/utils/listingAdvisor/ranker.test.js
import { describe, it, expect } from 'vitest'
import { rankTires } from './ranker.js'
import { MODE_WEIGHTS } from './modeWeights.js'

function tire(overrides = {}) {
  return {
    id: 't1',
    daysInStock: 60,
    daysSincePriceChange: 30,
    avgDaysToSell: 20,
    velocitySampleSize: 5,
    marginHeadroomPct: 0.25,
    missingPlatformCount: 1,
    doNotList: false,
    kyleFrozen: false,
    ...overrides,
  }
}

describe('rankTires', () => {
  it('returns [] for empty input', () => {
    expect(rankTires([], 'VELOCITY')).toEqual([])
  })

  it('filters out doNotList tires before scoring', () => {
    const input = [tire({ id: 'keep' }), tire({ id: 'skip', doNotList: true })]
    const out = rankTires(input, 'VELOCITY')
    expect(out.map((t) => t.id)).toEqual(['keep'])
  })

  it('unknown velocity (sampleSize < 3) contributes 0, never NaN', () => {
    const t = tire({ velocitySampleSize: 0, avgDaysToSell: null })
    const [ranked] = rankTires([t], 'VELOCITY')
    expect(Number.isFinite(ranked.rankScore)).toBe(true)
    expect(ranked.signalBreakdown.velocity.raw).toBe(0)
    expect(ranked.signalBreakdown.velocity.weighted).toBe(0)
  })

  it('clamps daysInStock to [0, 180]', () => {
    const hi = rankTires([tire({ id: 'hi', daysInStock: 400 })], 'CLEARANCE')[0]
    const cap = rankTires([tire({ id: 'cap', daysInStock: 180 })], 'CLEARANCE')[0]
    expect(hi.signalBreakdown.daysInStock.raw).toBe(180)
    expect(hi.rankScore).toBeCloseTo(cap.rankScore, 6)
  })

  it('clamps daysSincePriceChange to [0, 180]', () => {
    const hi = rankTires([tire({ id: 'hi', daysSincePriceChange: 400 })], 'CLEARANCE')[0]
    expect(hi.signalBreakdown.daysSincePriceChange.raw).toBe(180)
  })

  it('signalBreakdown weighted values sum to rankScore', () => {
    const [r] = rankTires([tire()], 'PROFIT')
    const sum =
      r.signalBreakdown.daysInStock.weighted +
      r.signalBreakdown.daysSincePriceChange.weighted +
      r.signalBreakdown.velocity.weighted +
      r.signalBreakdown.margin.weighted +
      r.signalBreakdown.crossPost.weighted
    expect(r.rankScore).toBeCloseTo(sum, 6)
  })

  it('Clearance mode ranks longest-in-stock tire first', () => {
    const tires = [
      tire({ id: 'fresh', daysInStock: 5 }),
      tire({ id: 'stale', daysInStock: 150 }),
      tire({ id: 'mid', daysInStock: 40 }),
    ]
    const out = rankTires(tires, 'CLEARANCE')
    expect(out[0].id).toBe('stale')
  })

  it('Profit mode prioritizes margin over age', () => {
    const tires = [
      tire({ id: 'fat', daysInStock: 10, daysSincePriceChange: 10, marginHeadroomPct: 0.6 }),
      tire({ id: 'stale_thin', daysInStock: 150, daysSincePriceChange: 120, marginHeadroomPct: 0.05 }),
    ]
    const out = rankTires(tires, 'PROFIT')
    expect(out[0].id).toBe('fat')
  })

  it('Velocity mode prioritizes fast-moving sizes', () => {
    const tires = [
      tire({ id: 'slow', avgDaysToSell: 90, velocitySampleSize: 8 }),
      tire({ id: 'fast', avgDaysToSell: 7, velocitySampleSize: 8 }),
    ]
    const out = rankTires(tires, 'VELOCITY')
    expect(out[0].id).toBe('fast')
  })

  it('throws for unknown mode', () => {
    expect(() => rankTires([tire()], 'BOGUS')).toThrow(/mode/i)
  })

  it('MODE_WEIGHTS is frozen', () => {
    expect(Object.isFrozen(MODE_WEIGHTS)).toBe(true)
  })
})
