import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { trimPayload, sanitizeValue } = require('./adminAuditLog')

describe('sanitizeValue', () => {
  it('keeps primitives', () => {
    expect(sanitizeValue(42)).toBe(42)
    expect(sanitizeValue(true)).toBe(true)
    expect(sanitizeValue('ok')).toBe('ok')
    expect(sanitizeValue(null)).toBeNull()
    expect(sanitizeValue(undefined)).toBeNull()
  })

  it('truncates long strings to 400 chars', () => {
    const long = 'x'.repeat(800)
    expect(sanitizeValue(long)).toHaveLength(400)
  })

  it('recurses into nested objects up to depth 2 then stubs', () => {
    const nested = { a: { b: { c: { d: 'deep' } } } }
    const out = sanitizeValue(nested)
    // depth 0 -> recurses, depth 1 -> recurses, depth 2 -> stubs as '[object]'
    expect(out.a.b).toBe('[object]')
    expect(out.a).toEqual({ b: '[object]' })
  })

  it('clamps arrays to 20 elements and stubs beyond depth 2', () => {
    const big = Array.from({ length: 50 }, (_, i) => i)
    expect(sanitizeValue(big)).toHaveLength(20)
    const deepArr = { a: { b: [1, 2, 3] } }
    expect(sanitizeValue(deepArr).a.b).toBe('[array]')
  })
})

describe('trimPayload', () => {
  it('returns {} for non-object input', () => {
    expect(trimPayload(null)).toEqual({})
    expect(trimPayload(undefined)).toEqual({})
    expect(trimPayload('string')).toEqual({})
    expect(trimPayload(42)).toEqual({})
  })

  it('caps at 20 keys', () => {
    const many = {}
    for (let i = 0; i < 40; i++) many['key' + i] = i
    const out = trimPayload(many)
    expect(Object.keys(out)).toHaveLength(20)
  })

  it('sanitizes string values in payload', () => {
    expect(trimPayload({ note: 'x'.repeat(500) }).note).toHaveLength(400)
  })

  it('does not leak arbitrary function or symbol values', () => {
    expect(trimPayload({ fn: () => 1, s: Symbol('x') })).toEqual({ fn: null, s: null })
  })
})
