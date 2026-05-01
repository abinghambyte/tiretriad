import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { _testonly } = require('./importInvoice.js')
const { handle, lineShareIncremental } = _testonly

/**
 * In-memory firestore mock supporting:
 *   collection(name).doc(id).get / set / update
 *   collection('orders').where(...).where(...).get()  (chained, AND-only)
 *   collection().doc().collection('costAudit').doc()  (auto-id subcollection)
 *   runTransaction(fn) with tx.get/set/update; tx writes commit to backing
 *   docs map so subsequent reads in the same test see them.
 */
function makeFirestore({ docs: initial = {}, orders = [] } = {}) {
  const docs = { ...initial }
  const orderUpdates = []
  const crewSets = []
  const auditSets = []
  const invoiceSets = []
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
        if (path.startsWith('invoices/')) {
          invoiceSets.push({ path, value, options: options || null })
        }
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

  function makeQuery(name, filters) {
    return {
      where: (field, op, value) => makeQuery(name, [...filters, { field, op, value }]),
      get: async () => {
        if (name !== 'orders') {
          return { docs: [], empty: true }
        }
        const matched = orders.filter((o) =>
          filters.every((f) => f.op === '==' && o[f.field] === f.value),
        )
        return {
          empty: matched.length === 0,
          docs: matched.map((o) => ({
            id: o.id,
            data: () => o,
          })),
        }
      },
    }
  }

  const firestore = {
    collection: (name) => ({
      doc: (id) => makeRef(`${name}/${id}`),
      where: (field, op, value) => makeQuery(name, [{ field, op, value }]),
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

  return { firestore, docs, orderUpdates, crewSets, auditSets, invoiceSets }
}

const PAYOUT_CFG = {
  exists: true,
  data: () => ({ splits: { alex: 0.35, dj: 0.35, kyle: 0.30 } }),
}
const ADMIN_USER = { exists: true, data: () => ({ role: 'admin' }) }

function callHandle(firestore) {
  return handle({ firestore, nowFn: () => Date.now() })
}

const FULL_INVOICE = {
  docNumber: 'DA0065549567',
  invoiceDate: '2026-04-15',
  docDate: '2026-04-15',
  poNumber: null,
  orderNumber: null,
  dr: 'DR3603421',
  lines: [
    {
      mspn: '19901',
      qty: 8,
      unitPrice: 600,
      discount: 0,
      netUnitPrice: 519.23,
      unitFet: 4.50,
      extended: 4193.84,
    },
  ],
  countyTax: 80,
  localTax: 11.48,
  stateTax: 200,
  tireFee: 16,
  bonusTotal: 4153.84,
  nobonusTotal: 0,
  fetTotal: 36,
  invoiceTotal: 4501.32,
}

describe('importInvoice', () => {
  it('throws unauthenticated when auth missing', async () => {
    const { firestore } = makeFirestore({})
    const fn = callHandle(firestore)
    let err
    try {
      await fn({ data: { invoice: FULL_INVOICE }, auth: null })
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
    const fn = callHandle(firestore)
    let err
    try {
      await fn({ data: { invoice: FULL_INVOICE }, auth: { uid: 'u1' } })
    } catch (e) {
      err = e
    }
    expect(err).toBeDefined()
    expect(err.code).toBe('permission-denied')
  })

  it('throws invalid-argument when invoice payload missing', async () => {
    const { firestore } = makeFirestore({
      docs: { 'users/u1': ADMIN_USER },
    })
    const fn = callHandle(firestore)
    let err
    try {
      await fn({ data: {}, auth: { uid: 'u1' } })
    } catch (e) {
      err = e
    }
    expect(err).toBeDefined()
    expect(err.code).toBe('invalid-argument')
  })

  it('throws already-exists when docNumber already imported', async () => {
    const { firestore } = makeFirestore({
      docs: {
        'users/u1': ADMIN_USER,
        'invoices/DA0065549567': {
          exists: true,
          data: () => ({ status: 'attached' }),
        },
      },
    })
    const fn = callHandle(firestore)
    let err
    try {
      await fn({ data: { invoice: FULL_INVOICE }, auth: { uid: 'u1' } })
    } catch (e) {
      err = e
    }
    expect(err).toBeDefined()
    expect(err.code).toBe('already-exists')
  })

  it('happy path: writes the invoice doc and auto-attaches matching lines', async () => {
    const { firestore, invoiceSets, orderUpdates, auditSets, crewSets } = makeFirestore({
      docs: {
        'users/u1': ADMIN_USER,
        'meta/payoutConfig': PAYOUT_CFG,
        'orders/order1': {
          exists: true,
          data: () => ({
            dr: 'DR3603421',
            status: 'completed',
            mspn: '19901',
            quantity: 8,
            paymentAmount: 5000,
            estimatedLandedCostAtCompletion: 3992,
            deliveredBy: null,
            deliveryBumpAtCompletion: 0.05,
          }),
        },
      },
      orders: [
        {
          id: 'order1',
          dr: 'DR3603421',
          status: 'completed',
          mspn: '19901',
          quantity: 8,
        },
      ],
    })
    const fn = callHandle(firestore)
    const res = await fn({
      data: { invoice: FULL_INVOICE },
      auth: { uid: 'u1' },
    })
    expect(res).toEqual({
      ok: true,
      docId: 'DA0065549567',
      status: 'attached',
      attachedCount: 1,
    })

    expect(invoiceSets).toHaveLength(1)
    expect(invoiceSets[0].path).toBe('invoices/DA0065549567')
    expect(invoiceSets[0].value.status).toBe('attached')
    expect(invoiceSets[0].value.importedBy).toBe('u1')
    expect(invoiceSets[0].value.lines[0].attachedOrderId).toBe('order1')

    // applyOrderCostChange ran
    expect(orderUpdates).toHaveLength(1)
    expect(orderUpdates[0].path).toBe('orders/order1')
    // 4193.84 + ((80+11.48+200) * 4153.84/4153.84=full) + 16*8/8 = 4193.84 + 291.48 + 16 = 4501.32
    expect(orderUpdates[0].patch.actualLandedCost).toBe(4501.32)

    expect(auditSets).toHaveLength(1)
    expect(auditSets[0].value.source).toBe('invoice-reconcile')
    expect(crewSets).toHaveLength(1)
  })

  it('partial auto-attach: invoice with two lines, only one matching', async () => {
    const twoLineInvoice = {
      ...FULL_INVOICE,
      docNumber: 'DA0000000002',
      lines: [
        { mspn: '19901', qty: 4, unitPrice: 600, discount: 0, netUnitPrice: 519.23, unitFet: 4.5, extended: 2096.92 },
        { mspn: '88888', qty: 4, unitPrice: 600, discount: 0, netUnitPrice: 519.23, unitFet: 4.5, extended: 2096.92 },
      ],
      bonusTotal: 4153.84,
    }
    const { firestore, invoiceSets, orderUpdates } = makeFirestore({
      docs: {
        'users/u1': ADMIN_USER,
        'meta/payoutConfig': PAYOUT_CFG,
        'orders/order1': {
          exists: true,
          data: () => ({
            dr: 'DR3603421',
            status: 'completed',
            mspn: '19901',
            quantity: 4,
            paymentAmount: 3000,
            estimatedLandedCostAtCompletion: 2200,
            deliveredBy: null,
            deliveryBumpAtCompletion: 0.05,
          }),
        },
      },
      orders: [
        { id: 'order1', dr: 'DR3603421', status: 'completed', mspn: '19901', quantity: 4 },
      ],
    })
    const fn = callHandle(firestore)
    const res = await fn({
      data: { invoice: twoLineInvoice },
      auth: { uid: 'u1' },
    })
    expect(res.status).toBe('partial')
    expect(res.attachedCount).toBe(1)
    expect(invoiceSets[0].value.status).toBe('partial')
    expect(invoiceSets[0].value.lines[0].attachedOrderId).toBe('order1')
    expect(invoiceSets[0].value.lines[1].attachedOrderId).toBe(null)
    expect(orderUpdates).toHaveLength(1)
  })

  it('no auto-attach when no DR is set on any candidate order', async () => {
    const { firestore, invoiceSets, orderUpdates } = makeFirestore({
      docs: {
        'users/u1': ADMIN_USER,
        'meta/payoutConfig': PAYOUT_CFG,
      },
      orders: [], // no orders match
    })
    const fn = callHandle(firestore)
    const res = await fn({
      data: { invoice: FULL_INVOICE },
      auth: { uid: 'u1' },
    })
    expect(res.status).toBe('pending')
    expect(res.attachedCount).toBe(0)
    expect(invoiceSets[0].value.status).toBe('pending')
    expect(orderUpdates).toHaveLength(0)
  })
})

describe('lineShareIncremental', () => {
  it('rolls extended + tax share + tire fee share', async () => {
    const cost = lineShareIncremental(
      { qty: 8, netUnitPrice: 519.23, extended: 4193.84 },
      {
        countyTax: 80,
        localTax: 11.48,
        stateTax: 200,
        tireFee: 16,
        bonusTotal: 4153.84,
        totalTires: 8,
      },
    )
    expect(cost).toBe(4501.32)
  })
})
