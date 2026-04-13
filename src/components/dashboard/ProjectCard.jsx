import { Link } from 'react-router-dom'

const STATUS_STYLES = {
  Live: 'bg-emerald-500/12 text-emerald-300 ring-1 ring-emerald-500/25',
  Preview: 'bg-sky-500/12 text-sky-300 ring-1 ring-sky-500/25',
  Buildout: 'bg-amber-500/12 text-amber-200 ring-1 ring-amber-500/30',
  Internal: 'bg-violet-500/12 text-violet-300 ring-1 ring-violet-500/25',
  Locked: 'bg-zinc-700/40 text-zinc-400 ring-1 ring-zinc-600/35',
}

const ACCENT_BAR = {
  amber: 'from-amber-500/90 to-amber-600/40',
  cyan: 'from-cyan-400/90 to-cyan-600/40',
  blue: 'from-blue-500/90 to-blue-700/40',
  violet: 'from-violet-500/90 to-violet-700/40',
  emerald: 'from-emerald-500/90 to-emerald-700/40',
  fuchsia: 'from-fuchsia-500/90 to-fuchsia-700/40',
}

const ACCENT_GLOW = {
  amber: 'group-hover:shadow-amber-500/8',
  cyan: 'group-hover:shadow-cyan-500/8',
  blue: 'group-hover:shadow-blue-500/8',
  violet: 'group-hover:shadow-violet-500/8',
  emerald: 'group-hover:shadow-emerald-500/8',
  fuchsia: 'group-hover:shadow-fuchsia-500/8',
}

const ACCENT_HALO = {
  amber: 'from-amber-400/25 to-transparent',
  cyan: 'from-cyan-400/25 to-transparent',
  blue: 'from-blue-400/25 to-transparent',
  violet: 'from-violet-400/25 to-transparent',
  emerald: 'from-emerald-400/25 to-transparent',
  fuchsia: 'from-fuchsia-400/25 to-transparent',
}

/**
 * @param {object} props
 * @param {string} props.title
 * @param {string} props.description
 * @param {string} props.stat
 * @param {'Live'|'Preview'|'Buildout'|'Internal'|'Locked'} props.status
 * @param {'amber'|'cyan'|'blue'|'violet'|'emerald'|'fuchsia'} props.accent
 * @param {import('react').ReactNode} props.icon
 * @param {string} [props.to]
 * @param {boolean} [props.locked] View-only or limited access (shows lock on card)
 */
export function ProjectCard({
  title,
  description,
  stat,
  status,
  accent,
  icon,
  to,
  locked,
}) {
  const clickable = Boolean(to)
  const statusClass = STATUS_STYLES[status] ?? STATUS_STYLES.Internal
  const barClass = ACCENT_BAR[accent] ?? ACCENT_BAR.amber
  const glowClass = ACCENT_GLOW[accent] ?? ''
  const haloClass = ACCENT_HALO[accent] ?? ACCENT_HALO.amber

  const inner = (
    <article
      className={[
        'group relative flex h-full min-h-[168px] flex-col overflow-hidden rounded-2xl border bg-zinc-950/80 p-5 transition duration-300 sm:min-h-[220px] sm:p-6',
        clickable
          ? `cursor-pointer border-zinc-700/90 hover:border-zinc-500 hover:bg-zinc-900/70 hover:shadow-xl hover:shadow-black/50 ${glowClass}`
          : 'cursor-not-allowed border-zinc-800/80 bg-zinc-950/50 opacity-60 saturate-50 hover:border-zinc-800 hover:bg-zinc-950/55',
      ].join(' ')}
      aria-disabled={!clickable}
    >
      {!clickable ? (
        <div
          className="pointer-events-none absolute inset-0 z-[1] rounded-2xl bg-[repeating-linear-gradient(-12deg,transparent,transparent_14px,rgba(255,255,255,0.04)_14px,rgba(255,255,255,0.04)_15px)] opacity-90"
          aria-hidden
        />
      ) : null}
      <div
        className={`pointer-events-none absolute left-0 top-0 h-full w-1 bg-gradient-to-b ${barClass} ${!clickable ? 'opacity-50' : ''}`}
        aria-hidden
      />
      {clickable ? (
        <div
          className={`pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-gradient-to-bl ${haloClass} opacity-40 blur-2xl transition duration-500 group-hover:opacity-70`}
          aria-hidden
        />
      ) : null}

      <div className="relative z-[2] mb-4 flex items-start justify-between gap-3 pl-2">
        <div
          className={`flex h-11 w-11 items-center justify-center rounded-xl border border-zinc-700/60 bg-zinc-900/80 text-zinc-200 shadow-inner shadow-black/20 transition ${clickable ? 'group-hover:scale-[1.03] group-hover:border-zinc-600/80 group-hover:bg-zinc-800/80' : 'opacity-80'}`}
        >
          {icon}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {locked && clickable ? (
            <span
              className="rounded-full border border-zinc-600/80 bg-zinc-900/90 px-2 py-0.5 text-[10px] text-zinc-400"
              title="View only"
            >
              View only
            </span>
          ) : null}
          <span
            className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${statusClass}`}
          >
            {status}
          </span>
        </div>
      </div>

      <div className="relative z-[2] flex flex-1 flex-col pl-2">
        <h2 className="text-lg font-semibold tracking-tight text-zinc-50">
          {title}
        </h2>
        <p className="mt-2 flex-1 text-sm leading-relaxed text-zinc-400">
          {description}
        </p>
        <div className="mt-5 border-t border-zinc-800/80 pt-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500">
            Signal
          </p>
          <p className="mt-1 font-mono text-sm tabular-nums text-zinc-200">
            {stat}
          </p>
        </div>
        {clickable ? (
          <span className="mt-3 text-xs font-medium text-zinc-500 transition group-hover:text-zinc-300">
            Enter module →
          </span>
        ) : (
          <span className="mt-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-600">
            Unavailable · under construction
          </span>
        )}
      </div>
    </article>
  )

  if (clickable && to) {
    return (
      <Link
        to={to}
        className="block h-full rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
      >
        {inner}
      </Link>
    )
  }

  return <div className="h-full">{inner}</div>
}
