/**
 * Shared Slack secrets for Gen2 (Secret Manager). Import this module only once per deploy graph.
 * Do not duplicate SLACK_* keys in `functions/.env` — Cloud Run rejects secret + plain env with the same name.
 */
const { defineSecret } = require('firebase-functions/params')

const SLACK_BOT_TOKEN = defineSecret('SLACK_BOT_TOKEN')
const SLACK_SIGNING_SECRET = defineSecret('SLACK_SIGNING_SECRET')
const SLACK_CHANNEL_ID = defineSecret('SLACK_CHANNEL_ID')
/** Slack user ID for `<@kyle>` mentions on `/reorder` (set via `firebase functions:secrets:set SLACK_KYLE_ID`). */
const SLACK_KYLE_ID = defineSecret('SLACK_KYLE_ID')

const SLACK_SECRETS = [SLACK_BOT_TOKEN, SLACK_SIGNING_SECRET, SLACK_CHANNEL_ID]

/** `slackActions` only — includes Kyle mention secret so other callables are not blocked on it. */
const SLACK_ACTIONS_SECRETS = [...SLACK_SECRETS, SLACK_KYLE_ID]

/** Optional `/hype` — not a Slack credential; set in `functions/.env` or Cloud Run env. */
function anthropicApiKeyFromEnv() {
  return String(process.env.ANTHROPIC_API_KEY || '').trim()
}

/** Comma/space-separated Slack user IDs for `/setlimit` and `/setquota` (not bot tokens). */
function slackAdminUserIdsRawFromEnv() {
  return String(process.env.SLACK_ADMIN_USER_IDS || '')
}

module.exports = {
  SLACK_BOT_TOKEN,
  SLACK_SIGNING_SECRET,
  SLACK_CHANNEL_ID,
  SLACK_KYLE_ID,
  SLACK_SECRETS,
  SLACK_ACTIONS_SECRETS,
  anthropicApiKeyFromEnv,
  slackAdminUserIdsRawFromEnv,
}
