/**
 * slackAdjustmentDm: fire-and-forget DM helper invoked after a cost
 * reconcile creates a meta/crewEarnings.members.{k}.adjustments entry.
 *
 * Looks up users where `crewKey == k` and `slackUserId` is set, and sends
 * a chat.postMessage DM with the delta, new balance, source order id, and
 * the eFleet invoice docNumber so the crew member can ack it in the portal
 * (/people/earnings).
 *
 * Token-less environments (no SLACK_BOT_TOKEN) short-circuit silently so
 * tests and local emulator runs never hit the Slack API.
 */

function getSlackToken() {
  return String(process.env.SLACK_BOT_TOKEN || '').trim()
}

/**
 * Post a single chat.postMessage DM. Returns `{ ok, error|skipped }` and
 * never throws; callers wrap in Promise.allSettled but defense-in-depth.
 *
 * @param {string} slackUserId
 * @param {string} text
 */
async function postDm(slackUserId, text) {
  const token = getSlackToken()
  if (!token || !slackUserId || !text) {
    return { ok: false, skipped: true }
  }
  try {
    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({ channel: slackUserId, text }),
    })
    const json = await res.json().catch(() => ({}))
    return { ok: !!json.ok, error: json.ok ? null : (json.error || `http ${res.status}`) }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * For a crew key, look up users where `crewKey == k` AND `slackUserId` is
 * set, and DM them about the cost reconcile adjustment. Fire-and-forget;
 * any single DM failure does not affect siblings.
 *
 * @param {object} args
 * @param {FirebaseFirestore.Firestore} args.firestore
 * @param {string} args.crewKey
 * @param {number} args.delta
 * @param {number} args.newBalance
 * @param {string} args.orderId
 * @param {string|null} args.invoiceDocNumber
 */
async function postAdjustmentDm({ firestore, crewKey, delta, newBalance, orderId, invoiceDocNumber }) {
  if (!firestore || !crewKey || !Number.isFinite(Number(delta))) return
  const usersSnap = await firestore
    .collection('users')
    .where('crewKey', '==', crewKey)
    .get()
  const sign = Number(delta) < 0 ? '-' : '+'
  const abs = Math.abs(Number(delta)).toFixed(2)
  const balanceStr = Number.isFinite(Number(newBalance))
    ? `$${Number(newBalance).toFixed(2)}`
    : 'updated'
  const invoiceLabel = invoiceDocNumber ? `eFleet invoice ${invoiceDocNumber}` : 'an eFleet invoice'
  const text = `Heads up - your balance was just adjusted by ${sign}$${abs} because order #${orderId} was reconciled against ${invoiceLabel}. New balance: ${balanceStr}. Acknowledge in the portal at /people/earnings.`
  const tasks = []
  const docs = (usersSnap && Array.isArray(usersSnap.docs)) ? usersSnap.docs : []
  for (const doc of docs) {
    const data = (typeof doc.data === 'function' ? doc.data() : null) || {}
    const sid = String(data.slackUserId || '').trim()
    if (!sid) continue
    tasks.push(postDm(sid, text))
  }
  if (tasks.length === 0) return
  await Promise.allSettled(tasks)
}

module.exports = { postAdjustmentDm, postDm }
module.exports._testonly = { postAdjustmentDm, postDm, getSlackToken }
