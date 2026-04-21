import { computeOpportunityScore } from './opportunityScore'
import { listingStatus } from './listingStatus'

// eBay is intentionally NOT in PLATFORMS until the sell-side integration ships
// (see ROADMAP.md > "eBay sell-side API integration"). When it lands, add
// 'ebay' here and no other change is required.
export const PLATFORMS = ['facebook', 'offerup', 'craigslist']

/**
 * Returns true when a tire qualifies for the Unutilized Inventory surface:
 *
 * 1. `computeOpportunityScore(tire).opportunity > 0`
 * 2. `computeOpportunityScore(tire).confidence` is 'high' or 'medium'
 * 3. Every platform in `PLATFORMS` has `listingStatus !== 'active'`
 * 4. `tire.researchQueue == null` OR `tire.researchQueue.resolvedAt != null`
 * 5. `tire.marginConfirmed !== true`
 *
 * @param {Record<string, unknown> | null | undefined} tire
 * @returns {boolean}
 */
export function isUnutilized(tire) {
  if (!tire || typeof tire !== 'object') return false

  if (tire.marginConfirmed === true) return false

  const queue = tire.researchQueue
  if (queue != null && queue.resolvedAt == null) return false

  const score = computeOpportunityScore(tire)
  if (!(Number.isFinite(score.opportunity) && score.opportunity > 0)) return false
  if (score.confidence !== 'high' && score.confidence !== 'medium') return false

  for (const platform of PLATFORMS) {
    if (listingStatus(tire, platform) === 'active') return false
  }

  return true
}

/**
 * Short justification tags for a qualifying tire. Returned strings are
 * lowercase and under 20 chars each. Callers may assume
 * `isUnutilized(tire) === true`; this fn does not defensively re-check.
 *
 * Example output: `['high opportunity', 'never listed']` or
 * `['medium opportunity', '2 stale']`.
 *
 * @param {Record<string, unknown>} tire
 * @returns {string[]}
 */
export function unutilizedReasons(tire) {
  const reasons = []

  const score = computeOpportunityScore(tire)
  if (score.confidence === 'high') reasons.push('high opportunity')
  else if (score.confidence === 'medium') reasons.push('medium opportunity')

  let neverCount = 0
  let staleCount = 0
  for (const platform of PLATFORMS) {
    const status = listingStatus(tire, platform)
    if (status === 'never') neverCount += 1
    else if (status === 'stale') staleCount += 1
  }

  if (staleCount === 0 && neverCount > 0) {
    reasons.push('never listed')
  } else if (staleCount > 0 && neverCount === 0) {
    reasons.push(`${staleCount} stale`)
  } else if (staleCount > 0 && neverCount > 0) {
    reasons.push(`${staleCount} stale`)
    reasons.push(`${neverCount} never`)
  }

  return reasons
}
