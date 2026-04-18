/**
 * Relative time from a Firestore Timestamp, Date, or epoch ms.
 * @param {unknown} ts
 * @returns {string} e.g. "2h ago", or "" if unknown
 */
export function timeAgo(ts) {
  if (ts == null) return ''
  let ms
  if (typeof ts === 'number' && Number.isFinite(ts)) {
    ms = ts
  } else if (ts instanceof Date) {
    ms = ts.getTime()
  } else if (typeof ts?.toMillis === 'function') {
    ms = ts.toMillis()
  } else if (typeof ts?.toDate === 'function') {
    const d = ts.toDate()
    ms = d instanceof Date ? d.getTime() : NaN
  } else {
    return ''
  }
  if (!Number.isFinite(ms)) return ''
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000))
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}
