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
  it('returns days since latest priceHistory entry', () => {
    const now = new Date('2026-04-22T00:00:00Z').getTime()
    const tire = {
      priceHistory: [
        { price: 300, at: ts('2026-01-01T00:00:00Z') },
        { price: 280, at: ts('2026-03-19T00:00:00Z') },
      ],
    }
    expect(computeDaysSincePriceChange(tire, now)).toBe(34)
  })

  it('returns 0 when priceHistory is missing or empty', () => {
    expect(computeDaysSincePriceChange({}, Date.now())).toBe(0)
    expect(computeDaysSincePriceChange({ priceHistory: [] }, Date.now())).toBe(0)
  })

  it('ignores entries with missing timestamps', () => {
    const now = new Date('2026-04-22T00:00:00Z').getTime()
    const tire = {
      priceHistory: [{ price: 300, at: null }, { price: 280, at: ts('2026-04-20T00:00:00Z') }],
    }
    expect(computeDaysSincePriceChange(tire, now)).toBe(2)
  })
})

describe('computeAvgDaysToSell', () => {
  it('groups by size+LR and averages completedAt - intakeAt', () => {
    const orders = [
      { status: 'completed', size: '265/70R17', lr: 'E', intakeAt: ts('2026-01-01'), completedAt: ts('2026-01-11') },
      { status: 'completed', size: '265/70R17', lr: 'E', intakeAt: ts('2026-02-01'), completedAt: ts('2026-02-21') },
      { status: 'completed', size: '235/75R15', lr: 'D', intakeAt: ts('2026-01-01'), completedAt: ts('2026-01-31') },
    ]
    const result = computeAvgDaysToSell(orders)
    expect(result['265/70R17|E']).toEqual({ avgDaysToSell: 15, sampleSize: 2 })
    expect(result['235/75R15|D']).toEqual({ avgDaysToSell: 30, sampleSize: 1 })
  })

  it('filters out non-completed orders', () => {
    const orders = [
      { status: 'pending', size: '265/70R17', lr: 'E', intakeAt: ts('2026-01-01'), completedAt: ts('2026-01-11') },
      { status: 'cancelled', size: '265/70R17', lr: 'E', intakeAt: ts('2026-01-01'), completedAt: ts('2026-01-11') },
    ]
    expect(computeAvgDaysToSell(orders)).toEqual({})
  })

  it('skips orders missing intakeAt or completedAt', () => {
    const orders = [
      { status: 'completed', size: '265/70R17', lr: 'E', intakeAt: null, completedAt: ts('2026-01-11') },
      { status: 'completed', size: '265/70R17', lr: 'E', intakeAt: ts('2026-01-01'), completedAt: null },
    ]
    expect(computeAvgDaysToSell(orders)).toEqual({})
  })
})

describe('buildEnrichedTires', () => {
  it('attaches daysSincePriceChange, velocity, margin, missingPlatformCount', () => {
    const now = new Date('2026-04-22T00:00:00Z').getTime()
    const tires = [
      {
        id: 't1',
        size: '265/70R17',
        lr: 'E',
        price: 300,
        buyPrice: 180,
        ctsTotal: 20,
        priceHistory: [{ price: 300, at: ts('2026-03-22T00:00:00Z') }],
        listedEbay: true,
        listedMarketplace: false,
        listedCraigslist: false,
      },
    ]
    const velocityBySize = { '265/70R17|E': { avgDaysToSell: 18, sampleSize: 6 } }
    const [enriched] = buildEnrichedTires(tires, velocityBySize, now)
    expect(enriched.daysSincePriceChange).toBe(31)
    expect(enriched.avgDaysToSell).toBe(18)
    expect(enriched.velocitySampleSize).toBe(6)
    expect(enriched.missingPlatformCount).toBe(2)
    // margin: (300 - 180 - 20) / 300 = 100 / 300 = 0.3333
    expect(enriched.marginHeadroomPct).toBeCloseTo(0.3333, 3)
  })

  it('defaults missing velocity to null + 0 sample size', () => {
    const tires = [{ id: 't1', size: '999', lr: 'Z', price: 100, buyPrice: 50 }]
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
})
