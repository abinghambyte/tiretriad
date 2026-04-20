const admin = require('firebase-admin')
const { setGlobalOptions } = require('firebase-functions/v2')
const { SLACK_CHANNEL_ID } = require('./slackSecrets')

admin.initializeApp()
setGlobalOptions({ region: 'us-central1' })

/** Resolve #fleet-ops target when SLACK_CHANNEL_ID secret is empty (e.g. name-based channel). */
function slackChannelWithSecretFallback() {
  const id = SLACK_CHANNEL_ID.value()
  return id || process.env.SLACK_NOTIFY_CHANNEL || '#fleet-ops'
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
  if (!json.ok) {
    throw new Error(json.error || `Slack API ${method} failed`)
  }
  return json
}

module.exports = {
  admin,
  slackChannelWithSecretFallback,
  slackApiPost,
}
