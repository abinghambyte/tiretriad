/** Client-side CRM score (mirrors functions/crmShared.js). */
export function computeCrmScore(data) {
  const fleet = Math.min(25, (Number(data.fleetSize) || 0) * 2.5)
  const pain = Math.min(30, (Number(data.painScore) || 0) * 3)
  const stage = Math.min(24, (Number(data.pipelineStage) || 1) * 4)
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
  if (s >= 80) return 'bg-emerald-950/70 text-emerald-100 ring-emerald-700/50'
  if (s >= 60) return 'bg-sky-950/70 text-sky-100 ring-sky-700/50'
  if (s >= 40) return 'bg-amber-950/70 text-amber-100 ring-amber-700/50'
  return 'bg-zinc-800 text-zinc-300 ring-zinc-600/50'
}
