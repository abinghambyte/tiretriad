'use strict'

/**
 * Kyle's catalog buy from a tire Firestore doc: `price`, then `cost`, then legacy `retailPrice`.
 * @param {Record<string, unknown> | null | undefined} td
 */
function tireCatalogBuyNumber(td) {
  const t = td && typeof td === 'object' ? td : {}
  return Number(t.price ?? t.cost ?? t.retailPrice) || 0
}

module.exports = { tireCatalogBuyNumber }
