import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { resolveCompletionTimestamp } = require('./orders.js')

const THIRTY_DAYS_MS = 30 * 86_400_000

describe('resolveCompletionTimestamp', () => {
  it('returns now when input is absent', () => {
    const nowMs = 1_700_000_000_000
    const r = resolveCompletionTimestamp(undefined, nowMs)
    expect(r.completedMs).toBe(nowMs)
    expect(r.completedAt).toBeNull()
    expect(r.completedAtSource).toBeUndefined()
  })

  it('accepts a valid past time and marks backdated when older than same-now window', () => {
    const nowMs = 1_700_000_000_000
    const completedAtMs = nowMs - 5 * 60_000
    const r = resolveCompletionTimestamp({ completedAtMs }, nowMs)
    expect(r.completedMs).toBe(completedAtMs)
    expect(r.completedAt?.toMillis?.()).toBe(completedAtMs)
    expect(r.completedAtSource).toBe('backdated')
  })

  it('rejects future times beyond skew (rule: future skew)', () => {
    const nowMs = 1_700_000_000_000
    expect(() =>
      resolveCompletionTimestamp({ completedAtMs: nowMs + 120_000 }, nowMs),
    ).toThrowError(/future skew/i)
    try {
      resolveCompletionTimestamp({ completedAtMs: nowMs + 120_000 }, nowMs)
    } catch (e) {
      expect(e.code).toBe('invalid-argument')
    }
  })

  it('rejects times older than 30 days (rule: minimum window)', () => {
    const nowMs = 1_700_000_000_000
    expect(() =>
      resolveCompletionTimestamp({ completedAtMs: nowMs - 31 * 86_400_000 }, nowMs),
    ).toThrowError(/minimum window/i)
    try {
      resolveCompletionTimestamp({ completedAtMs: nowMs - 31 * 86_400_000 }, nowMs)
    } catch (e) {
      expect(e.code).toBe('invalid-argument')
    }
  })

  it('rejects non-numeric string (rule: finite number)', () => {
    const nowMs = 1_700_000_000_000
    expect(() =>
      resolveCompletionTimestamp({ completedAtMs: 'garbage' }, nowMs),
    ).toThrowError(/finite number/i)
    try {
      resolveCompletionTimestamp({ completedAtMs: 'garbage' }, nowMs)
    } catch (e) {
      expect(e.code).toBe('invalid-argument')
    }
  })

  it('rejects NaN (rule: finite number)', () => {
    const nowMs = 1_700_000_000_000
    expect(() => resolveCompletionTimestamp({ completedAtMs: NaN }, nowMs)).toThrowError(/finite number/i)
    try {
      resolveCompletionTimestamp({ completedAtMs: NaN }, nowMs)
    } catch (e) {
      expect(e.code).toBe('invalid-argument')
    }
  })

  it('accepts exactly the 30-day boundary', () => {
    const nowMs = 1_700_000_000_000
    const completedAtMs = nowMs - THIRTY_DAYS_MS
    const r = resolveCompletionTimestamp({ completedAtMs }, nowMs)
    expect(r.completedMs).toBe(completedAtMs)
    expect(r.completedAt?.toMillis?.()).toBe(completedAtMs)
    expect(r.completedAtSource).toBe('backdated')
  })
})
