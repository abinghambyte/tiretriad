import { useCallback, useState } from 'react'
import { useMediaQuery } from '../../hooks/useMediaQuery.js'

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

export function FilterPresetsBar({
  brand,
  useTagFilters,
  lrFilters,
  minMargin,
  onApplyPreset,
}) {
  const [presets, setPresets] = useState(() => readPresets())
  const [compactMenuOpen, setCompactMenuOpen] = useState(false)
  const isNarrow = useMediaQuery('(max-width: 639px)')

  const saveCurrent = useCallback(() => {
    const name = window.prompt('Name for this filter preset')
    if (!name || !String(name).trim()) return
    const snapshot = {
      id: newId(),
      name: String(name).trim(),
      brand: brand || '',
      lrFilters: [...lrFilters],
      useTagFilters: [...useTagFilters],
      minMargin: Number(minMargin) || 0,
    }
    setPresets((prev) => {
      const next = [...prev, snapshot]
      writePresets(next)
      return next
    })
  }, [brand, useTagFilters, lrFilters, minMargin])

  const apply = useCallback(
    (p) => {
      onApplyPreset(p)
    },
    [onApplyPreset],
  )

  const remove = useCallback((id) => {
    setPresets((prev) => {
      const next = prev.filter((x) => x.id !== id)
      writePresets(next)
      return next
    })
  }, [])

  if (presets.length === 0) {
    if (isNarrow) {
      return (
        <div className="relative flex justify-end rounded-xl border border-zinc-800/40 bg-transparent px-1 py-1 sm:hidden">
          <button
            type="button"
            title="Filter presets"
            aria-expanded={compactMenuOpen}
            aria-haspopup="true"
            onClick={() => setCompactMenuOpen((o) => !o)}
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900/50 text-lg text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
          >
            <span aria-hidden>⚙</span>
            <span className="sr-only">Filter presets</span>
          </button>
          {compactMenuOpen ? (
            <div className="absolute right-0 top-full z-20 mt-1 w-56 rounded-lg border border-zinc-700 bg-zinc-900 p-3 shadow-xl">
              <p className="text-xs text-zinc-500">No saved presets yet.</p>
              <button
                type="button"
                onClick={() => {
                  setCompactMenuOpen(false)
                  saveCurrent()
                }}
                className="mt-2 w-full rounded-lg border border-zinc-600 py-2 text-xs font-medium text-zinc-200 hover:border-zinc-500"
              >
                Save current filters
              </button>
            </div>
          ) : null}
        </div>
      )
    }
    return (
      <div className="hidden flex-wrap items-center gap-3 rounded-xl border border-zinc-800/80 bg-zinc-900/30 px-4 py-3 sm:flex">
        <p className="text-xs text-zinc-500">No saved filter presets yet.</p>
        <button
          type="button"
          onClick={saveCurrent}
          className="rounded-lg border border-zinc-600 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:border-zinc-500 hover:text-white"
        >
          Save current filters
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-zinc-800/80 bg-zinc-900/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Presets
        </span>
        {presets.map((p) => (
          <span
            key={p.id}
            className="inline-flex items-center gap-1 rounded-full border border-zinc-700 bg-zinc-950/80 pl-2.5 pr-1 text-xs text-zinc-200"
          >
            <button
              type="button"
              onClick={() => apply(p)}
              className="max-w-[140px] truncate py-1 text-left font-medium hover:text-amber-200/95"
              title={`Load “${p.name}”`}
            >
              {p.name}
            </button>
            <button
              type="button"
              onClick={() => remove(p.id)}
              className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-red-300"
              aria-label={`Delete preset ${p.name}`}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <button
        type="button"
        onClick={saveCurrent}
        className="shrink-0 self-start rounded-lg border border-amber-900/50 bg-amber-950/25 px-3 py-1.5 text-xs font-medium text-amber-100 hover:bg-amber-950/45 sm:self-center"
      >
        Save current filters
      </button>
    </div>
  )
}
