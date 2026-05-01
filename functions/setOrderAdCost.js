/**
 * setOrderAdCost - callable to set / edit the per-order paid-ad cost on a
 * completed order. Allowed for admin OR the user who closed the order
 * (auth.uid === order.completedBy), within 7 days of completion.
 *
 * Atomic recompute via applyOrderAdCostChange: pool = pay - landed - adCost,
 * distributed via the bump-adjusted splits, with adjustment entries written
 * to meta/crewEarnings.members.{k}.adjustments and a Slack DM dispatch.
 */
const { onCall, HttpsError } = require('firebase-functions/v2/https')
const admin = require('firebase-admin')
const { SLACK_SECRETS } = require('./slackSecrets')
const { applyOrderAdCostChange } = require('./applyOrderAdCostChange')

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000
const AD_COST_CAP = 10000

function handle({ firestore, nowFn }) {
  return async function handler({ data, auth }) {
    if (!auth || !auth.uid) {
      throw new HttpsError('unauthenticated', 'Sign in required.')
    }
    const orderId = String((data && data.orderId) || '').trim()
    if (!orderId) {
      throw new HttpsError('invalid-argument', 'orderId required.')
    }

    const raw = data ? data.adCost : undefined
    let newAdCost
    if (raw === null || raw === undefined || raw === '') {
      newAdCost = 0
    } else {
      const parsed = Number(raw)
      if (!Number.isFinite(parsed) || parsed < 0) {
        throw new HttpsError(
          'invalid-argument',
          'adCost must be a finite non-negative number.',
        )
      }
      if (parsed > AD_COST_CAP) {
        throw new HttpsError(
          'invalid-argument',
          `adCost may not exceed $${AD_COST_CAP}.`,
        )
      }
      newAdCost = parsed
    }

    const orderRef = firestore.collection('orders').doc(orderId)
    const orderSnap = await orderRef.get()
    if (!orderSnap.exists) {
      throw new HttpsError('not-found', 'Order not found.')
    }
    const order = orderSnap.data() || {}

    // Permission: admin OR the user who completed the order.
    const userSnap = await firestore.collection('users').doc(auth.uid).get()
    const userData = userSnap.exists ? userSnap.data() || {} : {}
    const isAdmin = String(userData.role || '') === 'admin'
    const isCloser = !!order.completedBy && order.completedBy === auth.uid
    if (!isAdmin && !isCloser) {
      throw new HttpsError(
        'permission-denied',
        'Only an admin or the user who closed this order can edit ad cost.',
      )
    }

    const completedMs = Number(order.completedMs) || 0
    if (!completedMs || nowFn() - completedMs > SEVEN_DAYS_MS) {
      throw new HttpsError(
        'failed-precondition',
        'Edit window closed (7 days after completion).',
      )
    }

    const oldAdCost = Number(order.adCost) || 0
    if (oldAdCost === newAdCost) {
      return { ok: true, noChange: true }
    }

    const res = await applyOrderAdCostChange({
      firestore,
      orderId,
      oldAdCost,
      newAdCost,
      actorId: auth.uid,
      source: 'ad-cost-edit',
      notes: null,
    })
    if (res && res.noChange) return { ok: true, noChange: true }
    return {
      ok: true,
      oldAdCost,
      newAdCost,
      poolDelta: res?.poolDelta ?? 0,
    }
  }
}

exports.setOrderAdCost = onCall({ secrets: SLACK_SECRETS }, async (req) => {
  return handle({
    firestore: admin.firestore(),
    nowFn: () => Date.now(),
  })({ data: req.data, auth: req.auth })
})

exports._testonly = { handle, SEVEN_DAYS_MS, AD_COST_CAP }
