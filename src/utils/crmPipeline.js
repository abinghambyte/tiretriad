/**
 * Rubber CRM pipeline — numeric stages in Firestore with legacy 1–6 mapping on read.
 * Active funnel: 1–5. Lost: 7. (Legacy 6 "Active client" maps to Closed 5.)
 */

export const CRM_LOST_STAGE = 7

export const CRM_PIPELINE_STAGES = [1, 2, 3, 4, 5]

/** Display labels for normalized stages 1–5 */
export const CRM_STAGE_LABELS = {
  1: 'Spotted',
  2: 'Contacted',
  3: 'Qualified',
  4: 'Quoted',
  5: 'Closed',
  7: 'Lost',
}

/** Legacy UI / docs titles → same numbers were used with different names */
const LEGACY_STAGE_TITLES = {
  1: 'Identified Fleet',
  2: 'Contact Made',
  3: 'Pain Confirmed',
  4: 'Pilot Offered',
  5: 'Trial Scheduled',
  6: 'Active Fleet Client',
}

/** New accounts use v2: raw 1–5 and 7 map directly. v1 (default) remaps old 5→4, 6→5. */
export const CRM_PIPELINE_SCHEMA_VERSION = 2

/**
 * Normalize stored pipelineStage for UI columns and logic.
 * @param {unknown} raw
 * @param {{ pipelineSchemaVersion?: unknown } | null} [account]
 * @returns {number} 1–5 active, 7 lost
 */
export function normalizePipelineStage(raw, account = null) {
  const n = Number(raw)
  if (!Number.isFinite(n)) return 1
  if (n === CRM_LOST_STAGE) return CRM_LOST_STAGE
  const ver = Number(account?.pipelineSchemaVersion) || 1
  if (ver >= CRM_PIPELINE_SCHEMA_VERSION) {
    if (n >= 1 && n <= 5) return n
    return 1
  }
  if (n === 6) return 5
  if (n === 5) return 4
  if (n >= 1 && n <= 4) return n
  if (n > 5 && n < 7) return 5
  return 1
}

/**
 * Raw stage as stored (for writes). When user picks "Closed" we store 5; "Lost" stores 7.
 * @param {unknown} normalized
 */
export function denormalizePipelineStageForWrite(normalized) {
  const n = Number(normalized)
  if (n === CRM_LOST_STAGE) return CRM_LOST_STAGE
  if (n >= 1 && n <= 5) return n
  return 1
}

export function crmStageLabel(rawStage, account = null) {
  const n = normalizePipelineStage(rawStage, account)
  return CRM_STAGE_LABELS[n] || `Stage ${rawStage}`
}

export function wasLegacyStage(rawStage, account = null) {
  const ver = Number(account?.pipelineSchemaVersion) || 1
  if (ver >= CRM_PIPELINE_SCHEMA_VERSION) return false
  const n = Number(rawStage)
  return n === 5 || n === 6
}

export function legacyStageHint(rawStage, account = null) {
  if (!wasLegacyStage(rawStage, account)) return null
  const n = Number(rawStage)
  if (n >= 1 && n <= 6 && LEGACY_STAGE_TITLES[n]) {
    return `Legacy: ${LEGACY_STAGE_TITLES[n]}`
  }
  return null
}

// Tanner is a silent partner — no portal access, never a CRM owner going forward.
// Legacy records may still have owner='tanner'; label fallback keeps them readable
// (with a flag) until they're manually reassigned.
const OWNER_OPTIONS = ['alex', 'dj', 'kyle']

export function isValidCrmOwner(v) {
  return OWNER_OPTIONS.includes(String(v || '').toLowerCase())
}

export function crmOwnerLabel(v) {
  const k = String(v || '').toLowerCase()
  if (k === 'alex') return 'Alex'
  if (k === 'dj') return 'DJ'
  if (k === 'tanner') return 'Tanner (reassign — silent partner)'
  if (k === 'kyle') return 'Kyle'
  return v || '—'
}

/**
 * Estimated annual deal value (not stored): vehicles × 4 tires × avg buy × 2 rotations/yr
 * @param {{ vehicleCount?: unknown }} vehicleProfile
 * @param {number} avgBuyPerTire Kyle catalog average buy price
 */
export function estimatedDealValue(vehicleProfile, avgBuyPerTire) {
  const vc = Math.max(0, Number(vehicleProfile?.vehicleCount) || 0)
  const buy = Number(avgBuyPerTire) || 0
  if (vc <= 0 || buy <= 0) return null
  return vc * 4 * buy * 2
}

/**
 * @param {unknown} ts Firestore Timestamp-like
 */
export function activityLogEntries(account) {
  const log = Array.isArray(account?.activityLog) ? account.activityLog : []
  const mapped = log.map((e, i) => ({
    kind: 'log',
    i,
    note: String(e?.note || ''),
    by: String(e?.addedBy || '—'),
    at: e?.addedAt,
  }))
  const legacyNotes = Array.isArray(account?.notes) ? account.notes : []
  const legacy = legacyNotes.map((n, i) => ({
    kind: 'legacy',
    i,
    note: String(n?.text || ''),
    by: String(n?.by || '—'),
    at: n?.at,
  }))
  return [...mapped, ...legacy]
}

/** Newest first */
export function sortActivityDescending(entries) {
  return [...entries].sort((a, b) => {
    const ma = a.at?.toMillis?.() ?? 0
    const mb = b.at?.toMillis?.() ?? 0
    return mb - ma
  })
}

export function lastActivityEntry(account) {
  const sorted = sortActivityDescending(activityLogEntries(account))
  return sorted[0] || null
}

export function lastActivityAt(account) {
  const last = lastActivityEntry(account)
  return last?.at || account?.lastContactedAt || null
}
