import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { DEFAULT_CONFIG, computeOrderTaxes } = require('./payoutConfig')
const {
  CREW_KEYS,
  computePoolDollars,
  completedOrderMarginPool,
  buyPerTireFromOrderAndTire,
  ctsPerTire,
  round2,
  defaultRevenueDoc,
  defaultCrewDoc,
  bumpRevenueFields,
  bumpCrewEarned,
  buildTopSellersAggregate,
  runCompletionTransaction,
  isoWeekKey,
} = require('./financeStats')

describe('CREW_KEYS + default payout splits', () => {
  it('has three active profit-share keys (legacy tanner may remain on stored crew docs)', () => {
    expect(CREW_KEYS).toEqual(['alex', 'dj', 'kyle'])
  })

  it('default splits total to 100%', () => {
    const sum = Object.values(DEFAULT_CONFIG.splits).reduce((a, b) => a + b, 0)
    expect(sum).toBeCloseTo(1.0, 10)
  })

  it('matches DEFAULT_CONFIG.splits (Alex / DJ / Kyle)', () => {
    expect(DEFAULT_CONFIG.splits).toEqual({ alex: 0.35, dj: 0.35, kyle: 0.3 })
  })
})

describe('round2', () => {
  it('rounds to two decimals using Math.round', () => {
    expect(round2(1.234)).toBe(1.23)
    expect(round2(1.236)).toBe(1.24)
    expect(round2(1)).toBe(1)
    expect(round2(0)).toBe(0)
    expect(round2(-1.236)).toBe(-1.24)
  })

  it('returns 0 for non-finite', () => {
    expect(round2(Infinity)).toBe(0)
    expect(round2(NaN)).toBe(0)
  })
})

describe('buyPerTireFromOrderAndTire', () => {
  it('returns kylePriceOverride when set', () => {
    const order = { kylePriceOverride: 700 }
    const tire = { price: 800 }
    expect(buyPerTireFromOrderAndTire(order, tire)).toBe(700)
  })

  it('falls back to catalog price when no override', () => {
    expect(buyPerTireFromOrderAndTire({}, { price: 800 })).toBe(800)
  })

  it('treats non-finite override as missing', () => {
    expect(buyPerTireFromOrderAndTire({ kylePriceOverride: null }, { price: 800 })).toBe(800)
    expect(buyPerTireFromOrderAndTire({ kylePriceOverride: 'abc' }, { price: 800 })).toBe(800)
  })

  it('treats null order/tire as zero buy', () => {
    expect(buyPerTireFromOrderAndTire(null, null)).toBe(0)
  })
})

describe('ctsPerTire', () => {
  it('sums mount + delivery + other', () => {
    expect(ctsPerTire({ mountCost: 10, deliveryCost: 20, otherCost: 5 })).toBe(35)
  })

  it('does not include FET', () => {
    expect(ctsPerTire({ mountCost: 10, fet: 25 })).toBe(10)
  })

  it('treats missing/null tire as zero', () => {
    expect(ctsPerTire(null)).toBe(0)
    expect(ctsPerTire({})).toBe(0)
  })
})

describe('completedOrderMarginPool', () => {
  const tire = { price: 800, mountCost: 10, deliveryCost: 20, otherCost: 5 }

  it('subtracts taxesApplied.total when present on the order', () => {
    const order = {
      quantity: 4,
      taxesApplied: { salesTax: 10, tireFee: 5, total: 15 },
    }
    const base = computePoolDollars(3800, order, tire)
    expect(base).toBe(460)
    expect(completedOrderMarginPool(3800, order, tire)).toBe(445)
  })

  it('matches computePoolDollars when taxesApplied is absent', () => {
    const order = { quantity: 1 }
    expect(completedOrderMarginPool(950, order, tire)).toBe(computePoolDollars(950, order, tire))
  })
})

describe('computePoolDollars', () => {
  const tire = { price: 800, mountCost: 10, deliveryCost: 20, otherCost: 5 }

  it('pool = payment - (buy + cts) * qty', () => {
    const order = { quantity: 1 }
    expect(computePoolDollars(950, order, tire)).toBe(115)
  })

  it('scales cost with quantity', () => {
    expect(computePoolDollars(3800, { quantity: 4 }, tire)).toBe(460)
  })

  it('uses override over catalog price', () => {
    expect(computePoolDollars(950, { quantity: 1, kylePriceOverride: 700 }, tire)).toBe(215)
  })

  it('zero payment => negative pool equal to cost', () => {
    expect(computePoolDollars(0, { quantity: 1 }, tire)).toBe(-835)
  })

  it('negative qty (pre-sold) flips cost sign', () => {
    expect(computePoolDollars(0, { quantity: -1 }, tire)).toBe(835)
  })
})

describe('bumpCrewEarned', () => {
  it('adds default split shares from a $100 pool', () => {
    const next = bumpCrewEarned(defaultCrewDoc(), 100, DEFAULT_CONFIG.splits)
    expect(next.members.alex.totalEarned).toBe(35)
    expect(next.members.dj.totalEarned).toBe(35)
    expect(next.members.kyle.totalEarned).toBe(30)
  })

  it('accumulates on top of prior balances and leaves legacy members untouched', () => {
    const prev = {
      members: {
        alex: { totalEarned: 500, totalPaid: 200, balance: 300 },
        dj: { totalEarned: 200, totalPaid: 0, balance: 200 },
        tanner: { totalEarned: 200, totalPaid: 0, balance: 200 },
        kyle: { totalEarned: 100, totalPaid: 50, balance: 50 },
      },
      payoutLog: [],
    }
    const next = bumpCrewEarned(prev, 100, DEFAULT_CONFIG.splits)
    expect(next.members.alex.totalEarned).toBe(535)
    expect(next.members.alex.totalPaid).toBe(200)
    expect(next.members.alex.balance).toBe(335)
    expect(next.members.kyle.totalEarned).toBe(130)
    expect(next.members.kyle.balance).toBe(80)
    expect(next.members.tanner.totalEarned).toBe(200)
    expect(next.members.tanner.balance).toBe(200)
  })

  it('preserves payoutLog across bumps', () => {
    const prev = defaultCrewDoc()
    prev.payoutLog = [{ at: '2026-01-15', amount: 500, member: 'alex' }]
    const next = bumpCrewEarned(prev, 100, DEFAULT_CONFIG.splits)
    expect(next.payoutLog).toHaveLength(1)
    expect(next.payoutLog[0].amount).toBe(500)
  })

  it('handles negative pool (loss-making order)', () => {
    const next = bumpCrewEarned(defaultCrewDoc(), -100, DEFAULT_CONFIG.splits)
    expect(next.members.alex.totalEarned).toBe(-35)
    expect(next.members.alex.balance).toBe(-35)
  })

  it('rounds each share to cents independently', () => {
    const next = bumpCrewEarned(defaultCrewDoc(), 33.33, DEFAULT_CONFIG.splits)
    expect(next.members.alex.totalEarned).toBe(11.67)
    expect(next.members.dj.totalEarned).toBe(11.67)
    expect(next.members.kyle.totalEarned).toBe(10)
  })
})

describe('completion cost with buy-side taxes', () => {
  it('adds tax bundle to costTotal for known $100 × 4 case', () => {
    const buy = 100
    const cts = 0
    const qty = 4
    const taxesBundle = computeOrderTaxes(buy, qty, DEFAULT_CONFIG.taxes)
    expect(taxesBundle).toEqual({ salesTax: 28.92, tireFee: 8, total: 36.92 })
    const costTotal = round2((buy + cts) * qty + taxesBundle.total)
    expect(costTotal).toBe(436.92)
  })
})

describe('runCompletionTransaction', () => {
  it('merges taxesApplied onto the order patch', async () => {
    const refSnapshots = {
      'meta/payoutConfig': { exists: false },
      'orders/o1': {
        exists: true,
        data: () => ({
          status: 'in_transit',
          quantity: 4,
          mspn: 'M1',
        }),
      },
      'tires/M1': {
        exists: true,
        data: () => ({
          price: 100,
          mountCost: 0,
          deliveryCost: 0,
          otherCost: 0,
          weeklyVelocityWeek: '',
          weeklyVelocity: 0,
        }),
      },
      'meta/revenueStats': { exists: false },
      'meta/crewEarnings': { exists: false },
    }
    let orderPatch
    const db = {
      collection: (name) => ({
        doc: (id) => {
          const path = `${name}/${id}`
          return {
            path,
            get: async () => refSnapshots[path] || { exists: false },
          }
        },
      }),
      runTransaction: async (fn) => {
        const tx = {
          get: async (ref) => {
            const snap = refSnapshots[ref.path]
            if (!snap) return { exists: false, data: () => ({}) }
            return {
              exists: snap.exists,
              data: () => (typeof snap.data === 'function' ? snap.data() : {}),
            }
          },
          update: (ref, patch) => {
            if (ref.path === 'orders/o1') orderPatch = patch
          },
          set: () => {},
        }
        await fn(tx)
      },
    }

    await runCompletionTransaction(db, {
      orderRef: { path: 'orders/o1' },
      completionPatch: { status: 'completed' },
      paymentAmount: 500,
      completedMs: Date.UTC(2026, 3, 15, 19),
    })

    expect(orderPatch.status).toBe('completed')
    expect(orderPatch.taxesApplied).toEqual({
      salesTax: 28.92,
      tireFee: 8,
      total: 36.92,
    })
  })
})

describe('bumpRevenueFields', () => {
  const MS_2026_04_15_19UTC = Date.UTC(2026, 3, 15, 19, 0, 0)
  const fresh = () => defaultRevenueDoc()

  it('accumulates revenue/cost/margin into the rolling windows on first write', () => {
    const next = bumpRevenueFields(fresh(), 1000, 800, 200, MS_2026_04_15_19UTC)
    expect(next.dailyRevenue).toBe(1000)
    expect(next.dailyCost).toBe(800)
    expect(next.dailyMargin).toBe(200)
    expect(next.allTimeRevenue).toBe(1000)
  })

  it('resets daily/weekly/monthly when window key changes, preserves all-time', () => {
    const day1 = bumpRevenueFields(fresh(), 1000, 800, 200, Date.UTC(2026, 3, 15, 19))
    const day2 = bumpRevenueFields(day1, 500, 400, 100, Date.UTC(2026, 3, 23, 19))
    expect(day2.dailyRevenue).toBe(500)
    expect(day2.weeklyRevenue).toBe(500)
    expect(day2.allTimeRevenue).toBe(1500)
  })

  it('stamps the correct ytd year', () => {
    const next = bumpRevenueFields(fresh(), 1000, 800, 200, Date.UTC(2026, 3, 15, 19))
    expect(next.ytdYear).toBe(2026)
  })

  it('rolls over ytd at year boundary', () => {
    const dec = bumpRevenueFields(fresh(), 1000, 800, 200, Date.UTC(2025, 11, 20, 12))
    expect(dec.ytdYear).toBe(2025)
    expect(dec.ytdRevenue).toBe(1000)

    const jan = bumpRevenueFields(dec, 500, 400, 100, Date.UTC(2026, 0, 5, 12))
    expect(jan.ytdYear).toBe(2026)
    expect(jan.ytdRevenue).toBe(500)
    expect(jan.allTimeRevenue).toBe(1500)
  })
})

describe('isoWeekKey', () => {
  it('formats as YYYY-Www with zero padding', () => {
    const week = isoWeekKey(Date.UTC(2026, 0, 5, 12))
    expect(week).toMatch(/^\d{4}-W\d{2}$/)
  })

  it('groups the same Mon-Sun range under the same key', () => {
    const mon = isoWeekKey(Date.UTC(2026, 3, 13, 12))
    const sun = isoWeekKey(Date.UTC(2026, 3, 19, 12))
    expect(mon).toBe(sun)
  })
})

describe('buildTopSellersAggregate', () => {
  function docOf(id, data) {
    return { id, data: () => data }
  }

  it('returns up to 10 rows sorted desc by salesCount with 1-based rank', () => {
    const docs = Array.from({ length: 15 }, (_, i) =>
      docOf(`sku-${i}`, {
        mspn: `SKU${i}`,
        description: `Tire ${i}`,
        category: 'all-season',
        salesCount: 15 - i,
      }),
    )
    const result = buildTopSellersAggregate(docs)
    expect(result).toHaveLength(10)
    expect(result[0]).toEqual({
      rank: 1,
      sku: 'SKU0',
      description: 'Tire 0',
      category: 'all-season',
      salesCount: 15,
    })
    expect(result[9].rank).toBe(10)
    expect(result[9].salesCount).toBe(6)
  })

  it('skips docs with missing or non-positive salesCount and falls back to doc.id for sku', () => {
    const docs = [
      docOf('a', { mspn: 'A', salesCount: 5 }),
      docOf('b', { mspn: 'B' }),
      docOf('c', { salesCount: 2 }),
      docOf('d', { mspn: 'D', salesCount: 0 }),
      docOf('e', { mspn: 'E', salesCount: -4 }),
    ]
    const result = buildTopSellersAggregate(docs)
    expect(result).toEqual([
      { rank: 1, sku: 'A', description: '', category: '', salesCount: 5 },
      { rank: 2, sku: 'c', description: '', category: '', salesCount: 2 },
    ])
  })

  it('tolerates null / empty input', () => {
    expect(buildTopSellersAggregate(null)).toEqual([])
    expect(buildTopSellersAggregate([])).toEqual([])
  })
})
