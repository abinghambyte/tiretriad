import { formatCurrency, formatPercent } from '../../utils/format'
import { tireCatalogBuyNumber } from '../../utils/tireCatalogBuy'
import { tireCatalogRetailNumber } from '../../utils/tireCatalogRetail'
import { TirePhotoButton } from './TirePhotoButton.jsx'

/**
 * Marketplace platforms the catalog tracks listings on. Tire docs
 * carry these as `listings.{platform}.lastPostedAt` (and friends);
 * presence means the SKU has been posted there at some point.
 */
const LISTING_PLATFORMS = ['ebay', 'marketplace', 'craigslist']

function countActiveListings(tire) {
  const listings = tire && tire.listings
  if (!listings || typeof listings !== 'object') return 0
  let n = 0
  for (const key of LISTING_PLATFORMS) {
    if (listings[key] && listings[key].lastPostedAt) n += 1
  }
  return n
}

export function TireCardMobile({
  tire,
  selected = false,
  onTestOffer,
  onToggleSelect,
  onPhotoUploaded,
  onOpenPhotos,
}) {
  const ring = selected ? 'ring-2 ring-amber-500/70' : 'ring-1 ring-zinc-800'
  const checkboxClass = selected
    ? 'absolute right-3 top-3 inline-flex h-9 w-9 min-w-[36px] items-center justify-center rounded-md border border-amber-500/70 bg-amber-500/20 text-amber-300 hover:border-amber-400 hover:bg-amber-500/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60'
    : 'absolute right-3 top-3 inline-flex h-9 w-9 min-w-[36px] items-center justify-center rounded-md border border-zinc-700 bg-zinc-950 text-amber-300 hover:border-zinc-500 hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60'
  const photoCount = Array.isArray(tire.photos) ? tire.photos.length : 0
  // Pull display values through the canonical selectors so the card
  // matches the desktop margin table and stops rendering $0.00 for
  // every row. `tire.margin` and `tire.listingMargin` are computed
  // upstream in TiresDashboard's enrich step; prefer listing margin
  // (researched retail vs landed buy) and fall back to the catalog-
  // health headroom margin when no retail research exists yet.
  const buy = tireCatalogBuyNumber(tire)
  const retail = tireCatalogRetailNumber(tire)
  const marginPct = tire.listingMargin ?? tire.margin ?? null
  const fet = Number(tire.fet) || 0
  const listedCount = countActiveListings(tire)
  return (
    <div className={`relative rounded-xl bg-zinc-900 p-3 ${ring}`}>
      <button
        type="button"
        aria-label={selected ? `Deselect ${tire.description}` : `Select ${tire.description}`}
        aria-pressed={selected}
        onClick={() => onToggleSelect?.(tire)}
        className={checkboxClass}
      >
        {selected ? '✓' : ''}
      </button>
      <div className="flex items-start justify-between gap-2 pr-12">
        <p className="line-clamp-2 text-sm font-medium text-zinc-100">
          {tire.description}
        </p>
        <span className="shrink-0 rounded-full bg-zinc-800 px-2 py-0.5 font-mono text-[10px] text-zinc-300">
          {tire.mspn}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        <div>
          <span className="text-zinc-400">Buy</span>{' '}
          <span className="font-mono text-zinc-100">{formatCurrency(buy)}</span>
        </div>
        <div>
          <span className="text-zinc-400">Retail</span>{' '}
          <span className="font-mono text-zinc-100">
            {retail > 0 ? formatCurrency(retail) : <span className="text-zinc-500">—</span>}
          </span>
        </div>
        <div>
          <span className="text-zinc-400">Margin</span>{' '}
          <span className="font-mono text-emerald-300">
            {marginPct != null ? formatPercent(marginPct / 100) : <span className="text-zinc-500">—</span>}
          </span>
        </div>
        <div>
          <span className="text-zinc-400">FET</span>{' '}
          <span className="font-mono text-zinc-300">{formatCurrency(fet)}</span>
        </div>
        <div className="col-span-2">
          <span className="text-zinc-400">Listed</span>{' '}
          <span className="text-zinc-300">
            {listedCount > 0
              ? `${listedCount} platform${listedCount === 1 ? '' : 's'}`
              : 'Not listed'}
          </span>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <div className="flex items-center gap-1">
          <TirePhotoButton
            tire={tire}
            count={photoCount}
            onUploaded={(photo) => onPhotoUploaded?.(tire, photo)}
          />
          {photoCount > 0 ? (
            <button
              type="button"
              onClick={() => onOpenPhotos?.(tire)}
              className="inline-flex h-9 items-center rounded-md border border-zinc-700 px-2 text-xs font-medium text-zinc-300 hover:border-zinc-500 hover:bg-zinc-800"
            >
              View
            </button>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => onTestOffer?.(tire)}
          className="min-h-[44px] flex-1 rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-400"
        >
          Try a price
        </button>
      </div>
    </div>
  )
}
