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

  const scored = []
  for (const t of tires) {
    if (t && t.doNotList === true) continue
    const { rankScore, signalBreakdown } = scoreTire(t, weights)
    scored.push({ ...t, rankScore, signalBreakdown })
  }
  scored.sort((a, b) => b.rankScore - a.rankScore)
  return scored
}
