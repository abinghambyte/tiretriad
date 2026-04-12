import { useCallback, useState } from 'react'

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
  category,
  useTag,
  lr,
  minMargin,
  onApplyPreset,
}) {
  const [presets, setPresets] = useState(() => readPresets())

  const saveCurrent = useCallback(() => {
    const name = window.prompt('Name for this filter preset')
    if (!name || !String(name).trim()) return
    const snapshot = {
      id: newId(),
      name: String(name).trim(),
      brand: brand || '',
      category: category || '',
      useTag: useTag || '',
      lr: lr || '',
      minMargin: Number(minMargin) || 0,
    }
    setPresets((prev) => {
      const next = [...prev, snapshot]
      writePresets(next)
      return next
    })
  }, [brand, category, useTag, lr, minMargin])

  const apply = useCallback(
    (p) => {
      onApplyPreset({
        brand: p.brand ?? '',
        category: p.category ?? '',
        useTag: p.useTag ?? '',
        lr: p.lr ?? '',
        minMargin: Number(p.minMargin) || 0,
      })
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
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-800/80 bg-zinc-900/30 px-4 py-3">
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
      <div className="flex flex-wrap items-center gap-2">
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
