/** @vitest-environment node */
import { describe, expect, it } from 'vitest'
import { categoryMapAgeStatus } from './categoryMapAgeStatus.js'

describe('categoryMapAgeStatus', () => {
  it('returns missing when map is null/undefined', () => {
    expect(categoryMapAgeStatus(null)).toEqual({ status: 'missing', ageDays: null })
    expect(categoryMapAgeStatus(undefined)).toEqual({ status: 'missing', ageDays: null })
  })

  it('returns unknown when importedAt is absent or unparseable', () => {
    expect(categoryMapAgeStatus({})).toEqual({ status: 'unknown', ageDays: null })
    expect(categoryMapAgeStatus({ importedAt: 'not a date' })).toEqual({ status: 'unknown', ageDays: null })
    expect(categoryMapAgeStatus({ importedAt: null })).toEqual({ status: 'unknown', ageDays: null })
  })

  it('returns fresh for recent imports (within 30 days)', () => {
    const fiveDaysAgo = Date.now() - 5 * 24 * 60 * 60 * 1000
    expect(categoryMapAgeStatus({ importedAt: { toMillis: () => fiveDaysAgo } })).toEqual({
      status: 'fresh',
      ageDays: 5,
    })
  })

  it('returns stale for imports older than 30 days', () => {
    const fortyDaysAgo = Date.now() - 40 * 24 * 60 * 60 * 1000
    expect(categoryMapAgeStatus({ importedAt: { toMillis: () => fortyDaysAgo } })).toEqual({
      status: 'stale',
      ageDays: 40,
    })
  })

  it('accepts JS Date and ISO string for importedAt', () => {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
    expect(categoryMapAgeStatus({ importedAt: oneDayAgo }).status).toBe('fresh')

    const isoString = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()
    expect(categoryMapAgeStatus({ importedAt: isoString }).status).toBe('stale')
  })
})
