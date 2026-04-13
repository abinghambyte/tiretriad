/**
 * Kyle's catalog buy from a tire Firestore doc: `price` (primary), then `cost`, then legacy `retailPrice`.
 * Matches Cloud Functions catalog-buy / pricing checks.
 * @param {Record<string, unknown> | null | undefined} t
 */
export function tireCatalogBuyNumber(t) {
  if (t == null || typeof t !== 'object') return 0
  return Number(t.price ?? t.cost ?? t.retailPrice) || 0
}
