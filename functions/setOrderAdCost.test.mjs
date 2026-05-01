import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { _testonly } = require('./setOrderAdCost.js')
const { handle, SEVEN_DAYS_MS, AD_COST_CAP } = _testonly

const NOW = Date.UTC(2026, 4, 1, 12)
const FRESH_COMPLETED = NOW - 60 * 60 * 1000
const STALE_COMPLETED = NOW - SEVEN_DAYS_MS - 1000

function makeFirestore({ docs: initial = {} } = {}) {
  const docs = { ...initial }
  const orderUpdates = []
  const crewSets = []
  const auditSets = []
  let auditAutoId = 0

  function snap(path) {
    const d = docs[path]
    if (!d) return { exists: false, data: () => ({}) }
    return {
      exists: !!d.exists,
      data: () => (typeof d.data === 'function' ? d.data() : d.data || {}),
    }
  }
  function makeRef(path) {
    return {
      path,
      get: async () => snap(path),
      collection: (subname) => ({
        doc: (subId) => {
          const id = subId || `auto-${++auditAutoId}`
          return makeRef(`${path}/${subname}/${id}`)
        },
      }),
    }
  }
  const firestore = {
    collection: (name) => ({
      doc: (id) => makeRef(`${name}/${id}`),
      where: () => ({ get: async () => ({ docs: [] }) }),
    }),
    runTransaction: async (fn) => {
      const tx = {
        get: async (ref) => snap(ref.path),
        set: (ref, value, options) => {
          if (ref.path === 'meta/crewEarnings') crewSets.push({ value, options })
          else if (ref.path.includes('/costAudit/')) auditSets.push({ path: ref.path, value })
          const merged = options && options.merge
            ? { ...(typeof docs[ref.path]?.data === 'function' ? docs[ref.path].data() : (docs[ref.path]?.data || {})), ...value }
            : value
          docs[ref.path] = { exists: true, data: () => merged }
        },
        update: (ref, patch) => {
          orderUpdates.push({ path: ref.path, patch })
          const cur = docs[ref.path] && typeof docs[ref.path].data === 'function'
            ? docs[ref.path].data()
            : (docs[ref.path]?.data || {})
          docs[ref.path] = { exists: true, data: () => ({ ...cur, ...patch }) }
        },
      }
      return fn(tx)
    },
  }
  return { firestore, orderUpdates, crewSets, auditSets }
}

const PAYOUT_CFG = {
  exists: true,
  data: () => ({ splits: { alex: 0.35, dj: 0.35, kyle: 0.30 } }),
}

function adminFixture(overrides = {}) {
  return {
    'meta/payoutConfig': PAYOUT_CFG,
    'users/u-admin': { exists: true, data: () => ({ role: 'admin' }) },
    'users/u-closer': { exists: true, data: () => ({ role: 'member' }) },
    'users/u-rando': { exists: true, data: () => ({ role: 'member' }) },
    'orders/o1': {
      exists: true,
      data: () => ({
        paymentAmount: 1000,
        estimatedLandedCostAtCompletion: 800,
        adCost: 0,
        completedBy: 'u-closer',
        completedMs: FRESH_COMPLETED,
        deliveredBy: null,
        deliveryBumpAtCompletion: 0.05,
        ...overrides,
      }),
    },
  }
}

function call(firestore, args) {
  return handle({ firestore, nowFn: () => NOW })(args)
}

describe('setOrderAdCost callable', () => {
  it('rejects unauthenticated', async () => {
    const { firestore } = makeFirestore({ docs: adminFixture() })
    await expect(call(firestore, {
      data: { orderId: 'o1', adCost: 10 },
      auth: null,
    })).rejects.toMatchObject({ code: 'unauthenticated' })
  })

  it('rejects missing orderId', async () => {
    const { firestore } = makeFirestore({ docs: adminFixture() })
    await expect(call(firestore, {
      data: { orderId: '', adCost: 10 },
      auth: { uid: 'u-admin' },
    })).rejects.toMatchObject({ code: 'invalid-argument' })
  })

  it('rejects negative adCost', async () => {
    const { firestore } = makeFirestore({ docs: adminFixture() })
    await expect(call(firestore, {
      data: { orderId: 'o1', adCost: -5 },
      auth: { uid: 'u-admin' },
    })).rejects.toMatchObject({ code: 'invalid-argument' })
  })

  it('rejects non-finite adCost', async () => {
    const { firestore } = makeFirestore({ docs: adminFixture() })
    await expect(call(firestore, {
      data: { orderId: 'o1', adCost: 'not-a-number' },
      auth: { uid: 'u-admin' },
    })).rejects.toMatchObject({ code: 'invalid-argument' })
  })

  it('rejects above AD_COST_CAP', async () => {
    const { firestore } = makeFirestore({ docs: adminFixture() })
    await expect(call(firestore, {
      data: { orderId: 'o1', adCost: AD_COST_CAP + 1 },
      auth: { uid: 'u-admin' },
    })).rejects.toMatchObject({ code: 'invalid-argument' })
  })

  it('rejects when order is missing', async () => {
    const { firestore } = makeFirestore({ docs: adminFixture() })
    await expect(call(firestore, {
      data: { orderId: 'does-not-exist', adCost: 10 },
      auth: { uid: 'u-admin' },
    })).rejects.toMatchObject({ code: 'not-found' })
  })

  it('rejects non-admin non-closer with permission-denied', async () => {
    const { firestore } = makeFirestore({ docs: adminFixture() })
    await expect(call(firestore, {
      data: { orderId: 'o1', adCost: 10 },
      auth: { uid: 'u-rando' },
    })).rejects.toMatchObject({ code: 'permission-denied' })
  })

  it('rejects outside the 7-day window with failed-precondition', async () => {
    const { firestore } = makeFirestore({
      docs: adminFixture({ completedMs: STALE_COMPLETED }),
    })
    await expect(call(firestore, {
      data: { orderId: 'o1', adCost: 10 },
      auth: { uid: 'u-admin' },
    })).rejects.toMatchObject({ code: 'failed-precondition' })
  })

  it('rejects when completedMs is missing', async () => {
    const { firestore } = makeFirestore({
      docs: adminFixture({ completedMs: 0 }),
    })
    await expect(call(firestore, {
      data: { orderId: 'o1', adCost: 10 },
      auth: { uid: 'u-admin' },
    })).rejects.toMatchObject({ code: 'failed-precondition' })
  })

  it('returns noChange when adCost matches current', async () => {
    const { firestore, orderUpdates } = makeFirestore({
      docs: adminFixture({ adCost: 15 }),
    })
    const res = await call(firestore, {
      data: { orderId: 'o1', adCost: 15 },
      auth: { uid: 'u-admin' },
    })
    expect(res).toEqual({ ok: true, noChange: true })
    expect(orderUpdates).toHaveLength(0)
  })

  it('admin happy path: updates adCost and recomputes earnings', async () => {
    const { firestore, orderUpdates, crewSets, auditSets } = makeFirestore({
      docs: adminFixture(),
    })
    const res = await call(firestore, {
      data: { orderId: 'o1', adCost: 50 },
      auth: { uid: 'u-admin' },
    })
    expect(res.ok).toBe(true)
    expect(res.oldAdCost).toBe(0)
    expect(res.newAdCost).toBe(50)
    expect(res.poolDelta).toBe(-50)
    expect(orderUpdates).toHaveLength(1)
    expect(orderUpdates[0].patch.adCost).toBe(50)
    expect(orderUpdates[0].patch.adCostSetBy).toBe('u-admin')
    expect(crewSets).toHaveLength(1)
    expect(auditSets).toHaveLength(1)
    expect(auditSets[0].value).toMatchObject({
      source: 'ad-cost-edit',
      oldAdCost: 0,
      newAdCost: 50,
      setBy: 'u-admin',
    })
  })

  it('closer happy path: non-admin who closed the order can edit', async () => {
    const { firestore, orderUpdates } = makeFirestore({
      docs: adminFixture(),
    })
    const res = await call(firestore, {
      data: { orderId: 'o1', adCost: 25 },
      auth: { uid: 'u-closer' },
    })
    expect(res.ok).toBe(true)
    expect(res.newAdCost).toBe(25)
    expect(orderUpdates[0].patch.adCostSetBy).toBe('u-closer')
  })

  it('treats null adCost as $0 (clearing)', async () => {
    const { firestore, orderUpdates } = makeFirestore({
      docs: adminFixture({ adCost: 30 }),
    })
    const res = await call(firestore, {
      data: { orderId: 'o1', adCost: null },
      auth: { uid: 'u-admin' },
    })
    expect(res.ok).toBe(true)
    expect(res.newAdCost).toBe(0)
    expect(orderUpdates[0].patch.adCost).toBe(0)
  })
})
