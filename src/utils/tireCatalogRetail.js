/**
 * Typical consumer retail price for a catalog tire. Only the Gemini-researched
 * `priceIntel.retailPrice` populated by the nightly/afternoon crons counts.
 * Earlier versions of this utility fell back to a top-level `retailPrice`
 * field, but that field was never retail: the CSV importer mistakenly wrote
 * Kyle's buy cost there, which made unresearched tires display buy-cost-as-
 * retail in the catalog and zero out the margin column. Per AGENTS.md, no
 * top-level `retailPrice` field exists on tire docs.
 * @param {Record<string, unknown> | null | undefined} t
 * @returns {number} retail price per tire, or 0 if not yet researched
 */
export function tireCatalogRetailNumber(t) {
  if (t == null || typeof t !== 'object') return 0
  const pi = t.priceIntel && typeof t.priceIntel === 'object' ? t.priceIntel : {}
  const researched = Number(pi.retailPrice)
  if (Number.isFinite(researched) && researched > 0) return researched
  return 0
}

/**
 * @param {Record<string, unknown> | null | undefined} t
 * @returns {boolean} true when the retail number comes from the Gemini research layer
 */
export function tireRetailIsResearched(t) {
  if (t == null || typeof t !== 'object') return false
  const pi = t.priceIntel && typeof t.priceIntel === 'object' ? t.priceIntel : {}
  const researched = Number(pi.retailPrice)
  return Number.isFinite(researched) && researched > 0
}

/**
 * Last entry in the priceIntel sources audit trail. The backend writes one
 * source entry per attempt (`gemini_retail_search`,
 * `gemini_retail_search_alt`, `gemini_retail_search_pro`,
 * `estimated_from_catalog_median`, etc.), so the tail entry tells us where
 * the currently-displayed retail came from.
 * @param {Record<string, unknown> | null | undefined} t
 */
function lastPriceSource(t) {
  if (t == null || typeof t !== 'object') return ''
  const pi = t.priceIntel && typeof t.priceIntel === 'object' ? t.priceIntel : {}
  const sources = Array.isArray(pi.sources) ? pi.sources : []
  const last = sources[sources.length - 1]
  return String(last?.source || '')
}

/**
 * @param {Record<string, unknown> | null | undefined} t
 * @returns {boolean} true when the retail number is a catalog-median estimate
 *   rather than a real Gemini hit. UI should render these muted so users
 *   know the number is approximate.
 */
export function tireRetailIsEstimated(t) {
  if (!tireRetailIsResearched(t)) return false
  return lastPriceSource(t) === 'estimated_from_catalog_median'
}
