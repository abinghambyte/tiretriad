/** Aligns with `functions/financeStats.js` isoWeekKey (Monday week, UTC math). */
export function isoWeekKey(ms = Date.now()) {
  const d = new Date(ms)
  const day = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - day + 3)
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const yearStart = new Date(Date.UTC(firstThursday.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil(((firstThursday - yearStart) / 86400000 + 1) / 7)
  const y = firstThursday.getUTCFullYear()
  return `${y}-W${String(weekNo).padStart(2, '0')}`
}

export function denverYmd(ms = Date.now()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Denver',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(ms))
  const y = parts.find((p) => p.type === 'year')?.value
  const m = parts.find((p) => p.type === 'month')?.value
  const day = parts.find((p) => p.type === 'day')?.value
  return `${y}-${m}-${day}`
}

export function denverYm(ms = Date.now()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Denver',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date(ms))
  const y = parts.find((p) => p.type === 'year')?.value
  const m = parts.find((p) => p.type === 'month')?.value
  return `${y}-${m}`
}

const DENVER_YMD_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Denver',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** UTC ms for the first instant of the given `YYYY-MM-DD` in America/Denver. DST-safe. */
export function denverDayStartMs(ymd) {
  const targetKey = String(ymd || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetKey)) return null
  const y = Number(targetKey.slice(0, 4))
  const m = Number(targetKey.slice(5, 7))
  const d = Number(targetKey.slice(8, 10))
  if (!y || !m || !d) return null
  let lo = Date.UTC(y, m - 1, d) - 26 * 3600000
  let hi = Date.UTC(y, m - 1, d) + 26 * 3600000
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2)
    const key = DENVER_YMD_FMT.format(new Date(mid))
    if (key >= targetKey) hi = mid
    else lo = mid + 1
  }
  return lo
}

/** First UTC ms strictly after the last instant of `ymd` in America/Denver. DST-safe. */
export function denverDayEndExclusiveMs(ymd) {
  const start = denverDayStartMs(ymd)
  if (start == null) return null
  const key = DENVER_YMD_FMT.format(new Date(start))
  let t = start
  while (DENVER_YMD_FMT.format(new Date(t)) === key && t < start + 27 * 3600000) {
    t += 3600000
  }
  if (DENVER_YMD_FMT.format(new Date(t)) === key) {
    return start + 27 * 3600000
  }
  let lo = t - 3600000
  let hi = t
  while (hi - lo > 1000) {
    const mid = Math.floor((lo + hi) / 2)
    if (DENVER_YMD_FMT.format(new Date(mid)) === key) lo = mid
    else hi = mid
  }
  return hi
}

/** @param {string} ymd `YYYY-MM-DD` — calendar day math (UTC), independent of browser local TZ */
export function addDaysToYmd(ymd, deltaDays) {
  const [y, mo, da] = ymd.split('-').map(Number)
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(da)) return ymd
  const ms = Date.UTC(y, mo - 1, da + deltaDays)
  const dt = new Date(ms)
  const yy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(dt.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}
