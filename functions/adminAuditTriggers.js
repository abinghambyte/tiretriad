/**
 * Firestore triggers that append audit entries for admin-sensitive
 * collections where the write comes from the client (not a callable).
 * `expenses` and `meta/reorderQueue` are both admin-only per
 * `firestore.rules`, so these triggers give us forensics without forcing
 * the client writes through a callable.
 *
 * The identity of the writer is not directly available in Firestore
 * triggers (only the before/after document state), so the payload captures
 * what changed rather than who. For richer forensics, refactor those
 * client writes into callables and use `auditFromCallable` instead.
 */

'use strict'

const { onDocumentWritten } = require('firebase-functions/v2/firestore')
const admin = require('firebase-admin')
const { writeAuditEntry } = require('./adminAuditLog')

function diffKeys(before, after) {
  const out = new Set()
  for (const k of Object.keys(before || {})) out.add(k)
  for (const k of Object.keys(after || {})) out.add(k)
  return [...out].slice(0, 15)
}

exports.expenseAuditTrigger = onDocumentWritten(
  { document: 'expenses/{expenseId}', region: 'us-central1' },
  async (event) => {
    try {
      const db = admin.firestore()
      const before = event.data?.before?.data() || null
      const after = event.data?.after?.data() || null
      const action = !before ? 'expense.create' : !after ? 'expense.delete' : 'expense.update'
      await writeAuditEntry(db, {
        action,
        uid: String(after?.loggedBy || before?.loggedBy || 'unknown'),
        targetId: event.params?.expenseId || '',
        payload: {
          amount: after?.amount ?? before?.amount ?? null,
          category: after?.category ?? before?.category ?? null,
          date: after?.date ?? before?.date ?? null,
          note: String(after?.note ?? before?.note ?? '').slice(0, 200),
          changedFields: diffKeys(before, after),
        },
      })
    } catch (err) {
      console.error('[expenseAuditTrigger] failed', err instanceof Error ? err.message : err)
    }
  },
)

exports.reorderQueueAuditTrigger = onDocumentWritten(
  { document: 'meta/reorderQueue', region: 'us-central1' },
  async (event) => {
    try {
      const db = admin.firestore()
      const before = event.data?.before?.data() || null
      const after = event.data?.after?.data() || null
      const beforeLen = Array.isArray(before?.entries) ? before.entries.length : 0
      const afterLen = Array.isArray(after?.entries) ? after.entries.length : 0
      await writeAuditEntry(db, {
        action: 'reorder_queue.update',
        uid: 'unknown', // client writes do not carry uid through the trigger
        targetId: 'reorderQueue',
        payload: { beforeLen, afterLen, delta: afterLen - beforeLen },
      })
    } catch (err) {
      console.error('[reorderQueueAuditTrigger] failed', err instanceof Error ? err.message : err)
    }
  },
)
