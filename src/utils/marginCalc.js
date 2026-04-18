import { effectiveCts } from './ctsCalc'
import { tireCatalogBuyNumber } from './tireCatalogBuy'
import { tireCatalogRetailNumber } from './tireCatalogRetail'

/**
 * Markup headroom vs Kyle buy: ((buyPrice − overhead) / buyPrice) × 100.
 * Answers "how much of the buy cost stays as headroom after overhead" and is
 * useful for catalog-health checks where retail research has not run yet.
 * For the "what margin do I get at market retail?" question, use
 * `computeListingMargin` instead.
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
 * Listing margin at researched street retail: ((retail − buy) / retail) × 100.
 * Answers "if I list this tire at the typical consumer retail price, what
 * percentage of the sale is margin?". Matches how the Margin % column in the
 * catalog should be read. Returns null when no researched retail exists
 * (unresearched tires, genuine not-founds); the UI renders that as a dash.
 * @param {Record<string, unknown>} tire
 * @returns {number | null}
 */
export function computeListingMargin(tire) {
  const retail = tireCatalogRetailNumber(tire)
  if (!retail || retail <= 0) return null
  const buy = tireCatalogBuyNumber(tire)
  if (!buy || buy <= 0) return null
  return ((retail - buy) / retail) * 100
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
