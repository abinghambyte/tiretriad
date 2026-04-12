/**
 * Phase 4 People System — shared defaults (see docs/PHASE4-PEOPLE-SYSTEM-HANDOFF.md).
 */
const { HttpsError } = require('firebase-functions/v2/https')
const { FieldValue, Timestamp } = require('firebase-admin/firestore')

const ROLE_DEFAULTS = {
  admin: {
    tires: 'edit',
    orders: 'act',
    people: 'manage',
    crm: 'manage',
    analytics: 'view',
    revenue: 'view',
    wall: 'view',
  },
  supplier: {
    tires: 'view',
    orders: 'view',
    people: 'none',
    crm: 'none',
    analytics: 'none',
    revenue: 'none',
    wall: 'view',
  },
  mechanic: {
    tires: 'none',
    orders: 'act',
    people: 'none',
    crm: 'none',
    analytics: 'none',
    revenue: 'none',
    wall: 'view',
  },
  viewer: {
    tires: 'view',
    orders: 'view',
    people: 'none',
    crm: 'none',
    analytics: 'none',
    revenue: 'none',
    wall: 'view',
  },
}

const CREW_TAGS = {
  admin: 'Overwatch',
  supplier: 'Source',
  mechanic: 'Field',
  dispatch: 'Ground Control',
  sales: 'Scout',
  installer: 'Wrench',
  viewer: 'Spotter',
}

function crewTagFromRole(role) {
  return CREW_TAGS[role] || 'Spotter'
}

function normalizeRole(role) {
  const r = String(role || '').toLowerCase()
  if (ROLE_DEFAULTS[r]) return r
  return 'viewer'
}

function permissionsForRole(role) {
  return { ...ROLE_DEFAULTS[normalizeRole(role)] }
}

/**
 * @param {object} o
 * @param {string} o.uid
 * @param {string} [o.email]
 * @param {string} [o.firstName]
 * @param {string} [o.lastName]
 * @param {string} [o.phone]
 * @param {string} o.role
 * @param {boolean} [o.bootstrapExistingAuth] first-time Auth user already logging in
 */
function buildUserDocument(o) {
  const role = normalizeRole(o.role)
  const perms = permissionsForRole(role)
  const now = FieldValue.serverTimestamp()
  return {
    uid: o.uid,
    firstName: o.firstName || '',
    lastName: o.lastName || '',
    email: o.email || '',
    phone: o.phone || '',
    role,
    crewTag: crewTagFromRole(role),
    permissions: perms,
    inviteToken: o.inviteToken || '',
    inviteStatus: o.inviteStatus || 'active',
    inviteExpiry: o.inviteExpiry || null,
    inviteDelivery: o.inviteDelivery || 'email',
    inviteAccepted: Boolean(o.inviteAccepted),
    accessExpiry: o.accessExpiry != null ? o.accessExpiry : null,
    ghostMode: false,
    loginStreak: 0,
    lastLoginAt: null,
    lastLoginIp: '',
    lastLoginDevice: '',
    lastLoginLocation: '',
    handshakeSeen: Boolean(o.handshakeSeen),
    recentLogins: [],
    createdAt: now,
  }
}

async function countUsers(db) {
  try {
    const agg = await db.collection('users').count().get()
    return agg.data().count
  } catch {
    const snap = await db.collection('users').limit(1).get()
    return snap.empty ? 0 : 1
  }
}

async function assertCanManagePeople(db, callerUid) {
  const snap = await db.collection('users').doc(callerUid).get()
  if (!snap.exists) {
    throw new HttpsError('failed-precondition', 'User profile missing.')
  }
  if (snap.get('permissions.people') !== 'manage') {
    throw new HttpsError('permission-denied', 'People manage access required.')
  }
}

module.exports = {
  ROLE_DEFAULTS,
  crewTagFromRole,
  normalizeRole,
  permissionsForRole,
  buildUserDocument,
  countUsers,
  assertCanManagePeople,
  Timestamp,
  FieldValue,
}
