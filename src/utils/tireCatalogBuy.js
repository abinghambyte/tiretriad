/**
 * Kyle's catalog buy from a tire Firestore doc: `priceIntel.activeBuyPrice` when present and > 0,
 * else `price`, then `cost`, then legacy `retailPrice`. Matches Cloud Functions catalog-buy.
 * @param {Record<string, unknown> | null | undefined} t
 */
export function tireCatalogBuyNumber(t) {
  if (t == null || typeof t !== 'object') return 0
  const pi = t.priceIntel && typeof t.priceIntel === 'object' ? t.priceIntel : {}
  const active = Number(pi.activeBuyPrice)
  if (Number.isFinite(active) && active > 0) return active
  return Number(t.price ?? t.cost ?? t.retailPrice) || 0
}
