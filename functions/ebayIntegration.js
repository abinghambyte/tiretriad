'use strict'

const { HttpsError } = require('firebase-functions/v2/https')
const { pickSecretTrim } = require('./slackSecrets')

/**
 * Uses env until EBAY_* are set in Secret Manager and mounted on this function (see slackSecrets EBAY_SECRETS).
 * @returns {boolean}
 */
function ebaySecretsConfigured() {
  const a = pickSecretTrim(process.env.EBAY_APP_ID)
  const b = pickSecretTrim(process.env.EBAY_CERT_ID)
  const c = pickSecretTrim(process.env.EBAY_USER_TOKEN)
  return Boolean(a && b && c)
}

/**
 * eBay notification webhook — verify signature / sync orders in a follow-up.
 * @param {import('firebase-functions/v2/https').Request} req
 * @param {import('firebase-functions/v2/https').Response} res
 */
function ebayOrderWebhookHandler(req, res) {
  // TODO: verify eBay notification signature, map to internal orders, write Firestore, notify Slack.
  console.log('[ebayOrderWebhook] payload', {
    method: req.method,
    headers: req.headers,
    body: typeof req.body === 'object' ? req.body : String(req.body || '').slice(0, 4000),
  })
  res.status(200).json({ ok: true, received: true })
}

/**
 * @param {import('firebase-functions/v2/https').CallableRequest} request
 */
async function ebayPublishListingHandler(request) {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.')
  }

  const data = request.data && typeof request.data === 'object' ? request.data : {}
  if (data.probe === true) {
    const ok = ebaySecretsConfigured()
    return {
      probe: true,
      configured: ok,
      success: false,
      reason: ok ? 'eBay credentials present — listing API not implemented' : 'eBay credentials not configured',
    }
  }

  if (!ebaySecretsConfigured()) {
    return { success: false, reason: 'eBay credentials not configured' }
  }

  const mspn = String(data.mspn || '').trim()
  if (!mspn) {
    throw new HttpsError('invalid-argument', 'mspn is required.')
  }

  // TODO: call eBay Inventory API / Sell Feed with EBAY_APP_ID, EBAY_CERT_ID, EBAY_USER_TOKEN (OAuth refresh as needed).
  return {
    success: false,
    reason: 'eBay Inventory API integration not implemented yet',
    mspn,
  }
}

module.exports = {
  ebayOrderWebhookHandler,
  ebayPublishListingHandler,
}
