// CRUD helpers for the listing coach style guide stored at
// `meta/listingCoachStyleGuide`. The doc shape is:
//   { rules: [{ id, rule, audience, addedBy, addedAt, reason, enabled }],
//     updatedAt }
// Audience must be one of 'consumer' | 'commercial' | 'all'. Exact-text
// duplicates with the same audience short-circuit and return the existing
// id without writing. listStyleRules filters by `enabled` and matches
// either `all` or the requested audience.
const { randomUUID } = require('node:crypto')
const { FieldValue } = require('firebase-admin/firestore')

const STYLE_GUIDE_REF = (firestore) => firestore.collection('meta').doc('listingCoachStyleGuide')
const VALID_AUDIENCE = ['consumer', 'commercial', 'all']

async function loadDoc(firestore) {
  const snap = await STYLE_GUIDE_REF(firestore).get()
  if (!snap.exists) return { rules: [] }
  return snap.data() || { rules: [] }
}

async function saveDoc(firestore, doc) {
  await STYLE_GUIDE_REF(firestore).set(
    { ...doc, updatedAt: FieldValue.serverTimestamp() },
    { merge: false },
  )
}

async function addStyleRule({ firestore, rule, audience, addedBy, reason }) {
  const trimmed = String(rule || '').trim()
  if (!trimmed) throw new Error('rule must be non-empty')
  if (!VALID_AUDIENCE.includes(audience)) {
    throw new Error(`audience must be one of ${VALID_AUDIENCE.join(', ')}`)
  }
  const doc = await loadDoc(firestore)
  const rules = Array.isArray(doc.rules) ? doc.rules : []
  const existing = rules.find((r) => String(r.rule).trim() === trimmed && r.audience === audience)
  if (existing) return { ok: true, id: existing.id, duplicate: true }
  const id = `rule_${randomUUID().slice(0, 12)}`
  const next = [...rules, {
    id,
    rule: trimmed,
    audience,
    addedBy: String(addedBy || ''),
    addedAt: FieldValue.serverTimestamp(),
    reason: reason ? String(reason).slice(0, 500) : null,
    enabled: true,
  }]
  await saveDoc(firestore, { rules: next })
  return { ok: true, id, duplicate: false }
}

async function listStyleRules({ firestore, audience, includeDisabled = false } = {}) {
  const doc = await loadDoc(firestore)
  const rules = Array.isArray(doc.rules) ? doc.rules : []
  return rules.filter((r) => {
    if (!includeDisabled && r.enabled === false) return false
    if (!audience) return true
    return r.audience === 'all' || r.audience === audience
  })
}

async function toggleStyleRule({ firestore, id, enabled }) {
  const doc = await loadDoc(firestore)
  const rules = Array.isArray(doc.rules) ? doc.rules : []
  const idx = rules.findIndex((r) => r.id === id)
  if (idx < 0) throw new Error(`rule ${id} not found`)
  const next = rules.slice()
  next[idx] = { ...next[idx], enabled: Boolean(enabled) }
  await saveDoc(firestore, { rules: next })
  return { ok: true }
}

async function removeStyleRule({ firestore, id }) {
  const doc = await loadDoc(firestore)
  const rules = Array.isArray(doc.rules) ? doc.rules : []
  const next = rules.filter((r) => r.id !== id)
  await saveDoc(firestore, { rules: next })
  return { ok: true, removed: rules.length - next.length }
}

module.exports = {
  addStyleRule,
  listStyleRules,
  toggleStyleRule,
  removeStyleRule,
}
module.exports._testonly = {
  addStyleRule,
  listStyleRules,
  toggleStyleRule,
  removeStyleRule,
  STYLE_GUIDE_REF,
}
