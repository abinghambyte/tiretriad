import { describe, expect, it } from 'vitest'
import { isArchived } from './isArchived.js'

describe('isArchived', () => {
  it('returns false for null/undefined doc data', () => {
    expect(isArchived(null)).toBe(false)
    expect(isArchived(undefined)).toBe(false)
  })

  it('returns false when archivedAt field is absent (predates the soft-delete pattern)', () => {
    expect(isArchived({ name: 'Alex', email: 'alex@example.com' })).toBe(false)
  })

  it('returns false when archivedAt is explicitly null', () => {
    expect(isArchived({ archivedAt: null })).toBe(false)
  })

  it('returns false when archivedAt is undefined', () => {
    expect(isArchived({ archivedAt: undefined })).toBe(false)
  })

  it('returns true for a Firestore Timestamp-shaped object', () => {
    expect(isArchived({ archivedAt: { seconds: 1700000000, nanoseconds: 0 } })).toBe(true)
  })

  it('returns true for a Date instance', () => {
    expect(isArchived({ archivedAt: new Date() })).toBe(true)
  })

  it('returns true for an ISO string timestamp', () => {
    expect(isArchived({ archivedAt: '2026-04-26T12:00:00.000Z' })).toBe(true)
  })

  it('returns false for an empty string (defensive — should never happen but safe)', () => {
    expect(isArchived({ archivedAt: '' })).toBe(false)
  })

  it('does not get confused by archivedReason without archivedAt', () => {
    expect(isArchived({ archivedReason: 'some reason but no timestamp' })).toBe(false)
  })
})
