/**
 * Phase 4 — invite resolution, registration, delivery, login tracking.
 * @see docs/PHASE4-PEOPLE-SYSTEM-HANDOFF.md
 */
const crypto = require('crypto')
const { onCall, HttpsError } = require('firebase-functions/v2/https')
const admin = require('firebase-admin')
const { FieldValue, Timestamp } = require('firebase-admin/firestore')
const { crewTagFromRole } = require('./peopleSystem')

function firestore() {
  return admin.firestore()
}

function slackChannelEnv() {
  return (
    process.env.SLACK_CHANNEL_ID ||
    process.env.SLACK_NOTIFY_CHANNEL ||
    '#fleet-ops'
  )
}

async function slackFleetOps(text) {
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
  if (!json.ok) console.error('slackFleetOps', json.error || res.status)
}

function clientIpFromCallable(request) {
  const raw = request.rawRequest
  if (!raw) return ''
  const xf = raw.headers?.['x-forwarded-for'] || raw.headers?.['X-Forwarded-For']
  if (xf) return String(xf).split(',')[0].trim()
  if (typeof raw.ip === 'string') return raw.ip
  return ''
}

function parseUserAgent(ua) {
  const s = String(ua || '')
  let browser = 'Browser'
  if (/Edg/i.test(s)) browser = 'Edge'
  else if (/Chrome/i.test(s)) browser = 'Chrome'
  else if (/Safari/i.test(s) && !/Chrome/i.test(s)) browser = 'Safari'
  else if (/Firefox/i.test(s)) browser = 'Firefox'
  let os = 'Desktop'
  if (/iPhone|iPad|iPod/i.test(s)) os = /iPad/i.test(s) ? 'iPad' : 'iPhone'
  else if (/Android/i.test(s)) os = 'Android'
  else if (/Mac OS X|Macintosh/i.test(s)) os = 'macOS'
  else if (/Windows/i.test(s)) os = 'Windows'
  return `${os} / ${browser}`
}

async function lookupGeo(ip) {
  if (!ip || ip === '127.0.0.1' || ip === '::1') return ''
  try {
    const res = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`)
    const j = await res.json()
    if (j.error) return ''
    const city = j.city || ''
    const region = j.region || j.region_code || ''
    if (city && region) return `${city}, ${region}`
    return city || region || ''
  } catch {
    return ''
  }
}

async function loadActiveInvite(token) {
  const t = String(token || '').trim()
  if (!t) return null
  const db = firestore()
  const invRef = db.collection('inviteTokens').doc(t)
  const inv = await invRef.get()
  if (!inv.exists) return null
  const d = inv.data()
  if (d.status !== 'active') return null
  const exp = d.expiry?.toMillis?.()
  if (exp != null && Date.now() > exp) {
    await invRef.update({ status: 'expired' }).catch(() => {})
    return null
  }
  if (d.usedAt) return null
  const uid = d.uid
  if (!uid) return null
  const uSnap = await db.collection('users').doc(uid).get()
  if (!uSnap.exists) return null
  const u = uSnap.data()
  if (u.inviteAccepted) return null
  return { invRef, inv: d, uid, userRef: uSnap.ref, user: u }
}

exports.resolveInvite = onCall(async (request) => {
  const token = String(request.data?.token || '').trim()
  if (!token) {
    throw new HttpsError('invalid-argument', 'token is required.')
  }
  const ctx = await loadActiveInvite(token)
  if (!ctx) {
    return { valid: false, reason: 'inactive' }
  }
  const { user } = ctx
  return {
    valid: true,
    firstName: user.firstName || '',
    lastName: user.lastName || '',
    crewTag: user.crewTag || crewTagFromRole(user.role),
    role: user.role || 'viewer',
    email: user.email || '',
  }
})

exports.getInviteGreeting = onCall(async (request) => {
  const token = String(request.data?.token || '').trim()
  const firstName = String(request.data?.firstName || '').trim() || 'there'
  const crewTag = String(request.data?.crewTag || '').trim() || 'Spotter'
  if (!token) {
    throw new HttpsError('invalid-argument', 'token is required.')
  }
  const ctx = await loadActiveInvite(token)
  if (!ctx) {
    throw new HttpsError('failed-precondition', 'Invite is not active.')
  }

  const key = process.env.ANTHROPIC_API_KEY
  if (!key) {
    return { greeting: `${firstName}. We've been expecting this.` }
  }

  const model =
    process.env.ANTHROPIC_MODEL ||
    process.env.ANTHROPIC_INVITE_MODEL ||
    'claude-3-5-sonnet-20241022'

  const system = `You write a single short greeting line for someone joining a private operations platform called Skedaddle.
Tone: understated, slightly cryptic, never corporate, never exclamatory.
Always include their first name. Imply they were expected, not recruited.
Never explain what Skedaddle is. Never use punctuation beyond a period or comma.
Examples: "DJ. We've been expecting this." / "There you are, Kyle." / "The door was already open, DJ."`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 80,
        system,
        messages: [
          {
            role: 'user',
            content: `First name: ${firstName}. Role label: ${crewTag}.`,
          },
        ],
      }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      console.error('anthropic', json)
      return { greeting: `${firstName}. We've been expecting this.` }
    }
    const text =
      json?.content?.[0]?.text ||
      json?.content?.find?.((c) => c.type === 'text')?.text ||
      ''
    const line = String(text).split('\n')[0].trim().slice(0, 200)
    return { greeting: line || `${firstName}. We've been expecting this.` }
  } catch (e) {
    console.error(e)
    return { greeting: `${firstName}. We've been expecting this.` }
  }
})

exports.sendInviteRegistrationCode = onCall(async (request) => {
  const token = String(request.data?.token || '').trim()
  const email = String(request.data?.email || '').trim().toLowerCase()
  if (!token || !email) {
    throw new HttpsError('invalid-argument', 'token and email are required.')
  }
  const ctx = await loadActiveInvite(token)
  if (!ctx) {
    throw new HttpsError('failed-precondition', 'Invite is not active.')
  }
  const userEmail = String(ctx.user.email || '').trim().toLowerCase()
  if (userEmail !== email) {
    throw new HttpsError('permission-denied', 'Email does not match this invite.')
  }

  const code = String(Math.floor(100000 + Math.random() * 900000))
  const hash = crypto.createHash('sha256').update(`${token}:${code}`).digest('hex')
  const exp = Timestamp.fromMillis(Date.now() + 15 * 60 * 1000)
  await ctx.invRef.update({
    regCodeHash: hash,
    regCodeExpires: exp,
  })

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn('sendInviteRegistrationCode: RESEND_API_KEY not set; code not emailed')
    if (process.env.NODE_ENV !== 'production') {
      console.warn('DEV registration code (set RESEND_API_KEY to send):', code)
    }
    return { ok: true, sent: false }
  }

  const from = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev'
  const subjects = [
    'One moment',
    'Almost there',
    'Check this',
    'Quick note',
    'Your code',
  ]
  const subject = subjects[Math.floor(Math.random() * subjects.length)]
  const body = `Your code is ${code}.\nIt expires in fifteen minutes.\n\nIf you did not request this, ignore this message.`

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject,
      text: body,
    }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    console.error('resend', json)
    throw new HttpsError('internal', 'Could not send email. Check Resend configuration.')
  }
  return { ok: true, sent: true }
})

exports.completeInviteRegistration = onCall(async (request) => {
  const data = request.data || {}
  const token = String(data.token || '').trim()
  const email = String(data.email || '').trim().toLowerCase()
  const code = String(data.code || '').trim()
  const firstName = String(data.firstName || '').trim()
  const lastName = String(data.lastName || '').trim()
  const phone = String(data.phone || '').trim()
  const password = String(data.password || '')

  if (!token || !email || !code || !firstName || !lastName || password.length < 8) {
    throw new HttpsError(
      'invalid-argument',
      'token, email, code, firstName, lastName, and password (8+ chars) are required.',
    )
  }

  const ctx = await loadActiveInvite(token)
  if (!ctx) {
    throw new HttpsError('failed-precondition', 'Invite is not active.')
  }
  const userEmail = String(ctx.user.email || '').trim().toLowerCase()
  if (userEmail !== email) {
    throw new HttpsError('permission-denied', 'Email does not match this invite.')
  }

  const inv = ctx.inv
  const hash = crypto.createHash('sha256').update(`${token}:${code}`).digest('hex')
  if (!inv.regCodeHash || inv.regCodeHash !== hash) {
    throw new HttpsError('permission-denied', 'Invalid or expired code.')
  }
  const expMs = inv.regCodeExpires?.toMillis?.()
  if (expMs == null || Date.now() > expMs) {
    throw new HttpsError('permission-denied', 'Invalid or expired code.')
  }

  const uid = ctx.uid
  try {
    await admin.auth().updateUser(uid, {
      password,
      disabled: false,
      displayName: `${firstName} ${lastName}`,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new HttpsError('internal', msg)
  }

  const db = firestore()
  await ctx.userRef.update({
    firstName,
    lastName,
    phone,
    inviteAccepted: true,
    handshakeSeen: false,
    updatedAt: FieldValue.serverTimestamp(),
  })

  await ctx.invRef.update({
    usedAt: FieldValue.serverTimestamp(),
    status: 'renewed',
    regCodeHash: FieldValue.delete(),
    regCodeExpires: FieldValue.delete(),
  })

  return { ok: true, uid }
})

exports.recordLogin = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.')
  }
  const uid = request.auth.uid
  const ua = String(request.data?.userAgent || '')
  const dev = parseUserAgent(ua)
  const ip = clientIpFromCallable(request)
  const loc = await lookupGeo(ip)

  const ref = firestore().collection('users').doc(uid)
  const snap = await ref.get()
  if (!snap.exists) {
    return { ok: true, skipped: true }
  }
  const before = snap.data() || {}
  if (before.ghostMode) {
    return { ok: true, ghost: true }
  }

  const prevLogins = Array.isArray(before.recentLogins)
    ? before.recentLogins.filter(Boolean).slice(0, 3)
    : []

  let streak = Number(before.loginStreak) || 0
  const lastMs = before.lastLoginAt?.toMillis?.()
  if (lastMs && Date.now() - lastMs < 36 * 60 * 60 * 1000) {
    streak += 1
  } else {
    streak = 1
  }

  const atTs = Timestamp.fromMillis(Date.now())
  const newEntry = { ip, device: dev, at: atTs }
  const newRecent = [newEntry, ...prevLogins].slice(0, 3)

  let suspicious = false
  if (prevLogins.length >= 3) {
    const ips = new Set(prevLogins.map((p) => p.ip))
    const devs = new Set(prevLogins.map((p) => p.device))
    suspicious = !ips.has(ip) && !devs.has(dev)
  }

  if (suspicious) {
    const name = `${before.firstName || ''} ${before.lastName || ''}`.trim() || uid
    const tag = before.crewTag || crewTagFromRole(before.role)
    await slackFleetOps(
      [
        `⚠️ Unusual login — ${name} (${tag})`,
        `Device: ${dev}`,
        `Location: ${loc || '—'}`,
        `Time: ${new Date().toISOString()}`,
      ].join('\n'),
    )
  }

  await ref.update({
    lastLoginAt: FieldValue.serverTimestamp(),
    lastLoginIp: ip,
    lastLoginDevice: dev,
    lastLoginLocation: loc,
    loginStreak: streak,
    recentLogins: newRecent,
  })

  return { ok: true }
})

/**
 * @param {{ firstName: string, email: string, phone: string, inviteUrl: string, deliveryMethod: string }} p
 */
async function deliverInvite(p) {
  const { firstName, email, phone, inviteUrl, deliveryMethod } = p
  const body = `${firstName}. ${inviteUrl}`

  if (deliveryMethod === 'nfc') {
    return
  }

  if (deliveryMethod === 'sms') {
    const sid = process.env.TWILIO_ACCOUNT_SID
    const tok = process.env.TWILIO_AUTH_TOKEN
    const from = process.env.TWILIO_FROM_NUMBER
    const digits = String(phone || '').replace(/\D/g, '')
    if (!sid || !tok || !from || digits.length < 10) {
      console.warn('deliverInvite SMS: missing Twilio env or phone')
      return
    }
    let to = digits
    if (to.length === 10) to = `1${to}`
    to = `+${to}`
    const auth = Buffer.from(`${sid}:${tok}`).toString('base64')
    const params = new URLSearchParams({ To: to, From: from, Body: body })
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      },
    )
    const txt = await res.text()
    if (!res.ok) {
      console.error('Twilio SMS failed', res.status, txt)
    }
    return
  }

  if (deliveryMethod === 'email') {
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      console.warn('deliverInvite email: RESEND_API_KEY not set')
      return
    }
    const from = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev'
    const subjects = ['One step', 'This way', 'When you can', 'Quick link']
    const subject = subjects[Math.floor(Math.random() * subjects.length)]
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [email],
        subject,
        text: `${body}\n`,
      }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      console.error('Resend invite email failed', json)
    }
  }
}

module.exports = {
  deliverInvite,
  resolveInvite: exports.resolveInvite,
  getInviteGreeting: exports.getInviteGreeting,
  sendInviteRegistrationCode: exports.sendInviteRegistrationCode,
  completeInviteRegistration: exports.completeInviteRegistration,
  recordLogin: exports.recordLogin,
}
