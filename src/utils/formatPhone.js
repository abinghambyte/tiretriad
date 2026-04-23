/**
 * Phone helpers for People / invites -- NANP-friendly input, E.164 for storage.
 * (Keep normalization logic aligned with `normalizePhoneToE164` in `functions/peopleCallables.js`.)
 */

/** @param {unknown} value */
export function phoneDigitsOnly(value) {
  return String(value ?? '').replace(/\D/g, '')
}

/**
 * Progressive display for US/Canada-style entry: `+1 (555) 123-4567`.
 * Longer digit strings (other country codes) → `+<digits>`.
 * @param {unknown} value
 */
export function formatPhoneInputForDisplay(value) {
  const d = phoneDigitsOnly(value)
  if (!d) return ''

  const isNanpShape = d.length <= 10 || (d.length === 11 && d[0] === '1')
  if (!isNanpShape) {
    return `+${d}`
  }

  const national = d.length === 11 && d[0] === '1' ? d.slice(1) : d
  const n = national.slice(0, 10)
  if (n.length === 0) return ''
  if (n.length <= 3) return `+1 (${n}`
  if (n.length <= 6) return `+1 (${n.slice(0, 3)}) ${n.slice(3)}`
  return `+1 (${n.slice(0, 3)}) ${n.slice(3, 6)}-${n.slice(6)}`
}

/**
 * E.164 for Firestore / Twilio: US 10 → `+1…`, US 11 starting with 1 → `+1` + 10 digits,
 * other 8–15 digit international → `+<digits>`. Incomplete / invalid → ''.
 * @param {unknown} value
 * @returns {string}
 */
export function normalizePhoneToE164(value) {
  const d = phoneDigitsOnly(value)
  if (!d) return ''
  if (d.length === 10) return `+1${d}`
  if (d.length === 11 && d[0] === '1') return `+1${d.slice(1)}`
  if (d.length >= 8 && d.length <= 15) return `+${d}`
  return ''
}
