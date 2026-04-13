export function MarginFilters({
  brands,
  categories,
  useTags,
  lrs,
  brand,
  category,
  useTag,
  lr,
  onBrand,
  onCategory,
  onUseTag,
  onLr,
  minMargin,
  onMinMargin,
  deadStockOnly,
  onDeadStockOnly,
  hasActiveFilters,
  onClearAll,
}) {
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 sm:gap-6 sm:p-6">
      {hasActiveFilters && onClearAll ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800/80 pb-4">
          <p className="text-xs text-zinc-500">Filters are narrowing the table.</p>
          <button
            type="button"
            onClick={onClearAll}
            className="rounded-lg border border-zinc-600 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:border-zinc-500 hover:text-white"
          >
            Clear all filters
          </button>
        </div>
      ) : null}
      <div>
        <label htmlFor="min-margin" className="mb-2 flex flex-wrap items-baseline gap-2 text-sm font-normal text-zinc-300">
          <span>Min margin:</span>
          <span className="text-2xl font-semibold tabular-nums text-zinc-50">{minMargin}%</span>
        </label>
        <input
          id="min-margin"
          type="range"
          min={0}
          max={100}
          step={1}
          value={minMargin}
          onChange={(e) => onMinMargin(Number(e.target.value))}
          className="w-full accent-zinc-200"
        />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-col sm:gap-4 lg:flex-row lg:items-end">
        <div className="contents sm:flex sm:flex-1 sm:flex-wrap sm:gap-4 lg:border-r lg:border-zinc-800 lg:pr-6">
          <FilterSelect
            label="Brand"
            value={brand}
            onChange={onBrand}
            options={brands}
          />
          <FilterSelect
            label="Category"
            value={category}
            onChange={onCategory}
            options={categories}
          />
        </div>
        <div className="contents sm:flex sm:flex-1 sm:flex-wrap sm:gap-4">
          <FilterSelect label="LR" value={lr} onChange={onLr} options={lrs} />
          <FilterSelect
            label="Use tag"
            value={useTag}
            onChange={onUseTag}
            options={useTags}
          />
        </div>
      </div>
      {onDeadStockOnly != null ? (
        <label className="flex cursor-pointer items-center gap-2 pt-0 text-sm text-zinc-400 sm:pt-0">
          <input
            type="checkbox"
            checked={Boolean(deadStockOnly)}
            onChange={(e) => onDeadStockOnly(e.target.checked)}
            className="rounded border-zinc-600"
          />
          Dead stock only
        </label>
      ) : null}
    </div>
  )
}

function FilterSelect({ label, value, onChange, options }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-zinc-500">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-[44px] w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 sm:min-h-0"
      >
        <option value="">All</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  )
}
