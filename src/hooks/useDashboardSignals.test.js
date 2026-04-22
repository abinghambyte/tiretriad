import { describe, expect, it, vi } from 'vitest'

// Isolate the pure selector. Mocking the firebase imports keeps this file
// importable in a node test environment.
vi.mock('../firebase/config', () => ({ db: {}, functions: {} }))
vi.mock('firebase/firestore', () => ({
  collection: () => ({}),
  doc: () => ({}),
  getCountFromServer: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  limit: () => ({}),
  orderBy: () => ({}),
  query: () => ({}),
  Timestamp: { fromMillis: () => ({}) },
  where: () => ({}),
}))
vi.mock('firebase/functions', () => ({ httpsCallable: () => () => Promise.resolve({}) }))
vi.mock('./useTires', () => ({ useTires: () => ({ tires: [], loading: false }) }))

const {
  deriveCrewSignals,
  deriveKylesQueueCount,
  selectHiddenGems,
  selectTopSellersFromRevenueDoc,
  selectRollingAverageRevenue,
} = await import('./useDashboardSignals.js')

function ts(ms) {
  return { toMillis: () => ms }
}

describe('deriveCrewSignals', () => {
  const now = new Date('2026-04-21T19:00:00-06:00').getTime()

  const users = [
    { id: 'kyle', data: { role: 'sourcer', presence: { lastSeenAt: ts(now - 60_000) } } },
    { id: 'dj', data: { role: 'mechanic' } },
    { id: 'alex', data: { role: 'admin', presence: { lastSeenAt: ts(now - 5_000) } } },
  ]

  function makeOrders() {
    const today = now
    const oneDay = 86400000
    return [
      // DJ: in-progress + completed today + completed yesterday
      { id: 'o1', data: { assignedTo: 'dj', status: 'scheduled' } },
      { id: 'o2', data: { assignedTo: 'dj', status: 'in_transit' } },
      { id: 'o3', data: { assignedTo: 'dj', status: 'completed', completedAt: ts(today) } },
      { id: 'o4', data: { assignedTo: 'dj', status: 'completed', completedAt: ts(today - oneDay) } },
      { id: 'o5', data: { assignedTo: 'dj', status: 'completed', completedAt: ts(today - 2 * oneDay) } },
      // Gap on day 3 back breaks streak at 3
      { id: 'o6', data: { assignedTo: 'dj', status: 'completed', completedAt: ts(today - 5 * oneDay) } },
      // Kyle: no orders
      // Alex: one completion today
      { id: 'o7', data: { assignedTo: 'alex', status: 'completed', completedAt: ts(today) } },
    ]
  }

  it('buckets per-user WIP, today completions, and streaks', () => {
    const map = deriveCrewSignals(users, makeOrders(), [], now)
    expect(map.dj.wipCount).toBe(2)
    expect(map.dj.todayCompletions).toBe(1)
    expect(map.dj.streakDays).toBe(3) // today, -1, -2
    expect(map.alex.todayCompletions).toBe(1)
    expect(map.alex.wipCount).toBe(0)
    expect(map.alex.streakDays).toBe(1)
    expect(map.kyle.wipCount).toBe(0)
    expect(map.kyle.todayCompletions).toBe(0)
    expect(map.kyle.streakDays).toBe(0)
  })

  it('returns lastSeenAt: null when no presence subdoc exists', () => {
    const map = deriveCrewSignals(users, [], [], now)
    expect(map.dj.lastSeenAt).toBeNull()
    expect(typeof map.kyle.lastSeenAt).toBe('number')
  })

  it('zeroes queueCount for non-sourcers and surfaces it for sourcers', () => {
    const tires = [
      { mspn: 'T1', researchQueue: { resolvedAt: null } },
      { mspn: 'T2', researchQueue: { resolvedAt: null } },
      // resolved entry should not count
      { mspn: 'T3', researchQueue: { resolvedAt: ts(now) } },
      // no queue
      { mspn: 'T4' },
    ]
    const map = deriveCrewSignals(users, [], tires, now)
    expect(map.kyle.queueCount).toBe(2)
    expect(map.dj.queueCount).toBe(0)
    expect(map.alex.queueCount).toBe(0)
  })

  it('defaults queueCount to 0 for everyone when Patch Q data is absent', () => {
    const map = deriveCrewSignals(users, [], [], now)
    expect(map.kyle.queueCount).toBe(0)
    expect(map.dj.queueCount).toBe(0)
  })

  it('caps streakDays at 99', () => {
    const oneDay = 86400000
    const orders = []
    for (let i = 0; i < 150; i += 1) {
      orders.push({
        id: `x${i}`,
        data: {
          assignedTo: 'dj',
          status: 'completed',
          completedAt: ts(now - i * oneDay),
        },
      })
    }
    const map = deriveCrewSignals(users, orders, [], now)
    expect(map.dj.streakDays).toBe(99)
  })
})

describe('deriveKylesQueueCount', () => {
  it('returns null while loading so consumers can render a placeholder', () => {
    expect(deriveKylesQueueCount([{ researchQueue: { resolvedAt: null } }], true)).toBeNull()
  })

  it('returns 0 when given a non-array tires input', () => {
    expect(deriveKylesQueueCount(null, false)).toBe(0)
    expect(deriveKylesQueueCount(undefined, false)).toBe(0)
  })

  it('counts open entries across every reason so the badge matches /my-queue', () => {
    const tires = [
      { researchQueue: { resolvedAt: null, reason: 'below-margin-floor' } },
      { researchQueue: { resolvedAt: null, reason: 'unutilized-needs-research' } },
      { researchQueue: { resolvedAt: null, reason: 'below-margin-floor' } },
    ]
    expect(deriveKylesQueueCount(tires, false)).toBe(3)
  })

  it('ignores resolved entries and tires with no queue', () => {
    const tires = [
      { researchQueue: { resolvedAt: ts(123), reason: 'below-margin-floor' } },
      { researchQueue: null },
      {},
      { researchQueue: { resolvedAt: null, reason: 'unutilized-needs-research' } },
    ]
    expect(deriveKylesQueueCount(tires, false)).toBe(1)
  })

  it('treats non-object researchQueue values as absent', () => {
    const tires = [
      { researchQueue: 'corrupted' },
      { researchQueue: 42 },
      { researchQueue: { resolvedAt: null } },
    ]
    expect(deriveKylesQueueCount(tires, false)).toBe(1)
  })
})

describe('selectHiddenGems', () => {
  it('keeps tires with marginConfirmed true and fewer than 2 active platform listings', () => {
    const tires = [
      {
        id: 't1',
        mspn: 'AAA',
        description: 'All-season 205/55R16',
        marginConfirmed: true,
        platformListings: {
          ebay: { status: 'active', lastPostedAt: ts(1_700_000_000_000) },
        },
      },
      {
        id: 't2',
        mspn: 'BBB',
        marginConfirmed: true,
        platformListings: {
          ebay: { status: 'active' },
          marketplace: { status: 'active' },
          craigslist: { status: 'active' },
        },
      },
      { id: 't3', mspn: 'CCC', marginConfirmed: false, platformListings: {} },
      { id: 't4', mspn: 'DDD', marginConfirmed: true },
    ]
    const gems = selectHiddenGems(tires)
    expect(gems).toHaveLength(2)
    expect(gems[0]).toMatchObject({
      id: 't1',
      sku: 'AAA',
      description: 'All-season 205/55R16',
      platformCount: 1,
      platforms: ['ebay'],
      lastPostedAt: 1_700_000_000_000,
    })
    expect(gems[1]).toMatchObject({
      id: 't4',
      sku: 'DDD',
      platformCount: 0,
      lastPostedAt: null,
    })
  })

  it('excludes listings whose status is not active when counting', () => {
    const tires = [
      {
        id: 't1',
        mspn: 'AAA',
        marginConfirmed: true,
        platformListings: {
          ebay: { status: 'active' },
          marketplace: { status: 'stale' },
          craigslist: { status: 'archived' },
        },
      },
    ]
    expect(selectHiddenGems(tires)).toHaveLength(1)
    expect(selectHiddenGems(tires)[0].platformCount).toBe(1)
  })

  it('returns [] for null / empty input', () => {
    expect(selectHiddenGems(null)).toEqual([])
    expect(selectHiddenGems([])).toEqual([])
  })
})

describe('selectTopSellersFromRevenueDoc', () => {
  it('returns [] when the doc has no topSellers field', () => {
    expect(selectTopSellersFromRevenueDoc({})).toEqual([])
    expect(selectTopSellersFromRevenueDoc(null)).toEqual([])
  })

  it('passes an array through unchanged', () => {
    const list = [{ rank: 1, sku: 'A', salesCount: 9 }]
    expect(selectTopSellersFromRevenueDoc({ topSellers: list })).toBe(list)
  })

  it('rejects non-array topSellers values', () => {
    expect(selectTopSellersFromRevenueDoc({ topSellers: 'oops' })).toEqual([])
    expect(selectTopSellersFromRevenueDoc({ topSellers: { 0: 'x' } })).toEqual([])
  })
})

describe('selectRollingAverageRevenue', () => {
  it('returns null when the doc has no dailyHistory', () => {
    expect(selectRollingAverageRevenue(null)).toBeNull()
    expect(selectRollingAverageRevenue({})).toBeNull()
  })

  it('returns null with fewer than three closed days of history', () => {
    expect(
      selectRollingAverageRevenue({
        dailyHistory: { '2026-04-10': 100, '2026-04-11': 200 },
        dailyWindow: '2026-04-20',
      }),
    ).toBeNull()
  })

  it('averages the most recent seven closed days, excluding today', () => {
    const history = {}
    for (let i = 1; i <= 10; i += 1) {
      const d = String(i + 10).padStart(2, '0')
      history[`2026-04-${d}`] = i * 100
    }
    // include today with a value that should be ignored
    history['2026-04-21'] = 999999
    const avg = selectRollingAverageRevenue({
      dailyHistory: history,
      dailyWindow: '2026-04-21',
    })
    // last 7 closed days keys 14..20 map to values 400..1000 (i = 4..10)
    // mean = (400+500+600+700+800+900+1000) / 7 = 700
    expect(avg).toBe(700)
  })
})
