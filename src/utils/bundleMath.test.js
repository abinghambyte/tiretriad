import { describe, expect, it } from 'vitest'
import { bundleMath } from './bundleMath.js'

// Fixture mirrors a typical LT-rated tire: $412.50 buy, no CTS overhead,
// $25 FET surcharge. The FET line item must end up in cost — single-tire
// HaggleSheet on main treats it the same way (buyAllIn = buy + cts + fet).
const tire = {
  mspn: '09100',
  buy: 412.5,
  retail: 599,
  cts: 0,
  fet: 25,
}

describe('bundleMath', () => {
  it('matches existing single-tire HaggleSheet math for qty 1', () => {
    const result = bundleMath([tire], { '09100': 1 }, 20, 500)

    // cost = buy 412.5 + cts 0 + fet 25 = 437.5
    expect(result.revenue).toBe(599)
    expect(result.cost).toBe(437.5)
    expect(result.profit).toBe(161.5)
    expect(result.margin).toBeCloseTo(26.962, 2)
    // testOffer 500: profit = 500 - 437.5 = 62.5; margin = 62.5/500 = 12.5%
    expect(result.testProfit).toBe(62.5)
    expect(result.testMargin).toBe(12.5)
  })

  it('sums revenue and cost for two tires with different quantities', () => {
    const result = bundleMath(
      [
        // tire (qty 2): per-unit cost 437.5 → 875
        tire,
        // 22222 (qty 4): per-unit cost 300 + 25 + 0 = 325 → 1300
        { mspn: '22222', buy: 300, retail: 450, cts: 25 },
      ],
      { '09100': 2, '22222': 4 },
      20,
      3000,
    )

    expect(result.revenue).toBe(2998) // 599*2 + 450*4
    expect(result.cost).toBe(2175) // 875 + 1300
    expect(result.profit).toBe(823) // 2998 - 2175
    expect(result.margin).toBeCloseTo(27.452, 3)
    expect(result.testProfit).toBe(825) // 3000 - 2175
    expect(result.testMargin).toBeCloseTo(27.5, 3)
  })

  it('computes a test offer exactly at the margin floor', () => {
    // cost = 437.5; offer at 20% floor = 437.5 / 0.8 = 546.875
    const result = bundleMath([tire], { '09100': 1 }, 20, 546.875)

    expect(result.testMargin).toBeCloseTo(20, 5)
  })

  it('computes the counter-offer needed for the floor margin', () => {
    const result = bundleMath([tire], { '09100': 1 }, 20, 500)

    // counter = cost / (1 - 0.20) = 437.5 / 0.8 = 546.875
    expect(result.counterOffer).toBeCloseTo(546.875, 5)
  })

  it('returns zero totals for an empty tire list', () => {
    const result = bundleMath([], {}, 20, 500)

    expect(result.revenue).toBe(0)
    expect(result.cost).toBe(0)
    expect(result.profit).toBe(0)
    expect(result.margin).toBe(0)
    expect(result.testProfit).toBe(0)
    expect(result.testMargin).toBe(0)
  })

  it('includes FET in cost (regression: bundle and single-tire must match)', () => {
    // A tire with $0 FET vs the same tire with $25 FET should produce
    // distinct costs. If FET is missing from the math, both costs match.
    const noFet = bundleMath([{ ...tire, fet: 0 }], { '09100': 1 }, 20, 500)
    const withFet = bundleMath([tire], { '09100': 1 }, 20, 500)

    expect(withFet.cost - noFet.cost).toBe(25)
  })
})
