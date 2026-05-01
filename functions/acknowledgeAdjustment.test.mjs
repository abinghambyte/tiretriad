import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { _testonly } = require('./acknowledgeAdjustment.js')
const { handle } = _testonly

const SENTINEL = { __sentinel: 'serverTimestamp' }

function makeFirestore({ docs: initial = {} } = {}) {
  const docs = { ...initial }
  const writes = []

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
      collection: (subname) => ({
        doc: (subId) => makeRef(`${path}/${subname}/${subId || 'auto'}`),
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
          writes.push({ path: ref.path, value, options })
          const merged = options && options.merge
            ? { ...(typeof docs[ref.path]?.data === 'function' ? docs[ref.path].data() : (docs[ref.path]?.data || {})), ...value }
            : value
          docs[ref.path] = { exists: true, data: () => merged }
        },
        update: (ref, patch) => {
          writes.push({ path: ref.path, patch })
          const cur = docs[ref.path] && typeof docs[ref.path].data === 'function'
            ? docs[ref.path].data()
            : (docs[ref.path]?.data || {})
          docs[ref.path] = { exists: true, data: () => ({ ...cur, ...patch }) }
        },
      }
      return fn(tx)
    },
  }

  return { firestore, writes, docs }
}

function seed() {
  return {
    'users/admin1': { exists: true, data: () => ({ role: 'admin', displayName: 'Admin' }) },
    'users/alex1': { exists: true, data: () => ({ role: 'crew', displayName: 'Alex Bingham', crewKey: 'alex' }) },
    'users/dj1': { exists: true, data: () => ({ role: 'crew', displayName: 'DJ', crewKey: 'dj' }) },
    'meta/crewEarnings': {
      exists: true,
      data: () => ({
        members: {
          alex: { balance: 200, adjustments: [{ adjustmentId: 'A1', delta: -10, acknowledgedBy: null, acknowledgedAt: null }] },
          dj: { balance: 300, adjustments: [{ adjustmentId: 'D1', delta: -20, acknowledgedBy: null, acknowledgedAt: null }] },
          kyle: { balance: 100, adjustments: [] },
        },
      }),
    },
  }
}

describe('acknowledgeAdjustment', () => {
  it('throws unauthenticated when auth missing', async () => {
    const { firestore } = makeFirestore({ docs: seed() })
    const fn = handle({ firestore })
    await expect(fn({ data: { crewKey: 'alex', adjustmentId: 'A1' }, auth: null }))
      .rejects.toThrow(/sign in/i)
  })

  it('throws invalid-argument when crewKey or adjustmentId missing or invalid', async () => {
    const { firestore } = makeFirestore({ docs: seed() })
    const fn = handle({ firestore })
    await expect(fn({ data: { crewKey: 'bob', adjustmentId: 'A1' }, auth: { uid: 'admin1' } }))
      .rejects.toThrow(/crewKey/)
    await expect(fn({ data: { crewKey: 'alex', adjustmentId: '' }, auth: { uid: 'admin1' } }))
      .rejects.toThrow(/adjustmentId/)
  })

  it('throws not-found when crew member missing', async () => {
    const docs = seed()
    docs['meta/crewEarnings'] = {
      exists: true,
      data: () => ({ members: { kyle: { balance: 0, adjustments: [] } } }),
    }
    const { firestore } = makeFirestore({ docs })
    const fn = handle({ firestore })
    await expect(fn({ data: { crewKey: 'alex', adjustmentId: 'A1' }, auth: { uid: 'admin1' } }))
      .rejects.toThrow(/crew member not found/i)
  })

  it('throws not-found when adjustmentId not in member.adjustments', async () => {
    const { firestore } = makeFirestore({ docs: seed() })
    const fn = handle({ firestore })
    await expect(fn({ data: { crewKey: 'alex', adjustmentId: 'NOPE' }, auth: { uid: 'admin1' } }))
      .rejects.toThrow(/adjustment not found/i)
  })

  it('crew can ack their OWN adjustment', async () => {
    const { firestore, writes } = makeFirestore({ docs: seed() })
    const fn = handle({ firestore })
    const res = await fn({
      data: { crewKey: 'alex', adjustmentId: 'A1' },
      auth: { uid: 'alex1' },
    })
    expect(res).toEqual({ ok: true })
    const crewWrite = writes.find((w) => w.path === 'meta/crewEarnings')
    expect(crewWrite).toBeTruthy()
    const adj = crewWrite.value.members.alex.adjustments[0]
    expect(adj.acknowledgedBy).toBe('alex1')
    expect(adj.acknowledgedAt).toBeTruthy()
  })

  it('crew CANNOT ack another member adjustment', async () => {
    const { firestore } = makeFirestore({ docs: seed() })
    const fn = handle({ firestore })
    await expect(fn({
      data: { crewKey: 'dj', adjustmentId: 'D1' },
      auth: { uid: 'alex1' },
    })).rejects.toThrow(/own adjustments/i)
  })

  it('admin can ack any adjustment', async () => {
    const { firestore, writes } = makeFirestore({ docs: seed() })
    const fn = handle({ firestore })
    const res = await fn({
      data: { crewKey: 'dj', adjustmentId: 'D1' },
      auth: { uid: 'admin1' },
    })
    expect(res).toEqual({ ok: true })
    const crewWrite = writes.find((w) => w.path === 'meta/crewEarnings')
    expect(crewWrite.value.members.dj.adjustments[0].acknowledgedBy).toBe('admin1')
  })

  it('idempotent: re-ack returns noChange', async () => {
    const docs = seed()
    docs['meta/crewEarnings'] = {
      exists: true,
      data: () => ({
        members: {
          alex: { balance: 200, adjustments: [{ adjustmentId: 'A1', delta: -10, acknowledgedBy: 'someone-else', acknowledgedAt: SENTINEL }] },
          dj: { balance: 300, adjustments: [] },
          kyle: { balance: 100, adjustments: [] },
        },
      }),
    }
    const { firestore, writes } = makeFirestore({ docs })
    const fn = handle({ firestore })
    const res = await fn({
      data: { crewKey: 'alex', adjustmentId: 'A1' },
      auth: { uid: 'alex1' },
    })
    expect(res).toEqual({ ok: true, noChange: true })
    const crewWrite = writes.find((w) => w.path === 'meta/crewEarnings')
    expect(crewWrite).toBeFalsy()
  })
})
