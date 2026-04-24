import { Link } from 'react-router-dom'

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
 * Activity ticker. Full-width horizontally-scrolling chip bar. Each chip is
 * rendered exactly once; the track is pre-padded by a full container-width
 * so the first chip enters from offscreen-right. Animation translates the
 * track from 0 to -100% of its own width, then loops with a viewport-wide
 * breathing gap. Pauses on hover or focus. Color-coded by `kind`; unknown
 * kinds render as `neutral`.
 */
export function ActivityTicker({ chips = [] }) {
  if (!Array.isArray(chips) || chips.length === 0) return null

  return (
    <section
      aria-label="Activity ticker"
      aria-live="polite"
      aria-atomic="false"
      className="pc-card activity-ticker relative w-full overflow-hidden rounded-xl bg-zinc-900/60 py-2"
    >
      <div className="activity-ticker__track flex min-w-max items-center gap-3 whitespace-nowrap pl-[100%] pr-6">
        {chips.map((chip, i) =>
          chip.href ? (
            <Link key={chip.id ?? i} to={chip.href} className={chipClass(chip.kind)}>
              {chip.label}
            </Link>
          ) : (
            <span key={chip.id ?? i} className={chipClass(chip.kind)}>
              {chip.label}
            </span>
          ),
        )}
      </div>
    </section>
  )
}
