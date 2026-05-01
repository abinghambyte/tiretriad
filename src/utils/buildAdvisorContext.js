/**
 * Pure builder for the salesAdvisorChat context payload. Inputs are objects
 * the calling page already has loaded; output is the trimmed shape the
 * Cloud Function expects.
 *
 * @param {{
 *   brandAggregates: { total: number, brands: Array, missingBrands: string[] } | null,
 *   revenueStats: { mtdRevenue, ytdRevenue, completedCount30d, completedCount90d } | null,
 *   selectedTire: Record<string, unknown> | null,
 * }} input
 */
export function buildAdvisorContext({ brandAggregates, revenueStats, selectedTire }) {
  const out = {
    brandAggregates: brandAggregates && typeof brandAggregates === 'object'
      ? {
          total: Number(brandAggregates.total) || 0,
          brands: Array.isArray(brandAggregates.brands) ? brandAggregates.brands : [],
          missingBrands: Array.isArray(brandAggregates.missingBrands) ? brandAggregates.missingBrands : [],
        }
      : { total: 0, brands: [], missingBrands: [] },
    revenueStats: null,
    selectedTire: null,
  }

  if (revenueStats && typeof revenueStats === 'object') {
    out.revenueStats = {
      mtdRevenue: Number(revenueStats.mtdRevenue) || 0,
      ytdRevenue: Number(revenueStats.ytdRevenue) || 0,
      completedCount30d: Number(revenueStats.completedCount30d) || 0,
      completedCount90d: Number(revenueStats.completedCount90d) || 0,
    }
  }

  if (selectedTire && typeof selectedTire === 'object') {
    const retailPriceRaw = selectedTire?.priceIntel?.retailPrice
    const retailPrice = Number.isFinite(Number(retailPriceRaw)) ? Number(retailPriceRaw) : null
    const marginRaw = selectedTire?.listingMargin
    const listingMarginPct = Number.isFinite(Number(marginRaw)) ? Number(marginRaw) : null
    out.selectedTire = {
      mspn: String(selectedTire.mspn ?? ''),
      brand: String(selectedTire.brand ?? ''),
      description: String(selectedTire.description ?? ''),
      category: selectedTire.category ?? null,
      price: Number(selectedTire.price) || 0,
      retailPrice,
      listingMarginPct,
    }
  }

  return out
}
