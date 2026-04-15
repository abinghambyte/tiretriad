/**
 * meta/revenueStats + meta/crewEarnings + per-tire sales counters (Batch 1).
 * Denver calendar for daily/ytd windows; ISO week (Mon) for weekly.
 */
const { FieldValue } = require('firebase-admin/firestore')
const { tireCatalogBuyNumber } = require('./tireCatalogBuy')

const REVENUE_REF = (db) => db.collection('meta').doc('revenueStats')
const CREW_REF = (db) => db.collection('meta').doc('crewEarnings')

const CREW_KEYS = ['alex', 'dj', 'tanner', 'kyle']
const CREW_SPLIT = { alex: 0.5, dj: 0.2, tanner: 0.2, kyle: 0.1 }

/** Slack /spoils + /owed pool/balance lines — Tanner is a silent partner (profit share only, no ops role). */
function crewSlackSplitDisplayName(key) {
  const k = String(key || '').toLowerCase()
  if (k === 'tanner') return "Tanner (Silent partner)"
  return k
}

/** meta/crewEarnings UI (portal + Slack confirmations tied to stored balances). */
function crewEarningsMetaDisplayName(key) {
  const k = String(key || '').toLowerCase()
  if (k === 'tanner') return "Tanner — Silent partner"
  return k
}

function denverYmd(ms = Date.now()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Denver',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(ms))
  const y = parts.find((p) => p.type === 'year')?.value
  const m = parts.find((p) => p.type === 'month')?.value
  const d = parts.find((p) => p.type === 'day')?.value
  return `${y}-${m}-${d}`
}

/** Denver calendar month key `YYYY-MM` (for quota / monthly revenue rollups). */
function denverYm(ms = Date.now()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Denver',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date(ms))
  const y = parts.find((p) => p.type === 'year')?.value
  const m = parts.find((p) => p.type === 'month')?.value
  return `${y}-${m}`
}

/** ISO week key like 2026-W15 (week starts Monday). */
function isoWeekKey(ms = Date.now()) {
  const d = new Date(ms)
  const day = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - day + 3)
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const yearStart = new Date(Date.UTC(firstThursday.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil(((firstThursday - yearStart) / 86400000 + 1) / 7)
  const y = firstThursday.getUTCFullYear()
  return `${y}-W${String(weekNo).padStart(2, '0')}`
}

function denverYear(ms = Date.now()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Denver',
    year: 'numeric',
  }).formatToParts(new Date(ms))
  return Number(parts.find((p) => p.type === 'year')?.value) || new Date(ms).getUTCFullYear()
}

function denverYtdStartMs(year) {
  return Date.UTC(year, 0, 1, 12, 0, 0)
}

function buyPerTireFromOrderAndTire(order, tire) {
  const o = order || {}
  const t = tire || {}
  if (o.kylePriceOverride != null && Number.isFinite(Number(o.kylePriceOverride))) {
    return Number(o.kylePriceOverride)
  }
  return tireCatalogBuyNumber(t)
}

function ctsPerTire(tire) {
  const t = tire || {}
  const mount = Number(t.mountCost) || 0
  const delivery = Number(t.deliveryCost) || 0
  const other = Number(t.otherCost) || 0
  return mount + delivery + other
}

/**
 * Pool dollars (margin) for one completed order: payment − (buy + CTS) × qty.
 */
function computePoolDollars(paymentAmount, order, tire) {
  const qty = Number(order.quantity) || 0
  const buy = buyPerTireFromOrderAndTire(order, tire)
  const cts = ctsPerTire(tire)
  const cost = (buy + cts) * qty
  const rev = Number(paymentAmount) || 0
  return round2(rev - cost)
}

function round2(n) {
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100) / 100
}

function defaultRevenueDoc() {
  return {
    dailyWindow: '',
    weeklyWindow: '',
    monthlyWindow: '',
    ytdYear: 0,
    dailyRevenue: 0,
    weeklyRevenue: 0,
    monthlyRevenue: 0,
    ytdRevenue: 0,
    allTimeRevenue: 0,
    dailyCost: 0,
    weeklyCost: 0,
    monthlyCost: 0,
    ytdCost: 0,
    allTimeCost: 0,
    dailyMargin: 0,
    weeklyMargin: 0,
    monthlyMargin: 0,
    ytdMargin: 0,
    allTimeMargin: 0,
    updatedAt: FieldValue.serverTimestamp(),
  }
}

function defaultCrewDoc() {
  const members = {}
  for (const k of CREW_KEYS) {
    members[k] = {
      totalEarned: 0,
      totalPaid: 0,
      balance: 0,
      lastUpdatedAt: null,
    }
  }
  return { members, payoutLog: [] }
}

function bumpRevenueFields(prev, paymentAmount, costTotal, marginTotal, completedMs) {
  const p = { ...defaultRevenueDoc(), ...prev }
  const dayKey = denverYmd(completedMs)
  const weekKey = isoWeekKey(completedMs)
  const monthKey = denverYm(completedMs)
  const yYear = denverYear(completedMs)

  const next = { ...p }
  if (next.dailyWindow !== dayKey) {
    next.dailyWindow = dayKey
    next.dailyRevenue = 0
    next.dailyCost = 0
    next.dailyMargin = 0
  }
  if (next.weeklyWindow !== weekKey) {
    next.weeklyWindow = weekKey
    next.weeklyRevenue = 0
    next.weeklyCost = 0
    next.weeklyMargin = 0
  }
  if (next.monthlyWindow !== monthKey) {
    next.monthlyWindow = monthKey
    next.monthlyRevenue = 0
    next.monthlyCost = 0
    next.monthlyMargin = 0
  }
  if (Number(next.ytdYear) !== yYear) {
    next.ytdYear = yYear
    next.ytdRevenue = 0
    next.ytdCost = 0
    next.ytdMargin = 0
  }

  const pay = round2(Number(paymentAmount) || 0)
  const cost = round2(Number(costTotal) || 0)
  const margin = round2(Number(marginTotal) || 0)

  next.dailyRevenue = round2((Number(next.dailyRevenue) || 0) + pay)
  next.weeklyRevenue = round2((Number(next.weeklyRevenue) || 0) + pay)
  next.monthlyRevenue = round2((Number(next.monthlyRevenue) || 0) + pay)
  next.ytdRevenue = round2((Number(next.ytdRevenue) || 0) + pay)
  next.allTimeRevenue = round2((Number(next.allTimeRevenue) || 0) + pay)

  next.dailyCost = round2((Number(next.dailyCost) || 0) + cost)
  next.weeklyCost = round2((Number(next.weeklyCost) || 0) + cost)
  next.monthlyCost = round2((Number(next.monthlyCost) || 0) + cost)
  next.ytdCost = round2((Number(next.ytdCost) || 0) + cost)
  next.allTimeCost = round2((Number(next.allTimeCost) || 0) + cost)

  next.dailyMargin = round2((Number(next.dailyMargin) || 0) + margin)
  next.weeklyMargin = round2((Number(next.weeklyMargin) || 0) + margin)
  next.monthlyMargin = round2((Number(next.monthlyMargin) || 0) + margin)
  next.ytdMargin = round2((Number(next.ytdMargin) || 0) + margin)
  next.allTimeMargin = round2((Number(next.allTimeMargin) || 0) + margin)

  next.updatedAt = FieldValue.serverTimestamp()
  return next
}

function bumpCrewEarned(prev, pool) {
  const base = prev && typeof prev === 'object' ? prev : {}
  const members = { ...(base.members || {}) }
  for (const k of CREW_KEYS) {
    const cur = members[k] && typeof members[k] === 'object' ? members[k] : {}
    const add = round2(pool * (CREW_SPLIT[k] || 0))
    const earned = round2((Number(cur.totalEarned) || 0) + add)
    const paid = Number(cur.totalPaid) || 0
    members[k] = {
      totalEarned: earned,
      totalPaid: paid,
      balance: round2(earned - paid),
      lastUpdatedAt: FieldValue.serverTimestamp(),
    }
  }
  const payoutLog = Array.isArray(base.payoutLog) ? base.payoutLog : []
  return { ...base, members, payoutLog }
}

/**
 * Order completion + tire sales fields + revenue + crew in one transaction.
 */
async function runCompletionTransaction(db, params) {
  const { orderRef, completionPatch, paymentAmount, completedMs } = params
  await db.runTransaction(async (tx) => {
    const orderSnap = await tx.get(orderRef)
    if (!orderSnap.exists) {
      throw new Error('Order not found.')
    }
    const orderData = orderSnap.data() || {}
    const st = String(orderData.status || '').toLowerCase().replace(/\s/g, '_')
    if (st !== 'in_transit') throw new Error('ORDER_NOT_IN_TRANSIT')

    const mspn = String(orderData.mspn || '').trim()
    const tireRef = mspn ? db.collection('tires').doc(mspn) : null
    const tireSnap = tireRef ? await tx.get(tireRef) : null
    const tireData = tireSnap?.exists ? tireSnap.data() || {} : {}

    const qty = Number(orderData.quantity) || 0
    const buy = buyPerTireFromOrderAndTire(orderData, tireData)
    const cts = ctsPerTire(tireData)
    const costTotal = round2((buy + cts) * qty)
    const pay = round2(Number(paymentAmount) || 0)
    const marginTotal = round2(pay - costTotal)
    const pool = marginTotal

    tx.update(orderRef, completionPatch)

    if (tireRef && tireSnap?.exists) {
      const weekKey = isoWeekKey(completedMs)
      const prevWeek = tireData.weeklyVelocityWeek != null ? String(tireData.weeklyVelocityWeek) : ''
      const prevVel = Number(tireData.weeklyVelocity) || 0
      const nextVel = prevWeek === weekKey ? round2(prevVel + qty) : qty
      tx.update(tireRef, {
        salesCount: FieldValue.increment(qty),
        lastSoldAt: FieldValue.serverTimestamp(),
        weeklyVelocity: nextVel,
        weeklyVelocityWeek: weekKey,
        updatedAt: FieldValue.serverTimestamp(),
      })
    }

    const revRef = REVENUE_REF(db)
    const revSnap = await tx.get(revRef)
    const prevRev = revSnap.exists ? revSnap.data() || {} : {}
    const nextRev = bumpRevenueFields(prevRev, pay, costTotal, marginTotal, completedMs)
    tx.set(revRef, nextRev, { merge: true })

    const crewRef = CREW_REF(db)
    const crewSnap = await tx.get(crewRef)
    const cPrev = crewSnap.exists ? crewSnap.data() || {} : defaultCrewDoc()
    const nextCrew = bumpCrewEarned(cPrev, pool)
    tx.set(crewRef, nextCrew, { merge: true })
  })
}

module.exports = {
  REVENUE_REF,
  CREW_REF,
  CREW_KEYS,
  CREW_SPLIT,
  crewSlackSplitDisplayName,
  crewEarningsMetaDisplayName,
  denverYmd,
  isoWeekKey,
  denverYear,
  denverYtdStartMs,
  computePoolDollars,
  buyPerTireFromOrderAndTire,
  ctsPerTire,
  round2,
  defaultRevenueDoc,
  defaultCrewDoc,
  bumpRevenueFields,
  bumpCrewEarned,
  runCompletionTransaction,
}
