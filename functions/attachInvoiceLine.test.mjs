import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { _testonly } = require('./attachInvoiceLine.js')
const { handle } = _testonly

const ADMIN_USER = { exists: true, data: () => ({ role: 'admin' }) }

/**
 * Minimal firestore mock for attachInvoiceLine: collection().doc().get/update.
 * Tracks invoice updates so tests can assert lines + status rollup.
 */
function makeFirestore({ docs: initial = {} } = {}) {
  const docs = { ...initial }
  const invoiceUpdates = []

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
      update: async (patch) => {
        if (path.startsWith('invoices/')) {
          invoiceUpdates.push({ path, patch })
        }
        const cur = docs[path] && typeof docs[path].data === 'function'
          ? docs[path].data()
          : (docs[path]?.data || {})
        docs[path] = { exists: true, data: () => ({ ...cur, ...patch }) }
      },
    }
  }

  const firestore = {
    collection: (name) => ({
      doc: (id) => makeRef(`${name}/${id}`),
    }),
  }
  return { firestore, docs, invoiceUpdates }
}

function makeApplySpy() {
  const calls = []
  const fn = async (args) => {
    calls.push(args)
    return { ok: true }
  }
  return { fn, calls }
}

const FULL_INVOICE = {
  docNumber: 'DA0065549567',
  dr: 'DR3603421',
  countyTax: 80,
  localTax: 11.48,
  stateTax: 200,
  tireFee: 16,
  bonusTotal: 4153.84,
  lines: [
    {
      mspn: '19901',
      qty: 8,
      netUnitPrice: 519.23,
      extended: 4193.84,
      attachedOrderId: null,
      attachedAt: null,
      attachedBy: null,
    },
  ],
  status: 'pending',
}

describe('attachInvoiceLine', () => {
  it('throws unauthenticated when auth missing', async () => {
    const { firestore } = makeFirestore({})
    const apply = makeApplySpy()
    const fn = handle({ firestore, applyOrderCostChange: apply.fn })
    let err
    try {
      await fn({
        data: { invoiceId: 'x', lineIndex: 0, orderId: 'o1' },
        auth: null,
      })
    } catch (e) { err = e }
    expect(err).toBeDefined()
    expect(err.code).toBe('unauthenticated')
  })

  it('throws permission-denied when role !== admin', async () => {
    const { firestore } = makeFirestore({
      docs: {
        'users/u1': { exists: true, data: () => ({ role: 'mechanic' }) },
      },
    })
    const apply = makeApplySpy()
    const fn = handle({ firestore, applyOrderCostChange: apply.fn })
    let err
    try {
      await fn({
        data: { invoiceId: 'x', lineIndex: 0, orderId: 'o1' },
        auth: { uid: 'u1' },
      })
    } catch (e) { err = e }
    expect(err).toBeDefined()
    expect(err.code).toBe('permission-denied')
  })

  it('throws invalid-argument when invoiceId or lineIndex missing', async () => {
    const { firestore } = makeFirestore({
      docs: { 'users/u1': ADMIN_USER },
    })
    const apply = makeApplySpy()
    const fn = handle({ firestore, applyOrderCostChange: apply.fn })

    let err1
    try {
      await fn({ data: { orderId: 'o1' }, auth: { uid: 'u1' } })
    } catch (e) { err1 = e }
    expect(err1).toBeDefined()
    expect(err1.code).toBe('invalid-argument')

    let err2
    try {
      await fn({ data: { invoiceId: 'x', orderId: 'o1' }, auth: { uid: 'u1' } })
    } catch (e) { err2 = e }
    expect(err2).toBeDefined()
    expect(err2.code).toBe('invalid-argument')
  })

  it('throws not-found when invoice does not exist', async () => {
    const { firestore } = makeFirestore({
      docs: { 'users/u1': ADMIN_USER },
    })
    const apply = makeApplySpy()
    const fn = handle({ firestore, applyOrderCostChange: apply.fn })
    let err
    try {
      await fn({
        data: { invoiceId: 'missing', lineIndex: 0, orderId: 'o1' },
        auth: { uid: 'u1' },
      })
    } catch (e) { err = e }
    expect(err).toBeDefined()
    expect(err.code).toBe('not-found')
  })

  it('throws invalid-argument when lineIndex out of range', async () => {
    const { firestore } = makeFirestore({
      docs: {
        'users/u1': ADMIN_USER,
        'invoices/inv1': { exists: true, data: () => ({ ...FULL_INVOICE }) },
      },
    })
    const apply = makeApplySpy()
    const fn = handle({ firestore, applyOrderCostChange: apply.fn })
    let err
    try {
      await fn({
        data: { invoiceId: 'inv1', lineIndex: 5, orderId: 'o1' },
        auth: { uid: 'u1' },
      })
    } catch (e) { err = e }
    expect(err).toBeDefined()
    expect(err.code).toBe('invalid-argument')
  })

  it('returns noChange when target equals current attachedOrderId', async () => {
    const inv = {
      ...FULL_INVOICE,
      lines: [{ ...FULL_INVOICE.lines[0], attachedOrderId: 'orderA' }],
    }
    const { firestore, invoiceUpdates } = makeFirestore({
      docs: {
        'users/u1': ADMIN_USER,
        'invoices/inv1': { exists: true, data: () => inv },
      },
    })
    const apply = makeApplySpy()
    const fn = handle({ firestore, applyOrderCostChange: apply.fn })
    const res = await fn({
      data: { invoiceId: 'inv1', lineIndex: 0, orderId: 'orderA' },
      auth: { uid: 'u1' },
    })
    expect(res).toEqual({ ok: true, noChange: true })
    expect(apply.calls).toHaveLength(0)
    expect(invoiceUpdates).toHaveLength(0)
  })

  it('attaches a previously-unattached line: fires applyOrderCostChange once with positive cost', async () => {
    const { firestore, invoiceUpdates } = makeFirestore({
      docs: {
        'users/u1': ADMIN_USER,
        'invoices/inv1': { exists: true, data: () => ({ ...FULL_INVOICE }) },
      },
    })
    const apply = makeApplySpy()
    const fn = handle({ firestore, applyOrderCostChange: apply.fn })
    const res = await fn({
      data: { invoiceId: 'inv1', lineIndex: 0, orderId: 'orderA' },
      auth: { uid: 'u1' },
    })
    expect(res.ok).toBe(true)
    expect(res.priorOrderId).toBe(null)
    expect(res.newOrderId).toBe('orderA')
    expect(res.status).toBe('attached')
    expect(apply.calls).toHaveLength(1)
    expect(apply.calls[0].orderId).toBe('orderA')
    expect(apply.calls[0].incrementalActualCost).toBe(4501.32)
    expect(apply.calls[0].invoiceLineRef).toBe('invoices/inv1#0')
    expect(apply.calls[0].source).toBe('invoice-reconcile')
    expect(invoiceUpdates).toHaveLength(1)
    expect(invoiceUpdates[0].patch.status).toBe('attached')
    expect(invoiceUpdates[0].patch.lines[0].attachedOrderId).toBe('orderA')
    expect(invoiceUpdates[0].patch.lines[0].attachedBy).toBe('u1')
  })

  it('detaches: passes orderId null, reverses the prior attach with negative cost', async () => {
    const inv = {
      ...FULL_INVOICE,
      lines: [{ ...FULL_INVOICE.lines[0], attachedOrderId: 'orderA' }],
      status: 'attached',
    }
    const { firestore, invoiceUpdates } = makeFirestore({
      docs: {
        'users/u1': ADMIN_USER,
        'invoices/inv1': { exists: true, data: () => inv },
      },
    })
    const apply = makeApplySpy()
    const fn = handle({ firestore, applyOrderCostChange: apply.fn })
    const res = await fn({
      data: { invoiceId: 'inv1', lineIndex: 0, orderId: null },
      auth: { uid: 'u1' },
    })
    expect(res.ok).toBe(true)
    expect(res.priorOrderId).toBe('orderA')
    expect(res.newOrderId).toBe(null)
    expect(res.status).toBe('pending')
    expect(apply.calls).toHaveLength(1)
    expect(apply.calls[0].orderId).toBe('orderA')
    expect(apply.calls[0].incrementalActualCost).toBe(-4501.32)
    expect(apply.calls[0].notes).toBe('reverse prior attach')
    expect(invoiceUpdates[0].patch.status).toBe('pending')
    expect(invoiceUpdates[0].patch.lines[0].attachedOrderId).toBe(null)
    expect(invoiceUpdates[0].patch.lines[0].attachedBy).toBe(null)
  })

  it('re-attaches to a different order: reverses prior + applies to new', async () => {
    const inv = {
      ...FULL_INVOICE,
      lines: [{ ...FULL_INVOICE.lines[0], attachedOrderId: 'orderA' }],
      status: 'attached',
    }
    const { firestore } = makeFirestore({
      docs: {
        'users/u1': ADMIN_USER,
        'invoices/inv1': { exists: true, data: () => inv },
      },
    })
    const apply = makeApplySpy()
    const fn = handle({ firestore, applyOrderCostChange: apply.fn })
    const res = await fn({
      data: { invoiceId: 'inv1', lineIndex: 0, orderId: 'orderB' },
      auth: { uid: 'u1' },
    })
    expect(res.priorOrderId).toBe('orderA')
    expect(res.newOrderId).toBe('orderB')
    expect(res.status).toBe('attached')
    expect(apply.calls).toHaveLength(2)
    expect(apply.calls[0].orderId).toBe('orderA')
    expect(apply.calls[0].incrementalActualCost).toBe(-4501.32)
    expect(apply.calls[0].notes).toBe('reverse prior attach')
    expect(apply.calls[1].orderId).toBe('orderB')
    expect(apply.calls[1].incrementalActualCost).toBe(4501.32)
    expect(apply.calls[1].notes).toBe(null)
  })

  it('rolls up invoice status to attached when last line attaches', async () => {
    const twoLine = {
      ...FULL_INVOICE,
      lines: [
        { ...FULL_INVOICE.lines[0], qty: 4, extended: 2096.92, attachedOrderId: 'orderA' },
        { ...FULL_INVOICE.lines[0], qty: 4, extended: 2096.92, attachedOrderId: null },
      ],
      status: 'partial',
    }
    const { firestore, invoiceUpdates } = makeFirestore({
      docs: {
        'users/u1': ADMIN_USER,
        'invoices/inv1': { exists: true, data: () => twoLine },
      },
    })
    const apply = makeApplySpy()
    const fn = handle({ firestore, applyOrderCostChange: apply.fn })
    const res = await fn({
      data: { invoiceId: 'inv1', lineIndex: 1, orderId: 'orderB' },
      auth: { uid: 'u1' },
    })
    expect(res.status).toBe('attached')
    expect(invoiceUpdates[0].patch.status).toBe('attached')
  })

  it('rolls up invoice status to partial when one of two lines attaches', async () => {
    const twoLine = {
      ...FULL_INVOICE,
      lines: [
        { ...FULL_INVOICE.lines[0], qty: 4, extended: 2096.92, attachedOrderId: null },
        { ...FULL_INVOICE.lines[0], qty: 4, extended: 2096.92, attachedOrderId: null },
      ],
      status: 'pending',
    }
    const { firestore, invoiceUpdates } = makeFirestore({
      docs: {
        'users/u1': ADMIN_USER,
        'invoices/inv1': { exists: true, data: () => twoLine },
      },
    })
    const apply = makeApplySpy()
    const fn = handle({ firestore, applyOrderCostChange: apply.fn })
    const res = await fn({
      data: { invoiceId: 'inv1', lineIndex: 0, orderId: 'orderA' },
      auth: { uid: 'u1' },
    })
    expect(res.status).toBe('partial')
    expect(invoiceUpdates[0].patch.status).toBe('partial')
  })

  it('rolls up invoice status to pending when last attached line detaches', async () => {
    const twoLine = {
      ...FULL_INVOICE,
      lines: [
        { ...FULL_INVOICE.lines[0], qty: 4, extended: 2096.92, attachedOrderId: 'orderA' },
        { ...FULL_INVOICE.lines[0], qty: 4, extended: 2096.92, attachedOrderId: null },
      ],
      status: 'partial',
    }
    const { firestore, invoiceUpdates } = makeFirestore({
      docs: {
        'users/u1': ADMIN_USER,
        'invoices/inv1': { exists: true, data: () => twoLine },
      },
    })
    const apply = makeApplySpy()
    const fn = handle({ firestore, applyOrderCostChange: apply.fn })
    const res = await fn({
      data: { invoiceId: 'inv1', lineIndex: 0, orderId: null },
      auth: { uid: 'u1' },
    })
    expect(res.status).toBe('pending')
    expect(invoiceUpdates[0].patch.status).toBe('pending')
  })
})
