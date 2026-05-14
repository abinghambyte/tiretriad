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

/** Google AI Studio / Gemini — Listing Generator advisor (`listingAdvisor` callable). Set to `-` to skip Gemini. */
const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY')
/** Anthropic — `listingAdvisor` fallback (and optional `/hype` env elsewhere). Do not duplicate this name in `functions/.env` for the same Cloud Run service. */
const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY')

/** Sinch SMS outbound (invite delivery). Service plan + API token + from number. Set via `firebase functions:secrets:set`. */
const SINCH_SERVICE_PLAN_ID = defineSecret('SINCH_SERVICE_PLAN_ID')
const SINCH_API_TOKEN = defineSecret('SINCH_API_TOKEN')
const SINCH_FROM_NUMBER = defineSecret('SINCH_FROM_NUMBER')

/** Resend email (invite delivery). API key + from address + optional reply-to. */
const RESEND_API_KEY = defineSecret('RESEND_API_KEY')
const RESEND_FROM_EMAIL = defineSecret('RESEND_FROM_EMAIL')
/** Optional. When set, every outbound invite email includes Reply-To: <address>. Recipients hitting Reply on Gmail / Outlook / etc go to this inbox instead of bouncing off the from-address subdomain. */
const RESEND_REPLY_TO_EMAIL = defineSecret('RESEND_REPLY_TO_EMAIL')

/** All invite-delivery secrets, bundled for Gen2 callables that send invites. */
const INVITE_DELIVERY_SECRETS = [
  SINCH_SERVICE_PLAN_ID,
  SINCH_API_TOKEN,
  SINCH_FROM_NUMBER,
  RESEND_API_KEY,
  RESEND_FROM_EMAIL,
  RESEND_REPLY_TO_EMAIL,
]

const SLACK_SECRETS = [SLACK_BOT_TOKEN, SLACK_SIGNING_SECRET, SLACK_CHANNEL_ID]

/** Gen2 `secrets` for `listingAdvisor` — both bound on deploy; use `-` for a key you want to skip. */
const LISTING_ADVISOR_SECRETS = [GEMINI_API_KEY, ANTHROPIC_API_KEY]

/** `slackActions` only — includes Kyle mention + Anthropic for `/hype` + Gemini for price-intel slash commands. */
const SLACK_ACTIONS_SECRETS = [...SLACK_SECRETS, SLACK_KYLE_ID, ANTHROPIC_API_KEY, GEMINI_API_KEY]

/** Scheduled `tirePriceResearch` — Slack fleet posts + Gemini wholesale lookup. */
const TIRE_PRICE_INTEL_SECRETS = [...SLACK_SECRETS, GEMINI_API_KEY]

/**
 * Strip the byte-order mark (U+FEFF) + standard whitespace from a secret value.
 *
 * `firebase functions:secrets:set` reads stdin without normalising it; a
 * value pasted from a UTF-8-with-BOM file picks up an invisible 0xFEFF at
 * index 0. fetch refuses to encode that into an HTTP ByteString and throws
 * "Cannot convert argument to a ByteString" at request time. Strip BOM
 * first, then trim. Use this everywhere a secret is read from env or
 * Secret Manager.
 */
function cleanSecret(raw) {
  if (raw == null) return ''
  return String(raw).replace(/^\uFEFF/, '').trim()
}

/** Optional `/hype` — not a Slack credential; set in `functions/.env` or Cloud Run env. */
function anthropicApiKeyFromEnv() {
  return cleanSecret(process.env.ANTHROPIC_API_KEY)
}

function pickSecretTrim(v) {
  const s = cleanSecret(v)
  if (!s || s === '-' || /^none$/i.test(s)) return ''
  return s
}

/**
 * Prefer Secret Manager value from a bound `defineSecret` (e.g. `ANTHROPIC_API_KEY.value()`),
 * then fall back to env for local / migration.
 * @param {unknown} secretValue
 */
function anthropicKeyResolved(secretValue) {
  const a = pickSecretTrim(secretValue)
  if (a) return a
  return anthropicApiKeyFromEnv()
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
  TIRE_PRICE_INTEL_SECRETS,
  GEMINI_API_KEY,
  ANTHROPIC_API_KEY,
  LISTING_ADVISOR_SECRETS,
  SINCH_SERVICE_PLAN_ID,
  SINCH_API_TOKEN,
  SINCH_FROM_NUMBER,
  RESEND_API_KEY,
  RESEND_FROM_EMAIL,
  RESEND_REPLY_TO_EMAIL,
  INVITE_DELIVERY_SECRETS,
  anthropicApiKeyFromEnv,
  anthropicKeyResolved,
  slackAdminUserIdsRawFromEnv,
  pickSecretTrim,
  cleanSecret,
}
