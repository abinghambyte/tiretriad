/**
 * DJ streak, ghost contacts, hat trick Slack celebration.
 */
const { FieldValue, Timestamp } = require('firebase-admin/firestore')
const { e164DocIdFromContact, utcDayRangeMs } = require('./orderMetrics')

async function resetDjStreak(db) {
  await db
    .collection('meta')
    .doc('djStats')
    .set(
      {
        currentStreak: 0,
        lastUpdatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    )
}

async function incrementDjStreak(db) {
  const ref = db.collection('meta').doc('djStats')
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    const cur = snap.exists ? Number(snap.data().currentStreak) || 0 : 0
    const long = snap.exists ? Number(snap.data().longestStreak) || 0 : 0
    const next = cur + 1
    tx.set(
      ref,
      {
        currentStreak: next,
        longestStreak: Math.max(long, next),
        lastUpdatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    )
  })
}

/**
 * @returns {Promise<{ repeatGhost: boolean }>}
 */
async function upsertGhostForOrder(db, orderId, rawContact) {
  const id = e164DocIdFromContact(rawContact)
  if (!id) return { repeatGhost: false }
  const ref = db.collection('ghostContacts').doc(id)
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    const prev = snap.exists ? snap.data() : {}
    const orderIds = Array.isArray(prev.orderIds) ? [...prev.orderIds] : []
    if (!orderIds.includes(orderId)) orderIds.push(orderId)
    const nextCount = (Number(prev.ghostCount) || 0) + 1
    const repeatGhost = nextCount >= 2
    tx.set(
      ref,
      {
        phoneNumber: id,
        ghostCount: nextCount,
        lastGhostedAt: FieldValue.serverTimestamp(),
        orderIds,
        repeatGhost,
      },
      { merge: true },
    )
    return { repeatGhost }
  })
}

async function slackApiPost(token, method, body) {
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  if (!json.ok) throw new Error(json.error || `${method} failed`)
  return json
}

/**
 * If 3+ orders completed same UTC day as completedMs, set hatTrickDay on all and post Slack.
 */
async function applyHatTrick(db, token, envChannel, completedMs) {
  const { start, end } = utcDayRangeMs(completedMs)
  const qs = await db
    .collection('orders')
    .where('completedAt', '>=', Timestamp.fromMillis(start))
    .where('completedAt', '<', Timestamp.fromMillis(end))
    .get()

  const completed = qs.docs.filter((d) => d.get('status') === 'completed')
  if (completed.length < 3) return

  const batch = db.batch()
  for (const d of completed) {
    batch.update(d.ref, { hatTrickDay: true })
  }
  await batch.commit()

  const mspns = completed.map((d) => d.get('mspn')).filter(Boolean)
  const revenue = completed.reduce((s, d) => s + (Number(d.get('paymentAmount')) || 0), 0)

  const text = [
    '🎩 *Hat trick.* Three orders completed today.',
    mspns.map((m) => `\`${m}\``).join(', '),
    `*$${revenue.toFixed(2)}* combined revenue`,
  ].join('\n')

  await slackApiPost(token, 'chat.postMessage', {
    channel: envChannel,
    text: 'Hat trick — three orders completed today.',
    blocks: [{ type: 'section', text: { type: 'mrkdwn', text } }],
  })
}

module.exports = {
  resetDjStreak,
  incrementDjStreak,
  upsertGhostForOrder,
  applyHatTrick,
}
