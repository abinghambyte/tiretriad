import { describe, expect, it } from 'vitest'
import { bundleMath } from './bundleMath.js'

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

    expect(result.revenue).toBe(599)
    expect(result.cost).toBe(412.5)
    expect(result.profit).toBe(186.5)
    expect(result.margin).toBeCloseTo(31.135, 3)
    expect(result.testProfit).toBe(87.5)
    expect(result.testMargin).toBe(17.5)
  })

  it('sums revenue and cost for two tires with different quantities', () => {
    const result = bundleMath(
      [
        tire,
        { mspn: '22222', buy: 300, retail: 450, cts: 25 },
      ],
      { '09100': 2, '22222': 4 },
      20,
      3000,
    )

    expect(result.revenue).toBe(2998)
    expect(result.cost).toBe(2125)
    expect(result.profit).toBe(873)
    expect(result.margin).toBeCloseTo(29.119, 3)
    expect(result.testProfit).toBe(875)
    expect(result.testMargin).toBeCloseTo(29.167, 3)
  })

  it('computes a test offer exactly at the margin floor', () => {
    const result = bundleMath([tire], { '09100': 1 }, 20, 515.625)

    expect(result.testMargin).toBeCloseTo(20, 5)
  })

  it('computes the counter-offer needed for the floor margin', () => {
    const result = bundleMath([tire], { '09100': 1 }, 20, 500)

    expect(result.counterOffer).toBeCloseTo(515.625, 5)
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
})
