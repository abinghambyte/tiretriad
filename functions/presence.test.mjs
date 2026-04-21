import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { updatePresenceImpl, MIN_INTERVAL_MS, USER_AGENT_MAX, truncate } = require('./presence')

function makeDb({ existingLastSeenMs } = {}) {
  const writes = []
  const doc = {
    async get() {
      if (existingLastSeenMs == null) return { exists: false, data: () => null }
      return {
        exists: true,
        data: () => ({
          presence: {
            lastSeenAt: { toMillis: () => existingLastSeenMs },
          },
        }),
      }
    },
    async set(data, opts) {
      writes.push({ data, opts })
      return undefined
    },
  }
  const db = {
    _writes: writes,
    collection(name) {
      if (name !== 'users') throw new Error(`unexpected collection: ${name}`)
      return {
        doc(uid) {
          return doc
        },
      }
    },
  }
  return db
}

describe('truncate', () => {
  it('returns the input when short enough', () => {
    expect(truncate('abc', 10)).toBe('abc')
  })
  it('cuts to the max length', () => {
    expect(truncate('abcdef', 3)).toBe('abc')
  })
  it('coerces nullish to empty string', () => {
    expect(truncate(null, 5)).toBe('')
    expect(truncate(undefined, 5)).toBe('')
  })
})

describe('updatePresenceImpl', () => {
  it('rejects when caller is unauthenticated', async () => {
    const db = makeDb()
    await expect(
      updatePresenceImpl({ data: {} }, db),
    ).rejects.toMatchObject({ code: 'unauthenticated' })
  })

  it('rejects with resource-exhausted when the rate window has not elapsed', async () => {
    const now = 1_000_000_000_000
    const db = makeDb({ existingLastSeenMs: now - (MIN_INTERVAL_MS - 100) })
    await expect(
      updatePresenceImpl(
        { auth: { uid: 'kyle' }, data: {} },
        db,
        { nowMs: () => now },
      ),
    ).rejects.toMatchObject({ code: 'resource-exhausted' })
    expect(db._writes).toHaveLength(0)
  })

  it('writes presence.lastSeenAt + userAgent on success', async () => {
    const now = 1_700_000_000_000
    const db = makeDb({ existingLastSeenMs: now - (MIN_INTERVAL_MS + 1000) })
    const res = await updatePresenceImpl(
      { auth: { uid: 'kyle' }, data: { userAgent: 'Mozilla/5.0' } },
      db,
      { nowMs: () => now },
    )
    expect(res.ok).toBe(true)
    expect(res.lastSeenAt).toBe(new Date(now).toISOString())
    expect(db._writes).toHaveLength(1)
    const [w] = db._writes
    expect(w.opts).toEqual({ merge: true })
    expect(w.data.presence.userAgent).toBe('Mozilla/5.0')
    // serverTimestamp sentinel is an opaque value; just assert it was set.
    expect(w.data.presence.lastSeenAt).toBeDefined()
  })

  it('writes on the first call even when the user doc is missing', async () => {
    const db = makeDb()
    const res = await updatePresenceImpl(
      { auth: { uid: 'dj' }, data: {} },
      db,
      { nowMs: () => 42 },
    )
    expect(res.ok).toBe(true)
    expect(db._writes).toHaveLength(1)
    expect(db._writes[0].data.presence.userAgent).toBe('')
  })

  it('truncates userAgent strings longer than the cap', async () => {
    const db = makeDb()
    const longUa = 'x'.repeat(USER_AGENT_MAX + 50)
    await updatePresenceImpl(
      { auth: { uid: 'alex' }, data: { userAgent: longUa } },
      db,
      { nowMs: () => 1 },
    )
    expect(db._writes[0].data.presence.userAgent.length).toBe(USER_AGENT_MAX)
  })
})
