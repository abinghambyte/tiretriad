'use strict'

const admin = require('firebase-admin')
const { onCall, HttpsError } = require('firebase-functions/v2/https')
const { Timestamp } = require('firebase-admin/firestore')

/**
 * @param {unknown} raw
 * @returns {number} integer in [1, 365], default 90 when missing or non-finite
 */
function clampWindowDays(raw) {
  if (raw === undefined || raw === null || raw === '') return 90
  const n = Number(raw)
  if (!Number.isFinite(n)) return 90
  return Math.min(365, Math.max(1, Math.floor(n)))
}

/**
 * @param {number} ms
 * @returns {string} `YYYY-MM` in America/Denver
 */
function denverYearMonth(ms) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Denver',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date(ms))
  const y = parts.find((p) => p.type === 'year')?.value
  const m = parts.find((p) => p.type === 'month')?.value
  return `${y}-${m}`
}

/**
 * @param {FirebaseFirestore.DocumentData | Record<string, unknown>} data
 * @returns {number | null}
 */
function completedAtMs(data) {
  const c = data?.completedAt
  if (c && typeof c.toMillis === 'function') return c.toMillis()
  if (c && typeof c.seconds === 'number') {
    return c.seconds * 1000 + Math.floor((c.nanoseconds || 0) / 1e6)
  }
  return null
}

/**
 * @param {Array<FirebaseFirestore.DocumentData | Record<string, unknown>>} rows
 * @returns {{ totalRevenue: number, orderCount: number, byMonth: Array<{ yearMonth: string, revenue: number, count: number }> }}
 */
function rollupCompletedOrderRows(rows) {
  let totalRevenue = 0
  /** @type {Record<string, { revenue: number, count: number }>} */
  const monthMap = {}

  for (const data of rows) {
    const pay = Number(data.paymentAmount) || 0
    totalRevenue += pay
    const ms = completedAtMs(data)
    if (ms == null) continue
    const ym = denverYearMonth(ms)
    if (!monthMap[ym]) monthMap[ym] = { revenue: 0, count: 0 }
    monthMap[ym].revenue += pay
    monthMap[ym].count += 1
  }

  const byMonth = Object.keys(monthMap)
    .sort()
    .map((yearMonth) => ({
      yearMonth,
      revenue: monthMap[yearMonth].revenue,
      count: monthMap[yearMonth].count,
    }))

  return {
    totalRevenue,
    orderCount: rows.length,
    byMonth,
  }
}

/**
 * @param {FirebaseFirestore.Firestore} db
 * @param {number} windowDays
 */
async function readCompletedOrdersInWindow(db, windowDays) {
  const startMs = Date.now() - windowDays * 86400000
  const startTs = Timestamp.fromMillis(startMs)

  const qs = await db
    .collection('orders')
    .where('status', '==', 'completed')
    .where('completedAt', '>=', startTs)
    .orderBy('completedAt')
    .get()

  const rows = qs.docs.map((d) => d.data())
  return rollupCompletedOrderRows(rows)
}

/**
 * @param {import('firebase-functions/v2/https').CallableRequest} request
 * @param {FirebaseFirestore.Firestore} db
 */
async function getDashboardStatsImpl(request, db) {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.')
  }
  const data = request.data || {}
  const windowDays = clampWindowDays(data.windowDays)
  return readCompletedOrdersInWindow(db, windowDays)
}

const getDashboardStats = onCall(async (request) =>
  getDashboardStatsImpl(request, admin.firestore()),
)

module.exports = {
  getDashboardStats,
  clampWindowDays,
  rollupCompletedOrderRows,
  getDashboardStatsImpl,
}
