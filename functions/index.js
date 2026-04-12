/**
 * Gen2 callable — Slack / Discord notify via process.env only (not functions.config()).
 * Set NOTIFY_WEBHOOK_URL (+ optional NOTIFY_WEBHOOK_URL_2, NOTIFY_WEBHOOK_STYLE) using
 * functions/.env at deploy time or Cloud Run env for this function. See
 * docs/FIREBASE-GEN2-SENDTIRESALE-ENV.md — legacy `firebase functions:config:set` does not
 * populate process.env here.
 */
const { onCall, HttpsError } = require('firebase-functions/v2/https')
const { setGlobalOptions } = require('firebase-functions/v2')
const admin = require('firebase-admin')

admin.initializeApp()

setGlobalOptions({ region: 'us-central1' })

function formatSaleMessage(d) {
  const notes = [d.fulfillmentNotes, d.additionalNotes]
    .filter(Boolean)
    .join(' | ')

  return [
    '🛞 TIRE SALE - Action Required',
    '',
    `SKU: ${d.mspn}`,
    `Qty: ${d.quantity}`,
    `Price: $${Number(d.pricePerTire).toFixed(2)} each / $${Number(d.totalPrice).toFixed(2)} total`,
    '',
    `Customer: ${d.customerName}`,
    `Contact: ${d.customerContact}`,
    `Fulfillment: ${d.fulfillment}`,
    `Notes: ${notes || '—'}`,
    '',
    '— Skedaddle Portal',
  ].join('\n')
}

/**
 * Posts to Slack, Discord, or a generic JSON webhook.
 * Default is Slack ({ text }) — aligns with Block Kit / threading roadmap; use discord for { content }.
 * One-way: incoming webhooks only POST out. Two-way buttons (Kyle confirms → Firestore → DJ) need a
 * Slack app + Interactivity Request URL (HTTPS) + signing secret — separate from this webhook.
 */
async function postWebhook(url, message, style) {
  const s = (style || 'slack').toLowerCase()
  let body
  if (s === 'slack') {
    body = JSON.stringify({ text: message })
  } else if (s === 'generic') {
    body = JSON.stringify({ message, text: message })
  } else {
    body = JSON.stringify({ content: message.slice(0, 2000) })
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  })

  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new Error(`Webhook ${res.status}: ${t || res.statusText}`)
  }
}

async function notifyTeam(message) {
  const style = process.env.NOTIFY_WEBHOOK_STYLE || 'slack'
  const urls = [
    process.env.NOTIFY_WEBHOOK_URL,
    process.env.NOTIFY_WEBHOOK_URL_2,
  ].filter(Boolean)

  if (urls.length === 0) {
    throw new HttpsError(
      'failed-precondition',
      'No NOTIFY_WEBHOOK_URL configured. Add a Slack (or Discord) incoming webhook URL to the function environment.',
    )
  }

  await Promise.all(urls.map((u) => postWebhook(u, message, style)))
}

/** Kept name for existing clients; sends via webhook, not SMS. */
exports.sendTireSaleSms = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.')
  }

  const data = request.data || {}
  const mspn = String(data.mspn || '').trim()
  const quantity = Number(data.quantity)
  const pricePerTire = Number(data.pricePerTire)
  const totalPrice = Number(data.totalPrice)
  const fulfillment = data.fulfillment

  if (!mspn) {
    throw new HttpsError('invalid-argument', 'mspn is required.')
  }
  if (!Number.isFinite(quantity) || quantity < 1) {
    throw new HttpsError('invalid-argument', 'quantity must be at least 1.')
  }
  if (!Number.isFinite(pricePerTire) || pricePerTire < 0) {
    throw new HttpsError('invalid-argument', 'pricePerTire is invalid.')
  }
  if (!Number.isFinite(totalPrice) || totalPrice < 0) {
    throw new HttpsError('invalid-argument', 'totalPrice is invalid.')
  }
  if (fulfillment !== 'Pickup' && fulfillment !== 'Delivery') {
    throw new HttpsError('invalid-argument', 'fulfillment must be Pickup or Delivery.')
  }

  const body = formatSaleMessage({
    mspn,
    quantity,
    pricePerTire,
    totalPrice,
    customerName: String(data.customerName || '').trim() || '—',
    customerContact: String(data.customerContact || '').trim() || '—',
    fulfillment,
    fulfillmentNotes: String(data.fulfillmentNotes || '').trim(),
    additionalNotes: String(data.additionalNotes || '').trim(),
  })

  try {
    await notifyTeam(body)
  } catch (e) {
    if (e instanceof HttpsError) throw e
    const msg = e instanceof Error ? e.message : String(e)
    throw new HttpsError('internal', `Notify failed: ${msg}`)
  }

  return { ok: true }
})
