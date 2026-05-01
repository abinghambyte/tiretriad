import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { _testonly } = require('./listingCoachStyleGuide.js')

const { addStyleRule, listStyleRules, toggleStyleRule, removeStyleRule } = _testonly

function makeFirestore({ rules = [] } = {}) {
  const docs = new Map()
  docs.set('meta/listingCoachStyleGuide', {
    exists: rules.length > 0,
    data: () => ({ rules }),
  })
  const writes = []
  return {
    writes,
    collection: (name) => ({
      doc: (id) => ({
        get: async () => docs.get(`${name}/${id}`) || { exists: false, data: () => null },
        set: async (data, opts) => {
          writes.push({ path: `${name}/${id}`, data, opts })
          docs.set(`${name}/${id}`, { exists: true, data: () => data })
        },
        update: async (data) => {
          writes.push({ path: `${name}/${id}`, data, op: 'update' })
          const cur = (docs.get(`${name}/${id}`) || {}).data?.() || {}
          docs.set(`${name}/${id}`, { exists: true, data: () => ({ ...cur, ...data }) })
        },
      }),
    }),
  }
}

describe('addStyleRule', () => {
  it('appends a new rule to the empty doc', async () => {
    const fs = makeFirestore()
    const r = await addStyleRule({ firestore: fs, rule: 'Never mention FET in consumer listings.', audience: 'consumer', addedBy: 'u1', reason: 'corr' })
    expect(r.ok).toBe(true)
    expect(typeof r.id).toBe('string')
    const w = fs.writes[fs.writes.length - 1]
    expect(w.data.rules).toHaveLength(1)
    expect(w.data.rules[0].rule).toBe('Never mention FET in consumer listings.')
    expect(w.data.rules[0].audience).toBe('consumer')
    expect(w.data.rules[0].enabled).toBe(true)
    expect(w.data.rules[0].addedBy).toBe('u1')
  })

  it('rejects audience not in [consumer, commercial, all]', async () => {
    const fs = makeFirestore()
    await expect(addStyleRule({ firestore: fs, rule: 'x', audience: 'unknown', addedBy: 'u1' })).rejects.toThrow(/audience/i)
  })

  it('rejects empty rule', async () => {
    const fs = makeFirestore()
    await expect(addStyleRule({ firestore: fs, rule: '   ', audience: 'all', addedBy: 'u1' })).rejects.toThrow(/rule/i)
  })

  it('detects exact-text duplicates and returns the existing id', async () => {
    const existing = [{ id: 'r1', rule: 'X', audience: 'all', addedBy: 'u1', enabled: true }]
    const fs = makeFirestore({ rules: existing })
    const r = await addStyleRule({ firestore: fs, rule: 'X', audience: 'all', addedBy: 'u2' })
    expect(r.id).toBe('r1')
    expect(r.duplicate).toBe(true)
    expect(fs.writes).toHaveLength(0)
  })
})

describe('listStyleRules', () => {
  it('returns empty array when doc missing', async () => {
    const fs = makeFirestore()
    const r = await listStyleRules({ firestore: fs })
    expect(r).toEqual([])
  })

  it('filters to enabled by default', async () => {
    const rules = [
      { id: 'r1', rule: 'A', audience: 'all', enabled: true },
      { id: 'r2', rule: 'B', audience: 'all', enabled: false },
    ]
    const fs = makeFirestore({ rules })
    const r = await listStyleRules({ firestore: fs })
    expect(r.map((x) => x.id)).toEqual(['r1'])
  })

  it('filters by audience matching all + the requested', async () => {
    const rules = [
      { id: 'r1', rule: 'A', audience: 'all', enabled: true },
      { id: 'r2', rule: 'B', audience: 'consumer', enabled: true },
      { id: 'r3', rule: 'C', audience: 'commercial', enabled: true },
    ]
    const fs = makeFirestore({ rules })
    const out = await listStyleRules({ firestore: fs, audience: 'consumer' })
    expect(out.map((x) => x.id).sort()).toEqual(['r1', 'r2'])
  })
})

describe('toggleStyleRule', () => {
  it('flips enabled', async () => {
    const rules = [{ id: 'r1', rule: 'A', audience: 'all', enabled: true }]
    const fs = makeFirestore({ rules })
    const r = await toggleStyleRule({ firestore: fs, id: 'r1', enabled: false })
    expect(r.ok).toBe(true)
    const w = fs.writes[fs.writes.length - 1]
    expect(w.data.rules[0].enabled).toBe(false)
  })

  it('throws when id not found', async () => {
    const fs = makeFirestore({ rules: [] })
    await expect(toggleStyleRule({ firestore: fs, id: 'rX', enabled: false })).rejects.toThrow(/not found/i)
  })
})

describe('removeStyleRule', () => {
  it('removes by id', async () => {
    const rules = [{ id: 'r1', rule: 'A', audience: 'all', enabled: true }]
    const fs = makeFirestore({ rules })
    await removeStyleRule({ firestore: fs, id: 'r1' })
    const w = fs.writes[fs.writes.length - 1]
    expect(w.data.rules).toEqual([])
  })
})
