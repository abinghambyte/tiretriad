import { effectiveCts } from './ctsCalc'
import { tireCatalogBuyNumber } from './tireCatalogBuy'
import {
  tireCatalogRetailNumber,
  tireRetailIsEstimated,
  tireRetailIsResearched,
} from './tireCatalogRetail'

/** Maximum haggle discount the scorer will assume. Anything higher is clamped. */
const MAX_HAGGLE_DISCOUNT = 0.3
/** Fallback haggle when the caller passes a non-finite value. */
const DEFAULT_HAGGLE_DISCOUNT = 0.1

/**
 * Classify the retail-price confidence for a tire using the existing
 * `tireRetailIs*` helpers.
 *
 * Ordering matters: estimates come first because `tireRetailIsResearched`
 * returns true for any tire with a non-zero `priceIntel.retailPrice`,
 * including catalog-median estimates. Without the estimated check first
 * those would fall through to 'high'.
 *
 * Tier map:
 *   - high      → `tireRetailIsResearched` true AND not estimated
 *   - medium    → retail > 0 but neither researched nor estimated
 *                 (legacy manual retail / firmed values)
 *   - estimated → `tireRetailIsEstimated` true
 *   - none      → no retail at all
 *
 * @param {Record<string, unknown> | null | undefined} tire
 * @returns {'high' | 'medium' | 'estimated' | 'none'}
 */
export function retailConfidenceTier(tire) {
  if (tireRetailIsEstimated(tire)) return 'estimated'
  if (tireRetailIsResearched(tire)) return 'high'
  const retail = tireCatalogRetailNumber(tire)
  if (Number.isFinite(retail) && retail > 0) return 'medium'
  return 'none'
}

/** Back-compat alias for callers that imported the old name. */
export const confidenceTier = retailConfidenceTier

/**
 * @param {'high' | 'medium' | 'estimated' | 'none'} tier
 * @returns {number}
 */
export function confidenceWeight(tier) {
  if (tier === 'high') return 1.0
  if (tier === 'medium') return 0.85
  if (tier === 'estimated') return 0.4
  return 0
}

function fetNumber(tire) {
  if (!tire || typeof tire !== 'object') return 0
  const n = Number(tire.fet)
  return Number.isFinite(n) && n > 0 ? n : 0
}

function clampHaggle(v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return DEFAULT_HAGGLE_DISCOUNT
  if (n < 0) return 0
  if (n > MAX_HAGGLE_DISCOUNT) return MAX_HAGGLE_DISCOUNT
  return n
}

/**
 * All-in per-tire floor: buy + overhead + FET. Answers "what do I have to
 * clear to break even on this tire?" Returns null when buy is missing
 * because a floor without a cost basis is meaningless.
 *
 * @param {Record<string, unknown> | null | undefined} tire
 * @returns {number | null}
 */
export function computeFloor(tire) {
  const buy = tireCatalogBuyNumber(tire)
  if (!(Number.isFinite(buy) && buy > 0)) return null
  const overhead = effectiveCts(tire)
  const fet = fetNumber(tire)
  return buy + overhead + fet
}

/**
 * Projected per-tire net profit at a given haggle discount off researched
 * retail. `haggleDiscount` is a fraction clamped to [0, 0.30]; defaults to
 * 0.10 when not finite. Returns null when retail or buy is missing.
 *
 * net = retail * (1 - haggle) - buy - overhead - fet
 *
 * @param {Record<string, unknown> | null | undefined} tire
 * @param {number} [haggleDiscount=0.1]
 * @returns {number | null}
 */
export function computeNetPerTire(tire, haggleDiscount = DEFAULT_HAGGLE_DISCOUNT) {
  const retail = tireCatalogRetailNumber(tire)
  if (!(Number.isFinite(retail) && retail > 0)) return null
  const buy = tireCatalogBuyNumber(tire)
  if (!(Number.isFinite(buy) && buy > 0)) return null
  const overhead = effectiveCts(tire)
  const fet = fetNumber(tire)
  const h = clampHaggle(haggleDiscount)
  return retail * (1 - h) - buy - overhead - fet
}

/**
 * Opportunity breakdown for a single tire.
 *
 * The opportunity score is `netPerTire × confidenceWeight`: an $80 net on a
 * catalog-median estimate ranks as $32 (80 × 0.4), which loses to a $50 net
 * on a Gemini-researched retail ($50 × 1.0). That keeps unresearched
 * guesses from beating real data on the ranking.
 *
 * Missing-data behaviour:
 *   - no retail → `walkawayPrice`, `netPerTire`, `opportunity` all null,
 *                 but `floor` is still returned when buy is present so the
 *                 operator still has a break-even number to quote.
 *   - no buy   → `floor`, `netPerTire`, `opportunity` all null.
 *
 * @param {Record<string, unknown> | null | undefined} tire
 * @param {{ haggleDiscount?: number }} [opts]
 * @returns {{
 *   retail: number | null,
 *   buy: number | null,
 *   overhead: number,
 *   fet: number,
 *   walkawayPrice: number | null,
 *   netPerTire: number | null,
 *   floor: number | null,
 *   confidence: 'high' | 'medium' | 'estimated' | 'none',
 *   confidenceWeight: number,
 *   opportunity: number | null,
 * }}
 */
export function computeOpportunityScore(tire, opts) {
  const haggle = clampHaggle(opts && typeof opts === 'object' ? opts.haggleDiscount : undefined)
  const overhead = effectiveCts(tire)
  const fet = fetNumber(tire)

  const rawBuy = tireCatalogBuyNumber(tire)
  const buy = Number.isFinite(rawBuy) && rawBuy > 0 ? rawBuy : null

  const rawRetail = tireCatalogRetailNumber(tire)
  const retail = Number.isFinite(rawRetail) && rawRetail > 0 ? rawRetail : null

  const confidence = retailConfidenceTier(tire)
  const weight = confidenceWeight(confidence)

  const floor = buy != null ? buy + overhead + fet : null

  let walkawayPrice = null
  let netPerTire = null
  let opportunity = null
  if (retail != null) {
    walkawayPrice = retail * (1 - haggle)
    if (buy != null) {
      netPerTire = walkawayPrice - buy - overhead - fet
      opportunity = netPerTire * weight
    }
  }

  return {
    retail,
    buy,
    overhead,
    fet,
    walkawayPrice,
    netPerTire,
    floor,
    confidence,
    confidenceWeight: weight,
    opportunity,
  }
}
