import { effectiveCts } from './ctsCalc'
import { tireCatalogBuyNumber } from './tireCatalogBuy'

/**
 * Markup headroom vs Kyle buy: ((buyPrice − overhead) / buyPrice) × 100.
 * `price` is Kyle's buy (CSV); overhead is mount + delivery + other (`cts` on save).
 * @param {Record<string, unknown>} tire
 * @returns {number | null}
 */
export function computeMargin(tire) {
  const buyPrice = tireCatalogBuyNumber(tire)
  if (!buyPrice || buyPrice === 0) return null
  const overhead = effectiveCts(tire)
  return ((buyPrice - overhead) / buyPrice) * 100
}

/**
 * @param {number} referencePrice  Kyle buy or other positive reference
 * @param {number} overheadTotal  mount + delivery + other
 * @returns {number | null}
 */
export function marginPercent(referencePrice, overheadTotal) {
  if (referencePrice == null || overheadTotal == null || Number.isNaN(referencePrice) || Number.isNaN(overheadTotal)) {
    return null
  }
  if (referencePrice <= 0) return null
  return ((referencePrice - overheadTotal) / referencePrice) * 100
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

/** Kyle buy used as cost basis when comparing margin to an order (override from price check when set). */
export { kyleBuyBasisPerTire } from './orderCostBasis'
