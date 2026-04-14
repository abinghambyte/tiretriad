import { CRM_LOST_STAGE, normalizePipelineStage } from './crmPipeline.js'

/** Client-side CRM score (mirrors functions/crmShared.js). */
export function computeCrmScore(data) {
  const fleet = Math.min(25, (Number(data.fleetSize) || 0) * 2.5)
  const pain = Math.min(30, (Number(data.painScore) || 0) * 3)
  const ns = normalizePipelineStage(data.pipelineStage, data)
  const stage = ns === CRM_LOST_STAGE ? 0 : Math.min(20, ns * 4)
  let recency = 10
  const lc = data.lastContactedAt
  if (lc && typeof lc.toMillis === 'function') {
    const days = (Date.now() - lc.toMillis()) / 86400000
    recency = Math.max(0, Math.min(21, 21 - Math.min(21, days)))
  }
  return Math.round(Math.min(100, fleet + pain + stage + recency))
}

export function scoreBadgeClass(score) {
  const s = Number(score) || 0
  const t = 'transition-colors duration-200 ease-out '
  if (s >= 80) return t + 'bg-emerald-950/75 text-emerald-100 ring-emerald-700/45'
  if (s >= 60) return t + 'bg-sky-950/75 text-sky-100 ring-sky-700/45'
  if (s >= 40) return t + 'bg-amber-950/75 text-amber-100 ring-amber-700/45'
  return t + 'bg-zinc-800 text-zinc-300 ring-zinc-600/50'
}
