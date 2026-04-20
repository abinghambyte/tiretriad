import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const {
  DEFAULT_CONFIG,
  loadPayoutConfig,
  validatePayoutConfig,
  computeOrderTaxes,
  splitPool,
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
