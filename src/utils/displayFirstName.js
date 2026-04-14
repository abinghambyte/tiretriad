/**
 * @param {{ firstName?: string, displayName?: string } | null | undefined} profile
 * @param {{ email?: string | null } | null | undefined} [user]
 * @returns {string}
 */
export function displayFirstName(profile, user) {
  const fn = String(profile?.firstName || '').trim()
  if (fn) return fn.split(/\s+/)[0] || 'You'
  const dn = String(profile?.displayName || '').trim()
  if (dn) return dn.split(/\s+/)[0] || 'You'
  const em = String(user?.email || '').trim()
  if (em && em.includes('@')) return em.split('@')[0] || 'You'
  return 'You'
}
