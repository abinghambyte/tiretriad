import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const {
  validateDeliveredByForCompletion,
  buildBumpAuditEntry,
  resolveBumpAuditSource,
} = require('./orders.js')

describe('validateDeliveredByForCompletion', () => {
  it('returns null when raw is undefined', () => {
    expect(validateDeliveredByForCompletion(undefined, 'delivery')).toBeNull()
  })

  it('returns null when raw is null', () => {
    expect(validateDeliveredByForCompletion(null, 'delivery')).toBeNull()
  })

  it('returns null when raw is empty string', () => {
    expect(validateDeliveredByForCompletion('', 'delivery')).toBeNull()
  })

  it('accepts dj on delivery orders', () => {
    expect(validateDeliveredByForCompletion('dj', 'delivery')).toBe('dj')
  })

  it('accepts alex on delivery orders', () => {
    expect(validateDeliveredByForCompletion('alex', 'delivery')).toBe('alex')
  })

  it('accepts kyle on delivery orders', () => {
    expect(validateDeliveredByForCompletion('kyle', 'delivery')).toBe('kyle')
  })

  it('normalizes case + whitespace', () => {
    expect(validateDeliveredByForCompletion('  DJ  ', 'delivery')).toBe('dj')
    expect(validateDeliveredByForCompletion('Alex', 'delivery')).toBe('alex')
  })

  it('rejects an unknown crew name (invalid-argument)', () => {
    let err
    try {
      validateDeliveredByForCompletion('mallory', 'delivery')
    } catch (e) {
      err = e
    }
    expect(err).toBeDefined()
    expect(err.code).toBe('invalid-argument')
  })

  it('rejects a deliveredBy on pickup orders (invalid-argument)', () => {
    let err
    try {
      validateDeliveredByForCompletion('dj', 'pickup')
    } catch (e) {
      err = e
    }
    expect(err).toBeDefined()
    expect(err.code).toBe('invalid-argument')
  })

  it('returns null on pickup when raw is empty', () => {
    expect(validateDeliveredByForCompletion(null, 'pickup')).toBeNull()
    expect(validateDeliveredByForCompletion(undefined, 'pickup')).toBeNull()
  })
})

describe('resolveBumpAuditSource', () => {
  it('returns slack-completion when data.source === "slack-completion"', () => {
    expect(resolveBumpAuditSource({ source: 'slack-completion' })).toBe(
      'slack-completion',
    )
  })

  it('returns web-completion otherwise', () => {
    expect(resolveBumpAuditSource({})).toBe('web-completion')
    expect(resolveBumpAuditSource(undefined)).toBe('web-completion')
    expect(resolveBumpAuditSource({ source: 'something-else' })).toBe(
      'web-completion',
    )
  })
})

describe('buildBumpAuditEntry', () => {
  it('builds the initial audit entry for a freshly set deliveredBy', () => {
    const setAt = { __sentinel: 'serverTimestamp' }
    const entry = buildBumpAuditEntry({
      newValue: 'dj',
      setBy: 'uid-123',
      setAt,
      source: 'web-completion',
    })
    expect(entry).toEqual({
      oldValue: null,
      newValue: 'dj',
      setBy: 'uid-123',
      setAt,
      source: 'web-completion',
      reason: null,
    })
  })

  it('passes through slack-completion source', () => {
    const setAt = { __sentinel: 'serverTimestamp' }
    const entry = buildBumpAuditEntry({
      newValue: 'alex',
      setBy: null,
      setAt,
      source: 'slack-completion',
    })
    expect(entry.source).toBe('slack-completion')
    expect(entry.setBy).toBeNull()
    expect(entry.oldValue).toBeNull()
  })
})
