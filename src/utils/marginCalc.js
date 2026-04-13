import { effectiveCts } from './ctsCalc'

/**
 * Margin % on retail: ((retail − CTS) / retail) × 100.
 * Requires a positive buy price (`cost`); CTS uses FET + mount + delivery + other from the tire doc.
 * @param {Record<string, unknown>} tire
 * @returns {number | null}
 */
export function computeMargin(tire) {
  const retail = Number(tire?.price ?? tire?.retailPrice ?? 0)
  const cost = Number(tire?.cost) || 0
  if (!retail || retail === 0) return null
  if (!cost || cost === 0) return null
  const cts = effectiveCts(tire)
  return ((retail - cts) / retail) * 100
}

/**
 * @param {number} retail
 * @param {number} cts
 * @returns {number | null}
 */
export function marginPercent(retail, cts) {
  if (retail == null || cts == null || Number.isNaN(retail) || Number.isNaN(cts)) {
    return null
  }
  if (retail <= 0) return null
  return ((retail - cts) / retail) * 100
}

export function marginBadgeClass(percent) {
  if (percent == null || Number.isNaN(percent)) {
    return 'bg-zinc-700 text-zinc-300'
  }
  if (percent < 15) return 'bg-red-950/80 text-red-300 ring-1 ring-red-900/60'
  if (percent < 25) return 'bg-amber-950/80 text-amber-200 ring-1 ring-amber-900/50'
  if (percent < 35) return 'bg-emerald-950/80 text-emerald-200 ring-1 ring-emerald-900/50'
  return 'bg-sky-950/80 text-sky-200 ring-1 ring-amber-500/40'
}

export function marginBadgeLabel(percent) {
  if (percent == null || Number.isNaN(percent)) return '—'
  if (percent < 15) return '🔴 Low'
  if (percent < 25) return '🟡 OK'
  if (percent < 35) return '🟢 Good'
  return '💎 Strong'
}
