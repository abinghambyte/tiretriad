function lineKey(tire, index) {
  return String(tire?.mspn || tire?.id || index)
}

function positiveMoney(value) {
  const n = Number(value) || 0
  return Number.isFinite(n) && n > 0 ? n : 0
}

function quantityFor(tire, index, qtyByMspn) {
  const raw = qtyByMspn?.[lineKey(tire, index)]
  const n = Number(raw) || 1
  return Math.min(99, Math.max(1, Math.trunc(n)))
}

export function bundleMath(tires, qtyByMspn = {}, floorPct = 0, testOffer = 0) {
  const rows = Array.isArray(tires) ? tires : []
  let revenue = 0
  let cost = 0

  for (let index = 0; index < rows.length; index += 1) {
    const tire = rows[index]
    const qty = quantityFor(tire, index, qtyByMspn)
    // Match the single-tire HaggleSheet math: buyAllIn = buy + cts + fet.
    // FET is a real per-unit federal excise tax on LT-rated tires (~$7-15)
    // and must be in cost. Excluding it inflates margin and silently
    // mis-reports profit on truck/SUV bundles.
    const buy =
      positiveMoney(tire?.buy) + positiveMoney(tire?.cts) + positiveMoney(tire?.fet)
    const sell = positiveMoney(tire?.retail)
    revenue += sell * qty
    cost += buy * qty
  }

  const profit = revenue - cost
  const margin = revenue > 0 ? (profit / revenue) * 100 : 0
  const testOfferNum = rows.length > 0 ? positiveMoney(testOffer) : 0
  const testProfit = testOfferNum > 0 ? testOfferNum - cost : 0
  const testMargin = testOfferNum > 0 ? (testProfit / testOfferNum) * 100 : 0
  const counterOffer = floorPct < 100 ? cost / (1 - floorPct / 100) : null

  return { revenue, cost, profit, margin, testProfit, testMargin, counterOffer }
}
