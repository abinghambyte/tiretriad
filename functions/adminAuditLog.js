/**
 * Append-only audit trail for sensitive admin actions. Written exclusively
 * by Cloud Functions via the Admin SDK; Firestore rules deny all client
 * writes and gate reads to `userRole() == 'admin'` so non-admins can't see
 * or tamper with the record.
 *
 * Each entry captures who, when, what, and a trimmed payload. We never log
 * secret material (API keys, tokens, passwords); callers should pass only
 * identifying metadata in `payload`.
 *
 * Schema:
 *   at          Timestamp    when the server wrote it (serverTimestamp)
 *   uid         string       caller's Firebase Auth uid, or 'system' for crons
 *   email       string       caller's email at time of action (best-effort)
 *   action      string       short action key, e.g. 'expense.create'
 *   targetId    string       primary entity the action touched (docId / mspn)
 *   payload     map          small structured payload (trimmed to 20 keys)
 *   ip          string       remote IP from request context, if available
 *   ua          string       user agent, if available
 */

'use strict'

const { FieldValue } = require('firebase-admin/firestore')

const COLLECTION = 'adminAuditLog'
const MAX_PAYLOAD_KEYS = 20
const MAX_STRING_VALUE = 400

function sanitizeValue(v, depth = 0) {
  if (v == null) return null
  if (typeof v === 'string') return v.slice(0, MAX_STRING_VALUE)
  if (typeof v === 'number' || typeof v === 'boolean') return v
  if (Array.isArray(v)) return depth >= 2 ? '[array]' : v.slice(0, 20).map((x) => sanitizeValue(x, depth + 1))
  if (typeof v === 'object') {
    if (depth >= 2) return '[object]'
    const out = {}
    for (const [k, val] of Object.entries(v).slice(0, MAX_PAYLOAD_KEYS)) {
      out[k] = sanitizeValue(val, depth + 1)
    }
    return out
  }
  return null
}

function trimPayload(payload) {
  if (!payload || typeof payload !== 'object') return {}
  return sanitizeValue(payload, 0) || {}
}

/**
 * Write an audit entry. Best-effort: never throws, never blocks the caller.
 * @param {import('firebase-admin/firestore').Firestore} db
 * @param {object} input
 * @param {string} input.action — short action key, e.g. 'expense.create'
 * @param {string} [input.uid] — Firebase Auth uid of the caller, or 'system'
 * @param {string} [input.email] — caller email at action time
 * @param {string} [input.targetId] — primary entity id the action touched
 * @param {object} [input.payload] — structured metadata (never secrets)
 * @param {string} [input.ip]
 * @param {string} [input.ua]
 */
async function writeAuditEntry(db, input) {
  try {
    const entry = {
      at: FieldValue.serverTimestamp(),
      action: String(input?.action || 'unknown.action').slice(0, 80),
      uid: String(input?.uid || 'system').slice(0, 128),
      email: String(input?.email || '').slice(0, 320),
      targetId: String(input?.targetId || '').slice(0, 200),
      payload: trimPayload(input?.payload),
      ip: String(input?.ip || '').slice(0, 64),
      ua: String(input?.ua || '').slice(0, 300),
    }
    await db.collection(COLLECTION).add(entry)
  } catch (err) {
    // Logging is best-effort; a write failure on the audit trail must never
    // block the underlying action. Surface it in Cloud Logging for review.
    console.error('[adminAuditLog] write_failed', {
      action: input?.action,
      uid: input?.uid,
      err: err instanceof Error ? err.message : String(err),
    })
  }
}

/**
 * Convenience shortcut for v2 callable handlers. Pulls uid/email/ip/ua from
 * the `CallableRequest` and merges with the supplied action + payload.
 * @param {import('firebase-admin/firestore').Firestore} db
 * @param {import('firebase-functions/v2/https').CallableRequest<any>} request
 * @param {{ action: string, targetId?: string, payload?: object }} meta
 */
async function auditFromCallable(db, request, meta) {
  const uid = request?.auth?.uid || 'anon'
  const email = request?.auth?.token?.email || ''
  const ip = request?.rawRequest?.ip || request?.rawRequest?.headers?.['x-forwarded-for'] || ''
  const ua = request?.rawRequest?.headers?.['user-agent'] || ''
  await writeAuditEntry(db, {
    action: meta.action,
    uid,
    email,
    targetId: meta.targetId,
    payload: meta.payload,
    ip: String(ip).split(',')[0].trim().slice(0, 64),
    ua,
  })
}

module.exports = {
  COLLECTION,
  writeAuditEntry,
  auditFromCallable,
  trimPayload,
  sanitizeValue,
}
