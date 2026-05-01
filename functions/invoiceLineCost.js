/**
 * invoiceLineCost: shared helper for computing a single invoice line's
 * incremental landed cost. Used by importInvoice (auto-attach) and
 * attachInvoiceLine (manual attach + re-attach reversal).
 *
 * Formula: line.extended already bakes in per-line FET. Aggregate taxes are
 * pro-rated by the line's net dollars over invoice bonusTotal. Tire fee is
 * pro-rated by the line's tire count over the invoice's total tire count
 * (caller pre-computes totalTires by summing all lines[].qty).
 */
const { round2 } = require('./payoutConfig')

/**
 * @param {{ netUnitPrice?: number, qty?: number, extended?: number }} line
 * @param {{ countyTax?: number, localTax?: number, stateTax?: number,
 *   tireFee?: number, bonusTotal?: number, totalTires?: number }} totals
 * @returns {number}
 */
function lineShareIncremental(line, totals) {
  const lineNet = (Number(line.netUnitPrice) || 0) * (Number(line.qty) || 0)
  const totalNet = Number(totals.bonusTotal) || 0
  const aggregateTax = (Number(totals.countyTax) || 0)
    + (Number(totals.localTax) || 0)
    + (Number(totals.stateTax) || 0)
  const lineShareOfTax = totalNet > 0 ? aggregateTax * (lineNet / totalNet) : 0
  const totalTires = Number(totals.totalTires) || 0
  const lineTireFee = totalTires > 0
    ? (Number(totals.tireFee) || 0) * ((Number(line.qty) || 0) / totalTires)
    : 0
  return round2((Number(line.extended) || 0) + lineShareOfTax + lineTireFee)
}

module.exports = { lineShareIncremental }
