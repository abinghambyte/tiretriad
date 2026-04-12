/**
 * Pipeline + quirky metrics helpers for tire orders.
 */
const { Timestamp, FieldValue } = require('firebase-admin/firestore')

const DEFAULT_TZ = process.env.ORDER_METRICS_TZ || 'America/Chicago'

function toMillis(ts) {
  if (!ts || typeof ts.toMillis !== 'function') return null
  try {
    return ts.toMillis()
  } catch {
    return null
  }
}

/** Whole minutes between Firestore Timestamp `start` and epoch ms `endMs`. */
function minutesBetweenTsAndMs(startTs, endMs) {
  const a = toMillis(startTs)
  if (a == null || !Number.isFinite(endMs)) return null
  return Math.max(0, Math.round((endMs - a) / 60000))
}

function utcDayRangeMs(epochMs) {
  const d = new Date(epochMs)
  const start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  const end = start + 86400000
  return { start, end }
}

function hourInTimeZone(epochMs, tz) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    hour12: false,
  }).formatToParts(new Date(epochMs))
  const h = parts.find((p) => p.type === 'hour')
  return h ? parseInt(h.value, 10) : 12
}

/** E.164-ish doc id: digits only, US 10-digit gets leading 1. */
function e164DocIdFromContact(contact) {
  const digits = String(contact || '').replace(/\D/g, '')
  if (!digits) return null
  if (digits.length === 10) return `1${digits}`
  return digits
}

function round2(n) {
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100) / 100
}

function frictionScoreComplete(pokeCount, notifyToCompleteMinutes) {
  const pokes = Number(pokeCount) || 0
  const ntc = Number(notifyToCompleteMinutes) || 0
  return pokes * 10 + (ntc > 120 ? 20 : 0)
}

/** Same weighting as completion, plus +50 when an order is cancelled with a disposition. */
function frictionScoreCancelled(pokeCount, notifyToCancelMinutes, cancellationDisposition) {
  const pokes = Number(pokeCount) || 0
  const ntc = Number(notifyToCancelMinutes) || 0
  const disp = cancellationDisposition ? 50 : 0
  return pokes * 10 + (ntc > 120 ? 20 : 0) + disp
}

module.exports = {
  Timestamp,
  FieldValue,
  DEFAULT_TZ,
  toMillis,
  minutesBetweenTsAndMs,
  utcDayRangeMs,
  hourInTimeZone,
  e164DocIdFromContact,
  round2,
  frictionScoreComplete,
  frictionScoreCancelled,
}
