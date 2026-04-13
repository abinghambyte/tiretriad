/**
 * Slack when a CRM job is marked Done.
 */
const { onDocumentUpdated } = require('firebase-functions/v2/firestore')
const { SLACK_SECRETS } = require('./slackSecrets')

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
  if (!json.ok) console.error('crmJobTrigger slack', json.error || res.status)
}

exports.crmJobTrigger = onDocumentUpdated(
  {
    document: 'crmJobs/{jobId}',
    region: 'us-central1',
    secrets: SLACK_SECRETS,
  },
  async (event) => {
    const before = event.data.before.data() || {}
    const after = event.data.after.data() || {}
    if (String(before.completionStatus) === 'Done') return
    if (String(after.completionStatus) !== 'Done') return
    const loc = after.location || '—'
    const vc = Number(after.vehicleCount) || 0
    await slackQuiet(`✅ Job complete — ${loc}, ${vc} vehicle${vc === 1 ? '' : 's'}`)
  },
)
