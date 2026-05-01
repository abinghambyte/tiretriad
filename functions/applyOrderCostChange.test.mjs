import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { _testonly } = require('./applyOrderCostChange.js')
const { applyOrderCostChange } = _testonly

/**
 * In-memory firestore mock: collection().doc().get/set/update,
 * runTransaction(fn) with tx.get/set/update, plus subcollection refs that
 * mint auto-ids. Mirrors the pattern in orderDeliveredByEdit.test.mjs but
 * supports tx writes that mutate the backing docs map so subsequent calls
 * within the same test see updated state.
 */
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
      set: async (value, options) => {
        const merged = options && options.merge
          ? { ...(typeof docs[path]?.data === 'function' ? docs[path].data() : (docs[path]?.data || {})), ...value }
          : value
        docs[path] = { exists: true, data: () => merged }
      },
      update: async (patch) => {
        const cur = docs[path] && typeof docs[path].data === 'function'
          ? docs[path].data()
          : (docs[path]?.data || {})
        docs[path] = { exists: true, data: () => ({ ...cur, ...patch }) }
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
        get: async (ref) => snap(ref.path),
        set: (ref, value, options) => {
          if (ref.path === 'meta/crewEarnings') {
            crewSets.push({ value, options })
          } else if (ref.path.includes('/costAudit/')) {
            auditSets.push({ path: ref.path, value })
          }
          // commit to backing docs so later reads see it
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

  return { firestore, orderUpdates, crewSets, auditSets, docs }
}

const PAYOUT_CFG_DOC = {
  exists: true,
  data: () => ({ splits: { alex: 0.35, dj: 0.35, kyle: 0.30 } }),
}

describe('applyOrderCostChange', () => {
  it('first attach: moves order from estimated to actual; debits crew', async () => {
    const { firestore, orderUpdates, crewSets, auditSets } = makeFirestore({
      docs: {
        'meta/payoutConfig': PAYOUT_CFG_DOC,
        'orders/o1': {
          exists: true,
          data: () => ({
            paymentAmount: 1164,
            estimatedLandedCostAtCompletion: 881.40,
            deliveredBy: 'dj',
            deliveryBumpAtCompletion: 0.05,
          }),
        },
      },
    })
    const res = await applyOrderCostChange({
      firestore,
      orderId: 'o1',
      incrementalActualCost: 953.13,
      invoiceLineRef: 'invoices/DA0065549567#0',
      actorId: 'u-admin',
      source: 'invoice-reconcile',
      notes: null,
    })

    expect(res.ok).toBe(true)
    expect(res.oldRealized).toBe(881.40)
    expect(res.newRealized).toBe(953.13)
    // poolDelta = (1164 - 953.13) - (1164 - 881.40) = 210.87 - 282.60 = -71.73
    expect(res.poolDelta).toBe(-71.73)
    // dj is bumped (+5pp -> 0.40); -71.73 * 0.40 = -28.692 -> -28.69
    expect(res.memberDeltas.dj).toBe(-28.69)

    expect(orderUpdates).toHaveLength(1)
    expect(orderUpdates[0].patch.actualLandedCost).toBe(953.13)
    expect(orderUpdates[0].patch.invoiceLineRef).toBe('invoices/DA0065549567#0')

    expect(crewSets).toHaveLength(1)
    const crew = crewSets[0].value
    expect(crew.members.dj.balance).toBe(-28.69)
    expect(Array.isArray(crew.members.dj.adjustments)).toBe(true)
    expect(crew.members.dj.adjustments).toHaveLength(1)
    expect(crew.members.dj.adjustments[0]).toMatchObject({
      orderId: 'o1',
      delta: -28.69,
      reason: 'invoice-reconcile',
      invoiceLineRef: 'invoices/DA0065549567#0',
      acknowledgedBy: null,
    })
    expect(typeof crew.members.dj.adjustments[0].adjustmentId).toBe('string')
    expect(crew.members.dj.adjustments[0].adjustmentId.length).toBeGreaterThan(0)

    expect(auditSets).toHaveLength(1)
    expect(auditSets[0].value).toMatchObject({
      setBy: 'u-admin',
      source: 'invoice-reconcile',
      newActual: 953.13,
      oldEstimated: 881.40,
      oldActual: null,
    })
  })

  it('second attach (multi-line): accumulates onto running actualLandedCost', async () => {
    const { firestore, orderUpdates } = makeFirestore({
      docs: {
        'meta/payoutConfig': PAYOUT_CFG_DOC,
        'orders/o1': {
          exists: true,
          data: () => ({
            paymentAmount: 1164,
            estimatedLandedCostAtCompletion: 881.40,
            actualLandedCost: 953.13,
            deliveredBy: 'dj',
            deliveryBumpAtCompletion: 0.05,
          }),
        },
      },
    })
    const res = await applyOrderCostChange({
      firestore,
      orderId: 'o1',
      incrementalActualCost: 250,
      invoiceLineRef: 'invoices/DA0065549568#0',
      actorId: 'u-admin',
      source: 'invoice-reconcile',
      notes: null,
    })
    expect(res.oldRealized).toBe(953.13)
    expect(res.newRealized).toBe(1203.13)
    // newPool = max(0, 1164 - 1203.13) = 0; oldPool = 210.87; delta = -210.87
    expect(res.poolDelta).toBe(-210.87)
    expect(orderUpdates[0].patch.actualLandedCost).toBe(1203.13)
    expect(orderUpdates[0].patch.invoiceLineRef).toBe('invoices/DA0065549568#0')
  })

  it('writes a costAudit entry every call', async () => {
    const { firestore, auditSets } = makeFirestore({
      docs: {
        'meta/payoutConfig': PAYOUT_CFG_DOC,
        'orders/o1': {
          exists: true,
          data: () => ({
            paymentAmount: 1000,
            estimatedLandedCostAtCompletion: 800,
            deliveredBy: null,
            deliveryBumpAtCompletion: 0.05,
          }),
        },
      },
    })
    await applyOrderCostChange({
      firestore,
      orderId: 'o1',
      incrementalActualCost: 700,
      invoiceLineRef: 'invoices/A#0',
      actorId: 'u1',
      source: 'invoice-reconcile',
      notes: null,
    })
    await applyOrderCostChange({
      firestore,
      orderId: 'o1',
      incrementalActualCost: 100,
      invoiceLineRef: 'invoices/A#1',
      actorId: 'u1',
      source: 'invoice-reconcile',
      notes: null,
    })
    expect(auditSets).toHaveLength(2)
  })

  it('returns { ok: true, noChange: true } when newRealized equals oldRealized', async () => {
    const { firestore, orderUpdates, crewSets, auditSets } = makeFirestore({
      docs: {
        'meta/payoutConfig': PAYOUT_CFG_DOC,
        'orders/o1': {
          exists: true,
          data: () => ({
            paymentAmount: 1000,
            actualLandedCost: 800,
            deliveredBy: null,
            deliveryBumpAtCompletion: 0.05,
          }),
        },
      },
    })
    const res = await applyOrderCostChange({
      firestore,
      orderId: 'o1',
      incrementalActualCost: 0,
      invoiceLineRef: 'invoices/A#0',
      actorId: 'u1',
      source: 'invoice-reconcile',
      notes: null,
    })
    expect(res).toEqual({ ok: true, noChange: true })
    expect(orderUpdates).toHaveLength(0)
    expect(crewSets).toHaveLength(0)
    expect(auditSets).toHaveLength(0)
  })

  it('handles deliveredBy null (no bump): straight 0.35/0.35/0.30 split', async () => {
    const { firestore, crewSets } = makeFirestore({
      docs: {
        'meta/payoutConfig': PAYOUT_CFG_DOC,
        'orders/o1': {
          exists: true,
          data: () => ({
            paymentAmount: 1000,
            estimatedLandedCostAtCompletion: 800,
            deliveredBy: null,
            deliveryBumpAtCompletion: 0.05,
          }),
        },
      },
    })
    // oldRealized=800, newRealized=900 -> poolDelta = 100 - 200 = -100
    const res = await applyOrderCostChange({
      firestore,
      orderId: 'o1',
      incrementalActualCost: 900,
      invoiceLineRef: 'invoices/A#0',
      actorId: 'u1',
      source: 'invoice-reconcile',
      notes: null,
    })
    expect(res.poolDelta).toBe(-100)
    expect(res.memberDeltas.alex).toBe(-35)
    expect(res.memberDeltas.dj).toBe(-35)
    expect(res.memberDeltas.kyle).toBe(-30)
    const crew = crewSets[0].value
    expect(crew.members.alex.balance).toBe(-35)
    expect(crew.members.dj.balance).toBe(-35)
    expect(crew.members.kyle.balance).toBe(-30)
    for (const k of ['alex', 'dj', 'kyle']) {
      expect(typeof crew.members[k].adjustments[0].adjustmentId).toBe('string')
      expect(crew.members[k].adjustments[0].adjustmentId.length).toBeGreaterThan(0)
    }
  })

  it('throws when order is missing', async () => {
    const { firestore } = makeFirestore({
      docs: { 'meta/payoutConfig': PAYOUT_CFG_DOC },
    })
    await expect(applyOrderCostChange({
      firestore,
      orderId: 'doesnotexist',
      incrementalActualCost: 100,
      invoiceLineRef: 'invoices/X#0',
      actorId: 'u1',
      source: 'invoice-reconcile',
      notes: null,
    })).rejects.toThrow(/order not found/i)
  })

  it('throws on non-finite incrementalActualCost', async () => {
    const { firestore } = makeFirestore({
      docs: {
        'meta/payoutConfig': PAYOUT_CFG_DOC,
        'orders/o1': {
          exists: true,
          data: () => ({ paymentAmount: 1000, estimatedLandedCostAtCompletion: 800 }),
        },
      },
    })
    await expect(applyOrderCostChange({
      firestore,
      orderId: 'o1',
      incrementalActualCost: NaN,
      invoiceLineRef: 'invoices/X#0',
      actorId: 'u1',
      source: 'invoice-reconcile',
      notes: null,
    })).rejects.toThrow(/finite/i)
  })

  it('throws when orderId is missing', async () => {
    const { firestore } = makeFirestore({})
    await expect(applyOrderCostChange({
      firestore,
      orderId: '',
      incrementalActualCost: 100,
      invoiceLineRef: 'invoices/X#0',
      actorId: 'u1',
      source: 'invoice-reconcile',
      notes: null,
    })).rejects.toThrow(/orderId required/i)
  })
})
