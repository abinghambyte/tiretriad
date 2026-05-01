import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { _testonly } = require('./listingCoachTools.js')

const { getTireByMspn, getTireBySize, computeLandedCost, getRecentSalesForSize } = _testonly

function makeFirestore({ tires = [], orders = [], payoutCfg = null } = {}) {
  return {
    collection: (name) => ({
      doc: (id) => ({
        get: async () => {
          if (name === 'tires') {
            const t = tires.find((x) => x.mspn === id)
            return { exists: !!t, data: () => t, id }
          }
          if (name === 'meta' && id === 'payoutConfig') {
            return { exists: !!payoutCfg, data: () => payoutCfg }
          }
          return { exists: false, data: () => null }
        },
      }),
      where: () => ({
        limit: () => ({
          get: async () => ({ docs: tires.map((t) => ({ data: () => t, id: t.mspn })) }),
        }),
        orderBy: () => ({
          limit: () => ({
            get: async () => ({ docs: orders.map((o) => ({ data: () => o, id: o.orderId })) }),
          }),
        }),
      }),
    }),
  }
}

describe('getTireByMspn', () => {
  it('returns null when missing', async () => {
    const fs = makeFirestore()
    const r = await getTireByMspn({ firestore: fs, mspn: 'X' })
    expect(r).toBeNull()
  })

  it('returns the tire fields the model cares about', async () => {
    const tire = {
      mspn: '81501', description: 'LT285/70R17 KO2 LRC', brand: 'BFGoodrich', lr: 'C',
      price: 247, fet: 0,
      priceIntel: { retailPrice: 385, retailSources: [{ url: 'a', site: 'TireRack', price: 379 }], lastResearchedAt: { toMillis: () => 1700000000000 }, confidence: 'high' },
      salesCount: 12, weeklyVelocity: 1.5,
    }
    const fs = makeFirestore({ tires: [tire] })
    const r = await getTireByMspn({ firestore: fs, mspn: '81501' })
    expect(r.mspn).toBe('81501')
    expect(r.price).toBe(247)
    expect(r.priceIntel.retailPrice).toBe(385)
  })
})

describe('getTireBySize', () => {
  it('returns array of matching tires', async () => {
    const tires = [
      { mspn: 'A', description: 'LT285/70R17 KO2 LRC', price: 247, fet: 0 },
      { mspn: 'B', description: 'LT285/70R17 KO3 LRE', price: 250, fet: 0 },
    ]
    const fs = makeFirestore({ tires })
    const r = await getTireBySize({ firestore: fs, size: 'LT285/70R17' })
    expect(r).toHaveLength(2)
    expect(r.map((t) => t.mspn).sort()).toEqual(['A', 'B'])
  })
})

describe('computeLandedCost', () => {
  it('returns landed + breakdown', async () => {
    const fs = makeFirestore({
      payoutCfg: { taxes: { countyTaxPct: 0.0109, localTaxPct: 0.0312, stateTaxPct: 0.0302, tireFeePerTire: 2 } },
    })
    const r = await computeLandedCost({ firestore: fs, tire: { price: 247, fet: 0 } })
    expect(r.landedPerTire).toBeCloseTo(266.86, 2)
    expect(r.breakdown.catalog).toBe(247)
    expect(r.breakdown.fet).toBe(0)
    expect(r.breakdown.wholesaleTax).toBeCloseTo(17.86, 2)
    expect(r.breakdown.tireFee).toBe(2)
    expect(r.taxRate).toBeCloseTo(0.0723, 4)
  })

  it('zero buy returns 0 landed', async () => {
    const fs = makeFirestore({ payoutCfg: { taxes: { tireFeePerTire: 2 } } })
    const r = await computeLandedCost({ firestore: fs, tire: { price: 0 } })
    expect(r.landedPerTire).toBe(0)
  })
})

describe('getRecentSalesForSize', () => {
  it('returns recent completed orders', async () => {
    const orders = [
      { orderId: 'O1', completedMs: 1700000000, paymentAmount: 1540, quantity: 4, deliveredBy: 'dj', size: 'LT285/70R17' },
    ]
    const fs = makeFirestore({ orders })
    const r = await getRecentSalesForSize({ firestore: fs, size: 'LT285/70R17', limit: 5 })
    expect(r).toHaveLength(1)
    expect(r[0].orderId).toBe('O1')
  })
})
