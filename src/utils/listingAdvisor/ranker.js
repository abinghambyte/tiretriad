// src/utils/listingAdvisor/ranker.js
import { MODE_WEIGHTS } from './modeWeights.js'

const AGE_CLAMP_MAX = 180
const MIN_VELOCITY_SAMPLE = 3

function clampAge(days) {
  const n = Number(days)
  if (!Number.isFinite(n) || n < 0) return 0
  return n > AGE_CLAMP_MAX ? AGE_CLAMP_MAX : n
}

function velocityUrgency(avgDaysToSell, sampleSize) {
  const n = Number(avgDaysToSell)
  const s = Number(sampleSize) || 0
  if (s < MIN_VELOCITY_SAMPLE || !Number.isFinite(n) || n <= 0) return 0
  return 100 / Math.max(n, 1)
}

function scoreTire(tire, weights) {
  const repriceRaw = clampAge(tire.daysSincePriceChange)
  const staleListingRaw = clampAge(tire.daysSinceLastListed)
  const velRaw = velocityUrgency(tire.avgDaysToSell, tire.velocitySampleSize)
  const marginRaw = Number.isFinite(Number(tire.marginHeadroomPct)) ? Number(tire.marginHeadroomPct) : 0
  const crossRaw = Math.max(0, Number(tire.missingPlatformCount) || 0)

  // Margin is expressed as a fraction (0.32 = 32%). Multiply by 100 so the
  // weight scale lines up with the other signals.
  const repriceW = repriceRaw * weights.daysSincePriceChange
  const staleListingW = staleListingRaw * weights.daysSinceLastListed
  const velW = velRaw * weights.velocity
  const marginW = marginRaw * 100 * weights.margin
  const crossW = crossRaw * weights.crossPost

  return {
    rankScore: repriceW + staleListingW + velW + marginW + crossW,
    signalBreakdown: {
      daysSincePriceChange: { raw: repriceRaw, weighted: repriceW },
      daysSinceLastListed: { raw: staleListingRaw, weighted: staleListingW },
      velocity: { raw: velRaw, weighted: velW },
      margin: { raw: marginRaw, weighted: marginW },
      crossPost: { raw: crossRaw, weighted: crossW },
    },
  }
}

// Mode-specific tiebreakers for when rankScore is equal. Uniform catalog data
// (bulk backfill, bulk reprice, nothing posted yet) produces large tied-score
// plateaus at the top of the list; without tiebreakers, modes look identical.
//
// Each returns a number to compare; lower value sorts first (ascending).
const TIEBREAKERS = {
  // Breadth: prefer SKUs that would benefit most from exposure. Low margin
  // items are hardest to move on their own, so surface them first when the
  // primary score ties.
  COVERAGE: (t) => Number(t.marginHeadroomPct) || 0,
  // Money: highest margin first.
  PROFIT: (t) => -(Number(t.marginHeadroomPct) || 0),
  // Turnover: highest-velocity sizes first, then most recently repriced (proxy
  // for "this price is fresh, list it now"), then highest margin.
  VELOCITY: (t) => {
    const v = Number(t.avgDaysToSell)
    const sample = Number(t.velocitySampleSize) || 0
    const velScore = sample >= 3 && Number.isFinite(v) && v > 0 ? -100 / v : 0
    const reprice = -(Number(t.daysSincePriceChange) || 0)
    const margin = -(Number(t.marginHeadroomPct) || 0)
    // Multi-key sort via weighted sum; small magnitudes keep velocity primary.
    return velScore * 1e6 + reprice * 1e3 + margin
  },
}

/**
 * Rank tires for listing priority.
 * Pure function. No I/O. Tires with `doNotList: true` are dropped before scoring.
 *
 * @param {Array<object>} tires
 * @param {'COVERAGE'|'PROFIT'|'VELOCITY'} mode
 * @returns {Array<object>} sorted descending by rankScore, each row augmented with
 *   `rankScore` and `signalBreakdown`.
 */
export function rankTires(tires, mode) {
  const weights = MODE_WEIGHTS[mode]
  if (!weights) throw new Error(`Unknown advisor mode: ${mode}`)
  if (!Array.isArray(tires) || tires.length === 0) return []

  const tieBreak = TIEBREAKERS[mode]
  const scored = []
  for (const t of tires) {
    if (t && t.doNotList === true) continue
    const { rankScore, signalBreakdown } = scoreTire(t, weights)
    scored.push({ ...t, rankScore, signalBreakdown })
  }
  scored.sort((a, b) => {
    if (b.rankScore !== a.rankScore) return b.rankScore - a.rankScore
    return tieBreak(a) - tieBreak(b)
  })
  return scored
}
