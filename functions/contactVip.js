/**
 * Auto-VIP when a contact reaches 3+ completed orders (orderCount on contact doc).
 */
const { FieldValue } = require('firebase-admin/firestore')

/**
 * @param {FirebaseFirestore.Firestore} db
 * @param {string | null} phoneKey — `contacts` doc id (digits, US 11 with leading 1)
 */
async function ensureRepeatCustomerVip(db, phoneKey) {
  const id = String(phoneKey || '').trim()
  if (!id) return
  const ref = db.collection('contacts').doc(id)
  const snap = await ref.get()
  if (!snap.exists) return
  const n = Number(snap.get('orderCount')) || 0
  if (n >= 3) {
    await ref.set({ isVip: true, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
  }
}

module.exports = { ensureRepeatCustomerVip }
