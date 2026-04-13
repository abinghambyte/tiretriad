/**
 * Kyle's catalog buy per tire for an order — use Slack-confirmed override when present.
 * @param {{ kylePriceOverride?: unknown } | null | undefined} order
 * @param {{ price?: unknown; cost?: unknown } | null | undefined} tire
 */
export function kyleBuyBasisPerTire(order, tire) {
  const ko = order?.kylePriceOverride
  if (ko != null && Number.isFinite(Number(ko))) {
    return Number(ko)
  }
  const t = tire || {}
  return Number(t.price ?? t.cost) || 0
}
