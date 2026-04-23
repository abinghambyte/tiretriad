/**
 * Derive a short display name from an email local part (before @).
 * Uses the segment before the first `.` or `_`, then shortens long locals (e.g. boydabingham → Boyd).
 * @param {string} email
 * @returns {string}
 */
function displayNameFromEmail(email) {
  const full = String(email || '').trim()
  if (!full.includes('@')) return ''
  const localFull = full.split('@')[0] || ''
  const segment = localFull.split(/[._]/)[0] || localFull
  const letters = segment.replace(/[^a-zA-Z]/g, '')
  if (!letters) return ''
  let s = letters
  if (s.length > 8) s = s.slice(0, 4)
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
}

/**
 * First name for UI badges -- `profile.firstName`, then non-email displayName, then email-derived short name.
 * @param {{ firstName?: string, displayName?: string, email?: string } | null | undefined} profile
 * @param {string | null | undefined} [authEmail] Firebase Auth email when profile.email is unset
 * @returns {string}
 */
export function displayFirstName(profile, authEmail) {
  const fn = String(profile?.firstName || '').trim()
  if (fn) return fn.split(/\s+/)[0] || 'Crew'
  const dn = String(profile?.displayName || '').trim()
  if (dn && !dn.includes('@')) return dn.split(/\s+/)[0] || 'Crew'

  const email = String(profile?.email || authEmail || '').trim()
  const fromEmail = displayNameFromEmail(email)
  if (fromEmail) return fromEmail
  return 'Crew'
}
