import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const {
  DEFAULT_MARGIN_FLOOR,
  evaluateSweepCandidate,
  runBelowMarginFloorSweep,
  enqueueToResearchImpl,
  resolveQueueItemImpl,
} = require('./researchQueue')

/**
 * Build an in-memory Firestore stand-in that supports the narrow API
 * surface the queue code uses: `.collection().doc().get()`,
 * `.collection().get()`, `.batch().set(ref, data, { merge }).commit()`.
 */
function buildMockDb({ tires = {}, meta = {} } = {}) {
  const store = {
    tires: { ...tires },
    meta: { ...meta },
    users: {},
  }
  function tireRef(id) {
    return {
      __collection: 'tires',
      id,
      path: `tires/${id}`,
      async get() {
        const data = store.tires[id]
        return {
          exists: Object.prototype.hasOwnProperty.call(store.tires, id),
          data: () => data,
          get(field) {
            return data?.[field]
          },
        }
      },
      async set(patch, opts) {
        const merge = opts && opts.merge === true
        const current = store.tires[id] || {}
        store.tires[id] = merge ? deepMerge(current, patch) : { ...patch }
      },
    }
  }
  function metaRef(id) {
    return {
      __collection: 'meta',
      id,
      path: `meta/${id}`,
      async get() {
        return {
          exists: Object.prototype.hasOwnProperty.call(store.meta, id),
          data: () => store.meta[id],
          get(field) {
            return store.meta[id]?.[field]
          },
        }
      },
    }
  }
  function userRef(id) {
    return {
      __collection: 'users',
      id,
      async get() {
        return {
          exists: Object.prototype.hasOwnProperty.call(store.users, id),
          data: () => store.users[id],
          get(field) {
            return store.users[id]?.[field]
          },
        }
      },
    }
  }
  return {
    __store: store,
    collection(name) {
      if (name === 'tires') {
        return {
          doc: tireRef,
          async get() {
            return {
              docs: Object.keys(store.tires).map((id) => ({
                id,
                ref: tireRef(id),
                data: () => store.tires[id],
              })),
            }
          },
        }
      }
      if (name === 'meta') {
        return { doc: metaRef }
      }
      if (name === 'users') {
        return { doc: userRef }
      }
      throw new Error(`unknown collection: ${name}`)
    },
    batch() {
      const ops = []
      return {
        set(ref, patch, options) {
          ops.push({ ref, patch, options })
        },
        async commit() {
          for (const op of ops) {
            await op.ref.set(op.patch, op.options || {})
          }
        },
      }
    },
  }
}

function deepMerge(base, patch) {
  if (patch === null) return null
  if (Array.isArray(patch) || typeof patch !== 'object') return patch
  const out = { ...base }
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) {
      out[k] = null
    } else if (v && typeof v === 'object' && !Array.isArray(v) && base && typeof base[k] === 'object' && base[k] !== null) {
      out[k] = deepMerge(base[k], v)
    } else {
      out[k] = v
    }
  }
  return out
}

describe('evaluateSweepCandidate', () => {
  it('enqueues when margin is under the default floor', () => {
    const r = evaluateSweepCandidate(
      { retail: 100, price: 80, mountCost: 5, deliveryCost: 5, otherCost: 0, fet: 2 },
      DEFAULT_MARGIN_FLOOR,
    )
    expect(r.enqueue).toBe(true)
    expect(r.floor).toBe(DEFAULT_MARGIN_FLOOR)
  })

  it('skips when margin clears the floor', () => {
    const r = evaluateSweepCandidate(
      { retail: 200, price: 100, mountCost: 5, deliveryCost: 5, otherCost: 0, fet: 2 },
      DEFAULT_MARGIN_FLOOR,
    )
    expect(r.enqueue).toBe(false)
  })

  it('skips when marginConfirmed is true', () => {
    const r = evaluateSweepCandidate(
      { retail: 100, price: 95, marginConfirmed: true },
      DEFAULT_MARGIN_FLOOR,
    )
    expect(r.enqueue).toBe(false)
  })

  it('skips when there is already an existing research queue entry', () => {
    const r = evaluateSweepCandidate(
      { retail: 100, price: 95, researchQueue: { resolvedAt: null, reason: 'below-margin-floor' } },
      DEFAULT_MARGIN_FLOOR,
    )
    expect(r.enqueue).toBe(false)
  })

  it('skips when retail is zero or missing', () => {
    expect(evaluateSweepCandidate({ retail: 0, price: 10 }, DEFAULT_MARGIN_FLOOR).enqueue).toBe(false)
    expect(evaluateSweepCandidate({ price: 10 }, DEFAULT_MARGIN_FLOOR).enqueue).toBe(false)
  })

  it('honors per-tire marginFloor override', () => {
    const cleared = evaluateSweepCandidate(
      { retail: 100, price: 85, marginFloor: 0.1 },
      DEFAULT_MARGIN_FLOOR,
    )
    expect(cleared.enqueue).toBe(false)
    const still = evaluateSweepCandidate(
      { retail: 100, price: 85, marginFloor: 0.2 },
      DEFAULT_MARGIN_FLOOR,
    )
    expect(still.enqueue).toBe(true)
  })
})

describe('runBelowMarginFloorSweep', () => {
  it('is idempotent — two consecutive runs each enqueue a candidate exactly once', async () => {
    const db = buildMockDb({
      tires: {
        A: { retail: 100, price: 90 },
        B: { retail: 200, price: 100 },
      },
    })
    const serverTimestamp = () => 'TS'
    const r1 = await runBelowMarginFloorSweep(db, { serverTimestamp })
    expect(r1).toEqual({ scanned: 2, enqueued: 1 })
    expect(db.__store.tires.A.researchQueue).toMatchObject({
      reason: 'below-margin-floor',
      by: 'system',
      resolvedAt: null,
    })
    expect(db.__store.tires.B.researchQueue).toBeUndefined()

    const r2 = await runBelowMarginFloorSweep(db, { serverTimestamp })
    expect(r2).toEqual({ scanned: 2, enqueued: 0 })
  })

  it('skips tires with marginConfirmed: true', async () => {
    const db = buildMockDb({
      tires: {
        A: { retail: 100, price: 95, marginConfirmed: true },
      },
    })
    const r = await runBelowMarginFloorSweep(db, { serverTimestamp: () => 'TS' })
    expect(r).toEqual({ scanned: 1, enqueued: 0 })
    expect(db.__store.tires.A.researchQueue).toBeUndefined()
  })

  it('skips tires that already have an open queue entry', async () => {
    const db = buildMockDb({
      tires: {
        A: {
          retail: 100,
          price: 95,
          researchQueue: {
            at: 'prev',
            by: 'kyle',
            reason: 'below-margin-floor',
            resolvedAt: null,
            resolvedOutcome: null,
            resolvedBy: null,
          },
        },
      },
    })
    const r = await runBelowMarginFloorSweep(db, { serverTimestamp: () => 'TS' })
    expect(r).toEqual({ scanned: 1, enqueued: 0 })
    expect(db.__store.tires.A.researchQueue.by).toBe('kyle')
  })

  it('reads marginFloor from meta/payoutConfig', async () => {
    const db = buildMockDb({
      tires: { A: { retail: 100, price: 85 } },
      meta: { payoutConfig: { marginFloor: 0.1 } },
    })
    const r = await runBelowMarginFloorSweep(db, { serverTimestamp: () => 'TS' })
    expect(r.enqueued).toBe(0)
  })
})

describe('enqueueToResearchImpl', () => {
  function mkReq({ uid = 'u1', role = 'sourcer', data = {} } = {}) {
    return { auth: uid ? { uid } : null, data }
  }
  function dbWith(role) {
    const db = buildMockDb({
      tires: { A: { retail: 100, price: 90 } },
    })
    db.__store.users.u1 = { role }
    return db
  }

  it('rejects unauthenticated callers', async () => {
    const db = dbWith('sourcer')
    await expect(enqueueToResearchImpl(db, mkReq({ uid: null, data: { tireId: 'A', reason: 'below-margin-floor' } })))
      .rejects.toMatchObject({ code: 'unauthenticated' })
  })

  it('rejects viewer role', async () => {
    const db = dbWith('viewer')
    await expect(enqueueToResearchImpl(db, mkReq({ data: { tireId: 'A', reason: 'below-margin-floor' } })))
      .rejects.toMatchObject({ code: 'permission-denied' })
  })

  it('rejects unknown reason', async () => {
    const db = dbWith('sourcer')
    await expect(enqueueToResearchImpl(db, mkReq({ data: { tireId: 'A', reason: 'bogus' } })))
      .rejects.toMatchObject({ code: 'invalid-argument' })
  })

  it('writes a queue entry authored by the caller', async () => {
    const db = dbWith('sourcer')
    const res = await enqueueToResearchImpl(db, mkReq({ data: { tireId: 'A', reason: 'unutilized-needs-research' } }))
    expect(res).toEqual({ ok: true })
    expect(db.__store.tires.A.researchQueue).toMatchObject({
      by: 'u1',
      reason: 'unutilized-needs-research',
      resolvedAt: null,
    })
  })

  it('rejects when tire already has an open queue entry', async () => {
    const db = dbWith('sourcer')
    db.__store.tires.A.researchQueue = {
      at: 'x',
      by: 'system',
      reason: 'below-margin-floor',
      resolvedAt: null,
      resolvedOutcome: null,
      resolvedBy: null,
    }
    await expect(enqueueToResearchImpl(db, mkReq({ data: { tireId: 'A', reason: 'below-margin-floor' } })))
      .rejects.toMatchObject({ code: 'failed-precondition' })
  })
})

describe('resolveQueueItemImpl', () => {
  function mkReq({ uid = 'u1', data = {} } = {}) {
    return { auth: uid ? { uid } : null, data }
  }
  function seed(role, tire) {
    const db = buildMockDb({ tires: { A: tire } })
    db.__store.users.u1 = { role }
    return db
  }
  const openEntry = {
    at: 'prev',
    by: 'system',
    reason: 'below-margin-floor',
    resolvedAt: null,
    resolvedOutcome: null,
    resolvedBy: null,
  }

  it('rejects viewer role', async () => {
    const db = seed('viewer', { retail: 100, price: 95, researchQueue: openEntry })
    await expect(resolveQueueItemImpl(db, mkReq({ data: { tireId: 'A', outcome: 'punt' } })))
      .rejects.toMatchObject({ code: 'permission-denied' })
  })

  it('rejects non-sourcer non-admin (e.g. mechanic)', async () => {
    const db = seed('mechanic', { retail: 100, price: 95, researchQueue: openEntry })
    await expect(resolveQueueItemImpl(db, mkReq({ data: { tireId: 'A', outcome: 'punt' } })))
      .rejects.toMatchObject({ code: 'permission-denied' })
  })

  it('retail-wrong updates retail, clears queue, returns priorRetail', async () => {
    const db = seed('sourcer', { retail: 80, price: 75, researchQueue: openEntry })
    const res = await resolveQueueItemImpl(
      db,
      mkReq({ data: { tireId: 'A', outcome: 'retail-wrong', newRetail: 130 } }),
    )
    expect(res).toEqual({ ok: true, priorRetail: 80 })
    expect(db.__store.tires.A.retail).toBe(130)
    expect(db.__store.tires.A.researchQueue).toBe(null)
    expect(db.__store.tires.A.marginConfirmed).toBeUndefined()
  })

  it('retail-wrong rejects non-positive newRetail', async () => {
    const db = seed('sourcer', { retail: 80, price: 75, researchQueue: openEntry })
    await expect(resolveQueueItemImpl(
      db,
      mkReq({ data: { tireId: 'A', outcome: 'retail-wrong', newRetail: 0 } }),
    )).rejects.toMatchObject({ code: 'invalid-argument' })
  })

  it('confirm-archive sets marginConfirmed and fills resolution fields', async () => {
    const db = seed('sourcer', { retail: 80, price: 75, researchQueue: openEntry })
    const res = await resolveQueueItemImpl(
      db,
      mkReq({ data: { tireId: 'A', outcome: 'confirm-archive' } }),
    )
    expect(res).toEqual({ ok: true })
    expect(db.__store.tires.A.marginConfirmed).toBe(true)
    expect(db.__store.tires.A.researchQueue.resolvedOutcome).toBe('confirm-archive')
    expect(db.__store.tires.A.researchQueue.resolvedBy).toBe('u1')
  })

  it('punt bumps the queue entry and leaves it open', async () => {
    const db = seed('sourcer', { retail: 80, price: 75, researchQueue: openEntry })
    const res = await resolveQueueItemImpl(
      db,
      mkReq({ data: { tireId: 'A', outcome: 'punt' } }),
    )
    expect(res).toEqual({ ok: true })
    expect(db.__store.tires.A.researchQueue.resolvedAt).toBe(null)
    expect(db.__store.tires.A.marginConfirmed).toBeUndefined()
  })

  it('admin can resolve (not just sourcer)', async () => {
    const db = seed('admin', { retail: 80, price: 75, researchQueue: openEntry })
    await expect(resolveQueueItemImpl(
      db,
      mkReq({ data: { tireId: 'A', outcome: 'punt' } }),
    )).resolves.toEqual({ ok: true })
  })

  it('rejects unknown outcome', async () => {
    const db = seed('sourcer', { retail: 80, price: 75, researchQueue: openEntry })
    await expect(resolveQueueItemImpl(
      db,
      mkReq({ data: { tireId: 'A', outcome: 'bogus' } }),
    )).rejects.toMatchObject({ code: 'invalid-argument' })
  })
})
