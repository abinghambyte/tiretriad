/**
 * importInvoice — admin-only callable that ingests a parsed eFleet invoice
 * payload, persists it under `invoices/{docNumber}`, and auto-attaches each
 * line to a completed portal order matching DR + MSPN + qty. Each attached
 * line fires `applyOrderCostChange` with the line's pro-rated share of the
 * invoice (extended + tax share + tire-fee share) folded into
 * `incrementalActualCost`.
 *
 * Idempotent on `docNumber`: a re-import throws `already-exists`. Status
 * rolls up to 'attached' (all lines), 'partial' (some), or 'pending' (none).
 */
const { onCall, HttpsError } = require('firebase-functions/v2/https')
const admin = require('firebase-admin')
const { FieldValue } = require('firebase-admin/firestore')
const { SLACK_SECRETS } = require('./slackSecrets')
const { applyOrderCostChange } = require('./applyOrderCostChange')
const { lineShareIncremental } = require('./invoiceLineCost')

/**
 * Find a completed portal order whose DR + (mspn, qty) match the invoice line.
 * @param {FirebaseFirestore.Firestore} firestore
 * @param {string|null|undefined} dr
 * @param {{ mspn?: string, qty?: number }} line
 * @returns {Promise<string|null>}
 */
async function autoAttachByDr(firestore, dr, line) {
  if (!dr) return null
  const candidates = await firestore
    .collection('orders')
    .where('dr', '==', dr)
    .where('status', '==', 'completed')
    .get()
  const docs = candidates.docs || []
  for (const doc of docs) {
    const o = doc.data() || {}
    if (
      String(o.mspn) === String(line.mspn)
      && Number(o.quantity) === Number(line.qty)
    ) {
      return doc.id
    }
  }
  return null
}

function handle({ firestore }) {
  return async function handler({ data, auth }) {
    if (!auth || !auth.uid) {
      throw new HttpsError('unauthenticated', 'Sign in required.')
    }
    const userSnap = await firestore.collection('users').doc(auth.uid).get()
    const userData = userSnap.exists ? userSnap.data() || {} : {}
    if (String(userData.role || '') !== 'admin') {
      throw new HttpsError('permission-denied', 'Admin only.')
    }

    const invoice = data && data.invoice
    if (!invoice || typeof invoice !== 'object' || !invoice.docNumber) {
      throw new HttpsError('invalid-argument', 'invoice payload required.')
    }
    const docId = String(invoice.docNumber)

    const ref = firestore.collection('invoices').doc(docId)
    const existing = await ref.get()
    if (existing.exists) {
      throw new HttpsError(
        'already-exists',
        `Invoice ${docId} already imported.`,
      )
    }

    const linesIn = Array.isArray(invoice.lines) ? invoice.lines : []
    const totalTires = linesIn.reduce(
      (acc, l) => acc + (Number(l.qty) || 0),
      0,
    )
    const invoiceTotals = { ...invoice, totalTires }

    const lineRecords = []
    for (let i = 0; i < linesIn.length; i += 1) {
      const line = linesIn[i]
      const attachedOrderId = await autoAttachByDr(firestore, invoice.dr, line)
      lineRecords.push({
        ...line,
        attachedOrderId: attachedOrderId || null,
        attachedAt: attachedOrderId ? FieldValue.serverTimestamp() : null,
        attachedBy: attachedOrderId ? auth.uid : null,
      })
    }

    const allAttached = lineRecords.length > 0
      && lineRecords.every((l) => l.attachedOrderId)
    const someAttached = lineRecords.some((l) => l.attachedOrderId)
    const status = allAttached
      ? 'attached'
      : (someAttached ? 'partial' : 'pending')

    await ref.set({
      ...invoice,
      lines: lineRecords,
      status,
      importedAt: FieldValue.serverTimestamp(),
      importedBy: auth.uid,
    })

    let attachedCount = 0
    for (let i = 0; i < lineRecords.length; i += 1) {
      const l = lineRecords[i]
      if (!l.attachedOrderId) continue
      const cost = lineShareIncremental(l, invoiceTotals)
      await applyOrderCostChange({
        firestore,
        orderId: l.attachedOrderId,
        incrementalActualCost: cost,
        invoiceLineRef: `invoices/${docId}#${i}`,
        actorId: auth.uid,
        source: 'invoice-reconcile',
        notes: null,
      })
      attachedCount += 1
    }

    return { ok: true, docId, status, attachedCount }
  }
}

exports.importInvoice = onCall({ secrets: SLACK_SECRETS }, async (req) => {
  return handle({ firestore: admin.firestore() })({
    data: req.data,
    auth: req.auth,
  })
})

exports._testonly = { handle, lineShareIncremental, autoAttachByDr }
