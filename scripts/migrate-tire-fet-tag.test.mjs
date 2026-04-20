import { describe, expect, it } from 'vitest'
import { classifyHasFet } from './migrate-tire-fet-tag.mjs'

describe('classifyHasFet', () => {
  it('returns true when fet is 5.25 and hasFet is absent', () => {
    expect(classifyHasFet({ fet: 5.25 })).toBe(true)
  })

  it('returns false when fet is 0 and hasFet is absent', () => {
    expect(classifyHasFet({ fet: 0 })).toBe(false)
  })

  it('returns false when fet is missing and hasFet is absent', () => {
    expect(classifyHasFet({})).toBe(false)
  })

  it('returns true when fet is a numeric string and hasFet is absent', () => {
    expect(classifyHasFet({ fet: '4.50' })).toBe(true)
  })

  it('returns null when hasFet is true', () => {
    expect(classifyHasFet({ fet: 0, hasFet: true })).toBe(null)
  })

  it('returns null when hasFet is false', () => {
    expect(classifyHasFet({ fet: 5, hasFet: false })).toBe(null)
  })
})
