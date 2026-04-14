/**
 * Rubber CRM pipeline — mirrors src/utils/crmPipeline.js for Cloud Functions.
 */

const CRM_LOST_STAGE = 7

const CRM_STAGE_LABELS = {
  1: 'Spotted',
  2: 'Contacted',
  3: 'Qualified',
  4: 'Quoted',
  5: 'Closed',
  7: 'Lost',
}

const CRM_PIPELINE_SCHEMA_VERSION = 2

function normalizePipelineStage(raw, account = null) {
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

function crmStageLabel(rawStage, account = null) {
  const n = normalizePipelineStage(rawStage, account)
  return CRM_STAGE_LABELS[n] || `Stage ${rawStage}`
}

/**
 * @param {Array<{ data: () => object }>} docs Firestore query docs
 * @param {string} q
 */
function fuzzyMatchAccountDoc(docs, q) {
  const needle = String(q || '').trim().toLowerCase()
  if (!needle) return null
  let best = null
  let bestLen = Infinity
  for (const d of docs) {
    const row = typeof d.data === 'function' ? d.data() : {}
    const name = String(row.companyName || '').toLowerCase()
    if (!name) continue
    if (name === needle) return d
    if (name.includes(needle) && name.length < bestLen) {
      best = d
      bestLen = name.length
    }
  }
  return best
}

module.exports = {
  CRM_LOST_STAGE,
  CRM_PIPELINE_SCHEMA_VERSION,
  CRM_STAGE_LABELS,
  normalizePipelineStage,
  crmStageLabel,
  fuzzyMatchAccountDoc,
}
