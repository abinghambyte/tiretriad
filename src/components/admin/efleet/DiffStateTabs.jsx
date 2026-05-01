const STATES = [
  { key: 'mismatched',  label: 'Mismatched',  active: 'border-red-500 bg-red-950/30 text-red-200',     idle: 'border-transparent text-red-400/60 hover:text-red-300' },
  { key: 'invOnly',     label: 'Inv only',    active: 'border-amber-500 bg-amber-950/30 text-amber-200', idle: 'border-transparent text-amber-400/60 hover:text-amber-300' },
  { key: 'eFleetOnly',  label: 'eFleet only', active: 'border-blue-500 bg-blue-950/30 text-blue-200',   idle: 'border-transparent text-blue-400/60 hover:text-blue-300' },
  { key: 'aligned',     label: 'Aligned',     active: 'border-emerald-500 bg-emerald-950/30 text-emerald-200', idle: 'border-transparent text-emerald-400/60 hover:text-emerald-300' },
]

/**
 * Sub-tab strip for /admin/efleet > Diff. Each tab is keyed to a diff bucket
 * with state-specific color tokens (red/amber/blue/emerald). Click on the
 * active tab is a no-op. Counts render as part of the label.
 */
export function DiffStateTabs({ counts, active, onChange }) {
  return (
    <div role="tablist" aria-label="Diff state" className="flex flex-wrap gap-2 border-b border-zinc-800 pb-2">
      {STATES.map((s) => {
        const selected = s.key === active
        return (
          <button
            key={s.key}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => {
              if (!selected) onChange(s.key)
            }}
            className={`inline-flex items-center gap-2 rounded-t-lg border-b-2 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors ${
              selected ? s.active : s.idle
            }`}
          >
            <span>{s.label}</span>
            <span className="font-mono tabular-nums text-[11px] opacity-90">{counts[s.key] ?? 0}</span>
          </button>
        )
      })}
    </div>
  )
}
