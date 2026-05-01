import { createRequire } from 'node:module'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const { _testonly } = require('./applyOrderAdCostChange.js')
const { applyOrderAdCostChange } = _testonly

const fetchMock = vi.fn().mockResolvedValue({ status: 200, json: async () => ({ ok: true }) })
const originalFetch = global.fetch
beforeEach(() => {
  fetchMock.mockClear()
  global.fetch = fetchMock
  delete process.env.SLACK_BOT_TOKEN
})
afterEach(() => {
  global.fetch = originalFetch
  delete process.env.SLACK_BOT_TOKEN
})

function makeFirestore({ docs: initial = {}, users = [] } = {}) {
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
      where: (field, _op, value) => ({
        get: async () => ({
          docs: name === 'users'
            ? users.filter((u) => u[field] === value).map((u) => ({ data: () => u }))
            : [],
        }),
      }),
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

  return { firestore, orderUpdates, crewSets, auditSets, docs }
}

const PAYOUT_CFG_DOC = {
  exists: true,
  data: () => ({ splits: { alex: 0.35, dj: 0.35, kyle: 0.30 } }),
}

describe('applyOrderAdCostChange', () => {
  it('first set ($0 -> $20): debits the crew pool by adCost weighted via splits', async () => {
    const { firestore, orderUpdates, crewSets, auditSets } = makeFirestore({
      docs: {
        'meta/payoutConfig': PAYOUT_CFG_DOC,
        'orders/o1': {
          exists: true,
          data: () => ({
            paymentAmount: 1000,
            estimatedLandedCostAtCompletion: 800,
            adCost: 0,
            deliveredBy: null,
            deliveryBumpAtCompletion: 0.05,
          }),
        },
      },
    })
    const res = await applyOrderAdCostChange({
      firestore,
      orderId: 'o1',
      oldAdCost: 0,
      newAdCost: 20,
      actorId: 'u-admin',
      source: 'ad-cost-edit',
      notes: null,
    })
    expect(res.ok).toBe(true)
    expect(res.oldRealized).toBe(800)
    expect(res.newRealized).toBe(820)
    // poolDelta: (1000-820) - (1000-800) = 180-200 = -20
    expect(res.poolDelta).toBe(-20)
    expect(res.memberDeltas.alex.delta).toBe(-7) // 0.35*-20
    expect(res.memberDeltas.dj.delta).toBe(-7)
    expect(res.memberDeltas.kyle.delta).toBe(-6)

    expect(orderUpdates).toHaveLength(1)
    expect(orderUpdates[0].patch.adCost).toBe(20)
    expect(orderUpdates[0].patch.adCostSetBy).toBe('u-admin')

    expect(crewSets).toHaveLength(1)
    const crew = crewSets[0].value
    expect(crew.members.alex.balance).toBe(-7)
    expect(crew.members.alex.adjustments[0]).toMatchObject({
      orderId: 'o1',
      delta: -7,
      reason: 'ad-cost-edit',
      invoiceLineRef: null,
    })

    expect(auditSets).toHaveLength(1)
    expect(auditSets[0].value).toMatchObject({
      setBy: 'u-admin',
      source: 'ad-cost-edit',
      oldAdCost: 0,
      newAdCost: 20,
      oldEstimated: 800,
      newEstimated: 800,
    })
  })

  it('edit ($20 -> $35): only the delta moves the pool', async () => {
    const { firestore, orderUpdates } = makeFirestore({
      docs: {
        'meta/payoutConfig': PAYOUT_CFG_DOC,
        'orders/o1': {
          exists: true,
          data: () => ({
            paymentAmount: 1000,
            estimatedLandedCostAtCompletion: 800,
            adCost: 20,
            deliveredBy: null,
            deliveryBumpAtCompletion: 0.05,
          }),
        },
      },
    })
    const res = await applyOrderAdCostChange({
      firestore,
      orderId: 'o1',
      oldAdCost: 20,
      newAdCost: 35,
      actorId: 'u1',
      source: 'ad-cost-edit',
      notes: null,
    })
    expect(res.oldRealized).toBe(820)
    expect(res.newRealized).toBe(835)
    expect(res.poolDelta).toBe(-15)
    expect(orderUpdates[0].patch.adCost).toBe(35)
  })

  it('zeroing ($25 -> $0) credits the pool back', async () => {
    const { firestore } = makeFirestore({
      docs: {
        'meta/payoutConfig': PAYOUT_CFG_DOC,
        'orders/o1': {
          exists: true,
          data: () => ({
            paymentAmount: 1000,
            estimatedLandedCostAtCompletion: 800,
            adCost: 25,
            deliveredBy: null,
            deliveryBumpAtCompletion: 0.05,
          }),
        },
      },
    })
    const res = await applyOrderAdCostChange({
      firestore,
      orderId: 'o1',
      oldAdCost: 25,
      newAdCost: 0,
      actorId: 'u1',
      source: 'ad-cost-edit',
      notes: null,
    })
    expect(res.poolDelta).toBe(25)
    expect(res.memberDeltas.alex.delta).toBe(8.75)
  })

  it('no-change short-circuits with { ok: true, noChange: true }', async () => {
    const { firestore, orderUpdates, crewSets, auditSets } = makeFirestore({
      docs: {
        'meta/payoutConfig': PAYOUT_CFG_DOC,
        'orders/o1': {
          exists: true,
          data: () => ({
            paymentAmount: 1000,
            estimatedLandedCostAtCompletion: 800,
            adCost: 20,
          }),
        },
      },
    })
    const res = await applyOrderAdCostChange({
      firestore,
      orderId: 'o1',
      oldAdCost: 20,
      newAdCost: 20,
      actorId: 'u1',
      source: 'ad-cost-edit',
      notes: null,
    })
    expect(res).toEqual({ ok: true, noChange: true })
    expect(orderUpdates).toHaveLength(0)
    expect(crewSets).toHaveLength(0)
    expect(auditSets).toHaveLength(0)
  })

  it('respects deliveredBy bump when distributing the delta', async () => {
    const { firestore } = makeFirestore({
      docs: {
        'meta/payoutConfig': PAYOUT_CFG_DOC,
        'orders/o1': {
          exists: true,
          data: () => ({
            paymentAmount: 1000,
            estimatedLandedCostAtCompletion: 800,
            adCost: 0,
            deliveredBy: 'dj',
            deliveryBumpAtCompletion: 0.05,
          }),
        },
      },
    })
    // dj bumped to 0.40; remaining 0.60 distributed pro-rata to alex/kyle
    // (0.35/0.65 and 0.30/0.65). poolDelta = -100.
    const res = await applyOrderAdCostChange({
      firestore,
      orderId: 'o1',
      oldAdCost: 0,
      newAdCost: 100,
      actorId: 'u1',
      source: 'ad-cost-edit',
      notes: null,
    })
    expect(res.poolDelta).toBe(-100)
    expect(res.memberDeltas.dj.delta).toBe(-40)
    expect(res.memberDeltas.alex.delta).toBe(-32.31)
    expect(res.memberDeltas.kyle.delta).toBe(-27.69)
  })

  it('uses actualLandedCost when present (not estimated) for landed component', async () => {
    const { firestore } = makeFirestore({
      docs: {
        'meta/payoutConfig': PAYOUT_CFG_DOC,
        'orders/o1': {
          exists: true,
          data: () => ({
            paymentAmount: 1000,
            estimatedLandedCostAtCompletion: 850,
            actualLandedCost: 800,
            adCost: 0,
            deliveredBy: null,
            deliveryBumpAtCompletion: 0.05,
          }),
        },
      },
    })
    const res = await applyOrderAdCostChange({
      firestore,
      orderId: 'o1',
      oldAdCost: 0,
      newAdCost: 50,
      actorId: 'u1',
      source: 'ad-cost-edit',
      notes: null,
    })
    expect(res.oldRealized).toBe(800)
    expect(res.newRealized).toBe(850)
    expect(res.poolDelta).toBe(-50)
  })

  it('throws when order is missing', async () => {
    const { firestore } = makeFirestore({
      docs: { 'meta/payoutConfig': PAYOUT_CFG_DOC },
    })
    await expect(applyOrderAdCostChange({
      firestore,
      orderId: 'nope',
      oldAdCost: 0,
      newAdCost: 10,
      actorId: 'u1',
      source: 'ad-cost-edit',
      notes: null,
    })).rejects.toThrow(/order not found/i)
  })

  it('throws on missing orderId', async () => {
    const { firestore } = makeFirestore({})
    await expect(applyOrderAdCostChange({
      firestore,
      orderId: '',
      oldAdCost: 0,
      newAdCost: 10,
      actorId: 'u1',
      source: 'ad-cost-edit',
      notes: null,
    })).rejects.toThrow(/orderId required/i)
  })

  it('throws on negative or non-finite newAdCost', async () => {
    const { firestore } = makeFirestore({
      docs: {
        'meta/payoutConfig': PAYOUT_CFG_DOC,
        'orders/o1': {
          exists: true,
          data: () => ({ paymentAmount: 1000, estimatedLandedCostAtCompletion: 800 }),
        },
      },
    })
    await expect(applyOrderAdCostChange({
      firestore,
      orderId: 'o1',
      oldAdCost: 0,
      newAdCost: -5,
      actorId: 'u1',
      source: 'ad-cost-edit',
      notes: null,
    })).rejects.toThrow(/finite non-negative/i)
    await expect(applyOrderAdCostChange({
      firestore,
      orderId: 'o1',
      oldAdCost: 0,
      newAdCost: NaN,
      actorId: 'u1',
      source: 'ad-cost-edit',
      notes: null,
    })).rejects.toThrow(/finite non-negative/i)
  })

  it('dispatches DMs on ad-cost-edit when token is set', async () => {
    process.env.SLACK_BOT_TOKEN = 'xoxb-test'
    const { firestore } = makeFirestore({
      docs: {
        'meta/payoutConfig': PAYOUT_CFG_DOC,
        'orders/o1': {
          exists: true,
          data: () => ({
            paymentAmount: 1000,
            estimatedLandedCostAtCompletion: 800,
            adCost: 0,
            deliveredBy: null,
            deliveryBumpAtCompletion: 0.05,
          }),
        },
      },
      users: [
        { crewKey: 'alex', slackUserId: 'U_ALEX' },
        { crewKey: 'dj', slackUserId: 'U_DJ' },
        { crewKey: 'kyle', slackUserId: 'U_KYLE' },
      ],
    })
    await applyOrderAdCostChange({
      firestore,
      orderId: 'o1',
      oldAdCost: 0,
      newAdCost: 100,
      actorId: 'u1',
      source: 'ad-cost-edit',
      notes: null,
    })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('does not dispatch DMs when no token (silent skip)', async () => {
    const { firestore } = makeFirestore({
      docs: {
        'meta/payoutConfig': PAYOUT_CFG_DOC,
        'orders/o1': {
          exists: true,
          data: () => ({
            paymentAmount: 1000,
            estimatedLandedCostAtCompletion: 800,
            adCost: 0,
            deliveredBy: null,
            deliveryBumpAtCompletion: 0.05,
          }),
        },
      },
      users: [{ crewKey: 'dj', slackUserId: 'U_DJ' }],
    })
    await applyOrderAdCostChange({
      firestore,
      orderId: 'o1',
      oldAdCost: 0,
      newAdCost: 50,
      actorId: 'u1',
      source: 'ad-cost-edit',
      notes: null,
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
