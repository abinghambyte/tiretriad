/**
 * Daily stale CRM accounts — 8am MT ≈ 14:00 UTC (MST).
 */
const admin = require('firebase-admin')
const { Timestamp } = require('firebase-admin/firestore')

function slackChannelEnv() {
  return (
    process.env.SLACK_CHANNEL_ID ||
    process.env.SLACK_NOTIFY_CHANNEL ||
    '#fleet-ops'
  )
}

async function slackQuiet(text) {
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
  if (!json.ok) console.error('crmStaleCheck slack', json.error || res.status)
}

async function crmStaleCheckRun() {
  const db = admin.firestore()
  const cutoff = Timestamp.fromMillis(Date.now() - 30 * 86400000)
  let snap
  try {
    snap = await db
      .collection('crmAccounts')
      .where('lastContactedAt', '<', cutoff)
      .where('pipelineStage', '<', 6)
      .get()
  } catch (e) {
    console.error('crmStaleCheck query', e)
    return
  }

  for (const doc of snap.docs) {
    const d = doc.data() || {}
    const st = Number(d.pipelineStage) || 1
    if (st === 7) continue
    const name = d.companyName || doc.id
    await slackQuiet(
      `💤 Stale CRM account — *${name}* (stage ${st}). Last contact >30 days ago. ${process.env.PORTAL_BASE_URL || 'https://www.skedaddleinc.com'}/crm`,
    )
  }
}

module.exports = { crmStaleCheckRun }
