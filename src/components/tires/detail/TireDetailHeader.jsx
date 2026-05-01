import { Link } from 'react-router-dom'
import { brandColorCssVar } from '../../../utils/brandColor.js'
import { TireDescriptionCell } from '../MarginTable.jsx'

const SIDEWALL_TAGS = new Set(['XL', 'MS'])

const CATEGORY_LABELS = {
  passenger: 'Passenger',
  lightTruck: 'Light Truck',
  truck: 'Truck',
}

/**
 * Hero card for the tire detail page. Brand-color left edge, sidewall pills
 * via the existing TireDescriptionCell rendering path, MSPN + LR + category
 * metadata line, back link to the catalog.
 */
export function TireDetailHeader({ tire, backHref }) {
  const sidewallTags = Array.isArray(tire?.derivedUseTags)
    ? tire.derivedUseTags.filter((t) => SIDEWALL_TAGS.has(t))
    : []
  const lr = String(tire?.lr ?? '').trim() || '--'
  const categoryLabel = CATEGORY_LABELS[tire?.category] || '--'
  const brandColor = brandColorCssVar(tire?.brand)
  return (
    <div>
      <Link
        to={backHref}
        className="mb-3 inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200"
      >
        <span aria-hidden>←</span> Back to catalog
      </Link>
      <section
        className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 sm:p-6"
        style={{ borderLeftWidth: '6px', borderLeftColor: brandColor }}
      >
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span
            className="text-xs font-semibold uppercase tracking-wide"
            style={{ color: brandColor }}
          >
            {String(tire?.brand || '--')}
          </span>
          <span className="text-[11px] text-zinc-500">MSPN {String(tire?.mspn ?? '--')}</span>
          <span className="text-[11px] text-zinc-500">·</span>
          <span className="text-[11px] text-zinc-500">LR {lr}</span>
          <span className="text-[11px] text-zinc-500">·</span>
          <span className="text-[11px] text-zinc-500">{categoryLabel}</span>
        </div>
        <div className="mt-2">
          <TireDescriptionCell description={tire?.description} pillTags={sidewallTags} />
        </div>
      </section>
    </div>
  )
}
