import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

// `functions/` has no package.json `type: module`, so its runtime is CommonJS.
// Vitest requires ESM imports for itself, so we use createRequire to load the
// CommonJS module under test without changing its runtime shape.
const require = createRequire(import.meta.url)
const {
  CREW_SPLIT,
  CREW_KEYS,
  computePoolDollars,
  buyPerTireFromOrderAndTire,
  ctsPerTire,
  round2,
  defaultRevenueDoc,
  defaultCrewDoc,
  bumpRevenueFields,
  bumpCrewEarned,
  isoWeekKey,
} = require('./financeStats')

describe('CREW_SPLIT invariants', () => {
  it('has all four crew members', () => {
    expect(CREW_KEYS).toEqual(['alex', 'dj', 'tanner', 'kyle'])
  })

  it('splits total to 100%', () => {
    const sum = Object.values(CREW_SPLIT).reduce((a, b) => a + b, 0)
    expect(sum).toBeCloseTo(1.0, 10)
  })

  it('matches the documented percentages (Alex 50 / DJ 20 / Tanner 20 / Kyle 10)', () => {
    expect(CREW_SPLIT).toEqual({ alex: 0.5, dj: 0.2, tanner: 0.2, kyle: 0.1 })
  })
})

describe('round2', () => {
  it('rounds to two decimals using Math.round', () => {
    // `Math.round(n * 100) / 100` inherits IEEE-754 float quirks; callers
    // that need deterministic .xx5 rounding have to handle it themselves.
    // These values are all safe from that edge case.
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
  it('adds Alex 50 / DJ 20 / Tanner 20 / Kyle 10 from a $100 pool', () => {
    const next = bumpCrewEarned(defaultCrewDoc(), 100)
    expect(next.members.alex.totalEarned).toBe(50)
    expect(next.members.dj.totalEarned).toBe(20)
    expect(next.members.tanner.totalEarned).toBe(20)
    expect(next.members.kyle.totalEarned).toBe(10)
  })

  it('accumulates on top of prior balances', () => {
    const prev = {
      members: {
        alex: { totalEarned: 500, totalPaid: 200, balance: 300 },
        dj: { totalEarned: 200, totalPaid: 0, balance: 200 },
        tanner: { totalEarned: 200, totalPaid: 0, balance: 200 },
        kyle: { totalEarned: 100, totalPaid: 50, balance: 50 },
      },
      payoutLog: [],
    }
    const next = bumpCrewEarned(prev, 100)
    expect(next.members.alex.totalEarned).toBe(550)
    expect(next.members.alex.totalPaid).toBe(200) // preserved
    expect(next.members.alex.balance).toBe(350) // 550 - 200
    expect(next.members.kyle.totalEarned).toBe(110)
    expect(next.members.kyle.balance).toBe(60) // 110 - 50
  })

  it('preserves payoutLog across bumps', () => {
    const prev = defaultCrewDoc()
    prev.payoutLog = [{ at: '2026-01-15', amount: 500, member: 'alex' }]
    const next = bumpCrewEarned(prev, 100)
    expect(next.payoutLog).toHaveLength(1)
    expect(next.payoutLog[0].amount).toBe(500)
  })

  it('handles negative pool (loss-making order)', () => {
    const next = bumpCrewEarned(defaultCrewDoc(), -100)
    expect(next.members.alex.totalEarned).toBe(-50)
    expect(next.members.alex.balance).toBe(-50)
  })

  it('rounds each share to cents independently', () => {
    // Pool of 33.33; Alex gets 16.665 -> 16.67; DJ gets 6.666 -> 6.67
    const next = bumpCrewEarned(defaultCrewDoc(), 33.33)
    expect(next.members.alex.totalEarned).toBe(16.67)
    expect(next.members.dj.totalEarned).toBe(6.67)
    expect(next.members.kyle.totalEarned).toBe(3.33)
  })
})

describe('bumpRevenueFields', () => {
  const MS_2026_04_15_19UTC = Date.UTC(2026, 3, 15, 19, 0, 0) // a Wednesday afternoon
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
    // Jump forward a week
    const day2 = bumpRevenueFields(day1, 500, 400, 100, Date.UTC(2026, 3, 23, 19))
    expect(day2.dailyRevenue).toBe(500) // reset + added
    expect(day2.weeklyRevenue).toBe(500) // different ISO week
    expect(day2.allTimeRevenue).toBe(1500) // accumulated
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
    expect(jan.ytdRevenue).toBe(500) // reset for new year
    expect(jan.allTimeRevenue).toBe(1500)
  })
})

describe('isoWeekKey', () => {
  it('formats as YYYY-Www with zero padding', () => {
    const week = isoWeekKey(Date.UTC(2026, 0, 5, 12)) // Mon Jan 5, week 2
    expect(week).toMatch(/^\d{4}-W\d{2}$/)
  })

  it('groups the same Mon-Sun range under the same key', () => {
    const mon = isoWeekKey(Date.UTC(2026, 3, 13, 12))
    const sun = isoWeekKey(Date.UTC(2026, 3, 19, 12))
    expect(mon).toBe(sun)
  })
})
