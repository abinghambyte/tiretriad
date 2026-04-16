import { useMemo, useState } from 'react'

export function MarginFilters({
  brands,
  categories,
  useTags,
  lrs,
  brand,
  categoryFilters,
  useTagFilters,
  lrFilters,
  onBrand,
  onCategoryFilters,
  onUseTagFilters,
  onLrFilters,
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
        <label
          htmlFor="min-margin"
          className="mb-2 flex flex-wrap items-baseline gap-2 text-sm font-normal text-zinc-300"
        >
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-2 lg:gap-6">
        <div className="flex flex-col gap-4 lg:border-r lg:border-zinc-800 lg:pr-6">
          <FilterSelect label="Brand" value={brand} onChange={onBrand} options={brands} />
          <FilterMultiSelect
            label="Category"
            hint="Check one or more values. A row is shown if its category equals any of them (OR)."
            searchPlaceholder="Search categories…"
            options={categories}
            selected={categoryFilters}
            onChange={onCategoryFilters}
          />
        </div>
        <div className="flex flex-col gap-4">
          <FilterMultiSelect
            label="Load range (LR)"
            hint="Check one or more values. A row is shown if its LR equals any of them (OR)."
            searchPlaceholder="Search LR…"
            options={lrs}
            selected={lrFilters}
            onChange={onLrFilters}
          />
          <FilterMultiSelect
            label="Use tags"
            hint="Check one or more tags. A row is shown if it has at least one of the checked tags (OR)."
            searchPlaceholder="Search tags…"
            options={useTags}
            selected={useTagFilters}
            onChange={onUseTagFilters}
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

/**
 * @param {object} props
 * @param {string} props.label
 * @param {string} [props.hint]
 * @param {string} [props.searchPlaceholder]
 * @param {string[]} props.options
 * @param {string[]} props.selected
 * @param {(next: string[]) => void} props.onChange
 */
function FilterMultiSelect({ label, hint, searchPlaceholder, options, selected, onChange }) {
  const [q, setQ] = useState('')
  const qLower = q.trim().toLowerCase()
  const filtered = useMemo(
    () =>
      options.filter((o) =>
        qLower ? String(o || '').toLowerCase().includes(qLower) : true,
      ),
    [options, qLower],
  )

  function toggle(v) {
    const s = String(v)
    if (selected.includes(s)) {
      onChange(selected.filter((x) => x !== s))
    } else {
      onChange([...selected, s].sort((a, b) => String(a).localeCompare(String(b))))
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-zinc-500">{label}</span>
        {selected.length > 0 ? (
          <button
            type="button"
            onClick={() => onChange([])}
            className="shrink-0 text-[10px] font-medium text-violet-400 hover:underline"
          >
            Clear
          </button>
        ) : null}
      </div>
      {hint ? <p className="text-[10px] leading-snug text-zinc-600">{hint}</p> : null}
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={searchPlaceholder || 'Filter list…'}
        className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-zinc-500"
        autoComplete="off"
      />
      <div className="max-h-44 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950/80 p-2 sm:max-h-52">
        {filtered.length === 0 ? (
          <p className="px-1 py-2 text-xs text-zinc-500">No values match this search.</p>
        ) : (
          <ul className="space-y-0.5">
            {filtered.map((o) => {
              const key = String(o)
              const checked = selected.includes(key)
              return (
                <li key={key}>
                  <label className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800/70">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(key)}
                      className="size-4 shrink-0 rounded border-zinc-600"
                    />
                    <span className="min-w-0 break-words">{key || '—'}</span>
                  </label>
                </li>
              )
            })}
          </ul>
        )}
      </div>
      {selected.length > 0 ? (
        <p className="text-[10px] text-zinc-500">{selected.length} value(s) checked</p>
      ) : null}
    </div>
  )
}
