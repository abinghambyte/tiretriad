/**
 * Display names for `meta/crewEarnings` members in the portal (keep in sync with `functions/financeStats.js`).
 * @param {string | undefined} key
 */
export function crewEarningsMetaDisplayName(key) {
  const k = String(key || '').toLowerCase()
  if (k === 'tanner') return "Tanner — Silent partner"
  return k
}
