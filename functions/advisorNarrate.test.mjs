import { createRequire } from 'node:module'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const require = createRequire(import.meta.url)

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
  vi.resetModules()
  // Re-require after resetModules to get a fresh module instance.
  delete require.cache[require.resolve('./advisorNarrate.js')]
  const mod = require('./advisorNarrate.js')
  const make = await mod._testonly.handle({ firestore, now, callGemini: geminiMock })
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
