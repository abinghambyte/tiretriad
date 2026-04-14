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
  const base = 'inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 transition-colors duration-300 ease-out '
  if (percent == null || Number.isNaN(percent)) {
    return base + 'bg-zinc-800 text-zinc-300 ring-zinc-600/60'
  }
  if (percent < 15) return base + 'bg-red-950/85 text-red-200 ring-red-900/55'
  if (percent < 25) return base + 'bg-amber-950/85 text-amber-200 ring-amber-900/45'
  if (percent < 35) return base + 'bg-emerald-950/85 text-emerald-200 ring-emerald-900/45'
  return base + 'bg-sky-950/85 text-sky-200 ring-sky-700/40'
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
