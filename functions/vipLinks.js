/**
 * VIP concierge signed links: HMAC token + generate/verify callables.
 */
const crypto = require('crypto')
const { onCall, HttpsError } = require('firebase-functions/v2/https')
const { defineSecret } = require('firebase-functions/params')
const admin = require('firebase-admin')

const VIP_TOKEN_SECRET = defineSecret('VIP_TOKEN_SECRET')

const DEFAULT_TTL_MS = 72 * 60 * 60 * 1000
const VIP_TIERS = new Set(['standard', 'platinum'])

function firestore() {
  return admin.firestore()
}

function b64urlEncode(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function b64urlDecodeToBuffer(s) {
  const str = String(s || '')
  const pad = (4 - (str.length % 4)) % 4
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(pad)
  return Buffer.from(b64, 'base64')
}

function readVipSecretOrThrow() {
  let raw
  try {
    raw = VIP_TOKEN_SECRET.value()
  } catch {
    raw = ''
  }
  const secret = String(raw || '').trim()
  if (!secret) {
    throw new HttpsError(
      'failed-precondition',
      'VIP_TOKEN_SECRET is not configured. Run `firebase functions:secrets:set VIP_TOKEN_SECRET` and redeploy.',
    )
  }
  return secret
}

function signVipToken({ accountId, tier, ttlMs, secret, nowMs }) {
  const iat = nowMs
  const exp = nowMs + (typeof ttlMs === 'number' && ttlMs > 0 ? ttlMs : DEFAULT_TTL_MS)
  const payload = { accountId: String(accountId), tier: String(tier), exp, iat, v: 1 }
  const payloadJson = JSON.stringify(payload)
  const payloadB64 = b64urlEncode(Buffer.from(payloadJson, 'utf8'))
  const sig = crypto.createHmac('sha256', secret).update(payloadB64, 'utf8').digest()
  const sigB64 = b64urlEncode(sig)
  return `${payloadB64}.${sigB64}`
}

function verifyVipToken(token, secret, nowMs) {
  const t = String(token || '').trim()
  const parts = t.split('.')
  if (parts.length !== 2) return { ok: false, reason: 'malformed' }
  const [payloadB64, sigB64] = parts
  if (!payloadB64 || !sigB64) return { ok: false, reason: 'malformed' }

  let payloadRaw
  try {
    payloadRaw = b64urlDecodeToBuffer(payloadB64).toString('utf8')
  } catch {
    return { ok: false, reason: 'malformed' }
  }

  let payload
  try {
    payload = JSON.parse(payloadRaw)
  } catch {
    return { ok: false, reason: 'malformed' }
  }
  if (!payload || typeof payload !== 'object') return { ok: false, reason: 'malformed' }
  if (payload.v !== 1) return { ok: false, reason: 'wrong-version' }

  const expected = crypto.createHmac('sha256', secret).update(payloadB64, 'utf8').digest()
  let sigBuf
  try {
    sigBuf = b64urlDecodeToBuffer(sigB64)
  } catch {
    return { ok: false, reason: 'malformed' }
  }
  if (sigBuf.length !== expected.length) return { ok: false, reason: 'bad-signature' }
  if (!crypto.timingSafeEqual(sigBuf, expected)) return { ok: false, reason: 'bad-signature' }

  if (typeof payload.exp !== 'number' || payload.exp <= nowMs) return { ok: false, reason: 'expired' }

  return { ok: true, payload }
}

async function assertPortalAdmin(db, auth) {
  if (!auth?.uid) throw new HttpsError('unauthenticated', 'Sign in required.')
  if (String(auth.token?.role || '').toLowerCase() === 'admin') return
  const snap = await db.collection('users').doc(auth.uid).get()
  if (snap.exists && String(snap.data()?.role || '').toLowerCase() === 'admin') return
  throw new HttpsError('permission-denied', 'Admin only.')
}

async function resolvePortalOrigin(db) {
  const env =
    process.env.PORTAL_BASE_URL ||
    process.env.VITE_PORTAL_BASE_URL ||
    process.env.VITE_PORTAL_ORIGIN ||
    ''
  const trimmed = String(env || '').trim().replace(/\/+$/, '')
  if (trimmed) return trimmed

  const snap = await db.doc('meta/config').get()
  const fromMeta = snap.exists ? snap.data()?.portalOrigin : null
  const metaTrim = String(fromMeta || '').trim().replace(/\/+$/, '')
  if (metaTrim) return metaTrim

  throw new HttpsError(
    'failed-precondition',
    'Portal origin is not configured. Set PORTAL_BASE_URL (or VITE_PORTAL_BASE_URL) or Firestore meta/config.portalOrigin.',
  )
}

function resolvedTierFromAccount(docTier, tokenTier) {
  const d = String(docTier || '').toLowerCase()
  if (VIP_TIERS.has(d)) return d
  const t = String(tokenTier || '').toLowerCase()
  return VIP_TIERS.has(t) ? t : 'standard'
}

exports.signVipToken = signVipToken
exports.verifyVipToken = verifyVipToken

exports.generateVipLink = onCall({ secrets: [VIP_TOKEN_SECRET] }, async (request) => {
  const db = firestore()
  await assertPortalAdmin(db, request.auth)

  const accountId = String(request.data?.accountId || '').trim()
  const tier = String(request.data?.tier || '').trim().toLowerCase()
  if (!accountId) throw new HttpsError('invalid-argument', 'accountId is required.')
  if (!VIP_TIERS.has(tier)) {
    throw new HttpsError('invalid-argument', 'tier must be standard or platinum.')
  }

  const accRef = db.collection('crmAccounts').doc(accountId)
  const accSnap = await accRef.get()
  if (!accSnap.exists) throw new HttpsError('not-found', 'CRM account not found.')

  const secret = readVipSecretOrThrow()
  const token = signVipToken({
    accountId,
    tier,
    ttlMs: DEFAULT_TTL_MS,
    secret,
    nowMs: Date.now(),
  })
  const origin = await resolvePortalOrigin(db)
  const url = `${origin}/vip/${token}`

  return { token, url }
})

exports.verifyVipLink = onCall({ secrets: [VIP_TOKEN_SECRET] }, async (request) => {
  const db = firestore()
  const token = String(request.data?.token || '').trim()
  if (!token) throw new HttpsError('invalid-argument', 'token is required.')

  const secret = readVipSecretOrThrow()
  const checked = verifyVipToken(token, secret, Date.now())
  if (!checked.ok) {
    throw new HttpsError('invalid-argument', checked.reason)
  }

  const { accountId, tier: tokenTier } = checked.payload
  if (!accountId) throw new HttpsError('invalid-argument', 'malformed')

  const accSnap = await db.collection('crmAccounts').doc(String(accountId)).get()
  if (!accSnap.exists) throw new HttpsError('not-found', 'CRM account not found.')

  const data = accSnap.data() || {}
  const displayName =
    String(data.companyName || '').trim() ||
    String(data.decisionMaker || '').trim() ||
    'VIP client'

  const tier = resolvedTierFromAccount(data.vipTier, tokenTier)

  return {
    ok: true,
    account: { id: accSnap.id, displayName, tier },
  }
})
