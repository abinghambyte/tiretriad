'use strict'

/**
 * Presence heartbeat. Clients call `updatePresence` roughly every 60s while
 * the tab is visible; this function writes a server-timestamped `lastSeenAt`
 * onto `users/{uid}.presence`. A 45s server-side rate limit prevents runaway
 * writes. Server time is the sole source of truth — client timestamps are
 * ignored.
 */
const admin = require('firebase-admin')
const { onCall, HttpsError } = require('firebase-functions/v2/https')
const { FieldValue } = require('firebase-admin/firestore')

const MIN_INTERVAL_MS = 45_000
const USER_AGENT_MAX = 200

function truncate(str, max) {
  const s = String(str == null ? '' : str)
  if (s.length <= max) return s
  return s.slice(0, max)
}

/** @param {unknown} value */
function toMillis(value) {
  if (!value) return null
  if (typeof value.toMillis === 'function') return value.toMillis()
  if (typeof value.seconds === 'number') {
    return value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1e6)
  }
  return null
}

/**
 * Core impl split out for test injection. Throws `HttpsError` on auth and rate
 * limit failures; otherwise writes the presence sub-object and returns the
 * resolved `lastSeenAt` as an ISO string.
 *
 * @param {import('firebase-functions/v2/https').CallableRequest} request
 * @param {FirebaseFirestore.Firestore} db
 * @param {{ nowMs?: () => number }} [deps]
 */
async function updatePresenceImpl(request, db, deps = {}) {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Sign in required.')
  }
  const nowMs = typeof deps.nowMs === 'function' ? deps.nowMs() : Date.now()
  const uid = request.auth.uid
  const userRef = db.collection('users').doc(uid)

  const snap = await userRef.get()
  if (snap.exists) {
    const data = snap.data() || {}
    const lastMs = toMillis(data?.presence?.lastSeenAt)
    if (lastMs != null && nowMs - lastMs < MIN_INTERVAL_MS) {
      throw new HttpsError(
        'resource-exhausted',
        'Presence heartbeat rate limit (45s) has not elapsed.',
      )
    }
  }

  const payload = (request.data && typeof request.data === 'object') ? request.data : {}
  const userAgent = truncate(payload.userAgent, USER_AGENT_MAX)

  await userRef.set(
    {
      presence: {
        lastSeenAt: FieldValue.serverTimestamp(),
        userAgent,
      },
    },
    { merge: true },
  )

  return { ok: true, lastSeenAt: new Date(nowMs).toISOString() }
}

const updatePresence = onCall(async (request) =>
  updatePresenceImpl(request, admin.firestore()),
)

module.exports = {
  updatePresence,
  updatePresenceImpl,
  MIN_INTERVAL_MS,
  USER_AGENT_MAX,
  truncate,
}
