/**
 * attachInvoiceLine: admin-only callable for manually attaching, detaching,
 * or re-attaching a single invoice line to a portal order. Reverses any prior
 * attach via applyOrderCostChange (negative incremental cost) and applies the
 * new attach with a positive incremental cost. Detach (orderId === null) just
 * reverses. Idempotent on no-change. Rolls invoice status up to attached /
 * partial / pending after the line update lands.
 */
const { onCall, HttpsError } = require('firebase-functions/v2/https')
const admin = require('firebase-admin')
const { FieldValue } = require('firebase-admin/firestore')
const { applyOrderCostChange } = require('./applyOrderCostChange')
const { lineShareIncremental } = require('./invoiceLineCost')

function handle({ firestore, applyOrderCostChange: applyFn = applyOrderCostChange } = {}) {
  return async function handler({ data, auth }) {
    if (!auth || !auth.uid) {
      throw new HttpsError('unauthenticated', 'Sign in required.')
    }
    const userSnap = await firestore.collection('users').doc(auth.uid).get()
    const userData = userSnap.exists ? userSnap.data() || {} : {}
    if (String(userData.role || '') !== 'admin') {
      throw new HttpsError('permission-denied', 'Admin only.')
    }

    const invoiceId = String((data && data.invoiceId) || '').trim()
    const lineIndex = Number(data && data.lineIndex)
    const rawTarget = data ? data.orderId : undefined
    const targetOrderId = rawTarget === null
      ? null
      : (String(rawTarget || '').trim() || null)
    const notes = data && data.notes ? String(data.notes).slice(0, 500) : null

    if (!invoiceId || !Number.isInteger(lineIndex)) {
      throw new HttpsError(
        'invalid-argument',
        'invoiceId and lineIndex required.',
      )
    }

    const invRef = firestore.collection('invoices').doc(invoiceId)
    const invSnap = await invRef.get()
    if (!invSnap.exists) {
      throw new HttpsError('not-found', 'Invoice not found.')
    }
    const invoice = invSnap.data() || {}
    const lines = Array.isArray(invoice.lines) ? invoice.lines.slice() : []
    if (lineIndex < 0 || lineIndex >= lines.length) {
      throw new HttpsError('invalid-argument', 'lineIndex out of range.')
    }

    const line = { ...lines[lineIndex] }
    const priorOrderId = line.attachedOrderId || null
    if (priorOrderId === targetOrderId) {
      return { ok: true, noChange: true }
    }

    const totalTires = lines.reduce(
      (acc, l) => acc + (Number(l.qty) || 0),
      0,
    )
    const invoiceTotals = { ...invoice, totalTires }
    const cost = lineShareIncremental(line, invoiceTotals)

    if (priorOrderId) {
      await applyFn({
        firestore,
        orderId: priorOrderId,
        incrementalActualCost: -cost,
        invoiceLineRef: `invoices/${invoiceId}#${lineIndex}`,
        actorId: auth.uid,
        source: 'invoice-reconcile',
        notes: notes ? `${notes} (reverse prior attach)` : 'reverse prior attach',
      })
    }

    if (targetOrderId) {
      await applyFn({
        firestore,
        orderId: targetOrderId,
        incrementalActualCost: cost,
        invoiceLineRef: `invoices/${invoiceId}#${lineIndex}`,
        actorId: auth.uid,
        source: 'invoice-reconcile',
        notes,
      })
    }

    line.attachedOrderId = targetOrderId
    line.attachedAt = targetOrderId ? FieldValue.serverTimestamp() : null
    line.attachedBy = targetOrderId ? auth.uid : null
    lines[lineIndex] = line

    const allAttached = lines.length > 0 && lines.every((l) => l.attachedOrderId)
    const someAttached = lines.some((l) => l.attachedOrderId)
    const status = allAttached
      ? 'attached'
      : (someAttached ? 'partial' : 'pending')

    await invRef.update({ lines, status })

    return {
      ok: true,
      priorOrderId,
      newOrderId: targetOrderId,
      status,
    }
  }
}

exports.attachInvoiceLine = onCall(async (req) => {
  return handle({ firestore: admin.firestore() })({
    data: req.data,
    auth: req.auth,
  })
})

exports._testonly = { handle }
