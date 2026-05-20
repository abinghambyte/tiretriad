import { effectiveCts } from './ctsCalc'
import { tireCatalogBuyNumber } from './tireCatalogBuy'
import { tireCatalogRetailNumber } from './tireCatalogRetail'

/**
 * Markup headroom vs Kyle buy: ((buyPrice − overhead) / buyPrice) × 100.
 * Answers "how much of the buy cost stays as headroom after overhead" and is
 * useful for catalog-health checks where retail research has not run yet.
 * For the "what margin do I get at market retail?" question, use
 * `computeListingMargin` instead.
 *
 * Pass `landedBuy` (from `tireLandedBuyNumber(tire, taxes)`) to fold the
 * predictive landed cost - catalog buy + FET + wholesale tax + CO tire fee -
 * into the headroom denominator. When omitted, falls back to the catalog buy
 * for backward compatibility.
 *
 * @param {Record<string, unknown>} tire
 * @param {{ landedBuy?: number }} [opts]
 * @returns {number | null}
 */
export function computeMargin(tire, opts) {
  const override = opts && Number.isFinite(Number(opts.landedBuy)) ? Number(opts.landedBuy) : null
  const buyPrice = override != null && override > 0 ? override : tireCatalogBuyNumber(tire)
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
 *
 * Pass `landedBuy` (from `tireLandedBuyNumber(tire, taxes)`) to fold the
 * predictive landed cost — catalog buy + FET + wholesale tax + CO tire fee —
 * into the margin denominator. When omitted, falls back to the catalog buy.
 *
 * @param {Record<string, unknown>} tire
 * @param {{ landedBuy?: number }} [opts]
 * @returns {number | null}
 */
export function computeListingMargin(tire, opts) {
  const retail = tireCatalogRetailNumber(tire)
  if (!retail || retail <= 0) return null
  const override = opts && Number.isFinite(Number(opts.landedBuy)) ? Number(opts.landedBuy) : null
  const buy = override != null && override > 0 ? override : tireCatalogBuyNumber(tire)
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

/**
 * Bundle-level quote math for the quantity + sale price calculator. Powers
 * the inline "Quote" modal in the tires catalog: pick one tire, pick qty +
 * sale price, and see the total cost / revenue / margin across the bundle.
 *
 * Margin definition matches how a completed deal is reckoned:
 *   cost   = qty × (buy + overhead + fet)
 *   revenue = qty × salePrice
 *   margin % = (revenue - cost) / revenue × 100
 *
 * Returns `null` for `marginPct` when revenue is 0 (so the UI can render a
 * dash instead of NaN%). All totals are finite numbers, including 0 when
 * inputs are missing; negative `marginPct` is allowed so the user can see
 * that a given sale price is under-water vs. their all-in cost.
 *
 * @param {object} input
 * @param {number} input.qty               Quantity of tires in the bundle (>= 0).
 * @param {number} input.salePrice         Sale price per tire in USD (>= 0).
 * @param {number} input.buyPerTire        Landed cost per tire in USD. Use
 *   `tireLandedBuyNumber(tire, taxes)` so the figure includes FET, wholesale
 *   sales tax, and the CO tire fee. Passing the raw `tireCatalogBuyNumber`
 *   under-counts margin by the predictive landed adders.
 * @param {number} input.overheadPerTire   Mount + delivery + other per tire in USD.
 * @param {number} [input.fetPerTire=0]    FET per tire in USD. Already folded
 *   into the landed buy; pass 0 when `buyPerTire` is `tireLandedBuyNumber`.
 *   Reserved for legacy callers that still pass catalog buy and want FET on
 *   its own line.
 * @returns {{ qty: number, salePrice: number, buyTotal: number, overheadTotal: number,
 *            fetTotal: number, costTotal: number, revenueTotal: number,
 *            profitTotal: number, marginPct: number | null }}
 */
export function computeBundleQuote({ qty, salePrice, buyPerTire, overheadPerTire, fetPerTire = 0 }) {
  const n = (v) => {
    const x = Number(v)
    return Number.isFinite(x) ? x : 0
  }
  const q = Math.max(0, n(qty))
  const sp = Math.max(0, n(salePrice))
  const bp = Math.max(0, n(buyPerTire))
  const op = Math.max(0, n(overheadPerTire))
  const fp = Math.max(0, n(fetPerTire))

  const buyTotal = q * bp
  const overheadTotal = q * op
  const fetTotal = q * fp
  const costTotal = buyTotal + overheadTotal + fetTotal
  const revenueTotal = q * sp
  const profitTotal = revenueTotal - costTotal
  const marginPct = revenueTotal > 0 ? (profitTotal / revenueTotal) * 100 : null

  return {
    qty: q,
    salePrice: sp,
    buyTotal,
    overheadTotal,
    fetTotal,
    costTotal,
    revenueTotal,
    profitTotal,
    marginPct,
  }
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
  if (percent == null || Number.isNaN(percent)) return '--'
  if (percent < 15) return '🔴 Low'
  if (percent < 25) return '🟡 OK'
  if (percent < 35) return '🟢 Good'
  return '💎 Strong'
}

/** Kyle buy used as cost basis when comparing margin to an order (override from price check when set). */
export { kyleBuyBasisPerTire } from './orderCostBasis'
