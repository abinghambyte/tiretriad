const CHIP_KINDS = {
  inventory: 'bg-teal-500/15 text-teal-200 border-teal-700/40',
  kyle: 'bg-amber-500/15 text-amber-200 border-amber-700/40',
  ops: 'bg-rose-500/15 text-rose-200 border-rose-700/40',
  people: 'bg-emerald-500/15 text-emerald-200 border-emerald-700/40',
  neutral: 'bg-zinc-700/30 text-zinc-200 border-zinc-700/50',
}

const CHIP_BASE = 'inline-flex items-center rounded-full border px-3 py-1 text-xs'

function chipClass(kind) {
  return `${CHIP_BASE} ${CHIP_KINDS[kind] || CHIP_KINDS.neutral}`
}

/**
 * Activity ticker. Full-width horizontally-scrolling chip bar. Chips scroll
 * right-to-left on a 35s linear loop and pause on hover. Color-coded by
 * `kind`; unknown kinds render as `neutral`.
 */
export function ActivityTicker({ chips = [] }) {
  if (!Array.isArray(chips) || chips.length === 0) return null

  const doubled = [...chips, ...chips]

  return (
    <section
      aria-label="Activity ticker"
      aria-live="polite"
      aria-atomic="false"
      className="pc-card activity-ticker relative w-full overflow-hidden rounded-xl bg-zinc-900/60 py-2"
    >
      <style>{`
        @keyframes ticker-scroll {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        .activity-ticker .activity-ticker__track {
          animation: ticker-scroll 35s linear infinite;
        }
        .activity-ticker:hover .activity-ticker__track {
          animation: none;
        }
      `}</style>
      <div className="activity-ticker__track flex min-w-max gap-3 whitespace-nowrap px-3">
        {doubled.map((chip, i) => (
          <span
            key={`${chip.id}-${i}`}
            className={chipClass(chip.kind)}
          >
            {chip.label}
          </span>
        ))}
      </div>
    </section>
  )
}
