import { describe, expect, it } from 'vitest'
import { tireLandedBuyNumber } from './tireLandedBuy.js'

const COTaxes = {
  countyTaxPct: 0.0109,
  localTaxPct: 0.0312,
  stateTaxPct: 0.0302,
  tireFeePerTire: 2.0,
}

describe('tireLandedBuyNumber', () => {
  it('returns 0 when buy is 0', () => {
    expect(tireLandedBuyNumber({ price: 0 }, COTaxes)).toBe(0)
    expect(tireLandedBuyNumber(null, COTaxes)).toBe(0)
  })

  it('adds FET, wholesale tax, and tire fee', () => {
    // 220.35 + 0 + 220.35 * 0.0723 + 2 = ~238.28
    const r = tireLandedBuyNumber({ price: 220.35, fet: 0 }, COTaxes)
    expect(r).toBeCloseTo(238.28, 2)
  })

  it('treats fet > 0 additively', () => {
    // 499 + 25.23 + 499 * 0.0723 + 2 = ~562.31
    const r = tireLandedBuyNumber({ price: 499, fet: 25.23 }, COTaxes)
    expect(r).toBeCloseTo(562.31, 2)
  })

  it('prefers priceIntel.activeBuyPrice when present', () => {
    const tire = { price: 220, fet: 0, priceIntel: { activeBuyPrice: 240 } }
    // 240 + 0 + 240 * 0.0723 + 2 = ~259.35
    expect(tireLandedBuyNumber(tire, COTaxes)).toBeCloseTo(259.35, 2)
  })

  it('returns just buy + fet when taxes are zero', () => {
    const r = tireLandedBuyNumber(
      { price: 100, fet: 5 },
      { countyTaxPct: 0, localTaxPct: 0, stateTaxPct: 0, tireFeePerTire: 0 },
    )
    expect(r).toBe(105)
  })

  it('treats missing taxes object as all-zero (defensive)', () => {
    expect(tireLandedBuyNumber({ price: 100, fet: 0 }, null)).toBe(100)
    expect(tireLandedBuyNumber({ price: 100, fet: 0 }, undefined)).toBe(100)
  })
})
