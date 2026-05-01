/**
 * editOrderDeliveredBy — admin-only callable to fix who delivered a
 * completed delivery order. Allowed within 7 days of completion.
 *
 * Recomputes per-member earnings + delivery-bump tracking on
 * `meta/crewEarnings` using the order's snapshotted `deliveryBumpAtCompletion`
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

/**
 * Shared core that mutates `deliveredBy` on a completed delivery order,
 * recomputes the per-member splits + bump tracking on `meta/crewEarnings`, and
 * writes a `bumpAudit` entry. Used by both the admin-edit callable and the
 * Slack "Delivered by ..." button handler.
 *
 * @param {object} args
 * @param {FirebaseFirestore.Firestore} args.firestore
 * @param {string} args.orderId
 * @param {'alex'|'dj'|'kyle'|null} args.newValue
 * @param {string} args.actorId  uid (callable) or Slack user id
 * @param {'admin-edit'|'slack-completion'} args.source
 * @param {string|null} [args.reason]
 * @param {boolean} [args.skipAdminCheck=false]  Slack interactivity flow skips it
 * @param {() => number} args.nowFn
 * @param {{ uid?: string }|null} [args.auth]   admin-edit flow: required
 * @returns {Promise<{ ok: true, noChange?: true, oldValue?: string|null, newValue?: string|null }>}
 */
async function applyDeliveredByChange({
  firestore,
  orderId,
  newValue,
  actorId,
  source,
  reason = null,
  skipAdminCheck = false,
  nowFn,
  auth = null,
}) {
  if (!skipAdminCheck) {
    if (!auth || !auth.uid) {
      throw new HttpsError('unauthenticated', 'Sign in required.')
    }
    const userSnap = await firestore.collection('users').doc(auth.uid).get()
    const userData = userSnap.exists ? userSnap.data() || {} : {}
    const role = String(userData.role || '')
    if (role !== 'admin') {
      throw new HttpsError('permission-denied', 'Admin only.')
    }
  }

  if (!orderId) {
    throw new HttpsError('invalid-argument', 'orderId required.')
  }
  if (newValue !== null && !SPLIT_KEYS.includes(newValue)) {
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
    return { ok: true, noChange: true, oldValue, newValue }
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

  const bumpDollarsForNew = newBumpDollars

  await firestore.runTransaction(async (tx) => {
    const crewRef = firestore.collection('meta').doc('crewEarnings')
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
      deliveredBySetBy: actorId,
      updatedAt: FieldValue.serverTimestamp(),
    })

    const auditRef = orderRef.collection('bumpAudit').doc()
    tx.set(auditRef, {
      setBy: actorId,
      setAt: FieldValue.serverTimestamp(),
      oldValue,
      newValue,
      source,
      reason,
    })
  })

  return { ok: true, oldValue, newValue, bumpDollars: bumpDollarsForNew, pool }
}

function handle({ firestore, nowFn }) {
  return async function handler({ data, auth }) {
    const orderId = String((data && data.orderId) || '').trim()
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
    const res = await applyDeliveredByChange({
      firestore,
      orderId,
      newValue,
      actorId: auth && auth.uid ? auth.uid : '',
      source: 'admin-edit',
      reason,
      skipAdminCheck: false,
      nowFn,
      auth,
    })
    if (res.noChange) return { ok: true, noChange: true }
    return { ok: true, oldValue: res.oldValue, newValue: res.newValue }
  }
}

exports.editOrderDeliveredBy = onCall(async (req) => {
  return handle({
    firestore: admin.firestore(),
    nowFn: () => Date.now(),
  })({ data: req.data, auth: req.auth })
})

exports.applyDeliveredByChange = applyDeliveredByChange
exports._testonly = { handle, applyDeliveredByChange, SEVEN_DAYS_MS, SPLIT_KEYS }
