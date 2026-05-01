import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { _testonly } = require('./orderDeliveredByEdit.js')
const { handle, applyDeliveredByChange, SEVEN_DAYS_MS } = _testonly

const NOW = Date.UTC(2026, 4, 1, 12) // 2026-05-01 12:00 UTC
const FRESH_COMPLETED = NOW - 60 * 60 * 1000 // 1h ago
const STALE_COMPLETED = NOW - SEVEN_DAYS_MS - 1000

/**
 * Build an in-memory firestore mock supporting:
 *   firestore.collection(name).doc(id).get()
 *   firestore.collection(name).doc(id).collection('bumpAudit').doc()
 *   firestore.runTransaction(fn) with tx.get/set/update
 * Tracks writes per-path so tests can assert what landed.
 */
function makeFirestore({ docs = {} } = {}) {
  const orderUpdates = []
  const crewSets = []
  const auditSets = []
  let auditAutoId = 0

  function makeRef(path) {
    return {
      path,
      get: async () => {
        const snap = docs[path]
        if (!snap) return { exists: false, data: () => ({}) }
        return {
          exists: !!snap.exists,
          data: () => (typeof snap.data === 'function' ? snap.data() : snap.data || {}),
        }
      },
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
    }),
    runTransaction: async (fn) => {
      const tx = {
        get: async (ref) => {
          const snap = docs[ref.path]
          if (!snap) return { exists: false, data: () => ({}) }
          return {
            exists: !!snap.exists,
            data: () => (typeof snap.data === 'function' ? snap.data() : snap.data || {}),
          }
        },
        set: (ref, value, options) => {
          if (ref.path === 'meta/djStats') {
            crewSets.push({ value, options })
          } else if (ref.path.startsWith('orders/') && ref.path.includes('/bumpAudit/')) {
            auditSets.push({ path: ref.path, value })
          } else {
            // generic catch-all
            crewSets.push({ path: ref.path, value, options })
          }
        },
        update: (ref, patch) => {
          orderUpdates.push({ path: ref.path, patch })
        },
      }
      return fn(tx)
    },
  }

  return { firestore, orderUpdates, crewSets, auditSets }
}

function adminUser() {
  return { exists: true, data: () => ({ role: 'admin' }) }
}

const BASE_ORDER = {
  exists: true,
  data: () => ({
    fulfillment: 'delivery',
    completedMs: FRESH_COMPLETED,
    paymentAmount: 100,
    deliveryBumpAtCompletion: 0.05,
    deliveredBy: 'dj',
  }),
}

function callHandle(opts) {
  const nowFn = opts.nowFn || (() => NOW)
  return handle({ firestore: opts.firestore, nowFn })
}

describe('editOrderDeliveredBy handle()', () => {
  it('throws unauthenticated when auth is missing', async () => {
    const { firestore } = makeFirestore({ docs: {} })
    const fn = callHandle({ firestore })
    let err
    try {
      await fn({ data: { orderId: 'o1', deliveredBy: 'kyle' }, auth: null })
    } catch (e) {
      err = e
    }
    expect(err).toBeDefined()
    expect(err.code).toBe('unauthenticated')
  })

  it('throws permission-denied when role !== admin', async () => {
    const { firestore } = makeFirestore({
      docs: {
        'users/u1': { exists: true, data: () => ({ role: 'mechanic' }) },
      },
    })
    const fn = callHandle({ firestore })
    let err
    try {
      await fn({ data: { orderId: 'o1', deliveredBy: 'kyle' }, auth: { uid: 'u1' } })
    } catch (e) {
      err = e
    }
    expect(err).toBeDefined()
    expect(err.code).toBe('permission-denied')
  })

  it('throws not-found when order does not exist', async () => {
    const { firestore } = makeFirestore({
      docs: { 'users/u1': adminUser() },
    })
    const fn = callHandle({ firestore })
    let err
    try {
      await fn({ data: { orderId: 'missing', deliveredBy: 'kyle' }, auth: { uid: 'u1' } })
    } catch (e) {
      err = e
    }
    expect(err).toBeDefined()
    expect(err.code).toBe('not-found')
  })

  it('throws failed-precondition when fulfillment !== delivery', async () => {
    const { firestore } = makeFirestore({
      docs: {
        'users/u1': adminUser(),
        'orders/o1': {
          exists: true,
          data: () => ({
            fulfillment: 'pickup',
            completedMs: FRESH_COMPLETED,
            paymentAmount: 100,
            deliveryBumpAtCompletion: 0.05,
          }),
        },
      },
    })
    const fn = callHandle({ firestore })
    let err
    try {
      await fn({ data: { orderId: 'o1', deliveredBy: 'kyle' }, auth: { uid: 'u1' } })
    } catch (e) {
      err = e
    }
    expect(err).toBeDefined()
    expect(err.code).toBe('failed-precondition')
  })

  it('throws failed-precondition when older than 7 days', async () => {
    const { firestore } = makeFirestore({
      docs: {
        'users/u1': adminUser(),
        'orders/o1': {
          exists: true,
          data: () => ({
            fulfillment: 'delivery',
            completedMs: STALE_COMPLETED,
            paymentAmount: 100,
            deliveryBumpAtCompletion: 0.05,
            deliveredBy: 'dj',
          }),
        },
      },
    })
    const fn = callHandle({ firestore })
    let err
    try {
      await fn({ data: { orderId: 'o1', deliveredBy: 'kyle' }, auth: { uid: 'u1' } })
    } catch (e) {
      err = e
    }
    expect(err).toBeDefined()
    expect(err.code).toBe('failed-precondition')
  })

  it('changes deliveredBy from dj to kyle: writes order, audit entry, recomputes crew via snapshot bump', async () => {
    const { firestore, orderUpdates, crewSets, auditSets } = makeFirestore({
      docs: {
        'users/u1': adminUser(),
        'orders/o1': BASE_ORDER,
        // payoutConfig missing -> uses DEFAULT_CONFIG.splits
      },
    })
    const fn = callHandle({ firestore })
    const res = await fn({
      data: { orderId: 'o1', deliveredBy: 'kyle', reason: 'fix' },
      auth: { uid: 'u1' },
    })
    expect(res).toEqual({ ok: true, oldValue: 'dj', newValue: 'kyle' })

    // Order patch lands
    expect(orderUpdates).toHaveLength(1)
    expect(orderUpdates[0].path).toBe('orders/o1')
    expect(orderUpdates[0].patch.deliveredBy).toBe('kyle')
    expect(orderUpdates[0].patch.deliveredBySetBy).toBe('u1')

    // Audit entry
    expect(auditSets).toHaveLength(1)
    expect(auditSets[0].value).toMatchObject({
      setBy: 'u1',
      oldValue: 'dj',
      newValue: 'kyle',
      source: 'admin-edit',
      reason: 'fix',
    })

    // Crew set: dj loses 1 bump count (now 0 due to floor) and 5 dollars,
    // kyle gains 1 bump count and 5 dollars (pool = 100, bump = 0.05).
    expect(crewSets).toHaveLength(1)
    const crew = crewSets[0].value
    expect(crew.members.dj.deliveryBumpCount).toBe(0)
    expect(crew.members.dj.totalDeliveryBumps).toBe(-5) // started at 0 with floored count
    expect(crew.members.kyle.deliveryBumpCount).toBe(1)
    expect(crew.members.kyle.totalDeliveryBumps).toBe(5)
  })

  it('clearing deliveredBy from kyle to null decrements kyle bump count + dollars', async () => {
    const { firestore, crewSets } = makeFirestore({
      docs: {
        'users/u1': adminUser(),
        'orders/o1': {
          exists: true,
          data: () => ({
            fulfillment: 'delivery',
            completedMs: FRESH_COMPLETED,
            paymentAmount: 100,
            deliveryBumpAtCompletion: 0.05,
            deliveredBy: 'kyle',
          }),
        },
        'meta/djStats': {
          exists: true,
          data: () => ({
            members: {
              alex: { totalEarned: 0, totalPaid: 0, balance: 0, totalDeliveryBumps: 0, deliveryBumpCount: 0 },
              dj: { totalEarned: 0, totalPaid: 0, balance: 0, totalDeliveryBumps: 0, deliveryBumpCount: 0 },
              kyle: { totalEarned: 100, totalPaid: 0, balance: 100, totalDeliveryBumps: 5, deliveryBumpCount: 1 },
            },
          }),
        },
      },
    })
    const fn = callHandle({ firestore })
    const res = await fn({
      data: { orderId: 'o1', deliveredBy: null },
      auth: { uid: 'u1' },
    })
    expect(res).toEqual({ ok: true, oldValue: 'kyle', newValue: null })

    expect(crewSets).toHaveLength(1)
    const crew = crewSets[0].value
    expect(crew.members.kyle.totalDeliveryBumps).toBe(0)
    expect(crew.members.kyle.deliveryBumpCount).toBe(0) // floored at 0
  })

  it('floors deliveryBumpCount at 0 when prior count was already 0', async () => {
    const { firestore, crewSets } = makeFirestore({
      docs: {
        'users/u1': adminUser(),
        'orders/o1': {
          exists: true,
          data: () => ({
            fulfillment: 'delivery',
            completedMs: FRESH_COMPLETED,
            paymentAmount: 100,
            deliveryBumpAtCompletion: 0.05,
            deliveredBy: 'kyle',
          }),
        },
        'meta/djStats': {
          exists: true,
          data: () => ({
            members: {
              kyle: { totalEarned: 0, totalPaid: 0, balance: 0, totalDeliveryBumps: 0, deliveryBumpCount: 0 },
            },
          }),
        },
      },
    })
    const fn = callHandle({ firestore })
    await fn({ data: { orderId: 'o1', deliveredBy: null }, auth: { uid: 'u1' } })
    expect(crewSets[0].value.members.kyle.deliveryBumpCount).toBe(0)
  })

  it('setting deliveredBy from null to dj increments dj count + dollars', async () => {
    const { firestore, crewSets } = makeFirestore({
      docs: {
        'users/u1': adminUser(),
        'orders/o1': {
          exists: true,
          data: () => ({
            fulfillment: 'delivery',
            completedMs: FRESH_COMPLETED,
            paymentAmount: 100,
            deliveryBumpAtCompletion: 0.05,
            // no deliveredBy
          }),
        },
      },
    })
    const fn = callHandle({ firestore })
    const res = await fn({
      data: { orderId: 'o1', deliveredBy: 'dj' },
      auth: { uid: 'u1' },
    })
    expect(res.oldValue).toBe(null)
    expect(res.newValue).toBe('dj')
    const crew = crewSets[0].value
    expect(crew.members.dj.deliveryBumpCount).toBe(1)
    expect(crew.members.dj.totalDeliveryBumps).toBe(5)
  })

  it('returns noChange when newValue equals current and writes nothing', async () => {
    const { firestore, orderUpdates, crewSets, auditSets } = makeFirestore({
      docs: {
        'users/u1': adminUser(),
        'orders/o1': BASE_ORDER,
      },
    })
    const fn = callHandle({ firestore })
    const res = await fn({
      data: { orderId: 'o1', deliveredBy: 'dj' },
      auth: { uid: 'u1' },
    })
    expect(res).toEqual({ ok: true, noChange: true })
    expect(orderUpdates).toHaveLength(0)
    expect(crewSets).toHaveLength(0)
    expect(auditSets).toHaveLength(0)
  })

  it('skipAdminCheck path (Slack) sets deliveredBy without an admin user lookup, tags audit slack-completion', async () => {
    const { firestore, orderUpdates, crewSets, auditSets } = makeFirestore({
      docs: {
        // Notably no users/u1 doc — skipAdminCheck means we never look it up.
        'orders/o1': {
          exists: true,
          data: () => ({
            fulfillment: 'delivery',
            completedMs: FRESH_COMPLETED,
            paymentAmount: 100,
            deliveryBumpAtCompletion: 0.05,
          }),
        },
      },
    })
    const res = await applyDeliveredByChange({
      firestore,
      orderId: 'o1',
      newValue: 'kyle',
      actorId: 'U-SLACK-123',
      source: 'slack-completion',
      reason: null,
      skipAdminCheck: true,
      nowFn: () => NOW,
    })
    expect(res.ok).toBe(true)
    expect(res.oldValue).toBe(null)
    expect(res.newValue).toBe('kyle')
    expect(res.bumpDollars).toBe(5)
    expect(orderUpdates).toHaveLength(1)
    expect(orderUpdates[0].patch.deliveredBy).toBe('kyle')
    expect(orderUpdates[0].patch.deliveredBySetBy).toBe('U-SLACK-123')
    expect(auditSets).toHaveLength(1)
    expect(auditSets[0].value).toMatchObject({
      setBy: 'U-SLACK-123',
      oldValue: null,
      newValue: 'kyle',
      source: 'slack-completion',
    })
    expect(crewSets).toHaveLength(1)
  })

  it('uses deliveryBumpAtCompletion from the order, not live config', async () => {
    // Order snapshotted bump is 0.10; meta/payoutConfig says 0.50 (live).
    // Result must use 0.10 -> bump dollars = 10 on a 100-pool, not 50.
    const { firestore, crewSets } = makeFirestore({
      docs: {
        'users/u1': adminUser(),
        'orders/o1': {
          exists: true,
          data: () => ({
            fulfillment: 'delivery',
            completedMs: FRESH_COMPLETED,
            paymentAmount: 100,
            deliveryBumpAtCompletion: 0.1,
            deliveredBy: null,
          }),
        },
        'meta/payoutConfig': {
          exists: true,
          data: () => ({
            splits: { alex: 0.35, dj: 0.35, kyle: 0.3 },
            deliveryBump: 0.5,
          }),
        },
      },
    })
    const fn = callHandle({ firestore })
    await fn({ data: { orderId: 'o1', deliveredBy: 'dj' }, auth: { uid: 'u1' } })
    const crew = crewSets[0].value
    expect(crew.members.dj.totalDeliveryBumps).toBe(10)
    expect(crew.members.dj.deliveryBumpCount).toBe(1)
  })
})
