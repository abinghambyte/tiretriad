/**
 * Link completed orders to CRM accounts when phone keys match linkedPhone.
 */
const { FieldValue } = require('firebase-admin/firestore')
const { e164DocIdFromContact } = require('./orderMetrics')

/**
 * @param {import('firebase-admin').firestore.Firestore} db
 * @param {{ orderId: string, customerContact?: string, contactPhoneKey?: string }} params
 */
async function linkCompletedOrderToCrmAccounts(db, params) {
  const orderId = String(params.orderId || '').trim()
  if (!orderId) return
  const key =
    String(params.contactPhoneKey || '').trim() || e164DocIdFromContact(params.customerContact)
  if (!key) return
  let snap
  try {
    snap = await db.collection('crmAccounts').where('linkedPhone', '==', key).limit(25).get()
  } catch (e) {
    console.error('crmLinkOrders query', e)
    return
  }
  for (const doc of snap.docs) {
    try {
      await doc.ref.update({
        linkedOrders: FieldValue.arrayUnion(orderId),
        updatedAt: FieldValue.serverTimestamp(),
      })
    } catch (e) {
      console.error('crmLinkOrders update', doc.id, e)
    }
  }
}

module.exports = { linkCompletedOrderToCrmAccounts }
