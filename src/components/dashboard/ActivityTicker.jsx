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
 * Activity ticker. Full-width horizontally-scrolling chip bar. Chips scroll
 * right-to-left on a 35s linear loop and pause on hover. Color-coded by
 * `kind`; unknown kinds render as `neutral`.
 */
export function ActivityTicker({ chips = [] }) {
  if (!Array.isArray(chips) || chips.length === 0) return null

  // Duplicate the chip list so the scroll loop can wrap seamlessly.
  // Keys include an `a`/`b` copy prefix plus the index so collisions
  // are impossible even if two source chips happen to share an id.
  const doubled = [
    ...chips.map((chip, i) => ({ chip, key: `a-${i}` })),
    ...chips.map((chip, i) => ({ chip, key: `b-${i}` })),
  ]

  return (
    <section
      aria-label="Activity ticker"
      aria-live="polite"
      aria-atomic="false"
      className="pc-card activity-ticker relative w-full overflow-hidden rounded-xl bg-zinc-900/60 py-2"
    >
      <div className="activity-ticker__track flex min-w-max gap-3 whitespace-nowrap px-3">
        {doubled.map(({ chip, key }) =>
          chip.href ? (
            <Link key={key} to={chip.href} className={chipClass(chip.kind)}>
              {chip.label}
            </Link>
          ) : (
            <span key={key} className={chipClass(chip.kind)}>
              {chip.label}
            </span>
          ),
        )}
      </div>
    </section>
  )
}
