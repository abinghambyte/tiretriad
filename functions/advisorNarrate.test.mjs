import { createRequire } from 'node:module'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const require = createRequire(import.meta.url)

// Require advisorNarrate ONCE at top-level. Previously each test called
// vi.resetModules() + deleted require.cache to re-pull the module, which
// re-imported firebase-admin five times per file. Under suite-wide CPU
// contention that re-import could exceed the 5s default timeout and
// surface as an intermittent failure. The module is a pure factory with
// no mutable module-level state; a single require is correct.
const advisorNarrateMod = require('./advisorNarrate.js')

const geminiMock = vi.fn()
const now = new Date('2026-04-23T12:00:00Z').getTime()

function makeFirestoreStub(initial = {}) {
  const store = { ...initial }
  return {
    store,
    collection(name) {
      return {
        doc(id) {
          const key = `${name}/${id}`
          return {
            async get() {
              return {
                exists: key in store,
                data: () => store[key],
              }
            },
            async set(value) {
              store[key] = value
            },
          }
        },
      }
    },
  }
}

async function load(firestore) {
  const make = await advisorNarrateMod._testonly.handle({
    firestore,
    now,
    callGemini: geminiMock,
  })
  return make
}

describe('advisorNarrate', () => {
  beforeEach(() => {
    geminiMock.mockReset()
  })

  it('returns cached narrative when cache entry is < 24h old', async () => {
    const firestore = makeFirestoreStub({
      'tires/t1': { brand: 'Michelin', size: 'LT265/70R17', lr: 'E', price: 287 },
      'advisorCache/t1_VELOCITY': {
        narrative: 'Cached story.',
        shadowFlag: '',
        writtenAt: now - 10 * 60 * 60 * 1000,
      },
    })
    const handle = await load(firestore)
    const result = await handle({ tireId: 't1', mode: 'VELOCITY' })
    expect(result.narrative).toBe('Cached story.')
    expect(geminiMock).not.toHaveBeenCalled()
  })

  it('calls Gemini on cache miss and writes result to cache', async () => {
    geminiMock.mockResolvedValue({
      text: 'Top signals: age and missing platforms.\n\n\u26A0\uFE0F Comps dropped 18% this week.',
    })
    const firestore = makeFirestoreStub({
      'tires/t1': { brand: 'Michelin', size: 'LT265/70R17', lr: 'E', price: 287 },
    })
    const handle = await load(firestore)
    const result = await handle({ tireId: 't1', mode: 'VELOCITY' })
    expect(geminiMock).toHaveBeenCalledTimes(1)
    expect(result.narrative).toMatch(/Top signals/)
    expect(result.shadowFlag).toMatch(/Comps dropped/)
    expect(firestore.store['advisorCache/t1_VELOCITY']).toBeTruthy()
    expect(firestore.store['advisorCache/t1_VELOCITY'].narrative).toMatch(/Top signals/)
  })

  it('omits shadowFlag when the model emits only narrative', async () => {
    geminiMock.mockResolvedValue({ text: 'Quick story, no warning.' })
    const firestore = makeFirestoreStub({
      'tires/t1': { brand: 'Michelin', size: 'LT265/70R17', lr: 'E', price: 287 },
    })
    const handle = await load(firestore)
    const result = await handle({ tireId: 't1', mode: 'VELOCITY' })
    expect(result.narrative).toBe('Quick story, no warning.')
    expect(result.shadowFlag).toBe('')
  })

  it('rejects unknown mode', async () => {
    const firestore = makeFirestoreStub({ 'tires/t1': {} })
    const handle = await load(firestore)
    await expect(handle({ tireId: 't1', mode: 'BOGUS' })).rejects.toThrow(/mode/i)
  })

  it('rejects missing tireId', async () => {
    const firestore = makeFirestoreStub()
    const handle = await load(firestore)
    await expect(handle({ mode: 'VELOCITY' })).rejects.toThrow(/tireId/i)
  })
})
