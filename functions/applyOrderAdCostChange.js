/**
 * applyOrderAdCostChange - atomic Firestore transaction that recomputes crew
 * earnings when the per-order ad cost changes for a completed order.
 *
 * Mirrors applyOrderCostChange structurally. Differences:
 *   - Updates `adCost` on the order doc (not actualLandedCost).
 *   - oldRealized = currentLanded + oldAdCost; newRealized = currentLanded
 *     + newAdCost. The landed component (estimated or actual) is unchanged.
 *   - costAudit entry carries oldAdCost / newAdCost and source 'ad-cost-edit'.
 *
 * Pool semantics: pool = max(0, paymentAmount - landed - adCost), distributed
 * via applyDeliveryBump using the order's snapshotted deliveryBumpAtCompletion.
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
 * @param {number} args.oldAdCost            $ value the order currently has (0 if unset)
 * @param {number} args.newAdCost            $ value to set
 * @param {string} args.actorId              uid firing the edit
 * @param {string} args.source               'ad-cost-edit'
 * @param {string|null} [args.notes]
 * @returns {Promise<{ ok: true, noChange?: true, oldRealized?: number, newRealized?: number, poolDelta?: number, memberDeltas?: Record<string, { delta: number, newBalance: number }> }>}
 */
async function applyOrderAdCostChange({
  firestore,
  orderId,
  oldAdCost,
  newAdCost,
  actorId,
  source,
  notes,
}) {
  if (!orderId) throw new Error('applyOrderAdCostChange: orderId required')
  const oldVal = Number(oldAdCost) || 0
  const newVal = Number(newAdCost)
  if (!Number.isFinite(newVal) || newVal < 0) {
    throw new Error('applyOrderAdCostChange: newAdCost must be a finite non-negative number')
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
    const currentLanded = priorActualValid
      ? priorActual
      : (estimatedValid ? estimated : 0)

    const oldRealized = round2(currentLanded + oldVal)
    const newRealized = round2(currentLanded + newVal)

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
          invoiceLineRef: null,
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
      adCost: newVal,
      adCostSetAt: FieldValue.serverTimestamp(),
      adCostSetBy: actorId,
      updatedAt: FieldValue.serverTimestamp(),
    })

    const auditRef = orderRef.collection('costAudit').doc()
    tx.set(auditRef, {
      setBy: actorId,
      setAt: FieldValue.serverTimestamp(),
      oldEstimated: estimatedValid ? estimated : null,
      oldActual: priorActualValid ? priorActual : null,
      newEstimated: estimatedValid ? estimated : null,
      newActual: priorActualValid ? priorActual : null,
      oldAdCost: oldVal,
      newAdCost: newVal,
      source,
      notes: notes || null,
    })

    return { ok: true, oldRealized, newRealized, poolDelta, memberDeltas }
  })

  // Fire-and-forget DM dispatch on ad-cost-edit. Each member's adjustment was
  // just persisted; DM them so they can ack it. Slack failures are swallowed.
  if (txResult && !txResult.noChange && txResult.memberDeltas && source === 'ad-cost-edit') {
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
          invoiceDocNumber: null,
        }).catch(() => {}),
      )
    }
    if (tasks.length > 0) {
      await Promise.allSettled(tasks)
    }
  }

  return txResult
}

module.exports = { applyOrderAdCostChange }
module.exports._testonly = { applyOrderAdCostChange, SPLIT_KEYS }
