/**
 * Map America/Denver calendar dates to UTC epoch ms for Firestore range queries.
 */

/** @param {string} ymd `YYYY-MM-DD` */
function denverDayStartMs(ymd) {
  const targetKey = String(ymd || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetKey)) return null
  const y = Number(targetKey.slice(0, 4))
  const m = Number(targetKey.slice(5, 7))
  const d = Number(targetKey.slice(8, 10))
  if (!y || !m || !d) return null
  let lo = Date.UTC(y, m - 1, d) - 26 * 3600000
  let hi = Date.UTC(y, m - 1, d) + 26 * 3600000
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Denver',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2)
    const key = fmt.format(new Date(mid))
    if (key >= targetKey) hi = mid
    else lo = mid + 1
  }
  return lo
}

const DENVER_YMD = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Denver',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** First UTC ms strictly after the last instant of `ymd` in America/Denver (DST-safe). */
function denverDayEndExclusiveMs(ymd) {
  const start = denverDayStartMs(ymd)
  if (start == null) return null
  const key = DENVER_YMD.format(new Date(start))
  let t = start
  while (DENVER_YMD.format(new Date(t)) === key && t < start + 27 * 3600000) {
    t += 3600000
  }
  if (DENVER_YMD.format(new Date(t)) === key) {
    return start + 27 * 3600000
  }
  const hi0 = t
  let lo = hi0 - 3600000
  let hi = hi0
  while (hi - lo > 1000) {
    const mid = Math.floor((lo + hi) / 2)
    if (DENVER_YMD.format(new Date(mid)) === key) lo = mid
    else hi = mid
  }
  return hi
}

/** Inclusive Denver calendar start / exclusive UTC end for `completedAt` range queries. */
function denverYmdRangeMs(startYmd, endYmd) {
  const a = denverDayStartMs(startYmd)
  const endEx = denverDayEndExclusiveMs(endYmd)
  if (a == null || endEx == null) return null
  if (endEx < a) return null
  return { startMs: a, endExclusiveMs: endEx }
}

module.exports = { denverDayStartMs, denverYmdRangeMs }
