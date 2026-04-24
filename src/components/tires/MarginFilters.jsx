import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const STORAGE_KEY = 'skedaddle-tire-margin-presets-v1'

function readPresets() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writePresets(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch (e) {
    console.error(e)
  }
}

function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return `p-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

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
  onApplyPreset,
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

      {onApplyPreset != null ? (
        <FilterPresetsSection
          brand={brand}
          useTagFilters={useTagFilters}
          lrFilters={lrFilters}
          minMargin={minMargin}
          needsReposting={needsReposting}
          onApplyPreset={onApplyPreset}
        />
      ) : null}
    </div>
  )
}

function FilterPresetsSection({ brand, useTagFilters, lrFilters, minMargin, needsReposting, onApplyPreset }) {
  const [presets, setPresets] = useState(() => readPresets())
  const [namingOpen, setNamingOpen] = useState(false)
  const [draftName, setDraftName] = useState('')
  const nameInputRef = useRef(null)

  useEffect(() => {
    if (namingOpen) {
      queueMicrotask(() => nameInputRef.current?.focus())
    }
  }, [namingOpen])

  const openNaming = useCallback(() => {
    setDraftName('')
    setNamingOpen(true)
  }, [])

  const cancelNaming = useCallback(() => {
    setNamingOpen(false)
    setDraftName('')
  }, [])

  const commitName = useCallback(() => {
    const trimmed = String(draftName || '').trim()
    if (!trimmed) return
    const snapshot = {
      id: newId(),
      name: trimmed,
      brand: brand || '',
      lrFilters: [...lrFilters],
      useTagFilters: [...useTagFilters],
      minMargin: Number(minMargin) || 0,
      needsReposting: Boolean(needsReposting),
    }
    setPresets((prev) => {
      const next = [...prev, snapshot]
      writePresets(next)
      return next
    })
    setNamingOpen(false)
    setDraftName('')
  }, [draftName, brand, useTagFilters, lrFilters, minMargin, needsReposting])

  const onNameKeyDown = useCallback(
    (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        commitName()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        cancelNaming()
      }
    },
    [commitName, cancelNaming],
  )

  const remove = useCallback((id) => {
    setPresets((prev) => {
      const next = prev.filter((x) => x.id !== id)
      writePresets(next)
      return next
    })
  }, [])

  return (
    <div className="border-t border-zinc-800/60 pt-2.5 sm:pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="shrink-0 text-xs font-medium text-zinc-400">Saved filters</span>
        {presets.map((p) => (
          <span
            key={p.id}
            className="inline-flex items-center gap-1 rounded-full border border-zinc-700 bg-zinc-950/80 pl-2.5 pr-1 text-xs text-zinc-200"
          >
            <button
              type="button"
              onClick={() => onApplyPreset(p)}
              className="max-w-[140px] truncate py-1 text-left font-medium hover:text-amber-200/95"
              title={`Load "${p.name}"`}
            >
              {p.name}
            </button>
            <button
              type="button"
              onClick={() => remove(p.id)}
              className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-red-300"
              aria-label={`Delete preset ${p.name}`}
            >
              ×
            </button>
          </span>
        ))}
        {presets.length === 0 ? (
          <span className="text-xs text-zinc-600">None saved.</span>
        ) : null}
        {namingOpen ? (
          <div className="flex items-center gap-2">
            <input
              ref={nameInputRef}
              type="text"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={onNameKeyDown}
              placeholder="Preset name"
              className="w-36 rounded-lg border border-zinc-600 bg-zinc-950 px-2.5 py-1 text-xs text-zinc-100 outline-none focus:border-amber-600/50"
            />
            <button
              type="button"
              onClick={commitName}
              disabled={!draftName.trim()}
              className="rounded-lg bg-amber-600 px-2.5 py-1 text-xs font-semibold text-zinc-950 hover:bg-amber-500 disabled:opacity-50"
            >
              Save
            </button>
            <button
              type="button"
              onClick={cancelNaming}
              className="rounded-lg border border-zinc-600 px-2.5 py-1 text-xs font-medium text-zinc-300 hover:border-zinc-500"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={openNaming}
            className="rounded-lg border border-amber-900/50 bg-amber-950/25 px-2.5 py-1 text-xs font-medium text-amber-100 hover:bg-amber-950/45"
          >
            Save current
          </button>
        )}
      </div>
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
        className="min-w-0 flex-1 accent-amber-400"
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
      <span className="shrink-0 text-xs font-medium text-zinc-400">{label}</span>
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
            {key || '--'}
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
