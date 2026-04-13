/**
 * Shared Slack secrets for Gen2 (Secret Manager). Import this module only once per deploy graph.
 * Do not duplicate SLACK_* keys in `functions/.env` — Cloud Run rejects secret + plain env with the same name.
 */
const { defineSecret } = require('firebase-functions/params')

const SLACK_BOT_TOKEN = defineSecret('SLACK_BOT_TOKEN')
const SLACK_SIGNING_SECRET = defineSecret('SLACK_SIGNING_SECRET')
const SLACK_CHANNEL_ID = defineSecret('SLACK_CHANNEL_ID')

const SLACK_SECRETS = [SLACK_BOT_TOKEN, SLACK_SIGNING_SECRET, SLACK_CHANNEL_ID]

module.exports = {
  SLACK_BOT_TOKEN,
  SLACK_SIGNING_SECRET,
  SLACK_CHANNEL_ID,
  SLACK_SECRETS,
}
