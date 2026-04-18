import { describe, expect, it } from 'vitest'
import { computeCts, effectiveCts, tireOverheadParts } from './ctsCalc'

describe('computeCts', () => {
  it('sums mount + delivery + other', () => {
    expect(computeCts({ mountCost: 15, deliveryCost: 25, otherCost: 5 })).toBe(45)
  })

  it('treats missing parts as zero', () => {
    expect(computeCts({ mountCost: 15 })).toBe(15)
    expect(computeCts({})).toBe(0)
  })

  it('coerces string numerics', () => {
    expect(computeCts({ mountCost: '15', deliveryCost: '25', otherCost: '5' })).toBe(45)
  })

  it('ignores NaN-producing inputs', () => {
    expect(computeCts({ mountCost: 'abc', deliveryCost: 10, otherCost: null })).toBe(10)
  })

  it('handles null parts object', () => {
    expect(computeCts(null)).toBe(0)
    expect(computeCts(undefined)).toBe(0)
  })

  it('does not include FET (it is already in Kyle buy price)', () => {
    expect(computeCts({ mountCost: 10, fet: 25 })).toBe(10)
  })
})

describe('tireOverheadParts', () => {
  it('returns the three editable overhead fields', () => {
    const tire = { mountCost: 15, deliveryCost: 25, otherCost: 5, fet: 20, price: 800 }
    expect(tireOverheadParts(tire)).toEqual({
      mountCost: 15,
      deliveryCost: 25,
      otherCost: 5,
    })
  })

  it('zeroes missing fields', () => {
    expect(tireOverheadParts({})).toEqual({ mountCost: 0, deliveryCost: 0, otherCost: 0 })
  })
})

describe('effectiveCts', () => {
  it('matches computeCts on full tire object', () => {
    const tire = { mountCost: 15, deliveryCost: 25, otherCost: 5 }
    expect(effectiveCts(tire)).toBe(45)
  })
})
