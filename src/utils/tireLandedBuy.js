import { tireCatalogBuyNumber } from './tireCatalogBuy.js'

/**
 * Landed buy cost per tire = catalog buy + FET + wholesale sales tax + tire fee.
 * Pure / computed on read - never stored on the tire doc.
 *
 * Wholesale sales tax base is the catalog buy only (matches how the eFleet
 * invoice computes it: tax is on Bonus Total = qty * net unit price; FET is
 * a separate aggregate line, not part of the tax base).
 *
 * @param {Record<string, unknown> | null | undefined} tire
 * @param {Record<string, unknown> | null | undefined} taxes  meta/payoutConfig.taxes shape
 * @returns {number}
 */
export function tireLandedBuyNumber(tire, taxes) {
  const buy = tireCatalogBuyNumber(tire)
  if (!Number.isFinite(buy) || buy <= 0) return 0
  const fet = Number(tire?.fet) || 0
  const t = taxes && typeof taxes === 'object' ? taxes : {}
  const rate = (Number(t.countyTaxPct) || 0)
    + (Number(t.localTaxPct) || 0)
    + (Number(t.stateTaxPct) || 0)
  const fee = Number(t.tireFeePerTire) || 0
  return buy + fet + buy * rate + fee
}
