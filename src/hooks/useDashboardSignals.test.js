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

const { deriveCrewSignals, deriveKylesQueueCount } = await import('./useDashboardSignals.js')

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
