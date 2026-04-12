/**
 * Phase 4 — user provisioning & admin updates (callable).
 */
const crypto = require('crypto')
const { onCall, HttpsError } = require('firebase-functions/v2/https')
const admin = require('firebase-admin')
const { FieldValue, Timestamp } = require('firebase-admin/firestore')
const {
  buildUserDocument,
  assertCanManagePeople,
  crewTagFromRole,
  permissionsForRole,
  normalizeRole,
  MODULE_MATRIX,
} = require('./peopleSystem')
const { deliverInvite } = require('./inviteFlow')

const LEVEL_RANK = { none: 0, view: 1, edit: 2, act: 2, manage: 3 }

function levelRank(lev) {
  return LEVEL_RANK[String(lev || '').toLowerCase()] ?? 0
}

exports.ensureUserDocument = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.')
  }
  const db = admin.firestore()
  const uid = request.auth.uid
  const ref = db.collection('users').doc(uid)
  const existing = await ref.get()
  if (existing.exists) {
    return { ok: true, created: false }
  }

  const email = request.auth.token.email || ''
  const emailLc = email.trim().toLowerCase()
  const displayName = request.auth.token.name || ''
  const parts = String(displayName).trim().split(/\s+/)
  const firstName = parts[0] || 'User'
  const lastName = parts.slice(1).join(' ') || ''

  const boot = String(process.env.BOOTSTRAP_ADMIN_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)

  let role = 'viewer'
  if (boot.length > 0) {
    if (boot.includes(emailLc)) role = 'admin'
  } else {
    const qs = await db.collection('users').limit(1).get()
    role = qs.empty ? 'admin' : 'viewer'
  }

  const payload = buildUserDocument({
    uid,
    email,
    firstName,
    lastName,
    phone: '',
    role,
    inviteAccepted: true,
    handshakeSeen: true,
    inviteStatus: 'renewed',
    inviteToken: '',
    inviteExpiry: null,
  })

  try {
    await ref.create(payload)
  } catch (e) {
    const code = e && (e.code || e.status)
    if (code === 6 || code === 'ALREADY_EXISTS') {
      return { ok: true, created: false }
    }
    const msg = e instanceof Error ? e.message : String(e)
    throw new HttpsError('internal', msg)
  }

  return { ok: true, created: true, role }
})

exports.createPortalUser = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.')
  }
  const db = admin.firestore()
  await assertCanManagePeople(db, request.auth.uid)

  const data = request.data || {}
  const firstName = String(data.firstName || '').trim()
  const lastName = String(data.lastName || '').trim()
  const email = String(data.email || '').trim().toLowerCase()
  const phone = String(data.phone || '').trim()
  const role = normalizeRole(data.role)
  const inviteDelivery = ['sms', 'nfc', 'email'].includes(data.inviteDelivery)
    ? data.inviteDelivery
    : 'email'
  const accessExpiryMs = data.accessExpiryMs

  if (!firstName || !lastName || !email) {
    throw new HttpsError(
      'invalid-argument',
      'First name, last name, and email are required.',
    )
  }

  const token = crypto.randomBytes(24).toString('hex')
  const tempPassword = crypto.randomBytes(24).toString('base64url').slice(0, 32)

  let userRecord
  try {
    userRecord = await admin.auth().createUser({
      email,
      password: tempPassword,
      displayName: `${firstName} ${lastName}`,
      emailVerified: false,
      disabled: true,
    })
  } catch (e) {
    const code = e && e.errorInfo && e.errorInfo.code
    if (code === 'auth/email-already-exists') {
      throw new HttpsError('already-exists', 'That email is already registered.')
    }
    const msg = e instanceof Error ? e.message : String(e)
    throw new HttpsError('internal', msg)
  }

  const uid = userRecord.uid
  const inviteExpiry = Timestamp.fromMillis(Date.now() + 48 * 3600000)
  let accessExpiry = null
  if (accessExpiryMs != null && Number.isFinite(Number(accessExpiryMs))) {
    accessExpiry = Timestamp.fromMillis(Number(accessExpiryMs))
  }

  const batch = db.batch()
  const userRef = db.collection('users').doc(uid)
  const invRef = db.collection('inviteTokens').doc(token)

  batch.set(
    userRef,
    buildUserDocument({
      uid,
      email,
      firstName,
      lastName,
      phone,
      role,
      inviteToken: token,
      inviteStatus: 'active',
      inviteExpiry,
      inviteDelivery,
      inviteAccepted: false,
      handshakeSeen: false,
      accessExpiry,
    }),
  )

  batch.set(invRef, {
    token,
    uid,
    status: 'active',
    expiry: inviteExpiry,
    createdAt: FieldValue.serverTimestamp(),
    usedAt: null,
    deliveryMethod: inviteDelivery,
  })

  try {
    await batch.commit()
  } catch (e) {
    await admin.auth().deleteUser(uid).catch(() => {})
    const msg = e instanceof Error ? e.message : String(e)
    throw new HttpsError('internal', `Failed to save invite: ${msg}`)
  }

  const portalBase = process.env.PORTAL_BASE_URL || 'https://www.skedaddleinc.com'
  const inviteUrl = `${portalBase.replace(/\/$/, '')}/i/${token}`

  try {
    await deliverInvite({
      firstName,
      email,
      phone,
      inviteUrl,
      deliveryMethod: inviteDelivery,
    })
  } catch (e) {
    console.error('createPortalUser: deliverInvite', e)
  }

  return {
    ok: true,
    uid,
    token,
    inviteUrl,
  }
})

exports.updatePortalUser = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.')
  }
  const db = admin.firestore()
  await assertCanManagePeople(db, request.auth.uid)

  const data = request.data || {}
  const targetUid = String(data.targetUid || '').trim()
  if (!targetUid) {
    throw new HttpsError('invalid-argument', 'targetUid is required.')
  }

  const ref = db.collection('users').doc(targetUid)
  const snap = await ref.get()
  if (!snap.exists) {
    throw new HttpsError('not-found', 'User not found.')
  }

  const before = snap.data() || {}
  const patch = {}

  if (data.permissions && typeof data.permissions === 'object') {
    patch.permissions = data.permissions
  }
  if (data.role != null) {
    const nr = normalizeRole(data.role)
    patch.role = nr
    patch.crewTag = crewTagFromRole(nr)
    if (data.applyRoleDefaults) {
      patch.permissions = permissionsForRole(nr)
    }
  }
  if (['active', 'expired', 'locked', 'renewed'].includes(data.inviteStatus)) {
    patch.inviteStatus = data.inviteStatus
  }
  if (typeof data.ghostMode === 'boolean') {
    patch.ghostMode = data.ghostMode
  }
  if (data.accessExpiryMs === null) {
    patch.accessExpiry = null
  } else if (data.accessExpiryMs != null && Number.isFinite(Number(data.accessExpiryMs))) {
    patch.accessExpiry = Timestamp.fromMillis(Number(data.accessExpiryMs))
  }
  if (data.renewInvite === true) {
    patch.inviteExpiry = Timestamp.fromMillis(Date.now() + 48 * 3600000)
    patch.inviteStatus = 'active'
  }

  if (Object.keys(patch).length === 0) {
    throw new HttpsError('invalid-argument', 'Nothing to update.')
  }

  patch.updatedAt = FieldValue.serverTimestamp()

  await ref.update(patch)

  await db.collection('accessLog').doc().set({
    uid: targetUid,
    changedBy: request.auth.uid,
    changedAt: FieldValue.serverTimestamp(),
    field: 'portalUpdate',
    before: { permissions: before.permissions, role: before.role },
    after: patch,
    reason: String(data.reason || ''),
  })

  return { ok: true }
})

/**
 * Temporary elevation: raises one module permission until expiresAt; revert is processed hourly.
 */
exports.scheduleElevationRevert = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.')
  }
  const db = admin.firestore()
  await assertCanManagePeople(db, request.auth.uid)

  const targetUid = String(request.data?.targetUid || '').trim()
  const module = String(request.data?.module || '').trim()
  const elevatedLevel = String(request.data?.elevatedLevel || '').trim().toLowerCase()
  const duration = String(request.data?.duration || '')
  const durationMs =
    duration === '24h'
      ? 24 * 3600000
      : duration === '48h'
        ? 48 * 3600000
        : duration === '7d'
          ? 7 * 24 * 3600000
          : 0

  if (!targetUid) {
    throw new HttpsError('invalid-argument', 'targetUid is required.')
  }
  if (!durationMs) {
    throw new HttpsError('invalid-argument', 'duration must be 24h, 48h, or 7d.')
  }

  const row = MODULE_MATRIX.find((r) => r.key === module)
  if (!row) {
    throw new HttpsError('invalid-argument', 'Invalid module.')
  }
  if (!row.levels.includes(elevatedLevel)) {
    throw new HttpsError('invalid-argument', 'Invalid level for this module.')
  }

  const userRef = db.collection('users').doc(targetUid)
  const revertRef = db.collection('scheduledReverts').doc()
  const elevationId = revertRef.id
  const expiresAt = Timestamp.fromMillis(Date.now() + durationMs)

  let loggedPrev = 'none'

  await db.runTransaction(async (tx) => {
    const fresh = await tx.get(userRef)
    if (!fresh.exists) {
      throw new HttpsError('not-found', 'User not found.')
    }
    const d = fresh.data() || {}
    const prev = String(d.permissions?.[module] || 'none').toLowerCase()
    const prevNorm = row.levels.includes(prev) ? prev : 'none'
    loggedPrev = prevNorm
    if (levelRank(elevatedLevel) <= levelRank(prevNorm)) {
      throw new HttpsError(
        'failed-precondition',
        'Elevated level must be strictly higher than the user’s current level for this module.',
      )
    }
    const nextPerms = { ...(d.permissions || {}) }
    nextPerms[module] = elevatedLevel
    const arr = Array.isArray(d.timedElevations) ? d.timedElevations : []
    const entry = {
      id: elevationId,
      module,
      previousLevel: prevNorm,
      elevatedLevel,
      expiresAt,
      grantedBy: request.auth.uid,
    }
    tx.update(userRef, {
      permissions: nextPerms,
      timedElevations: [...arr, entry],
      updatedAt: FieldValue.serverTimestamp(),
    })
    tx.set(revertRef, {
      elevationId,
      targetUid,
      module,
      previousLevel: prevNorm,
      elevatedLevel,
      expiresAt,
      grantedBy: request.auth.uid,
      processed: false,
      createdAt: FieldValue.serverTimestamp(),
    })
  })

  await db.collection('accessLog').doc().set({
    uid: targetUid,
    changedBy: request.auth.uid,
    changedAt: FieldValue.serverTimestamp(),
    field: `permissions.${module}`,
    before: { [module]: loggedPrev },
    after: { [module]: elevatedLevel, elevationId, expiresAtMillis: expiresAt.toMillis() },
    reason: 'Timed elevation granted',
  })

  return { ok: true, elevationId, expiresAtMillis: expiresAt.toMillis() }
})
