import { useMemo, useState } from 'react'

export function MarginFilters({
  brands,
  useTags,
  lrs,
  brand,
  useTagFilters,
  lrFilters,
  onBrand,
  onUseTagFilters,
  onLrFilters,
  minMargin,
  onMinMargin,
  needsReposting,
  onNeedsReposting,
  hasActiveFilters,
  onClearAll,
}) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-3 sm:gap-3 sm:p-3.5">
      {/* Row 1: min margin, brand, needs-reposting, clear. One compact line on sm+. */}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <InlineMinMargin value={minMargin} onChange={onMinMargin} />
        <InlineBrand value={brand} onChange={onBrand} options={brands} />
        {onNeedsReposting != null ? (
          <InlineToggle
            checked={Boolean(needsReposting)}
            onChange={onNeedsReposting}
            label="Needs reposting"
            title="Previously posted, now stale on all platforms"
          />
        ) : null}
        <div className="sm:ml-auto">
          {hasActiveFilters && onClearAll ? (
            <button
              type="button"
              onClick={onClearAll}
              className="rounded-lg border border-zinc-700 px-2.5 py-1 text-[11px] font-medium text-zinc-300 hover:border-zinc-500 hover:text-zinc-100"
            >
              Clear filters
            </button>
          ) : null}
        </div>
      </div>

      {/* Row 2: chip pickers for LR and tags. Hidden when the option set is empty. */}
      {lrs.length > 0 ? (
        <ChipRow
          label="LR"
          options={lrs}
          selected={lrFilters}
          onChange={onLrFilters}
          ariaLabel="Load range"
        />
      ) : null}
      {useTags.length > 0 ? (
        <ChipRow
          label="Tags"
          options={useTags}
          selected={useTagFilters}
          onChange={onUseTagFilters}
          ariaLabel="Use tags"
          collapseAfter={14}
        />
      ) : null}
    </div>
  )
}

function InlineMinMargin({ value, onChange }) {
  return (
    <label htmlFor="min-margin" className="flex min-w-[14rem] items-center gap-2 text-xs text-zinc-400 sm:flex-1">
      <span className="shrink-0">Min margin</span>
      <input
        id="min-margin"
        type="range"
        min={0}
        max={100}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={`Minimum margin filter, currently ${value}%`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
        className="min-w-0 flex-1 accent-zinc-200"
      />
      <span className="w-10 shrink-0 text-right text-sm font-semibold tabular-nums text-zinc-100">
        {value}%
      </span>
    </label>
  )
}

function InlineBrand({ value, onChange, options }) {
  return (
    <label className="flex items-center gap-2 text-xs text-zinc-400">
      <span className="shrink-0">Brand</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm text-zinc-100 outline-none focus:border-zinc-500"
      >
        <option value="">All</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  )
}

function InlineToggle({ checked, onChange, label, title }) {
  return (
    <label
      className="flex cursor-pointer items-center gap-1.5 rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:border-zinc-500 hover:text-zinc-100"
      title={title}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-3.5 rounded border-zinc-600"
      />
      <span>{label}</span>
    </label>
  )
}

/**
 * Horizontal chip picker. Shows all options as toggleable pills in a single
 * wrap-aware row. Long lists collapse behind a "+N more" toggle so the filter
 * bar never balloons vertically.
 */
function ChipRow({ label, options, selected, onChange, ariaLabel, collapseAfter = 0 }) {
  const [expanded, setExpanded] = useState(false)
  const selectedSet = useMemo(() => new Set(selected.map(String)), [selected])
  const shouldCollapse = collapseAfter > 0 && options.length > collapseAfter && !expanded
  const visible = shouldCollapse ? options.slice(0, collapseAfter) : options
  const hidden = shouldCollapse ? options.length - collapseAfter : 0

  function toggle(v) {
    const s = String(v)
    if (selectedSet.has(s)) {
      onChange(selected.filter((x) => x !== s))
    } else {
      onChange([...selected, s].sort((a, b) => String(a).localeCompare(String(b))))
    }
  }

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="flex flex-wrap items-center gap-1.5 border-t border-zinc-800/60 pt-2 sm:pt-2.5"
    >
      <span className="shrink-0 text-xs font-medium text-zinc-500">{label}</span>
      {visible.map((o) => {
        const key = String(o)
        const active = selectedSet.has(key)
        return (
          <button
            key={key}
            type="button"
            onClick={() => toggle(key)}
            aria-pressed={active}
            className={`rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors ${
              active
                ? 'bg-amber-500/20 text-amber-200 ring-1 ring-amber-500/40'
                : 'bg-zinc-800/60 text-zinc-300 ring-1 ring-zinc-700/60 hover:bg-zinc-800 hover:text-zinc-100'
            }`}
          >
            {key || '—'}
          </button>
        )
      })}
      {hidden > 0 ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="rounded-full px-2 py-0.5 text-[11px] font-medium text-zinc-400 hover:text-zinc-200"
        >
          +{hidden} more
        </button>
      ) : null}
      {!shouldCollapse && collapseAfter > 0 && options.length > collapseAfter && expanded ? (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="rounded-full px-2 py-0.5 text-[11px] font-medium text-zinc-400 hover:text-zinc-200"
        >
          Show less
        </button>
      ) : null}
      {selected.length > 0 ? (
        <button
          type="button"
          onClick={() => onChange([])}
          className="ml-auto shrink-0 text-[11px] font-medium text-violet-400 hover:underline"
        >
          Clear {label.toLowerCase()}
        </button>
      ) : null}
    </div>
  )
}
