/**
 * Sinch XMS incoming SMS webhook to #fleet-ops Block Kit + Reply (slackActions modal).
 * @see https://developers.sinch.com/docs/sms/api-reference/sms/webhooks/incomingsms
 */
const crypto = require('crypto')
const { e164DocIdFromContact } = require('./orderMetrics')
const { ACTION_SMS_REPLY } = require('./smsReplySlack')

/**
 * Verify that an inbound POST came from Sinch. Sinch XMS offers several
 * callback auth flavors depending on account tier; we accept any of them:
 *
 * 1. Query string: ?k=<shared>  (works on any plan; configure via URL)
 * 2. Bearer token in Authorization: Bearer <shared>  (or X-Inbound-Secret)
 * 3. Basic auth (Authorization: Basic base64(user:pass) — password is the secret)
 * 4. HMAC-SHA256 of the raw body, hex-encoded, sent in X-Signature
 *    (also X-Sinch-Signature / Signature for broader compatibility)
 *
 * 2-4 require the account manager to enable on your Service Plan per Sinch docs.
 * If no secret is configured, all requests are accepted (backward compatible).
 */
function isAuthorizedInbound(req, rawBody, shared) {
  if (!shared) return true
  const qk = String((req.query && (req.query.k || req.query.key)) || '').trim()
  const auth = String(req.get('Authorization') || '').trim()
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  const basicSecret = (() => {
    if (!auth.startsWith('Basic ')) return ''
    try {
      const decoded = Buffer.from(auth.slice(6).trim(), 'base64').toString('utf8')
      const idx = decoded.indexOf(':')
      return idx >= 0 ? decoded.slice(idx + 1) : decoded
    } catch {
      return ''
    }
  })()
  const headerSecret = String(req.get('X-Inbound-Secret') || '').trim()
  const sig = String(
    req.get('X-Signature') || req.get('X-Sinch-Signature') || req.get('Signature') || '',
  )
    .trim()
    .toLowerCase()

  if (qk && timingSafeEq(qk, shared)) return true
  if (bearer && timingSafeEq(bearer, shared)) return true
  if (basicSecret && timingSafeEq(basicSecret, shared)) return true
  if (headerSecret && timingSafeEq(headerSecret, shared)) return true
  if (sig && rawBody) {
    const expected = crypto.createHmac('sha256', shared).update(rawBody).digest('hex')
    if (timingSafeEq(sig, expected)) return true
  }
  return false
}

function timingSafeEq(a, b) {
  const ba = Buffer.from(String(a))
  const bb = Buffer.from(String(b))
  if (ba.length !== bb.length) return false
  return crypto.timingSafeEqual(ba, bb)
}

function escapeSlackMrkdwn(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
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
    throw new Error(json.error || `${method} failed`)
  }
  return json
}

const ACTIVE_ORDER_STATUSES = new Set(['pending', 'available', 'scheduled', 'in_transit'])

function parseInboundJson(body) {
  if (!body || typeof body !== 'object') return null
  const type = String(body.type || '')
  if (type && type !== 'mo_text' && type !== 'mo_binary' && type !== 'mo_media') {
    if (type.startsWith('delivery_report')) return { skip: true }
  }
  const text = String(body.body ?? body.message ?? '').trim()
  const from = String(body.from ?? body.msisdn ?? '').trim()
  if (!from) return null
  return { text, from, id: String(body.id || '') }
}

async function pickActiveOrderForContact(db, phoneKey) {
  const snap = await db.collection('orders').where('contactPhoneKey', '==', phoneKey).limit(60).get()
  let best = null
  let bestMs = -1
  for (const doc of snap.docs) {
    const st = String(doc.get('status') || '')
      .toLowerCase()
      .replace(/\s/g, '_')
    if (!ACTIVE_ORDER_STATUSES.has(st)) continue
    const u =
      doc.get('updatedAt')?.toMillis?.() ??
      doc.get('createdAt')?.toMillis?.() ??
      0
    if (u >= bestMs) {
      bestMs = u
      best = doc
    }
  }
  return best
}

/**
 * @param {import('firebase-functions').https.Request} req
 * @param {import('firebase-functions').https.Response} res
 * @param {FirebaseFirestore.Firestore} db
 */
async function handleInboundSmsRequest(req, res, db) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    res.status(204).send('')
    return
  }
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed')
    return
  }

  const shared = String(process.env.SINCH_INBOUND_SHARED_SECRET || '').trim()
  const rawBody = req.rawBody != null ? req.rawBody.toString('utf8') : JSON.stringify(req.body || {})

  if (!isAuthorizedInbound(req, rawBody, shared)) {
    console.warn('inboundSms: unauthorized. headers:', {
      hasAuth: !!req.get('Authorization'),
      hasXSig: !!req.get('X-Signature'),
      hasXSinchSig: !!req.get('X-Sinch-Signature'),
      hasSig: !!req.get('Signature'),
      hasXInboundSecret: !!req.get('X-Inbound-Secret'),
    })
    res.status(401).send('Unauthorized')
    return
  }

  let parsed
  try {
    parsed = typeof req.body === 'object' && req.body && Object.keys(req.body).length ? req.body : JSON.parse(rawBody || '{}')
  } catch {
    res.status(400).send('Bad JSON')
    return
  }

  const mo = parseInboundJson(parsed)
  if (mo?.skip) {
    res.status(200).send('ok')
    return
  }
  if (!mo || !mo.text) {
    res.status(200).send('ok')
    return
  }

  const phoneKey = e164DocIdFromContact(mo.from)
  if (!phoneKey) {
    res.status(200).send('ok')
    return
  }

  const cSnap = await db.collection('contacts').doc(phoneKey).get()
  const customerName = cSnap.exists
    ? String(cSnap.get('name') || '').trim() || 'Customer'
    : 'Unknown contact'

  const orderSnap = await pickActiveOrderForContact(db, phoneKey)
  const orderId = orderSnap ? orderSnap.id : ''
  const mspn = orderSnap ? String(orderSnap.get('mspn') || '').trim() : ''

  const { SLACK_BOT_TOKEN, SLACK_CHANNEL_ID } = require('./slackSecrets')
  const token = SLACK_BOT_TOKEN.value()
  const channel = String(SLACK_CHANNEL_ID.value() || '').trim()
  if (!token || !channel) {
    console.error('inboundSms: Slack not configured')
    res.status(500).send('Slack not configured')
    return
  }

  const bodyPreview = mo.text.length > 2800 ? `${mo.text.slice(0, 2800)}…` : mo.text
  const lines = [
    '*📩 Customer SMS reply*',
    `*From:* ${escapeSlackMrkdwn(customerName)}`,
    `*Phone key:* \`${escapeSlackMrkdwn(phoneKey)}\``,
    `*Message:* ${escapeSlackMrkdwn(bodyPreview)}`,
    orderId
      ? `*Linked order:* \`${escapeSlackMrkdwn(orderId)}\`${mspn ? ` · MSPN \`${escapeSlackMrkdwn(mspn)}\`` : ''}`
      : '_No active order found for this contact — still logged here._',
  ]

  const blocks = [
    { type: 'section', text: { type: 'mrkdwn', text: lines.join('\n') } },
  ]
  if (orderId) {
    blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Reply' },
          style: 'primary',
          action_id: ACTION_SMS_REPLY,
          value: orderId.slice(0, 250),
        },
      ],
    })
  }

  try {
    await slackApiPost(token, 'chat.postMessage', {
      channel,
      text: `Inbound SMS · ${customerName}`,
      blocks,
    })
  } catch (e) {
    console.error('inboundSms slack', e)
    res.status(500).send('Slack post failed')
    return
  }

  res.status(200).send('ok')
}

module.exports = { handleInboundSmsRequest, isAuthorizedInbound }
