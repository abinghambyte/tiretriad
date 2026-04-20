/**
 * Firestore-backed payout split + buy-side tax rates (`meta/payoutConfig`).
 */
const admin = require('firebase-admin')
const { FieldValue } = require('firebase-admin/firestore')
const { onCall, HttpsError } = require('firebase-functions/v2/https')

const PAYOUT_CONFIG_REF = (db) => db.collection('meta').doc('payoutConfig')

const DEFAULT_CONFIG = Object.freeze({
  splits: Object.freeze({ alex: 0.35, dj: 0.35, kyle: 0.3 }),
  taxes: Object.freeze({
    countyTaxPct: 0.0109,
    localTaxPct: 0.0312,
    stateTaxPct: 0.0302,
    tireFeePerTire: 2.0,
  }),
})

const SPLIT_KEYS = ['alex', 'dj', 'kyle']

function round2(n) {
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100) / 100
}

function computeOrderTaxes(buyPerTire, qty, taxes) {
  const t = taxes || DEFAULT_CONFIG.taxes
  const q = Number(qty) || 0
  const buy = Number(buyPerTire) || 0
  const rate =
    (Number(t.countyTaxPct) || 0) + (Number(t.localTaxPct) || 0) + (Number(t.stateTaxPct) || 0)
  const base = round2(buy * q)
  const salesTax = round2(base * rate)
  const tireFee = round2((Number(t.tireFeePerTire) || 0) * q)
  const total = round2(salesTax + tireFee)
  return { salesTax, tireFee, total }
}

function splitPool(pool, splits) {
  const p = Number(pool) || 0
  const s = splits && typeof splits === 'object' ? splits : DEFAULT_CONFIG.splits
  const keys = Object.keys(s).sort()
  const out = {}
  let sum = 0
  for (let i = 0; i < keys.length; i += 1) {
    const k = keys[i]
    if (i === keys.length - 1) {
      out[k] = round2(p - sum)
    } else {
      const cents = round2(p * (Number(s[k]) || 0))
      out[k] = cents
      sum = round2(sum + cents)
    }
  }
  return out
}

function validatePayoutConfig(input) {
  const errors = []
  const src = input && typeof input === 'object' ? input : {}
  const splitsIn = src.splits && typeof src.splits === 'object' ? src.splits : {}
  const taxesIn = src.taxes && typeof src.taxes === 'object' ? src.taxes : {}

  for (const k of SPLIT_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(splitsIn, k)) {
      errors.push(`splits.${k} is required`)
    }
  }
  for (const k of Object.keys(splitsIn)) {
    if (!SPLIT_KEYS.includes(k)) errors.push(`unknown split key: ${k}`)
  }

  let splitSum = 0
  for (const k of SPLIT_KEYS) {
    const v = Number(splitsIn[k])
    if (!Number.isFinite(v)) {
      errors.push(`splits.${k} must be a finite number`)
      continue
    }
    if (v < 0 || v > 1) errors.push(`splits.${k} must be in [0, 1]`)
    splitSum += v
  }
  if (!errors.some((e) => e.startsWith('splits.'))) {
    if (Math.abs(splitSum - 1) > 1e-6) errors.push('splits must sum to 1')
  }

  const taxFields = ['countyTaxPct', 'localTaxPct', 'stateTaxPct']
  for (const f of taxFields) {
    const v = Number(taxesIn[f])
    if (!Number.isFinite(v)) {
      errors.push(`taxes.${f} must be a finite number`)
      continue
    }
    if (v < 0 || v > 0.25) errors.push(`taxes.${f} must be in [0, 0.25]`)
  }
  const tireFee = Number(taxesIn.tireFeePerTire)
  if (!Number.isFinite(tireFee)) errors.push('taxes.tireFeePerTire must be a finite number')
  else if (tireFee < 0 || tireFee > 25) errors.push('taxes.tireFeePerTire must be in [0, 25]')

  if (errors.length) return { ok: false, errors, normalized: null }

  const normalized = {
    splits: {
      alex: Number(splitsIn.alex),
      dj: Number(splitsIn.dj),
      kyle: Number(splitsIn.kyle),
    },
    taxes: {
      countyTaxPct: Number(taxesIn.countyTaxPct),
      localTaxPct: Number(taxesIn.localTaxPct),
      stateTaxPct: Number(taxesIn.stateTaxPct),
      tireFeePerTire: Number(taxesIn.tireFeePerTire),
    },
  }
  return { ok: true, errors: [], normalized }
}

async function loadPayoutConfig(db) {
  const snap = await PAYOUT_CONFIG_REF(db).get()
  if (!snap.exists) {
    return {
      splits: { ...DEFAULT_CONFIG.splits },
      taxes: { ...DEFAULT_CONFIG.taxes },
    }
  }
  const d = snap.data() || {}
  return {
    splits: { ...DEFAULT_CONFIG.splits, ...(d.splits && typeof d.splits === 'object' ? d.splits : {}) },
    taxes: { ...DEFAULT_CONFIG.taxes, ...(d.taxes && typeof d.taxes === 'object' ? d.taxes : {}) },
  }
}

async function requireAdmin(request) {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Sign in required.')
  }
  const db = admin.firestore()
  const u = await db.collection('users').doc(request.auth.uid).get()
  if (!u.exists || String(u.get('role') || '') !== 'admin') {
    throw new HttpsError('permission-denied', 'Admin only.')
  }
  return db
}

const getPayoutConfig = onCall(async (request) => {
  const db = await requireAdmin(request)
  const config = await loadPayoutConfig(db)
  return { config }
})

const updatePayoutConfig = onCall(async (request) => {
  const db = await requireAdmin(request)
  const v = validatePayoutConfig(request.data || {})
  if (!v.ok) {
    throw new HttpsError('invalid-argument', v.errors.join('; '))
  }
  const ref = PAYOUT_CONFIG_REF(db)
  await ref.set(
    {
      ...v.normalized,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: request.auth.uid,
    },
    { merge: true },
  )
  const snap = await ref.get()
  const saved = snap.exists ? snap.data() || {} : v.normalized
  return { ok: true, config: { splits: saved.splits, taxes: saved.taxes } }
})

module.exports = {
  DEFAULT_CONFIG,
  PAYOUT_CONFIG_REF,
  loadPayoutConfig,
  validatePayoutConfig,
  computeOrderTaxes,
  splitPool,
  round2,
  getPayoutConfig,
  updatePayoutConfig,
}
