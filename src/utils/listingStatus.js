const STALE_MS = 7 * 24 * 60 * 60 * 1000

/**
 * @param {Record<string, unknown>} tire
 * @param {'facebook' | 'offerup' | 'craigslist'} platform
 * @returns {'never' | 'active' | 'stale'}
 */
export function listingStatus(tire, platform) {
  const ts = tire?.platformListings?.[platform]?.lastPostedAt
  if (!ts) return 'never'
  const ms = typeof ts.toMillis === 'function' ? ts.toMillis() : Number(ts)
  return Date.now() - ms < STALE_MS ? 'active' : 'stale'
}
