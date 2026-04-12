/**
 * Firestore doc id for contacts / ghostContacts (digits only; US 10-digit → leading 1).
 * Mirrors `functions/orderMetrics.js` e164DocIdFromContact.
 * @param {string} contact
 * @returns {string | null}
 */
export function phoneDocIdFromContact(contact) {
  const digits = String(contact || '').replace(/\D/g, '')
  if (!digits) return null
  if (digits.length === 10) return `1${digits}`
  return digits
}
