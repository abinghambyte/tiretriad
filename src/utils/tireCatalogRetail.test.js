import { describe, expect, it } from 'vitest'
import {
  tireCatalogRetailNumber,
  tireRetailIsResearched,
  tireRetailIsEstimated,
} from './tireCatalogRetail'

describe('tireCatalogRetailNumber', () => {
  it('returns the researched retail when present', () => {
    expect(tireCatalogRetailNumber({ priceIntel: { retailPrice: 750 } })).toBe(750)
  })

  it('returns 0 for unresearched (no fallback to legacy retailPrice)', () => {
    expect(tireCatalogRetailNumber({ retailPrice: 900 })).toBe(0)
    expect(tireCatalogRetailNumber({})).toBe(0)
    expect(tireCatalogRetailNumber(null)).toBe(0)
  })
})

describe('tireRetailIsResearched', () => {
  it('true when priceIntel.retailPrice > 0', () => {
    expect(tireRetailIsResearched({ priceIntel: { retailPrice: 750 } })).toBe(true)
  })

  it('false when missing or zero', () => {
    expect(tireRetailIsResearched({})).toBe(false)
    expect(tireRetailIsResearched({ priceIntel: {} })).toBe(false)
    expect(tireRetailIsResearched({ priceIntel: { retailPrice: 0 } })).toBe(false)
  })
})

describe('tireRetailIsEstimated', () => {
  const gemini = { source: 'gemini_retail_search', price: 750 }
  const estimate = { source: 'estimated_from_catalog_median', price: 780 }

  it('true when tail source is the catalog-median estimator', () => {
    expect(
      tireRetailIsEstimated({ priceIntel: { retailPrice: 780, sources: [estimate] } }),
    ).toBe(true)
  })

  it('false when tail source is a real Gemini research hit', () => {
    expect(
      tireRetailIsEstimated({ priceIntel: { retailPrice: 750, sources: [gemini] } }),
    ).toBe(false)
  })

  it('false when retail is absent (nothing to classify)', () => {
    expect(
      tireRetailIsEstimated({ priceIntel: { sources: [estimate] } }),
    ).toBe(false)
  })

  it('looks at the LAST source entry (newer attempts override older)', () => {
    expect(
      tireRetailIsEstimated({
        priceIntel: { retailPrice: 780, sources: [gemini, estimate] },
      }),
    ).toBe(true)
    expect(
      tireRetailIsEstimated({
        priceIntel: { retailPrice: 750, sources: [estimate, gemini] },
      }),
    ).toBe(false)
  })
})
