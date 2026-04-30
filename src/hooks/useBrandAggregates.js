import { useMemo } from 'react'
import { EXPECTED_BRANDS } from '../constants/tireCategory.js'
import { tireRetailIsResearched } from '../utils/tireCatalogRetail.js'
import { computeListingMargin } from '../utils/marginCalc.js'

/**
 * Normalize brand strings: trim, uppercase, alias BFG -> BFGOODRICH.
 * Empty / null / undefined collapse to '(unknown)' so they bucket together.
 *
 * @param {unknown} raw
 * @returns {string}
 */
function normalizeBrand(raw) {
  const s = String(raw ?? '').trim().toUpperCase()
  if (!s) return '(unknown)'
  if (s === 'BFG') return 'BFGOODRICH'
  if (s === 'BFGOODRICH') return 'BFGOODRICH'
  return s
}

/**
 * Returns true when the tire's retail price comes from a Gemini research pass
 * rather than a catalog-median estimate or other non-authoritative source.
 * Checks both that a valid retailPrice exists and that retailSource (if
 * present) is not the 'estimate' sentinel.
 *
 * @param {Record<string, unknown> | null | undefined} t
 * @returns {boolean}
 */
function retailIsAuthoritative(t) {
  if (!tireRetailIsResearched(t)) return false
  const pi = t?.priceIntel && typeof t.priceIntel === 'object' ? t.priceIntel : {}
  const src = pi.retailSource
  if (src != null && src === 'estimate') return false
  return true
}

/**
 * @typedef {Object} BrandAggregate
 * @property {string} brand
 * @property {number} count
 * @property {number | null} avgListingMarginPct
 * @property {number | null} avgResearchedRetail
 * @property {number} offProgramCount
 * @property {number} missingRetailResearchCount
 */

/**
 * Per-brand portfolio aggregates, optionally scoped to a tire category.
 *
 * @param {Array<Record<string, unknown>>} tires    Enriched tire docs
 * @param {string | null}                  category 'passenger' | 'lightTruck' | 'truck' | null (all)
 * @returns {{
 *   total: number,
 *   brands: Array<BrandAggregate>,
 *   missingBrands: Array<string>,
 * }}
 */
export function useBrandAggregates(tires, category) {
  return useMemo(() => {
    const accum = new Map()
    let total = 0

    for (const tire of Array.isArray(tires) ? tires : []) {
      if (category && tire?.category !== category) continue
      total += 1
      const brand = normalizeBrand(tire?.brand)
      let bucket = accum.get(brand)
      if (!bucket) {
        bucket = {
          brand,
          count: 0,
          marginSum: 0,
          marginN: 0,
          retailSum: 0,
          retailN: 0,
          offProgramCount: 0,
          missingRetailResearchCount: 0,
        }
        accum.set(brand, bucket)
      }
      bucket.count += 1
      if (tire?.offProgramAt) bucket.offProgramCount += 1
      if (retailIsAuthoritative(tire)) {
        const retail = Number(tire?.priceIntel?.retailPrice)
        if (Number.isFinite(retail) && retail > 0) {
          bucket.retailSum += retail
          bucket.retailN += 1
        }
        const margin = computeListingMargin(tire)
        if (Number.isFinite(margin)) {
          bucket.marginSum += margin
          bucket.marginN += 1
        }
      } else {
        bucket.missingRetailResearchCount += 1
      }
    }

    const brands = [...accum.values()]
      .map((b) => ({
        brand: b.brand,
        count: b.count,
        avgListingMarginPct: b.marginN > 0 ? b.marginSum / b.marginN : null,
        avgResearchedRetail: b.retailN > 0 ? b.retailSum / b.retailN : null,
        offProgramCount: b.offProgramCount,
        missingRetailResearchCount: b.missingRetailResearchCount,
      }))
      .sort((a, b) => b.count - a.count || a.brand.localeCompare(b.brand))

    const stockedBrandSet = new Set(brands.filter((b) => b.count > 0).map((b) => b.brand))
    const missingBrands = EXPECTED_BRANDS.filter((b) => !stockedBrandSet.has(b))

    return { total, brands, missingBrands }
  }, [tires, category])
}
