/**
 * Phase 4 — invite resolution, registration, delivery, login tracking.
 * @see docs/PHASE4-PEOPLE-SYSTEM-HANDOFF.md
 */
const crypto = require('crypto')
const { onCall, HttpsError } = require('firebase-functions/v2/https')
const { SLACK_SECRETS, ANTHROPIC_API_KEY, anthropicKeyResolved } = require('./slackSecrets')
const admin = require('firebase-admin')
const { FieldValue, Timestamp } = require('firebase-admin/firestore')
const { crewTagFromRole, assertCanManagePeople, normalizeRole } = require('./peopleSystem')
const { BRAND } = require('./brand')

/**
 * Minimal HTML escape so AI-generated greetings, names, or URLs can be
 * interpolated into the invite email HTML without breaking layout or
 * opening an XSS hole (the recipient's own mail client renders this).
 */
function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Translate a millisecond expiry timestamp into a short, plain-English
 * duration ("in 47 hours", "in 2 days"). Helps the recipient gauge how
 * soon they need to act, and adds a concrete time signal that real
 * registration emails carry — bare links read as phishing.
 */
function expiryPhrase(inviteExpiryMillis) {
  const ms = Number(inviteExpiryMillis)
  if (!Number.isFinite(ms) || ms <= Date.now()) return ''
  const deltaMin = Math.round((ms - Date.now()) / 60000)
  if (deltaMin < 90) return `in ${deltaMin} minute${deltaMin === 1 ? '' : 's'}`
  const deltaHr = Math.round(deltaMin / 60)
  if (deltaHr < 36) return `in ${deltaHr} hour${deltaHr === 1 ? '' : 's'}`
  const deltaDays = Math.round(deltaHr / 24)
  return `in ${deltaDays} day${deltaDays === 1 ? '' : 's'}`
}

/**
 * Triad mark used as the hero-band background image. Inline SVG via
 * data: URI renders in Apple Mail, iOS Mail, Outlook web, and most
 * Gmail clients; Outlook desktop and Android Gmail strip background
 * images, so the cell falls back to the solid bgcolor with the
 * wordmark and verified badge still readable. Stroke opacity dropped
 * to 0.55 so the wordmark layered on top stays high-contrast.
 */
const TRIAD_HERO_DATA_URI =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none">' +
      '<circle cx="24" cy="16" r="9" stroke="#7e14ff" stroke-opacity="0.55" stroke-width="2.5"/>' +
      '<circle cx="16" cy="29.86" r="9" stroke="#7e14ff" stroke-opacity="0.55" stroke-width="2.5"/>' +
      '<circle cx="32" cy="29.86" r="9" stroke="#7e14ff" stroke-opacity="0.55" stroke-width="2.5"/>' +
      '</svg>',
  )

/**
 * Build the HTML body for the invite email. Inline styles only — Gmail,
 * Outlook, and most webmail clients strip <style> blocks. Table-based
 * layout because divs are still flaky in Outlook desktop. Dark theme
 * (zinc-950 outer, zinc-900 card with brand-purple ring) matches the
 * portal chrome; modern clients respect explicit dark colors instead
 * of auto-inverting. Outlook desktop falls back to a solid dark card
 * without the SVG mark, which is fine.
 *
 * Trust signals on purpose: explicit "Verified registration link"
 * subhead, expiry duration, named inviter, legal entity in the footer.
 * Spam filters weight these as legitimacy markers; humans read them
 * the same way.
 */
function renderInviteEmailHtml({
  greeting,
  inviterFirstName,
  inviteUrl,
  inviteExpiryMillis,
}) {
  const safeGreeting = escapeHtml(greeting)
  const safeUrl = escapeHtml(inviteUrl)
  const safeInviter = escapeHtml(inviterFirstName)
  const safeEntity = escapeHtml(BRAND.legalEntity)
  const inviterClause = safeInviter
    ? `${safeInviter} set you up with access to <strong style="color:#fafafa;">Tire Triad</strong>`
    : `You have been given access to <strong style="color:#fafafa;">Tire Triad</strong>`
  const sentByLine = safeInviter
    ? `Sent by ${safeInviter} ~ Tire Triad initiation`
    : `Sent by ${safeEntity} ~ Tire Triad initiation`
  const expiryStr = expiryPhrase(inviteExpiryMillis)
  const expiryLine = expiryStr
    ? `This registration link is single-use and expires ${expiryStr}.`
    : 'This registration link is single-use and expires automatically.'
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>Tire Triad access</title>
</head>
<body style="margin:0;padding:0;background:#09090b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#fafafa;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#09090b;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;background:#18181b;border-radius:14px;border:1px solid #27272a;">
<tr><td align="center" valign="middle" background="${TRIAD_HERO_DATA_URI}" bgcolor="#18181b" height="220" style="height:220px;background-color:#18181b;background-image:url('${TRIAD_HERO_DATA_URI}');background-repeat:no-repeat;background-position:center;background-size:200px 200px;padding:32px 32px 24px;">
<div style="letter-spacing:0.32em;font-size:18px;font-weight:600;color:#fafafa;text-shadow:0 1px 2px rgba(0,0,0,0.6);">TIRE TRIAD</div>
<div style="margin-top:12px;">
<span style="display:inline-block;font-size:11px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:#e9d5ff;background:rgba(15,15,18,0.7);border:1px solid rgba(126,20,255,0.55);border-radius:999px;padding:5px 12px;">Verified registration link</span>
</div>
</td></tr>
<tr><td style="padding:0 32px 8px;"><hr style="border:0;border-top:1px solid #27272a;margin:0;"></td></tr>
<tr><td style="padding:20px 32px 4px;font-size:16px;line-height:1.55;color:#e4e4e7;">
<p style="margin:0 0 16px;color:#fafafa;">${safeGreeting}</p>
<p style="margin:0 0 24px;color:#d4d4d8;">${inviterClause}, the private ops portal for ${safeEntity}. The button below signs you in and finishes registration.</p>
</td></tr>
<tr><td align="center" style="padding:8px 32px 20px;">
<a href="${safeUrl}" style="display:inline-block;background:#7e14ff;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:14px 28px;border-radius:8px;">Open Tire Triad</a>
</td></tr>
<tr><td style="padding:4px 32px 8px;text-align:center;">
<p style="margin:0;font-size:12px;color:#a1a1aa;">${expiryLine}</p>
</td></tr>
<tr><td style="padding:16px 32px 24px;font-size:12px;color:#71717a;line-height:1.5;">
<p style="margin:0 0 8px;color:#a1a1aa;">Trouble with the button? Paste this verified link into your browser:</p>
<p style="margin:0;word-break:break-all;"><a href="${safeUrl}" style="color:#c4b5fd;text-decoration:underline;">${safeUrl}</a></p>
</td></tr>
<tr><td style="padding:16px 32px 28px;border-top:1px solid #27272a;">
<p style="margin:0;font-size:12px;color:#71717a;line-height:1.6;">${sentByLine}. Authenticated by SPF, DKIM, and DMARC on the <code style="color:#a1a1aa;background:#27272a;padding:1px 4px;border-radius:4px;font-size:11px;">${escapeHtml(BRAND.emailDomain)}</code> domain. If you were not expecting this email, you can ignore it; the registration link will expire on its own and no account is created until you complete sign-in.</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`
}

function firestore() {
  return admin.firestore()
}

/**
 * Read a secret env var and strip junk that breaks HTTP headers.
 *
 * Specifically guards against U+FEFF (byte-order mark) at the start of the
 * value. firebase functions:secrets:set reads stdin without normalising; a
 * key pasted from a file saved as UTF-8-with-BOM or copied through certain
 * clipboard paths picks up an invisible 0xFEFF at index 0, which fetch
 * refuses to encode into an HTTP header and throws
 * "Cannot convert argument to a ByteString". Strips BOM, then trims
 * standard whitespace, then returns the result. Empty string if unset.
 *
 * Apply to every secret that ends up in an Authorization header, an
 * x-api-key header, or any other ByteString-encoded HTTP slot.
 */
function cleanSecret(raw) {
  if (raw == null) return ''
  return String(raw).replace(/^\uFEFF/, '').trim()
}

function slackChannelEnv() {
  return (
    process.env.SLACK_CHANNEL_ID ||
    process.env.SLACK_NOTIFY_CHANNEL ||
    '#fleet-ops'
  )
}

async function slackFleetOps(text) {
  const token = cleanSecret(process.env.SLACK_BOT_TOKEN)
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

async function fetchInviteGreetingLine(firstName, crewTag, apiKey) {
  const fn = String(firstName || '').trim() || 'there'
  const tag = String(crewTag || '').trim() || 'Spotter'
  const key = String(apiKey || '').trim()
  if (!key) {
    return `${fn}. We've been expecting this.`
  }

  const model =
    process.env.ANTHROPIC_MODEL ||
    process.env.ANTHROPIC_INVITE_MODEL ||
    'claude-sonnet-4-6'

  const system = `You write a single short greeting line for someone joining a private operations platform called Tire Triad.
Tone: understated, slightly cryptic, never corporate, never exclamatory.
Always include their first name. Imply they were expected, not recruited.
Never explain what Tire Triad is. Never use punctuation beyond a period or comma.
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
            content: `First name: ${fn}. Role label: ${tag}.`,
          },
        ],
      }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      console.error('anthropic', json)
      return `${fn}. We've been expecting this.`
    }
    const text =
      json?.content?.[0]?.text ||
      json?.content?.find?.((c) => c.type === 'text')?.text ||
      ''
    const line = String(text).split('\n')[0].trim().slice(0, 200)
    return line || `${fn}. We've been expecting this.`
  } catch (e) {
    console.error(e)
    return `${fn}. We've been expecting this.`
  }
}

exports.getInviteGreeting = onCall({ secrets: [ANTHROPIC_API_KEY] }, async (request) => {
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

  const greeting = await fetchInviteGreetingLine(
    firstName,
    crewTag,
    anthropicKeyResolved(ANTHROPIC_API_KEY.value()),
  )
  return { greeting }
})

/** People admins — preview greeting before sending an invite (no token). */
exports.previewInviteGreeting = onCall({ secrets: [ANTHROPIC_API_KEY] }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.')
  }
  const db = firestore()
  await assertCanManagePeople(db, request.auth.uid)
  const firstName = String(request.data?.firstName || '').trim() || 'there'
  const role = normalizeRole(request.data?.role)
  const crewTag = crewTagFromRole(role)
  const greeting = await fetchInviteGreetingLine(
    firstName,
    crewTag,
    anthropicKeyResolved(ANTHROPIC_API_KEY.value()),
  )
  return { greeting }
})

/**
 * Generate an invite greeting line server-side (for inclusion in the SMS/email body).
 * Uses the same Anthropic path as `previewInviteGreeting`. Falls back to a safe line
 * if generation fails or the Anthropic key is missing. Never throws.
 * @param {{ firstName: string, role?: string, secretValue?: unknown }} opts
 * @returns {Promise<string>}
 */
async function generateInviteGreetingLine({ firstName, role, secretValue }) {
  const fn = String(firstName || '').trim() || 'there'
  const crewTag = crewTagFromRole(normalizeRole(role))
  try {
    const key = anthropicKeyResolved(secretValue)
    return await fetchInviteGreetingLine(fn, crewTag, key)
  } catch (e) {
    console.warn('generateInviteGreetingLine failed, falling back', e)
    return `${fn}. We've been expecting this.`
  }
}

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

  const apiKey = cleanSecret(process.env.RESEND_API_KEY)
  if (!apiKey) {
    console.warn('sendInviteRegistrationCode: RESEND_API_KEY not set; code not emailed')
    if (process.env.NODE_ENV !== 'production') {
      console.warn('DEV registration code (set RESEND_API_KEY to send):', code)
    }
    return { ok: true, sent: false }
  }

  const from = cleanSecret(process.env.RESEND_FROM_EMAIL) || 'onboarding@resend.dev'
  const replyTo = cleanSecret(process.env.RESEND_REPLY_TO_EMAIL)
  // Code-in-subject is the industry pattern (Stripe / Slack / GitHub do this).
  // The recipient can read the code straight from their phone notification or
  // the inbox preview pane without opening the message - massively faster than
  // a generic "Your code" subject + open + scan + retype flow. The code is
  // single-use and expires in 15 min so subject-line exposure is a non-issue.
  const subject = `${code} is your Tire Triad sign-in code`
  const body = `Your code is ${code}.\nIt expires in fifteen minutes.\n\nIf you did not request this, ignore this message.`

  const payload = {
    from,
    to: [email],
    subject,
    text: body,
  }
  if (replyTo) payload.reply_to = replyTo

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
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

  const slackInviteUrl = String(process.env.SLACK_INVITE_URL || '').trim()
  return { ok: true, uid, slackInviteUrl: slackInviteUrl || null }
})

exports.recordLogin = onCall({ secrets: SLACK_SECRETS }, async (request) => {
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

/** Fallback body when no greeting was generated. */
function fallbackBody(firstName, inviteUrl) {
  return `${firstName}. ${inviteUrl}`
}

/**
 * Build the SMS body from a greeting + invite URL, keeping the total under 280 chars
 * so it stays a single segment on most carriers. Truncates the greeting if required.
 * @param {string} greeting
 * @param {string} firstName
 * @param {string} inviteUrl
 */
function buildSmsBody(greeting, firstName, inviteUrl) {
  const url = String(inviteUrl || '').trim()
  const rawGreeting = String(greeting || '').trim()
  const fallback = `${firstName}.`
  const MAX = 280
  // Reserve one char for the space between greeting and URL.
  const maxGreetingLen = Math.max(0, MAX - url.length - 1)
  if (rawGreeting && rawGreeting.length <= maxGreetingLen) {
    return `${rawGreeting} ${url}`
  }
  if (rawGreeting && maxGreetingLen > 0) {
    return `${rawGreeting.slice(0, maxGreetingLen).trimEnd()} ${url}`
  }
  // No greeting, or not enough room: fall back to the first-name line.
  if (fallback.length + 1 + url.length <= MAX) {
    return `${fallback} ${url}`
  }
  return url
}

/**
 * @param {{ firstName: string, email: string, phone: string, inviteUrl: string, deliveryMethod: string, greeting?: string, inviterFirstName?: string, inviteExpiryMillis?: number }} p
 * @returns {Promise<{ sent: boolean, reason?: string }>}
 */
async function deliverInvite(p) {
  const { firstName, email, phone, inviteUrl, deliveryMethod, greeting, inviterFirstName, inviteExpiryMillis } = p
  const greetingLine = String(greeting || '').trim()
  const emailFirstPara = greetingLine || `${firstName}.`

  if (deliveryMethod === 'nfc') {
    return { sent: false, reason: 'client-side-nfc' }
  }

  if (deliveryMethod === 'sms') {
    const planId = cleanSecret(process.env.SINCH_SERVICE_PLAN_ID)
    const apiToken = cleanSecret(process.env.SINCH_API_TOKEN)
    const from = cleanSecret(process.env.SINCH_FROM_NUMBER)
    const region = cleanSecret(process.env.SINCH_REGION).toLowerCase() || 'us'
    const digits = String(phone || '').replace(/\D/g, '')
    if (!planId || !apiToken || !from || digits.length < 10) {
      console.warn('deliverInvite SMS: missing Sinch configuration or phone')
      return { sent: false, reason: 'missing-env' }
    }
    const to = digits.length === 10 ? `1${digits}` : digits
    const body = buildSmsBody(greetingLine, firstName, inviteUrl) || fallbackBody(firstName, inviteUrl)
    const host = region === 'eu' ? 'eu.sms.api.sinch.com' : 'us.sms.api.sinch.com'
    try {
      const res = await fetch(
        `https://${host}/xms/v1/${encodeURIComponent(planId)}/batches`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ from, to: [to], body }),
        },
      )
      const txt = await res.text()
      if (!res.ok) {
        console.error('Sinch SMS failed', res.status, txt)
        return { sent: false, reason: 'provider-error' }
      }
      return { sent: true }
    } catch (e) {
      console.error('Sinch SMS threw', e)
      return { sent: false, reason: 'provider-error' }
    }
  }

  if (deliveryMethod === 'email') {
    const apiKey = cleanSecret(process.env.RESEND_API_KEY)
    if (!apiKey) {
      console.warn('deliverInvite email: Resend configuration missing')
      return { sent: false, reason: 'missing-env' }
    }
    const from = cleanSecret(process.env.RESEND_FROM_EMAIL) || 'onboarding@resend.dev'
    const replyTo = cleanSecret(process.env.RESEND_REPLY_TO_EMAIL)
    // Subject names both parties when we have them: "Kyle, Alex set up
    // your Tire Triad access". Names the sender so the recipient sees a
    // trust signal in the notification line, and drops the "portal"
    // jargon that reads as boilerplate. Falls back to the older
    // recipient-only or fully generic forms when one name is missing.
    // Dropped the random rotation through "One step" / "This way" /
    // "Quick link" - those read as phishing to spam filters and humans.
    const inviter = String(inviterFirstName || '').trim()
    let subject
    if (firstName && inviter) {
      subject = `${firstName}, ${inviter} set up your Tire Triad access`
    } else if (firstName) {
      subject = `${firstName}, your Tire Triad access`
    } else {
      subject = 'Your Tire Triad access'
    }
    // Both HTML and text. Most modern clients render HTML; the text body
    // is the fallback for plain-text-only clients and also reduces the
    // spam-filter weight against us (raw URL + nothing else looks bad).
    const inviterClauseText = inviter
      ? `${inviter} set you up with access to Tire Triad`
      : `You have been given access to Tire Triad`
    const expiryStrText = expiryPhrase(inviteExpiryMillis)
    const expiryLineText = expiryStrText
      ? `This registration link is single-use and expires ${expiryStrText}.`
      : 'This registration link is single-use and expires automatically.'
    const textBody = [
      emailFirstPara,
      '',
      `${inviterClauseText}, the private ops portal for ${BRAND.legalEntity}.`,
      'Open the link below to verify your registration and sign in:',
      '',
      inviteUrl,
      '',
      expiryLineText,
      '',
      inviter
        ? `Sent by ${inviter} ~ Tire Triad initiation. Authenticated by SPF, DKIM, and DMARC on ${BRAND.emailDomain}. If you were not expecting this email, you can ignore it; no account is created until you complete sign-in.`
        : `Sent by ${BRAND.legalEntity} ~ Tire Triad initiation. Authenticated by SPF, DKIM, and DMARC on ${BRAND.emailDomain}. If you were not expecting this email, you can ignore it; no account is created until you complete sign-in.`,
      '',
    ].join('\n')
    const htmlBody = renderInviteEmailHtml({
      greeting: emailFirstPara,
      inviterFirstName: inviter,
      inviteUrl,
      inviteExpiryMillis,
    })
    const payload = {
      from,
      to: [email],
      subject,
      text: textBody,
      html: htmlBody,
    }
    if (replyTo) payload.reply_to = replyTo
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        console.error('Resend invite email failed', json)
        return { sent: false, reason: 'provider-error' }
      }
      return { sent: true }
    } catch (e) {
      console.error('Resend invite email threw', e)
      return { sent: false, reason: 'provider-error' }
    }
  }

  return { sent: false, reason: 'unknown-method' }
}

module.exports = {
  deliverInvite,
  generateInviteGreetingLine,
  buildSmsBody,
  resolveInvite: exports.resolveInvite,
  getInviteGreeting: exports.getInviteGreeting,
  previewInviteGreeting: exports.previewInviteGreeting,
  sendInviteRegistrationCode: exports.sendInviteRegistrationCode,
  completeInviteRegistration: exports.completeInviteRegistration,
  recordLogin: exports.recordLogin,
}
