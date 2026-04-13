/**
 * Brand + description line for contact enrichment after an order completes.
 * @param {import('firebase-admin/firestore').Firestore} db
 * @param {string} mspn
 */
async function lastTireLabelForMspn(db, mspn) {
  const id = String(mspn || '').trim()
  if (!id) return ''
  const ts = await db.collection('tires').doc(id).get()
  if (!ts.exists) return id
  const td = ts.data() || {}
  const brand = String(td.brand || '').trim()
  const desc = String(td.description || td.tread || '').trim()
  const s = [brand, desc].filter(Boolean).join(' · ')
  return s || id
}

module.exports = { lastTireLabelForMspn }
