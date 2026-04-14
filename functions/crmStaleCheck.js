/**
 * Daily stale CRM accounts — 8am MT ≈ 14:00 UTC (MST).
 */
const admin = require('firebase-admin')
const { Timestamp } = require('firebase-admin/firestore')
const { SLACK_BOT_TOKEN, SLACK_CHANNEL_ID } = require('./slackSecrets')
const { normalizePipelineStage, CRM_LOST_STAGE } = require('./crmPipeline')

async function slackQuiet(text) {
  const token = String(SLACK_BOT_TOKEN.value() || '').trim()
  const channel = String(SLACK_CHANNEL_ID.value() || '').trim() || '#fleet-ops'
  if (!token || !channel) return
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
    snap = await db.collection('crmAccounts').where('lastContactedAt', '<', cutoff).limit(300).get()
  } catch (e) {
    console.error('crmStaleCheck query', e)
    return
  }

  const portalBase = process.env.PORTAL_BASE_URL || 'https://www.skedaddleinc.com'

  for (const doc of snap.docs) {
    const d = doc.data() || {}
    const st = normalizePipelineStage(d.pipelineStage, d)
    if (st === CRM_LOST_STAGE || st >= 5) continue
    if (st < 1 || st > 4) continue
    const name = d.companyName || doc.id
    await slackQuiet(
      `💤 Stale CRM account — *${name}* (${st}). Last contact >30 days ago. ${portalBase}/crm`,
    )
  }
}

module.exports = { crmStaleCheckRun }
