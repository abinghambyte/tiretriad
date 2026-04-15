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

/**
 * eBay Sell / Inventory — Secret Manager key names: `EBAY_APP_ID`, `EBAY_CERT_ID`, `EBAY_USER_TOKEN`.
 * We intentionally do not call `defineSecret` until those secrets have at least one version; Firebase
 * deploy fails in non-interactive mode otherwise. When ready, add:
 *   const EBAY_APP_ID = defineSecret('EBAY_APP_ID')
 *   const EBAY_CERT_ID = defineSecret('EBAY_CERT_ID')
 *   const EBAY_USER_TOKEN = defineSecret('EBAY_USER_TOKEN')
 *   const EBAY_SECRETS = [EBAY_APP_ID, EBAY_CERT_ID, EBAY_USER_TOKEN]
 * export them below, mount `[...SLACK_SECRETS, ...EBAY_SECRETS]` on ebay functions, and use `.value()` in ebayIntegration.
 */
const EBAY_SECRETS = []

const SLACK_SECRETS = [SLACK_BOT_TOKEN, SLACK_SIGNING_SECRET, SLACK_CHANNEL_ID]

/** Gen2 `secrets` for `listingAdvisor` — both bound on deploy; use `-` for a key you want to skip. */
const LISTING_ADVISOR_SECRETS = [GEMINI_API_KEY, ANTHROPIC_API_KEY]

/** `slackActions` only — includes Kyle mention + Anthropic for `/hype` + Gemini for price-intel slash commands. */
const SLACK_ACTIONS_SECRETS = [...SLACK_SECRETS, SLACK_KYLE_ID, ANTHROPIC_API_KEY, GEMINI_API_KEY]

/** Scheduled `tirePriceResearch` — Slack fleet posts + Gemini wholesale lookup. */
const TIRE_PRICE_INTEL_SECRETS = [...SLACK_SECRETS, GEMINI_API_KEY]

/** Optional `/hype` — not a Slack credential; set in `functions/.env` or Cloud Run env. */
function anthropicApiKeyFromEnv() {
  return String(process.env.ANTHROPIC_API_KEY || '').trim()
}

function pickSecretTrim(v) {
  const s = String(v ?? '').trim()
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
  EBAY_SECRETS,
  anthropicApiKeyFromEnv,
  anthropicKeyResolved,
  slackAdminUserIdsRawFromEnv,
  pickSecretTrim,
}
