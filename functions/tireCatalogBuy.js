'use strict'

/**
 * Kyle's catalog buy from a tire Firestore doc: `priceIntel.activeBuyPrice` when present and > 0,
 * else `price`, then `cost`, then legacy `retailPrice`.
 * @param {Record<string, unknown> | null | undefined} td
 */
function tireCatalogBuyNumber(td) {
  const t = td && typeof td === 'object' ? td : {}
  const pi = t.priceIntel && typeof t.priceIntel === 'object' ? t.priceIntel : {}
  const active = Number(pi.activeBuyPrice)
  if (Number.isFinite(active) && active > 0) return active
  return Number(t.price ?? t.cost ?? t.retailPrice) || 0
}

module.exports = { tireCatalogBuyNumber }
