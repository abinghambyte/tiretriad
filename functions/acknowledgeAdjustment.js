/**
 * acknowledgeAdjustment: callable that flips acknowledgedBy + acknowledgedAt
 * on a single entry in meta/crewEarnings.members.{crewKey}.adjustments. Crew
 * can ack only their own row (uid mapped to crewKey via users/{uid}.crewKey
 * or a displayName/name substring fallback). Admins can ack anyone. Re-ack of
 * an already-acknowledged entry is a no-op that returns noChange. Lookup is
 * by stable adjustmentId, so reordering of the array does not break refs.
 */
const { onCall, HttpsError } = require('firebase-functions/v2/https')
const admin = require('firebase-admin')
const { FieldValue } = require('firebase-admin/firestore')

const SPLIT_KEYS = ['alex', 'dj', 'kyle']

function uidToCrewKey(userData) {
  const data = userData || {}
  if (typeof data.crewKey === 'string' && SPLIT_KEYS.includes(data.crewKey)) {
    return data.crewKey
  }
  const dn = String(data.displayName || data.name || '').toLowerCase()
  if (dn.includes('alex')) return 'alex'
  if (dn.includes('dj')) return 'dj'
  if (dn.includes('kyle')) return 'kyle'
  return null
}

function handle({ firestore }) {
  return async function handler({ data, auth }) {
    if (!auth || !auth.uid) {
      throw new HttpsError('unauthenticated', 'Sign in required.')
    }
    const userSnap = await firestore.collection('users').doc(auth.uid).get()
    const userData = userSnap.exists ? userSnap.data() || {} : {}
    const role = String(userData.role || '')
    const ownCrewKey = uidToCrewKey(userData)

    const targetCrewKey = String((data && data.crewKey) || '').trim()
    const adjustmentId = String((data && data.adjustmentId) || '').trim()
    if (!SPLIT_KEYS.includes(targetCrewKey)) {
      throw new HttpsError('invalid-argument', 'crewKey must be alex, dj, or kyle.')
    }
    if (!adjustmentId) {
      throw new HttpsError('invalid-argument', 'adjustmentId required.')
    }

    if (role !== 'admin' && ownCrewKey !== targetCrewKey) {
      throw new HttpsError(
        'permission-denied',
        'Crew can only acknowledge their own adjustments.',
      )
    }

    const crewRef = firestore.collection('meta').doc('crewEarnings')
    return await firestore.runTransaction(async (tx) => {
      const snap = await tx.get(crewRef)
      if (!snap.exists) {
        throw new HttpsError('not-found', 'Crew earnings doc missing.')
      }
      const crew = snap.data() || {}
      const member = (crew.members || {})[targetCrewKey]
      if (!member) {
        throw new HttpsError('not-found', 'Crew member not found.')
      }
      const adjustments = Array.isArray(member.adjustments)
        ? member.adjustments.slice()
        : []
      const idx = adjustments.findIndex(
        (a) => a && String(a.adjustmentId) === adjustmentId,
      )
      if (idx < 0) {
        throw new HttpsError('not-found', 'Adjustment not found.')
      }
      if (adjustments[idx].acknowledgedBy) {
        return { ok: true, noChange: true }
      }
      adjustments[idx] = {
        ...adjustments[idx],
        acknowledgedBy: auth.uid,
        acknowledgedAt: FieldValue.serverTimestamp(),
      }
      const members = {
        ...(crew.members || {}),
        [targetCrewKey]: { ...member, adjustments },
      }
      tx.set(crewRef, { ...crew, members }, { merge: true })
      return { ok: true }
    })
  }
}

exports.acknowledgeAdjustment = onCall(async (req) => {
  return handle({ firestore: admin.firestore() })({
    data: req.data,
    auth: req.auth,
  })
})

exports._testonly = { handle, uidToCrewKey }
