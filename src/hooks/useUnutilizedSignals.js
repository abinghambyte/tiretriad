import { useMemo } from 'react'
import { useTires } from './useTires'
import { computeOpportunityScore } from '../utils/opportunityScore'
import { isUnutilized, unutilizedReasons, PLATFORMS } from '../utils/unutilizedClassifier'

const WEEK_MS = 7 * 24 * 60 * 60 * 1000
const MAX_ROWS = 25

function timestampToMillis(ts) {
  if (ts == null) return null
  if (typeof ts === 'number') return Number.isFinite(ts) ? ts : null
  if (typeof ts.toMillis === 'function') {
    const ms = ts.toMillis()
    return Number.isFinite(ms) ? ms : null
  }
  const n = Number(ts)
  return Number.isFinite(n) ? n : null
}

function wasPostedWithinWeek(tire, now) {
  const listings = tire?.platformListings
  if (!listings || typeof listings !== 'object') return false
  for (const platform of PLATFORMS) {
    const ms = timestampToMillis(listings?.[platform]?.lastPostedAt)
    if (ms != null && now - ms < WEEK_MS) return true
  }
  return false
}

function hasRecentQueueEntry(tire, now) {
  const q = tire?.researchQueue
  if (!q) return false
  const ms = timestampToMillis(q.at)
  if (ms == null) return false
  return now - ms < WEEK_MS
}

/**
 * Pure derivation so tests can drive it with fixtures. The hook just wires
 * the Firestore snapshot into this function.
 *
 * @param {Array<Record<string, unknown>>} tires
 * @param {number} [now]
 * @returns {{
 *   rows: Array<{ tire: Record<string, unknown>, score: ReturnType<typeof computeOpportunityScore>, reasons: string[] }>,
 *   footerCounts: { inResearchThisWeek: number, listedThisWeek: number },
 * }}
 */
export function deriveUnutilizedSignals(tires, now = Date.now()) {
  const safeTires = Array.isArray(tires) ? tires : []

  const rows = []
  for (const tire of safeTires) {
    if (!isUnutilized(tire)) continue
    const score = computeOpportunityScore(tire)
    rows.push({ tire, score, reasons: unutilizedReasons(tire) })
  }
  rows.sort((a, b) => (b.score.opportunity ?? 0) - (a.score.opportunity ?? 0))
  const capped = rows.slice(0, MAX_ROWS)

  let inResearchThisWeek = 0
  let listedThisWeek = 0
  for (const tire of safeTires) {
    if (hasRecentQueueEntry(tire, now)) inResearchThisWeek += 1
    if (wasPostedWithinWeek(tire, now)) listedThisWeek += 1
  }

  return {
    rows: capped,
    footerCounts: { inResearchThisWeek, listedThisWeek },
  }
}

/**
 * Live Firestore-backed selector for the Unutilized Inventory surface.
 *
 * Subscribes to the full `tires` collection (same pattern as the other
 * dashboard hooks) and derives the ranked rows + footer counts client-side.
 *
 * @returns {{
 *   rows: Array<{ tire: Record<string, unknown>, score: ReturnType<typeof computeOpportunityScore>, reasons: string[] }>,
 *   footerCounts: { inResearchThisWeek: number, listedThisWeek: number },
 *   loading: boolean,
 *   error: Error | null,
 * }}
 */
export function useUnutilizedSignals() {
  const { tires, loading, error } = useTires()
  const { rows, footerCounts } = useMemo(() => deriveUnutilizedSignals(tires), [tires])
  return { rows, footerCounts, loading, error }
}
