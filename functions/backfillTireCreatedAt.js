/**
 * One-shot backfill: stamp `createdAt` on every tire doc that lacks one.
 *
 * Strategy (tightest lower bound we can derive from existing data):
 *   1. If the tire already has `createdAt`, skip.
 *   2. Else use the Firestore document `createTime` metadata (when the doc
 *      was first written). This is the strongest signal we have.
 *   3. If somehow no createTime is present, fall back to the earliest
 *      priceIntel.sources entry.
 *   4. If none of the above, stamp Timestamp.now() as a last resort so
 *      future runs have something to measure against.
 *
 * Callable, admin-only (permissions.tires === 'edit' or root-admin role).
 * Idempotent: re-running only touches docs still missing createdAt.
 */
const { onCall, HttpsError } = require('firebase-functions/v2/https')
const admin = require('firebase-admin')

const BATCH_SIZE = 400 // Firestore batched writes cap at 500

function earliestPriceIntelMs(sources) {
  if (!Array.isArray(sources)) return null
  let earliest = null
  for (const entry of sources) {
    const ts = entry?.at || entry?.recordedAt
    const ms = ts?.toMillis?.()
    if (typeof ms === 'number' && Number.isFinite(ms) && (!earliest || ms < earliest)) {
      earliest = ms
    }
  }
  return earliest
}

exports.backfillTireCreatedAt = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.')
  }
  const db = admin.firestore()
  const uSnap = await db.collection('users').doc(request.auth.uid).get()
  const tiresPerm = uSnap.exists ? String(uSnap.data()?.permissions?.tires || 'none') : 'none'
  if (tiresPerm !== 'edit') {
    throw new HttpsError('permission-denied', 'Tires edit permission required.')
  }

  const dryRun = Boolean(request.data?.dryRun)
  const snap = await db.collection('tires').get()

  const plan = []
  for (const doc of snap.docs) {
    const data = doc.data() || {}
    if (data.createdAt) continue
    const createTimeMs = doc.createTime?.toMillis?.() ?? null
    const priceIntelMs = earliestPriceIntelMs(data.priceIntel?.sources)
    const nowMs = Date.now()
    const chosenMs = createTimeMs ?? priceIntelMs ?? nowMs
    const source = createTimeMs
      ? 'createTime'
      : priceIntelMs
        ? 'priceIntel'
        : 'now'
    plan.push({ id: doc.id, ms: chosenMs, source })
  }

  if (dryRun) {
    const counts = plan.reduce(
      (acc, p) => {
        acc[p.source] = (acc[p.source] || 0) + 1
        return acc
      },
      {},
    )
    return { scanned: snap.size, toWrite: plan.length, counts, dryRun: true }
  }

  // Batched writes.
  let written = 0
  for (let i = 0; i < plan.length; i += BATCH_SIZE) {
    const batch = db.batch()
    const slice = plan.slice(i, i + BATCH_SIZE)
    for (const { id, ms } of slice) {
      batch.update(db.collection('tires').doc(id), {
        createdAt: admin.firestore.Timestamp.fromMillis(ms),
      })
    }
    await batch.commit()
    written += slice.length
  }

  const counts = plan.reduce(
    (acc, p) => {
      acc[p.source] = (acc[p.source] || 0) + 1
      return acc
    },
    {},
  )
  return { scanned: snap.size, written, counts, dryRun: false }
})
