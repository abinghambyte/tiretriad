/**
 * applyOrderCostChange — atomic Firestore transaction that recomputes crew
 * earnings when a new actual cost figure lands for a completed order. Used
 * by importInvoice (auto-attach) and attachInvoiceLine (manual attach + the
 * re-attach reversal flow).
 *
 * Multi-line accumulation: subsequent attaches for the same order add their
 * incremental cost onto the running actualLandedCost rather than replacing
 * it. The first attach moves the order from estimatedLandedCostAtCompletion
 * to firstLineRealized; later attaches move from running -> running + line.
 *
 * Pool semantics mirror runCompletionTransaction: pool = max(0, paymentAmount
 * - realizedCost), distributed via applyDeliveryBump using the order's
 * snapshotted deliveryBumpAtCompletion.
 */
const { randomUUID } = require('node:crypto')
const { FieldValue } = require('firebase-admin/firestore')
const { applyDeliveryBump, round2 } = require('./payoutConfig')
const { postAdjustmentDm } = require('./slackAdjustmentDm')

const SPLIT_KEYS = ['alex', 'dj', 'kyle']
const DEFAULT_SPLITS = { alex: 0.35, dj: 0.35, kyle: 0.30 }

/**
 * @param {object} args
 * @param {FirebaseFirestore.Firestore} args.firestore
 * @param {string} args.orderId
 * @param {number} args.incrementalActualCost   $ this attach contributes
 * @param {string} args.invoiceLineRef          e.g. 'invoices/DA####\#0'
 * @param {string} args.actorId                 uid firing the attach
 * @param {string} args.source                  'invoice-reconcile' | 'admin-edit'
 * @param {string | null} args.notes
 * @returns {Promise<{ ok: true, noChange?: true, oldRealized?: number, newRealized?: number, poolDelta?: number, memberDeltas?: Record<string, { delta: number, newBalance: number }> }>}
 */
async function applyOrderCostChange({
  firestore,
  orderId,
  incrementalActualCost,
  invoiceLineRef,
  actorId,
  source,
  notes,
}) {
  if (!orderId) throw new Error('applyOrderCostChange: orderId required')
  const incremental = Number(incrementalActualCost)
  if (!Number.isFinite(incremental)) {
    throw new Error('applyOrderCostChange: incrementalActualCost must be finite')
  }

  const orderRef = firestore.collection('orders').doc(orderId)
  const crewRef = firestore.collection('meta').doc('crewEarnings')
  const cfgRef = firestore.collection('meta').doc('payoutConfig')

  const cfgSnap = await cfgRef.get()
  const cfg = cfgSnap.exists ? cfgSnap.data() || {} : {}
  const splits = cfg && cfg.splits && typeof cfg.splits === 'object'
    ? cfg.splits
    : DEFAULT_SPLITS

  const txResult = await firestore.runTransaction(async (tx) => {
    const orderSnap = await tx.get(orderRef)
    if (!orderSnap.exists) throw new Error('Order not found')
    const order = orderSnap.data() || {}

    const priorActual = Number(order.actualLandedCost)
    const priorActualValid = Number.isFinite(priorActual) && priorActual >= 0
    const estimated = Number(order.estimatedLandedCostAtCompletion)
    const estimatedValid = Number.isFinite(estimated) && estimated >= 0

    const oldRealized = priorActualValid
      ? priorActual
      : (estimatedValid ? estimated : 0)
    const newRealized = round2(
      (priorActualValid ? priorActual : 0) + incremental,
    )

    if (newRealized === oldRealized) {
      return { ok: true, noChange: true }
    }

    const paymentAmount = Number(order.paymentAmount) || 0
    const oldPool = Math.max(0, paymentAmount - oldRealized)
    const newPool = Math.max(0, paymentAmount - newRealized)
    const poolDelta = round2(newPool - oldPool)

    const deliveredBy = SPLIT_KEYS.includes(order.deliveredBy)
      ? order.deliveredBy
      : null
    const bumpAtCompletion = Number(order.deliveryBumpAtCompletion) || 0
    const adjusted = applyDeliveryBump(splits, bumpAtCompletion, deliveredBy)

    const crewSnap = await tx.get(crewRef)
    const crew = crewSnap.exists ? crewSnap.data() || {} : { members: {} }
    const members = { ...(crew.members || {}) }

    const memberDeltas = {}
    for (const k of SPLIT_KEYS) {
      const share = Number(adjusted[k]) || 0
      const delta = round2(poolDelta * share)

      const cur = members[k] && typeof members[k] === 'object'
        ? members[k]
        : {
          totalEarned: 0,
          totalPaid: 0,
          balance: 0,
          totalDeliveryBumps: 0,
          deliveryBumpCount: 0,
        }
      const prevBalance = Number(cur.balance) || 0
      const newTotalEarned = round2((Number(cur.totalEarned) || 0) + delta)
      const newBalance = round2(prevBalance + delta)
      memberDeltas[k] = { delta, newBalance }
      const adjustments = Array.isArray(cur.adjustments)
        ? cur.adjustments.slice()
        : []
      if (delta !== 0) {
        adjustments.push({
          adjustmentId: randomUUID(),
          orderId,
          oldBalance: prevBalance,
          newBalance,
          delta,
          reason: source,
          invoiceLineRef: invoiceLineRef || null,
          createdAt: FieldValue.serverTimestamp(),
          acknowledgedBy: null,
          acknowledgedAt: null,
        })
      }
      members[k] = {
        ...cur,
        totalEarned: Math.max(0, newTotalEarned),
        totalPaid: Number(cur.totalPaid) || 0,
        balance: newBalance,
        totalDeliveryBumps: Number(cur.totalDeliveryBumps) || 0,
        deliveryBumpCount: Number(cur.deliveryBumpCount) || 0,
        adjustments,
        lastUpdatedAt: FieldValue.serverTimestamp(),
      }
    }
    tx.set(crewRef, { ...crew, members }, { merge: true })

    tx.update(orderRef, {
      actualLandedCost: newRealized,
      invoiceLineRef: invoiceLineRef || order.invoiceLineRef || null,
      updatedAt: FieldValue.serverTimestamp(),
    })

    const auditRef = orderRef.collection('costAudit').doc()
    tx.set(auditRef, {
      setBy: actorId,
      setAt: FieldValue.serverTimestamp(),
      oldEstimated: estimatedValid ? estimated : null,
      oldActual: priorActualValid ? priorActual : null,
      newEstimated: estimatedValid ? estimated : null,
      newActual: newRealized,
      invoiceLineRef: invoiceLineRef || null,
      source,
      notes: notes || null,
    })

    return { ok: true, oldRealized, newRealized, poolDelta, memberDeltas }
  })

  // Fire-and-forget DM dispatch on invoice-reconcile sources only.
  // Each member's adjustment was just persisted; DM them with their delta
  // and new balance so they can ack it in /people/earnings. Failures are
  // swallowed so a Slack outage does not fail the cost-change flow.
  if (txResult && !txResult.noChange && txResult.memberDeltas && source === 'invoice-reconcile') {
    const invoiceDocNumber = invoiceLineRef
      ? String(invoiceLineRef).split('/')[1]?.split('#')[0] || null
      : null
    const tasks = []
    for (const k of SPLIT_KEYS) {
      const entry = txResult.memberDeltas[k]
      if (!entry || !entry.delta || entry.delta === 0) continue
      tasks.push(
        postAdjustmentDm({
          firestore,
          crewKey: k,
          delta: entry.delta,
          newBalance: entry.newBalance,
          orderId,
          invoiceDocNumber,
        }).catch(() => {}),
      )
    }
    if (tasks.length > 0) {
      await Promise.allSettled(tasks)
    }
  }

  return txResult
}

module.exports = { applyOrderCostChange }
module.exports._testonly = { applyOrderCostChange, SPLIT_KEYS }
