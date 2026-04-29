export const STALE_DAYS = 30

export function categoryMapAgeStatus(map) {
  if (!map) return { status: 'missing', ageDays: null }
  const ts = map.importedAt
  let importedMs = null
  if (ts && typeof ts.toMillis === 'function') importedMs = ts.toMillis()
  else if (ts instanceof Date) importedMs = ts.getTime()
  else if (typeof ts === 'string') {
    const parsed = Date.parse(ts)
    if (!Number.isNaN(parsed)) importedMs = parsed
  }
  if (importedMs === null) return { status: 'unknown', ageDays: null }
  const ageDays = Math.floor((Date.now() - importedMs) / (1000 * 60 * 60 * 24))
  return { status: ageDays > STALE_DAYS ? 'stale' : 'fresh', ageDays }
}
