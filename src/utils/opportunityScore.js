import { effectiveCts } from './ctsCalc'
import { tireLandedBuyNumber } from './tireLandedBuy.js'
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
  if (tire.hasFet === false) return 0
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
 * All-in per-tire floor: landed buy + overhead. Answers "what do I have to
 * clear to break even on this tire?" `landed` already folds in FET,
 * wholesale sales tax, and the CO tire fee — see `tireLandedBuyNumber`.
 * Returns null when landed buy is missing because a floor without a cost
 * basis is meaningless.
 *
 * @param {Record<string, unknown> | null | undefined} tire
 * @param {Record<string, unknown> | null | undefined} [taxes]  meta/payoutConfig.taxes
 * @returns {number | null}
 */
export function computeFloor(tire, taxes) {
  const landed = tireLandedBuyNumber(tire, taxes)
  if (!(Number.isFinite(landed) && landed > 0)) return null
  const overhead = effectiveCts(tire)
  return landed + overhead
}

/**
 * Projected per-tire net profit at a given haggle discount off researched
 * retail. `haggleDiscount` is a fraction clamped to [0, 0.30]; defaults to
 * 0.10 when not finite. Returns null when retail or landed buy is missing.
 *
 * net = retail * (1 - haggle) - landed - overhead
 *
 * @param {Record<string, unknown> | null | undefined} tire
 * @param {number} [haggleDiscount=0.1]
 * @param {Record<string, unknown> | null | undefined} [taxes]
 * @returns {number | null}
 */
export function computeNetPerTire(tire, haggleDiscount = DEFAULT_HAGGLE_DISCOUNT, taxes) {
  const retail = tireCatalogRetailNumber(tire)
  if (!(Number.isFinite(retail) && retail > 0)) return null
  const landed = tireLandedBuyNumber(tire, taxes)
  if (!(Number.isFinite(landed) && landed > 0)) return null
  const overhead = effectiveCts(tire)
  const h = clampHaggle(haggleDiscount)
  return retail * (1 - h) - landed - overhead
}

/**
 * Opportunity breakdown for a single tire.
 *
 * The opportunity score is `netPerTire × confidenceWeight`: an $80 net on a
 * catalog-median estimate ranks as $32 (80 × 0.4), which loses to a $50 net
 * on a Gemini-researched retail ($50 × 1.0). That keeps unresearched
 * guesses from beating real data on the ranking.
 *
 * Cost basis is the predictive landed cost from `tireLandedBuyNumber`:
 * catalog buy + FET + wholesale sales tax (rate from `taxes`) + CO tire fee.
 * `r.buy` reports landed (so callers see the all-in cost), `r.fet` stays as
 * the per-tire FET for breakdown rendering. Floor and net subtract landed
 * directly; FET is NOT subtracted again on top of landed.
 *
 * Missing-data behaviour:
 *   - no retail → `walkawayPrice`, `netPerTire`, `opportunity` all null,
 *                 but `floor` is still returned when landed > 0 so the
 *                 operator still has a break-even number to quote.
 *   - no buy   → `floor`, `netPerTire`, `opportunity` all null.
 *
 * @param {Record<string, unknown> | null | undefined} tire
 * @param {{ haggleDiscount?: number, taxes?: Record<string, unknown> | null }} [opts]
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
  const taxes = opts && typeof opts === 'object' ? opts.taxes : undefined
  const overhead = effectiveCts(tire)
  const fet = fetNumber(tire)

  const rawLanded = tireLandedBuyNumber(tire, taxes)
  const landed = Number.isFinite(rawLanded) && rawLanded > 0 ? rawLanded : null

  const rawRetail = tireCatalogRetailNumber(tire)
  const retail = Number.isFinite(rawRetail) && rawRetail > 0 ? rawRetail : null

  const confidence = retailConfidenceTier(tire)
  const weight = confidenceWeight(confidence)

  const floor = landed != null ? landed + overhead : null

  let walkawayPrice = null
  let netPerTire = null
  let opportunity = null
  if (retail != null) {
    walkawayPrice = retail * (1 - haggle)
    if (landed != null) {
      netPerTire = walkawayPrice - landed - overhead
      opportunity = netPerTire * weight
    }
  }

  return {
    retail,
    buy: landed,
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
