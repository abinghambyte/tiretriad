import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const {
  validateDr,
  computeEstimatedLandedCostAtCompletion,
} = require('./orders.js')

describe('validateDr', () => {
  it('returns null value when raw is undefined', () => {
    expect(validateDr(undefined)).toEqual({ ok: true, value: null })
  })

  it('returns null value when raw is null', () => {
    expect(validateDr(null)).toEqual({ ok: true, value: null })
  })

  it('returns null when input is empty/whitespace string', () => {
    expect(validateDr('')).toEqual({ ok: true, value: null })
    expect(validateDr('   ')).toEqual({ ok: true, value: null })
  })

  it('trims whitespace from valid input', () => {
    expect(validateDr('  DR3611350  ')).toEqual({ ok: true, value: 'DR3611350' })
  })

  it('caps at 64 chars', () => {
    const long = 'D'.repeat(80)
    const result = validateDr(long)
    expect(result.ok).toBe(true)
    expect(result.value).toHaveLength(64)
  })

  it('rejects non-string non-null inputs', () => {
    expect(validateDr(123).ok).toBe(false)
    expect(validateDr({}).ok).toBe(false)
    expect(validateDr(true).ok).toBe(false)
  })
})

describe('computeEstimatedLandedCostAtCompletion', () => {
  const taxes = {
    countyTaxPct: 0.0109,
    localTaxPct: 0.0312,
    stateTaxPct: 0.0302,
    tireFeePerTire: 2.0,
  }

  it('single-tire order: qty * tireLandedBuyNumber rounded to cents', () => {
    const order = { mspn: 'M1', quantity: 4 }
    const tireDocs = new Map([['M1', { price: 100 }]])
    // landed per tire = 100 + 0 (fet) + 100*(0.0109+0.0312+0.0302) + 2 = 100 + 7.23 + 2 = 109.23
    // total = 4 * 109.23 = 436.92
    const result = computeEstimatedLandedCostAtCompletion(order, tireDocs, taxes)
    expect(result).toBe(436.92)
  })

  it('returns 0 when tire doc missing', () => {
    const order = { mspn: 'X1', quantity: 4 }
    expect(computeEstimatedLandedCostAtCompletion(order, new Map(), taxes)).toBe(0)
  })

  it('returns 0 when qty is zero or negative', () => {
    const tires = new Map([['M1', { price: 100 }]])
    expect(computeEstimatedLandedCostAtCompletion({ mspn: 'M1', quantity: 0 }, tires, taxes)).toBe(0)
    expect(computeEstimatedLandedCostAtCompletion({ mspn: 'M1', quantity: -2 }, tires, taxes)).toBe(0)
  })

  it('handles multi-line tires array shape', () => {
    const order = {
      tires: [
        { mspn: 'A', qty: 2 },
        { mspn: 'B', qty: 1 },
      ],
    }
    const tires = new Map([
      ['A', { price: 100 }],
      ['B', { price: 50 }],
    ])
    // A landed = 109.23 * 2 = 218.46
    // B landed = 50 + 50*0.0723 + 2 = 55.615 -> rounds to 55.62 per tire after total round
    // Actually compute: 50 + 50*0.0723 + 2 = 55.615
    // total = 218.46 + 55.615 = 274.075 -> 274.08
    const result = computeEstimatedLandedCostAtCompletion(order, tires, taxes)
    expect(result).toBe(274.08)
  })

  it('returns 0 for malformed input', () => {
    expect(computeEstimatedLandedCostAtCompletion(null, new Map(), taxes)).toBe(0)
    expect(computeEstimatedLandedCostAtCompletion({}, new Map(), taxes)).toBe(0)
  })
})
