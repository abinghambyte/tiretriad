/**
 * editOrderDeliveredBy — admin-only callable to fix who delivered a
 * completed delivery order. Allowed within 7 days of completion.
 *
 * Recomputes per-member earnings + delivery-bump tracking on
 * `meta/djStats` using the order's snapshotted `deliveryBumpAtCompletion`
 * (so live config drift does not rewrite history). Order doc, crew doc,
 * and a `bumpAudit` subcollection entry all land in one transaction.
 */
const { onCall, HttpsError } = require('firebase-functions/v2/https')
const admin = require('firebase-admin')
const { FieldValue } = require('firebase-admin/firestore')
const {
  applyDeliveryBump,
  round2,
  DEFAULT_CONFIG,
} = require('./payoutConfig')
const { completedOrderMarginPool } = require('./financeStats')

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000
const SPLIT_KEYS = ['alex', 'dj', 'kyle']

function handle({ firestore, nowFn }) {
  return async function handler({ data, auth }) {
    if (!auth || !auth.uid) {
      throw new HttpsError('unauthenticated', 'Sign in required.')
    }
    const userSnap = await firestore.collection('users').doc(auth.uid).get()
    const userData = userSnap.exists ? userSnap.data() || {} : {}
    const role = String(userData.role || '')
    if (role !== 'admin') {
      throw new HttpsError('permission-denied', 'Admin only.')
    }

    const orderId = String((data && data.orderId) || '').trim()
    if (!orderId) {
      throw new HttpsError('invalid-argument', 'orderId required.')
    }

    const reason = data && data.reason ? String(data.reason).slice(0, 500) : null
    const newRaw = data ? data.deliveredBy : undefined
    let newValue
    if (newRaw === null || newRaw === undefined || newRaw === '') {
      newValue = null
    } else if (SPLIT_KEYS.includes(newRaw)) {
      newValue = newRaw
    } else {
      throw new HttpsError(
        'invalid-argument',
        'deliveredBy must be alex, dj, kyle, or null.',
      )
    }

    const orderRef = firestore.collection('orders').doc(orderId)
    const orderSnap = await orderRef.get()
    if (!orderSnap.exists) {
      throw new HttpsError('not-found', 'Order not found.')
    }
    const order = orderSnap.data() || {}

    if (String(order.fulfillment || '').toLowerCase() !== 'delivery') {
      throw new HttpsError(
        'failed-precondition',
        'Order is not a delivery order.',
      )
    }
    const completedMs = Number(order.completedMs) || 0
    if (!completedMs || nowFn() - completedMs > SEVEN_DAYS_MS) {
      throw new HttpsError(
        'failed-precondition',
        'Edit window closed (7 days after completion).',
      )
    }

    const oldValue = SPLIT_KEYS.includes(order.deliveredBy)
      ? order.deliveredBy
      : null
    if (oldValue === newValue) {
      return { ok: true, noChange: true }
    }

    const bump = Number(order.deliveryBumpAtCompletion) || 0

    const cfgSnap = await firestore.collection('meta').doc('payoutConfig').get()
    const cfg = cfgSnap.exists ? cfgSnap.data() || {} : {}
    const splits =
      cfg && cfg.splits && typeof cfg.splits === 'object'
        ? cfg.splits
        : DEFAULT_CONFIG.splits

    // Pool mirrors runCompletionTransaction: payment - cost (taxesApplied
    // already accounted for via completedOrderMarginPool when present).
    const mspn = String(order.mspn || '').trim()
    let tireData = {}
    if (mspn) {
      const tireSnap = await firestore.collection('tires').doc(mspn).get()
      if (tireSnap.exists) tireData = tireSnap.data() || {}
    }
    const pool = completedOrderMarginPool(
      Number(order.paymentAmount) || 0,
      order,
      tireData,
    )

    const oldAdjusted = applyDeliveryBump(splits, bump, oldValue)
    const newAdjusted = applyDeliveryBump(splits, bump, newValue)

    const memberDeltas = {}
    for (const k of SPLIT_KEYS) {
      const delta =
        (Number(newAdjusted[k]) || 0) - (Number(oldAdjusted[k]) || 0)
      memberDeltas[k] = round2(pool * delta)
    }

    const oldBumpDollars =
      oldValue && Object.prototype.hasOwnProperty.call(splits, oldValue)
        ? round2(
            ((Number(oldAdjusted[oldValue]) || 0)
              - (Number(splits[oldValue]) || 0))
              * pool,
          )
        : 0
    const newBumpDollars =
      newValue && Object.prototype.hasOwnProperty.call(splits, newValue)
        ? round2(
            ((Number(newAdjusted[newValue]) || 0)
              - (Number(splits[newValue]) || 0))
              * pool,
          )
        : 0

    await firestore.runTransaction(async (tx) => {
      const crewRef = firestore.collection('meta').doc('djStats')
      const crewSnap = await tx.get(crewRef)
      const crew = crewSnap.exists
        ? crewSnap.data() || {}
        : { members: {}, payoutLog: [] }
      const members = { ...(crew.members || {}) }
      for (const k of SPLIT_KEYS) {
        const cur =
          members[k] && typeof members[k] === 'object' ? members[k] : {}
        let totalDeliveryBumps = Number(cur.totalDeliveryBumps) || 0
        let deliveryBumpCount = Number(cur.deliveryBumpCount) || 0
        if (k === oldValue && oldBumpDollars > 0) {
          totalDeliveryBumps = round2(totalDeliveryBumps - oldBumpDollars)
          deliveryBumpCount = Math.max(0, deliveryBumpCount - 1)
        }
        if (k === newValue && newBumpDollars > 0) {
          totalDeliveryBumps = round2(totalDeliveryBumps + newBumpDollars)
          deliveryBumpCount = deliveryBumpCount + 1
        }
        const earned = round2(
          (Number(cur.totalEarned) || 0) + (memberDeltas[k] || 0),
        )
        const paid = Number(cur.totalPaid) || 0
        members[k] = {
          ...cur,
          totalEarned: earned,
          totalPaid: paid,
          balance: round2(earned - paid),
          totalDeliveryBumps,
          deliveryBumpCount,
          lastUpdatedAt: FieldValue.serverTimestamp(),
        }
      }
      tx.set(crewRef, { ...crew, members }, { merge: true })

      tx.update(orderRef, {
        deliveredBy: newValue,
        deliveredBySetAt: FieldValue.serverTimestamp(),
        deliveredBySetBy: auth.uid,
        updatedAt: FieldValue.serverTimestamp(),
      })

      const auditRef = orderRef.collection('bumpAudit').doc()
      tx.set(auditRef, {
        setBy: auth.uid,
        setAt: FieldValue.serverTimestamp(),
        oldValue,
        newValue,
        source: 'admin-edit',
        reason,
      })
    })

    return { ok: true, oldValue, newValue }
  }
}

exports.editOrderDeliveredBy = onCall(async (req) => {
  return handle({
    firestore: admin.firestore(),
    nowFn: () => Date.now(),
  })({ data: req.data, auth: req.auth })
})

exports._testonly = { handle, SEVEN_DAYS_MS, SPLIT_KEYS }
