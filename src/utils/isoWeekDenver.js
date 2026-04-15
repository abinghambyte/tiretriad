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
