/**
 * Typical retail price for a catalog tire. Prefers the Gemini-researched
 * `priceIntel.retailPrice` (populated by the nightly/afternoon crons). Falls
 * back to the legacy CSV-sourced top-level `retailPrice` field, which tends
 * to be a stale sticker value.
 * @param {Record<string, unknown> | null | undefined} t
 * @returns {number} retail price per tire, or 0 if unknown
 */
export function tireCatalogRetailNumber(t) {
  if (t == null || typeof t !== 'object') return 0
  const pi = t.priceIntel && typeof t.priceIntel === 'object' ? t.priceIntel : {}
  const researched = Number(pi.retailPrice)
  if (Number.isFinite(researched) && researched > 0) return researched
  const legacy = Number(t.retailPrice)
  if (Number.isFinite(legacy) && legacy > 0) return legacy
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
