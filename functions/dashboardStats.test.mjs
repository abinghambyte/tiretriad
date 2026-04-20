import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const {
  clampWindowDays,
  rollupCompletedOrderRows,
  getDashboardStatsImpl,
} = require('./dashboardStats')

describe('clampWindowDays', () => {
  it('defaults to 90 when missing or not finite', () => {
    expect(clampWindowDays(undefined)).toBe(90)
    expect(clampWindowDays(null)).toBe(90)
    expect(clampWindowDays('abc')).toBe(90)
  })

  it('clamps high values to 365', () => {
    expect(clampWindowDays(900)).toBe(365)
    expect(clampWindowDays(365)).toBe(365)
  })

  it('clamps low values to 1', () => {
    expect(clampWindowDays(0)).toBe(1)
    expect(clampWindowDays(-5)).toBe(1)
  })

  it('floors decimals inside the range', () => {
    expect(clampWindowDays(30.9)).toBe(30)
  })
})

describe('rollupCompletedOrderRows', () => {
  it('aggregates revenue, counts, and Denver calendar months', () => {
    const { Timestamp } = require('firebase-admin/firestore')
    const ts = Timestamp.fromMillis(Date.UTC(2026, 3, 15, 18, 0, 0))
    const rows = [
      { paymentAmount: 100, completedAt: ts },
      { paymentAmount: 50, completedAt: ts },
    ]
    const out = rollupCompletedOrderRows(rows)
    expect(out.orderCount).toBe(2)
    expect(out.totalRevenue).toBe(150)
    expect(out.byMonth.length).toBeGreaterThan(0)
    const bucket = out.byMonth.find((b) => b.yearMonth === '2026-04')
    expect(bucket).toBeDefined()
    expect(bucket.revenue).toBe(150)
    expect(bucket.count).toBe(2)
  })
})

describe('getDashboardStatsImpl', () => {
  it('throws unauthenticated when auth is missing', async () => {
    const mockDb = { collection: () => ({}) }
    await expect(getDashboardStatsImpl({ data: {} }, mockDb)).rejects.toMatchObject({
      code: 'unauthenticated',
    })
  })

  it('returns aggregated stats when authenticated', async () => {
    const { Timestamp } = require('firebase-admin/firestore')
    const ts = Timestamp.fromMillis(Date.UTC(2026, 2, 10, 12, 0, 0))
    const docData = { paymentAmount: 200, completedAt: ts }
    const chain = {
      where() {
        return chain
      },
      orderBy() {
        return chain
      },
      async get() {
        return { docs: [{ data: () => docData }] }
      },
    }
    const mockDb = {
      collection: () => chain,
    }
    const out = await getDashboardStatsImpl({ auth: { uid: 'test-user' }, data: { windowDays: 30 } }, mockDb)
    expect(out.orderCount).toBe(1)
    expect(out.totalRevenue).toBe(200)
    expect(out.byMonth.some((b) => b.count === 1 && b.revenue === 200)).toBe(true)
  })
})
