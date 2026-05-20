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
const { deliverInvite, generateInviteGreetingLine } = require('./inviteFlow')
const { ANTHROPIC_API_KEY, INVITE_DELIVERY_SECRETS } = require('./slackSecrets')
const { auditFromCallable } = require('./adminAuditLog')
const { BRAND } = require('./brand')

/** E.164 — keep in sync with `normalizePhoneToE164` in `src/utils/formatPhone.js`. */
function normalizePhoneToE164(raw) {
  const d = String(raw || '').replace(/\D/g, '')
  if (!d) return ''
  if (d.length === 10) return `+1${d}`
  if (d.length === 11 && d[0] === '1') return `+1${d.slice(1)}`
  if (d.length >= 8 && d.length <= 15) return `+${d}`
  return ''
}

/**
 * Grab the inviter's first name from the callable's auth context so the
 * invite email subject can read "Kyle, Alex set up your Tire Triad
 * access" instead of generic boilerplate. Returns '' if the token has no
 * `name` claim — the email subject then falls back to the generic form.
 */
function inviterFirstNameFrom(request) {
  const raw = String(request?.auth?.token?.name || '').trim()
  if (!raw) return ''
  return raw.split(/\s+/)[0]
}

/**
 * Build the `lastInviteDelivery` payload from a `deliverInvite` result and
 * write it to the user doc. Same shape across create/reissue/resend so the
 * People modal renders consistently. `source` distinguishes which callable
 * wrote the row for downstream debugging. Failures are swallowed — invite
 * delivery already succeeded (or didn't) regardless of whether we can
 * persist the breadcrumb.
 */
async function persistLastInviteDelivery(userRef, { delivery, attemptedFallback, source }) {
  try {
    const payload = {
      attempted: delivery?.attempted || attemptedFallback,
      sent: !!delivery?.sent,
      reason: String(delivery?.reason || ''),
      sentAt: FieldValue.serverTimestamp(),
      source,
    }
    if (delivery?.sinchBatchId) payload.sinchBatchId = delivery.sinchBatchId
    await userRef.update({ lastInviteDelivery: payload })
  } catch (e) {
    console.error(`${source}: persisting lastInviteDelivery failed`, e)
  }
}

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

exports.createPortalUser = onCall({ secrets: [ANTHROPIC_API_KEY, ...INVITE_DELIVERY_SECRETS] }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.')
  }
  const db = admin.firestore()
  await assertCanManagePeople(db, request.auth.uid)

  const data = request.data || {}
  const firstName = String(data.firstName || '').trim()
  const lastName = String(data.lastName || '').trim()
  const email = String(data.email || '').trim().toLowerCase()
  const phone = normalizePhoneToE164(String(data.phone || '').trim())
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

  async function createAuthUser() {
    return admin.auth().createUser({
      email,
      password: tempPassword,
      displayName: `${firstName} ${lastName}`,
      emailVerified: false,
      disabled: true,
    })
  }

  let userRecord
  try {
    userRecord = await createAuthUser()
  } catch (e) {
    const code = e && e.errorInfo && e.errorInfo.code
    if (code !== 'auth/email-already-exists') {
      const msg = e instanceof Error ? e.message : String(e)
      throw new HttpsError('internal', msg)
    }
    // Auth says the email is taken. Three possible states:
    //   1. Genuinely in use by an active user with a Firestore doc -> reject
    //      with a clearer error that names the conflict.
    //   2. Auth user exists but has NO Firestore users/{uid} doc (zombie left
    //      over from a partially-failed create, or legacy data) -> safe to
    //      delete the Auth account and retry.
    //   3. Firestore doc exists but is soft-archived (archivedAt set) -> the
    //      operator already removed the user from the People table; the email
    //      reservation is residual. Hard-delete the user doc + Auth account
    //      and retry, so re-registration works.
    let conflictUser
    try {
      conflictUser = await admin.auth().getUserByEmail(email)
    } catch {
      // If we can't look up the conflict, surface the original error as-is.
      throw new HttpsError('already-exists', 'That email is already registered.')
    }
    const conflictRef = db.collection('users').doc(conflictUser.uid)
    const conflictSnap = await conflictRef.get()
    const conflictData = conflictSnap.exists ? (conflictSnap.data() || {}) : null
    const conflictArchived = !!(conflictData && conflictData.archivedAt)

    if (!conflictSnap.exists || conflictArchived) {
      // Self-heal: drop the residual Auth account (and the archived Firestore
      // doc + its inviteTokens, if present) so the email can be reused.
      try {
        if (conflictSnap.exists) {
          const tokensSnap = await db
            .collection('inviteTokens')
            .where('uid', '==', conflictUser.uid)
            .get()
          const cleanupBatch = db.batch()
          tokensSnap.docs.forEach((d) => cleanupBatch.delete(d.ref))
          cleanupBatch.delete(conflictRef)
          await cleanupBatch.commit()
        }
        await admin.auth().deleteUser(conflictUser.uid)
      } catch (healErr) {
        const msg = healErr instanceof Error ? healErr.message : String(healErr)
        throw new HttpsError('internal', `Failed to clear residual account: ${msg}`)
      }
      // Retry once; if it still fails, surface the underlying error.
      try {
        userRecord = await createAuthUser()
      } catch (retryErr) {
        const msg = retryErr instanceof Error ? retryErr.message : String(retryErr)
        throw new HttpsError('internal', `Retry after self-heal failed: ${msg}`)
      }
    } else {
      const conflictName = [conflictData.firstName, conflictData.lastName]
        .filter((s) => typeof s === 'string' && s.trim().length > 0)
        .join(' ')
        .trim()
      const detail = conflictName ? ` (currently assigned to ${conflictName})` : ''
      throw new HttpsError(
        'already-exists',
        `That email is already registered${detail}.`,
      )
    }
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

  // Production invite links always use the public site host (Phase 9).
  const inviteUrl = `${BRAND.inviteUrlBase}/${token}`

  // Generate the greeting line first so both SMS and email bodies can include it.
  // Never throws; falls back to a safe default line on failure.
  const greeting = await generateInviteGreetingLine({
    firstName,
    role,
    secretValue: ANTHROPIC_API_KEY.value(),
  })

  let delivery = { attempted: inviteDelivery, sent: false, reason: 'unknown' }
  try {
    const result = await deliverInvite({
      firstName,
      email,
      phone,
      inviteUrl,
      deliveryMethod: inviteDelivery,
      greeting,
      inviterFirstName: inviterFirstNameFrom(request),
      inviteExpiryMillis: inviteExpiry.toMillis(),
    })
    delivery = { attempted: inviteDelivery, ...result }
  } catch (e) {
    console.error('createPortalUser: deliverInvite', e)
    delivery = { attempted: inviteDelivery, sent: false, reason: 'provider-error' }
  }

  await persistLastInviteDelivery(userRef, {
    delivery,
    attemptedFallback: inviteDelivery,
    source: 'create',
  })

  await auditFromCallable(db, request, {
    action: 'user.invite.create',
    targetId: uid,
    payload: {
      email,
      firstName,
      lastName,
      role,
      inviteDelivery,
      deliverySent: !!delivery?.sent,
      deliveryReason: String(delivery?.reason || ''),
    },
  })

  return {
    ok: true,
    uid,
    token,
    inviteUrl,
    delivery,
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
  // Channel swap on an existing invite. The admin picks Email / SMS /
  // NFC when creating the user, but corporate email gateways or carrier
  // black holes mean the chosen channel sometimes doesn't reach the
  // recipient. Allowing the recorded channel to change here means the
  // next Resend goes through the new channel without having to delete
  // and recreate the user (which would burn the existing token + audit
  // trail).
  if (['sms', 'nfc', 'email'].includes(data.inviteDelivery)) {
    patch.inviteDelivery = data.inviteDelivery
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

  // Profile-detail edits (name / phone always allowed; email change only
  // while the invite has not been accepted, since redirecting an
  // accepted user's email here would stomp their auth identity).
  if (typeof data.firstName === 'string' && data.firstName.trim()) {
    patch.firstName = data.firstName.trim()
  }
  if (typeof data.lastName === 'string' && data.lastName.trim()) {
    patch.lastName = data.lastName.trim()
  }
  if (typeof data.phone === 'string') {
    const p = normalizePhoneToE164(data.phone)
    // Allow clearing the phone (empty string in, empty out) or setting
    // a new valid E.164 value; reject anything else with a clear
    // message so the operator knows the format failed.
    if (data.phone.trim() === '') {
      patch.phone = ''
    } else if (p) {
      patch.phone = p
    } else {
      throw new HttpsError('invalid-argument', 'Phone could not be parsed as a US number.')
    }
  }

  // Email change: capture the desired new value but apply it via the
  // Auth admin SDK below so the Auth record stays in sync with
  // Firestore. Reject the change if the user has already accepted.
  let emailChange = null
  if (typeof data.email === 'string') {
    const newEmail = data.email.trim().toLowerCase()
    const oldEmail = String(before.email || '').trim().toLowerCase()
    if (newEmail && newEmail !== oldEmail) {
      if (before.inviteAccepted) {
        throw new HttpsError(
          'failed-precondition',
          'Cannot change email after registration. Ask the user to update it from their profile, or delete and re-invite.',
        )
      }
      emailChange = { from: oldEmail, to: newEmail }
      patch.email = newEmail
    }
  }

  if (Object.keys(patch).length === 0) {
    throw new HttpsError('invalid-argument', 'Nothing to update.')
  }

  // Sync the Auth record before the Firestore write so we don't end up
  // with a Firestore doc pointing at an email that Auth rejected. The
  // Auth SDK throws on collisions (auth/email-already-exists) and bad
  // formats; surface those with the same code so the UI can show a
  // useful toast instead of a generic internal error.
  if (emailChange) {
    try {
      await admin.auth().updateUser(targetUid, { email: emailChange.to })
    } catch (e) {
      const code = e && e.errorInfo && e.errorInfo.code
      if (code === 'auth/email-already-exists') {
        throw new HttpsError('already-exists', 'That email is already registered to another user.')
      }
      if (code === 'auth/invalid-email') {
        throw new HttpsError('invalid-argument', 'That email address is not valid.')
      }
      const msg = e instanceof Error ? e.message : String(e)
      throw new HttpsError('internal', `Auth email update failed: ${msg}`)
    }
  }
  if ((patch.firstName || patch.lastName) && (before.firstName || before.lastName)) {
    // Keep the Auth displayName in sync with whatever we just stored
    // so signed-in admins see the new name in audit logs / token
    // claims. Best-effort: a failure here shouldn't block the
    // Firestore update.
    const nextFirst = patch.firstName ?? before.firstName ?? ''
    const nextLast = patch.lastName ?? before.lastName ?? ''
    admin
      .auth()
      .updateUser(targetUid, { displayName: `${nextFirst} ${nextLast}`.trim() })
      .catch((e) => console.warn('updatePortalUser: Auth displayName sync failed', e))
  }

  patch.updatedAt = FieldValue.serverTimestamp()

  await ref.update(patch)

  await auditFromCallable(db, request, {
    action: 'user.update',
    targetId: targetUid,
    payload: {
      before: { permissions: before.permissions, role: before.role },
      after: patch,
      reason: String(data.reason || ''),
    },
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

  await auditFromCallable(db, request, {
    action: 'user.elevation.grant',
    targetId: targetUid,
    payload: {
      module,
      before: loggedPrev,
      after: elevatedLevel,
      elevationId,
      expiresAtMillis: expiresAt.toMillis(),
    },
  })

  return { ok: true, elevationId, expiresAtMillis: expiresAt.toMillis() }
})

/**
 * Revoke the active invite for a user.
 * Marks every active inviteTokens doc for that uid as 'revoked',
 * then clears inviteToken + sets inviteStatus = 'expired' on the user doc.
 */
exports.revokeInvite = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.')
  }
  const db = admin.firestore()
  await assertCanManagePeople(db, request.auth.uid)

  const targetUid = String(request.data?.targetUid || '').trim()
  if (!targetUid) {
    throw new HttpsError('invalid-argument', 'targetUid is required.')
  }

  const userRef = db.collection('users').doc(targetUid)
  const userSnap = await userRef.get()
  if (!userSnap.exists) {
    throw new HttpsError('not-found', 'User not found.')
  }

  // Mark all active invite tokens for this uid as revoked
  const tokensSnap = await db
    .collection('inviteTokens')
    .where('uid', '==', targetUid)
    .where('status', '==', 'active')
    .get()

  const batch = db.batch()
  tokensSnap.docs.forEach((doc) => {
    batch.update(doc.ref, { status: 'revoked', revokedAt: FieldValue.serverTimestamp() })
  })

  batch.update(userRef, {
    inviteToken: '',
    inviteStatus: 'expired',
    updatedAt: FieldValue.serverTimestamp(),
  })

  await batch.commit()

  await auditFromCallable(db, request, {
    action: 'user.invite.revoke',
    targetId: targetUid,
    payload: {
      before: { inviteStatus: userSnap.data()?.inviteStatus },
      after: { inviteStatus: 'expired', tokensRevoked: tokensSnap.size },
      reason: 'Invite manually revoked',
    },
  })

  return { ok: true, tokensRevoked: tokensSnap.size }
})

/**
 * Issue a new invite token for an existing (pre-registration) user.
 * Revokes any prior active token, generates a fresh one, and delivers it.
 */
exports.reissueInvite = onCall({ secrets: [ANTHROPIC_API_KEY, ...INVITE_DELIVERY_SECRETS] }, async (request) => {
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

  const inviteDelivery = ['sms', 'nfc', 'email'].includes(data.inviteDelivery)
    ? data.inviteDelivery
    : 'email'

  const userRef = db.collection('users').doc(targetUid)
  const userSnap = await userRef.get()
  if (!userSnap.exists) {
    throw new HttpsError('not-found', 'User not found.')
  }
  const user = userSnap.data()
  if (user.inviteAccepted) {
    throw new HttpsError('failed-precondition', 'User has already completed registration.')
  }

  // Revoke existing active tokens
  const oldTokensSnap = await db
    .collection('inviteTokens')
    .where('uid', '==', targetUid)
    .where('status', '==', 'active')
    .get()

  const token = crypto.randomBytes(24).toString('hex')
  const inviteExpiry = Timestamp.fromMillis(Date.now() + 48 * 3600000)
  const inviteUrl = `${BRAND.inviteUrlBase}/${token}`

  const batch = db.batch()

  // Revoke old tokens
  oldTokensSnap.docs.forEach((doc) => {
    batch.update(doc.ref, { status: 'revoked', revokedAt: FieldValue.serverTimestamp() })
  })

  // Write new token
  const invRef = db.collection('inviteTokens').doc(token)
  batch.set(invRef, {
    token,
    uid: targetUid,
    status: 'active',
    expiry: inviteExpiry,
    createdAt: FieldValue.serverTimestamp(),
    usedAt: null,
    deliveryMethod: inviteDelivery,
  })

  // Update user doc
  batch.update(userRef, {
    inviteToken: token,
    inviteStatus: 'active',
    inviteExpiry,
    inviteDelivery,
    updatedAt: FieldValue.serverTimestamp(),
  })

  await batch.commit()

  // Generate greeting before delivery (best-effort — fallback line on failure).
  const greeting = await generateInviteGreetingLine({
    firstName: user.firstName || '',
    role: user.role,
    secretValue: ANTHROPIC_API_KEY.value(),
  })

  // Deliver (best-effort — don't fail the whole request if email/SMS is down).
  let delivery = { attempted: inviteDelivery, sent: false, reason: 'unknown' }
  try {
    const result = await deliverInvite({
      firstName: user.firstName || '',
      email: user.email || '',
      phone: user.phone || '',
      inviteUrl,
      deliveryMethod: inviteDelivery,
      greeting,
      inviterFirstName: inviterFirstNameFrom(request),
      inviteExpiryMillis: inviteExpiry.toMillis(),
    })
    delivery = { attempted: inviteDelivery, ...result }
  } catch (e) {
    console.error('reissueInvite: deliverInvite failed', e)
    delivery = { attempted: inviteDelivery, sent: false, reason: 'provider-error' }
  }

  // Persist last-delivery state on the user doc so the UI can show whether
  // the email actually went out without depending on the audit log.
  await persistLastInviteDelivery(userRef, {
    delivery,
    attemptedFallback: inviteDelivery,
    source: 'reissue',
  })

  await auditFromCallable(db, request, {
    action: 'user.invite.reissue',
    targetId: targetUid,
    payload: {
      inviteDelivery,
      tokensRevoked: oldTokensSnap.size,
      deliverySent: !!delivery?.sent,
      deliveryReason: String(delivery?.reason || ''),
    },
  })

  return { ok: true, token, inviteUrl, delivery }
})

/**
 * Re-send the invite email/SMS for the user's existing active token. Does NOT
 * rotate the token (so any QR codes / NFC cards / shared links still work).
 * Useful when the original delivery failed (Resend API misconfigured, network
 * blip, recipient never got the email) and the operator wants to retry without
 * destroying the existing link.
 */
exports.resendInviteDelivery = onCall(
  { secrets: [ANTHROPIC_API_KEY, ...INVITE_DELIVERY_SECRETS] },
  async (request) => {
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

    const userRef = db.collection('users').doc(targetUid)
    const userSnap = await userRef.get()
    if (!userSnap.exists) {
      throw new HttpsError('not-found', 'User not found.')
    }
    const user = userSnap.data() || {}
    if (user.inviteAccepted) {
      throw new HttpsError('failed-precondition', 'User has already completed registration.')
    }

    // Find the user's active invite token. Prefer the one referenced on the
    // user doc; fall back to a query if the user doc reference drifted.
    let tokenStr = String(user.inviteToken || '').trim()
    if (tokenStr) {
      const tokenSnap = await db.collection('inviteTokens').doc(tokenStr).get()
      if (!tokenSnap.exists || tokenSnap.get('status') !== 'active') {
        tokenStr = ''
      }
    }
    if (!tokenStr) {
      const fallback = await db
        .collection('inviteTokens')
        .where('uid', '==', targetUid)
        .where('status', '==', 'active')
        .limit(1)
        .get()
      if (fallback.empty) {
        throw new HttpsError('failed-precondition', 'No active invite to resend; use New invite to issue a fresh link.')
      }
      tokenStr = fallback.docs[0].id
    }
    const inviteUrl = `${BRAND.inviteUrlBase}/${tokenStr}`

    // Pull expiry off the active token doc so the email can render a
    // concrete "expires in 47 hours" line. Falls back to the user doc's
    // own copy, then to the +48h default if both are missing.
    let inviteExpiryMillis = null
    try {
      const tokenSnap = await db.collection('inviteTokens').doc(tokenStr).get()
      const expiry = tokenSnap.exists ? tokenSnap.get('expiry') : null
      if (expiry && typeof expiry.toMillis === 'function') {
        inviteExpiryMillis = expiry.toMillis()
      } else if (user.inviteExpiry && typeof user.inviteExpiry.toMillis === 'function') {
        inviteExpiryMillis = user.inviteExpiry.toMillis()
      }
    } catch {
      // Best-effort; the email will fall back to the generic expiry copy.
    }

    const inviteDelivery = ['sms', 'nfc', 'email'].includes(data.inviteDelivery)
      ? data.inviteDelivery
      : (user.inviteDelivery || 'email')

    const greeting = await generateInviteGreetingLine({
      firstName: user.firstName || '',
      role: user.role,
      secretValue: ANTHROPIC_API_KEY.value(),
    })

    let delivery = { attempted: inviteDelivery, sent: false, reason: 'unknown' }
    try {
      const result = await deliverInvite({
        firstName: user.firstName || '',
        email: user.email || '',
        phone: user.phone || '',
        inviteUrl,
        deliveryMethod: inviteDelivery,
        greeting,
        inviterFirstName: inviterFirstNameFrom(request),
        inviteExpiryMillis,
      })
      delivery = { attempted: inviteDelivery, ...result }
    } catch (e) {
      console.error('resendInviteDelivery: deliverInvite failed', e)
      delivery = { attempted: inviteDelivery, sent: false, reason: 'provider-error' }
    }

    await persistLastInviteDelivery(userRef, {
      delivery,
      attemptedFallback: inviteDelivery,
      source: 'resend',
    })

    await auditFromCallable(db, request, {
      action: 'user.invite.resend',
      targetId: targetUid,
      payload: {
        inviteDelivery,
        deliverySent: !!delivery?.sent,
        deliveryReason: String(delivery?.reason || ''),
      },
    })

    return { ok: true, inviteUrl, delivery }
  },
)

/**
 * Permanently delete a portal user.
 * Removes the Firebase Auth account, all inviteTokens docs, and the user Firestore doc.
 * Admins cannot delete themselves.
 */
exports.deletePortalUser = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.')
  }
  const db = admin.firestore()
  await assertCanManagePeople(db, request.auth.uid)

  const targetUid = String(request.data?.targetUid || '').trim()
  if (!targetUid) {
    throw new HttpsError('invalid-argument', 'targetUid is required.')
  }
  if (targetUid === request.auth.uid) {
    throw new HttpsError('failed-precondition', 'You cannot delete your own account.')
  }

  const userRef = db.collection('users').doc(targetUid)
  const userSnap = await userRef.get()
  if (!userSnap.exists) {
    throw new HttpsError('not-found', 'User not found.')
  }

  const userData = userSnap.data() || {}

  // Delete all inviteTokens for this user
  const tokensSnap = await db
    .collection('inviteTokens')
    .where('uid', '==', targetUid)
    .get()

  const batch = db.batch()
  tokensSnap.docs.forEach((doc) => batch.delete(doc.ref))
  batch.delete(userRef)
  await batch.commit()

  // Delete Firebase Auth account (best-effort — don't fail if already deleted)
  try {
    await admin.auth().deleteUser(targetUid)
  } catch (e) {
    if (e?.errorInfo?.code !== 'auth/user-not-found') {
      console.error('deletePortalUser: auth.deleteUser failed', e)
    }
  }

  await auditFromCallable(db, request, {
    action: 'user.delete',
    targetId: targetUid,
    payload: {
      before: {
        email: userData.email,
        firstName: userData.firstName,
        lastName: userData.lastName,
        role: userData.role,
      },
      reason: 'User permanently deleted',
    },
  })

  return { ok: true }
})
