import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const {
  DEFAULT_CONFIG,
  loadPayoutConfig,
  validatePayoutConfig,
  computeOrderTaxes,
  tireLandedBuyNumber,
  splitPool,
  applyDeliveryBump,
} = require('./payoutConfig')

describe('loadPayoutConfig', () => {
  it('returns defaults when doc is missing', async () => {
    const db = {
      collection: () => ({
        doc: () => ({
          get: async () => ({ exists: false }),
        }),
      }),
    }
    const cfg = await loadPayoutConfig(db)
    expect(cfg.splits).toEqual({ alex: 0.35, dj: 0.35, kyle: 0.3 })
    expect(cfg.taxes).toMatchObject({
      countyTaxPct: 0.0109,
      localTaxPct: 0.0312,
      stateTaxPct: 0.0302,
      tireFeePerTire: 2,
    })
  })

  it('merges stored doc over defaults', async () => {
    const db = {
      collection: () => ({
        doc: () => ({
          get: async () => ({
            exists: true,
            data: () => ({
              splits: { alex: 0.4, dj: 0.35, kyle: 0.25 },
              taxes: { tireFeePerTire: 3 },
            }),
          }),
        }),
      }),
    }
    const cfg = await loadPayoutConfig(db)
    expect(cfg.splits).toEqual({ alex: 0.4, dj: 0.35, kyle: 0.25 })
    expect(cfg.taxes.tireFeePerTire).toBe(3)
    expect(cfg.taxes.countyTaxPct).toBe(0.0109)
  })
})

describe('validatePayoutConfig', () => {
  const valid = () => ({
    splits: { alex: 0.35, dj: 0.35, kyle: 0.3 },
    taxes: {
      countyTaxPct: 0.01,
      localTaxPct: 0.02,
      stateTaxPct: 0.03,
      tireFeePerTire: 2,
    },
  })

  it('accepts a valid payload', () => {
    const r = validatePayoutConfig(valid())
    expect(r.ok).toBe(true)
    expect(r.normalized.splits.kyle).toBe(0.3)
  })

  it('rejects splits that do not sum to 1', () => {
    const r = validatePayoutConfig({
      ...valid(),
      splits: { alex: 0.34, dj: 0.35, kyle: 0.3 },
    })
    expect(r.ok).toBe(false)
    expect(r.errors.join(' ')).toMatch(/sum/)
  })

  it('rejects a missing split key', () => {
    const r = validatePayoutConfig({
      ...valid(),
      splits: { alex: 0.5, dj: 0.5 },
    })
    expect(r.ok).toBe(false)
    expect(r.errors.some((e) => e.includes('kyle'))).toBe(true)
  })

  it('rejects unknown split keys', () => {
    const r = validatePayoutConfig({
      ...valid(),
      splits: { alex: 0.25, dj: 0.25, kyle: 0.25, tanner: 0.25 },
    })
    expect(r.ok).toBe(false)
    expect(r.errors.some((e) => e.includes('unknown'))).toBe(true)
  })

  it('rejects tax rate above ceiling', () => {
    const r = validatePayoutConfig({
      ...valid(),
      taxes: { ...valid().taxes, stateTaxPct: 0.26 },
    })
    expect(r.ok).toBe(false)
  })

  it('rejects tire fee out of range', () => {
    const r = validatePayoutConfig({
      ...valid(),
      taxes: { ...valid().taxes, tireFeePerTire: 30 },
    })
    expect(r.ok).toBe(false)
  })
})

describe('computeOrderTaxes', () => {
  it('matches known $100/tire × 4 case under default rates', () => {
    const r = computeOrderTaxes(100, 4, DEFAULT_CONFIG.taxes)
    expect(r).toEqual({ salesTax: 28.92, tireFee: 8, total: 36.92 })
  })
})

describe('splitPool', () => {
  it('distributes $100 with no remainder under 35/35/30', () => {
    const parts = splitPool(100, DEFAULT_CONFIG.splits)
    expect(parts.alex + parts.dj + parts.kyle).toBe(100)
    expect(parts).toEqual({ alex: 35, dj: 35, kyle: 30 })
  })
})

describe('applyDeliveryBump', () => {
  const splits = { alex: 0.35, dj: 0.35, kyle: 0.3 }

  it('returns splits unchanged when deliveredBy is null', () => {
    expect(applyDeliveryBump(splits, 0.05, null)).toEqual(splits)
  })

  it('returns splits unchanged when bump is 0', () => {
    expect(applyDeliveryBump(splits, 0, 'dj')).toEqual(splits)
  })

  it('returns splits unchanged when deliveredBy is unknown', () => {
    expect(applyDeliveryBump(splits, 0.05, 'mallory')).toEqual(splits)
  })

  it('zero-sum redistributes a 5% bump on dj', () => {
    const out = applyDeliveryBump(splits, 0.05, 'dj')
    expect(out.dj).toBeCloseTo(0.4, 6)
    expect(out.alex + out.dj + out.kyle).toBeCloseTo(1.0, 6)
    expect(out.alex).toBeCloseTo(0.35 * (0.6 / 0.65), 4)
    expect(out.kyle).toBeCloseTo(0.3 * (0.6 / 0.65), 4)
  })

  it('clamps deliverer share to 0.95 when bump would exceed 1.0', () => {
    const out = applyDeliveryBump(splits, 0.99, 'dj')
    expect(out.dj).toBe(0.95)
    expect(out.alex + out.dj + out.kyle).toBeCloseTo(1.0, 6)
  })

  it('preserves sum-to-1 with negative bump (defensive; clamps to 0)', () => {
    const out = applyDeliveryBump(splits, -0.1, 'dj')
    expect(out).toEqual(splits)
  })
})

describe('validatePayoutConfig deliveryBump', () => {
  const baseTaxes = {
    countyTaxPct: 0.01,
    localTaxPct: 0.03,
    stateTaxPct: 0.03,
    tireFeePerTire: 2,
  }
  const baseSplits = { alex: 0.35, dj: 0.35, kyle: 0.3 }

  it('accepts deliveryBump in valid range', () => {
    const r = validatePayoutConfig({ splits: baseSplits, taxes: baseTaxes, deliveryBump: 0.05 })
    expect(r.ok).toBe(true)
    expect(r.normalized.deliveryBump).toBe(0.05)
  })

  it('defaults deliveryBump to 0.05 when missing', () => {
    const r = validatePayoutConfig({ splits: baseSplits, taxes: baseTaxes })
    expect(r.ok).toBe(true)
    expect(r.normalized.deliveryBump).toBe(0.05)
  })

  it('rejects deliveryBump below 0', () => {
    const r = validatePayoutConfig({ splits: baseSplits, taxes: baseTaxes, deliveryBump: -0.05 })
    expect(r.ok).toBe(false)
  })

  it('rejects deliveryBump above 0.5', () => {
    const r = validatePayoutConfig({ splits: baseSplits, taxes: baseTaxes, deliveryBump: 0.6 })
    expect(r.ok).toBe(false)
  })
})

describe('DEFAULT_CONFIG', () => {
  it('exposes deliveryBump default', () => {
    expect(DEFAULT_CONFIG.deliveryBump).toBe(0.05)
  })
})

describe('tireLandedBuyNumber (server)', () => {
  const taxes = {
    countyTaxPct: 0.0109, localTaxPct: 0.0312, stateTaxPct: 0.0302, tireFeePerTire: 2,
  }
  it('matches the client helper case-for-case', () => {
    expect(tireLandedBuyNumber({ price: 220.35, fet: 0 }, taxes)).toBeCloseTo(238.28, 2)
    expect(tireLandedBuyNumber({ price: 499, fet: 25.23 }, taxes)).toBeCloseTo(562.31, 2)
    expect(tireLandedBuyNumber({ price: 0 }, taxes)).toBe(0)
    expect(tireLandedBuyNumber(null, taxes)).toBe(0)
  })
  it('priceIntel.activeBuyPrice takes precedence', () => {
    const tire = { price: 200, fet: 0, priceIntel: { activeBuyPrice: 240 } }
    expect(tireLandedBuyNumber(tire, taxes)).toBeCloseTo(259.35, 2)
  })
  it('treats missing taxes as zero', () => {
    expect(tireLandedBuyNumber({ price: 100, fet: 5 }, null)).toBe(105)
  })
})
