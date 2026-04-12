/**
 * Phase 4 — scheduled people access (access expiry lock, timed elevation revert).
 * @see docs/PHASE4-PEOPLE-SYSTEM-HANDOFF.md
 */
const admin = require('firebase-admin')
const { FieldValue, Timestamp } = require('firebase-admin/firestore')

function slackChannelEnv() {
  return (
    process.env.SLACK_CHANNEL_ID ||
    process.env.SLACK_NOTIFY_CHANNEL ||
    '#fleet-ops'
  )
}

async function slackFleetOpsQuiet(text) {
  const token = process.env.SLACK_BOT_TOKEN
  if (!token) return
  const channel = slackChannelEnv()
  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({ channel, text }),
  })
  const json = await res.json().catch(() => ({}))
  if (!json.ok) console.error('slackFleetOpsQuiet', json.error || res.status)
}

/**
 * Daily 07:00 UTC ≈ midnight Mountain Standard Time — lock users past accessExpiry.
 */
async function checkAccessExpiryRun() {
  const db = admin.firestore()
  const now = Timestamp.fromMillis(Date.now())
  const snap = await db.collection('users').where('accessExpiry', '<=', now).get()
  for (const doc of snap.docs) {
    const d = doc.data() || {}
    if (d.inviteStatus === 'locked') continue
    if (!d.accessExpiry) continue
    const name = `${d.firstName || ''} ${d.lastName || ''}`.trim() || doc.id
    try {
      await doc.ref.update({
        inviteStatus: 'locked',
        updatedAt: FieldValue.serverTimestamp(),
      })
      await slackFleetOpsQuiet(`🔒 ${name}'s access expired and was automatically locked.`)
    } catch (e) {
      console.error('checkAccessExpiry', doc.id, e)
    }
  }
}

/**
 * Hourly — revert timed permission elevations past expiresAt.
 */
async function processElevationRevertsRun() {
  const db = admin.firestore()
  const now = Timestamp.fromMillis(Date.now())
  let q
  try {
    q = await db
      .collection('scheduledReverts')
      .where('processed', '==', false)
      .where('expiresAt', '<=', now)
      .get()
  } catch (e) {
    console.error('processElevationReverts query (add composite index if needed)', e)
    return
  }

  for (const revDoc of q.docs) {
    const rev = revDoc.data() || {}
    const targetUid = rev.targetUid
    const elevationId = rev.elevationId
    const modKey = rev.module
    if (!targetUid || !elevationId || !modKey) {
      await revDoc.ref.update({ processed: true, processedAt: FieldValue.serverTimestamp() }).catch(() => {})
      continue
    }

    try {
      await db.runTransaction(async (tx) => {
        const rSnap = await tx.get(revDoc.ref)
        if (!rSnap.exists || rSnap.get('processed')) return
        const userRef = db.collection('users').doc(targetUid)
        const uSnap = await tx.get(userRef)
        if (!uSnap.exists) {
          tx.update(revDoc.ref, {
            processed: true,
            processedAt: FieldValue.serverTimestamp(),
            error: 'user_missing',
          })
          return
        }
        const u = uSnap.data() || {}
        const perms = { ...(u.permissions || {}) }
        perms[modKey] = rev.previousLevel
        const arr = Array.isArray(u.timedElevations) ? u.timedElevations : []
        const nextElev = arr.filter((e) => e && e.id !== elevationId)
        tx.update(userRef, {
          permissions: perms,
          timedElevations: nextElev,
          updatedAt: FieldValue.serverTimestamp(),
        })
        tx.update(revDoc.ref, {
          processed: true,
          processedAt: FieldValue.serverTimestamp(),
        })
        const logRef = db.collection('accessLog').doc()
        tx.set(logRef, {
          uid: targetUid,
          changedBy: 'system:elevation-revert',
          changedAt: FieldValue.serverTimestamp(),
          field: `permissions.${modKey}`,
          before: rev.elevatedLevel,
          after: rev.previousLevel,
          reason: `Timed elevation expired (revert ${elevationId})`,
        })
      })
    } catch (e) {
      console.error('processElevationReverts', revDoc.id, e)
    }
  }
}

module.exports = {
  checkAccessExpiryRun,
  processElevationRevertsRun,
}
