/**
 * First name for UI badges — prefers Firestore `firstName` only (no email fallback).
 * @param {{ firstName?: string, displayName?: string } | null | undefined} profile
 * @returns {string}
 */
export function displayFirstName(profile) {
  const fn = String(profile?.firstName || '').trim()
  if (fn) return fn.split(/\s+/)[0] || 'Crew'
  const dn = String(profile?.displayName || '').trim()
  if (dn && !dn.includes('@')) return dn.split(/\s+/)[0] || 'Crew'
  return 'Crew'
}
