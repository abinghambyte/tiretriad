import { brandColorCssVar } from '../../utils/brandColor.js'

/**
 * Tab-style pill row of brand aggregates above the catalog table. Clicking
 * a pill sets the brand filter; clicking the leading All pill clears it.
 * Click on the already-selected pill is a no-op (matches CategoryTabs).
 */
export function BrandStatsRow({
  brands,
  total,
  selectedBrand,
  onBrandChange,
}) {
  const items = [
    { brand: null, label: 'All', count: total, color: 'var(--color-zinc-300)' },
    ...brands.map((b) => ({
      brand: b.brand,
      label: b.brand,
      count: b.count,
      avgListingMarginPct: b.avgListingMarginPct,
      color: brandColorCssVar(b.brand),
    })),
  ]
  return (
    <div
      role="tablist"
      aria-label="Brand filter"
      className="flex flex-nowrap gap-2 overflow-x-auto scroll-smooth py-2 [scroll-snap-type:x_mandatory] sm:flex-wrap sm:overflow-visible"
    >
      {items.map((it) => {
        const selected = it.brand === selectedBrand
        const handleClick = () => {
          if (selected) return
          onBrandChange(it.brand)
        }
        const activeStyle = selected
          ? {
              borderColor: it.color,
              color: it.color,
              backgroundColor: `color-mix(in oklab, ${it.color} 18%, transparent)`,
            }
          : { borderColor: it.color, color: it.color }
        return (
          <button
            key={it.label}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={handleClick}
            style={activeStyle}
            className={`inline-flex shrink-0 [scroll-snap-align:start] flex-col gap-0.5 rounded-lg border px-3 py-1.5 text-left transition-transform hover:-translate-y-px ${
              selected ? 'font-semibold shadow-sm' : 'font-medium'
            }`}
          >
            <span className="text-[11px] uppercase tracking-wide leading-none">{it.label}</span>
            <span className="font-mono text-base leading-none tabular-nums">{it.count}</span>
            {it.avgListingMarginPct != null ? (
              <span className="hidden text-[10px] font-normal opacity-80 leading-none sm:block">
                {it.avgListingMarginPct.toFixed(1)}% avg margin
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
