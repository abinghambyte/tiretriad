import { EXPECTED_BRANDS } from '../../constants/tireCategory.js'
import { brandColorCssVar } from '../../utils/brandColor.js'

/**
 * Dashboard hero strip showing brand portfolio at-a-glance.
 *
 * Renders all EXPECTED_BRANDS (not just stocked) so a 0-SKU brand surfaces
 * with a NOT STOCKED badge. Clicking a stocked card jumps to the catalog
 * pre-filtered to that brand.
 */
export function BrandTierStrip({ aggregates, navigate }) {
  const byBrand = new Map(aggregates.brands.map((b) => [b.brand, b]))
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
      {EXPECTED_BRANDS.map((brand) => {
        const b = byBrand.get(brand)
        const stocked = !!(b && b.count > 0)
        const color = brandColorCssVar(brand)
        const onClick = stocked ? () => navigate(`/tires?brand=${brand}`) : undefined
        return (
          <button
            key={brand}
            type="button"
            data-brand-card
            data-stocked={stocked ? 'true' : 'false'}
            onClick={onClick}
            disabled={!stocked}
            style={
              stocked
                ? { borderColor: color, color }
                : undefined
            }
            className={`flex flex-col items-start gap-1 rounded-xl border-2 px-4 py-3 text-left transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:hover:translate-y-0 ${
              stocked ? 'shadow-sm' : 'border-red-500 text-red-500'
            }`}
          >
            <span className="text-[11px] font-semibold uppercase tracking-wide">{brand}</span>
            <span className="font-mono text-2xl font-bold tabular-nums">
              {stocked ? b.count : 0}
              <span className="ml-1 text-xs font-normal opacity-70">SKUs</span>
            </span>
            {stocked && b.avgListingMarginPct != null ? (
              <span className="text-xs opacity-80">{b.avgListingMarginPct.toFixed(1)}% avg margin</span>
            ) : null}
            {!stocked ? (
              <span
                data-not-stocked
                className="rounded bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-700 dark:bg-red-950/40 dark:text-red-300"
              >
                NOT STOCKED
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
