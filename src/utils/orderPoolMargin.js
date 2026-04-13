import { effectiveCts } from './ctsCalc'
import { kyleBuyBasisPerTire } from './orderCostBasis'

function round2(n) {
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100) / 100
}

/**
 * Pool dollars for one completed order (matches Cloud Functions margin basis).
 * @param {Record<string, unknown>} order
 * @param {Record<string, unknown>} tire
 */
export function poolDollarsForOrder(order, tire) {
  const qty = Number(order?.quantity) || 0
  const buy = kyleBuyBasisPerTire(order, tire)
  const cts = effectiveCts(tire || {})
  const cost = round2((buy + cts) * qty)
  const pay = round2(Number(order?.paymentAmount ?? order?.totalPrice) || 0)
  return round2(pay - cost)
}

/** Margin % of payment (0–100+). */
export function marginPercentOfPayment(order, tire) {
  const pay = Number(order?.paymentAmount ?? order?.totalPrice) || 0
  if (pay <= 0) return null
  const pool = poolDollarsForOrder(order, tire)
  return (100 * pool) / pay
}
