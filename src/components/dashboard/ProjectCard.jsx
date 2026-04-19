import { Link } from 'react-router-dom'

const STATUS_STYLES = {
  Live: 'bg-emerald-500/12 text-emerald-300 ring-1 ring-emerald-500/25',
  Preview: 'bg-sky-500/12 text-sky-300 ring-1 ring-sky-500/25',
  Buildout: 'bg-amber-500/12 text-amber-200 ring-1 ring-amber-500/30',
  Internal: 'bg-violet-500/12 text-violet-300 ring-1 ring-violet-500/25',
  Locked: 'bg-zinc-700/40 text-zinc-400 ring-1 ring-zinc-600/35',
}

const ACCENT_BAR = {
  teal: 'from-teal-500/90 to-teal-800/35',
  orange: 'from-orange-500/90 to-orange-800/40',
  slate: 'from-slate-500/90 to-slate-800/40',
  green: 'from-green-600/90 to-emerald-950/45',
  rose: 'from-rose-600/90 to-rose-950/45',
  amber: 'from-amber-500/90 to-amber-800/40',
}

const ACCENT_HALO = {
  teal: 'from-teal-400/22 to-transparent',
  orange: 'from-orange-400/22 to-transparent',
  slate: 'from-slate-400/20 to-transparent',
  green: 'from-green-400/22 to-transparent',
  rose: 'from-rose-400/22 to-transparent',
  amber: 'from-amber-400/22 to-transparent',
}

const ACCENT_CTA_RING = {
  teal: 'hover:border-teal-500/45 hover:ring-teal-500/25 focus-visible:ring-teal-500/40',
  orange: 'hover:border-orange-500/45 hover:ring-orange-500/25 focus-visible:ring-orange-500/40',
  slate: 'hover:border-slate-400/45 hover:ring-slate-400/20 focus-visible:ring-slate-400/40',
  green: 'hover:border-green-500/45 hover:ring-green-500/25 focus-visible:ring-green-500/40',
  rose: 'hover:border-rose-500/45 hover:ring-rose-500/25 focus-visible:ring-rose-500/40',
  amber: 'hover:border-amber-500/45 hover:ring-amber-500/25 focus-visible:ring-amber-500/40',
}

/**
 * Dashboard module card. The card itself is a non-interactive region; the
 * single CTA button at the bottom is the only focusable/click target, which
 * avoids nested-interactive accessibility pitfalls.
 *
 * @param {object} props
 * @param {string} props.title
 * @param {string} props.description
 * @param {string} props.stat
 * @param {string} [props.statLabel]
 * @param {string} [props.ctaLabel]
 * @param {'Live'|'Preview'|'Buildout'|'Internal'|'Locked'} props.status
 * @param {'teal'|'orange'|'slate'|'green'|'rose'|'amber'} props.accent
 * @param {import('react').ReactNode} props.icon
 * @param {string} [props.to]
 * @param {boolean} [props.locked] View-only or limited access (shows lock on card)
 * @param {boolean} [props.compact] Smaller module tiles (e.g. bottom-of-dashboard nav)
 */
export function ProjectCard({
  title,
  description,
  stat,
  statLabel = 'Snapshot',
  ctaLabel,
  status,
  accent,
  icon,
  to,
  locked,
  compact = false,
}) {
  const clickable = Boolean(to)
  const statusClass = STATUS_STYLES[status] ?? STATUS_STYLES.Internal
  const barClass = ACCENT_BAR[accent] ?? ACCENT_BAR.teal
  const haloClass = ACCENT_HALO[accent] ?? ACCENT_HALO.teal
  const ctaRing = ACCENT_CTA_RING[accent] ?? ACCENT_CTA_RING.teal

  const primaryCta = clickable ? (ctaLabel ?? 'Open') : (ctaLabel ?? 'Unavailable · under construction')

  const cta = clickable && to ? (
    <Link
      to={to}
      className={[
        'mt-4 flex w-full items-center justify-center rounded-xl border bg-zinc-900/70 py-3 text-sm font-bold tracking-tight ring-1 ring-transparent transition outline-none',
        'border-zinc-600/90 text-zinc-50 hover:bg-zinc-800/90',
        `${ctaRing} focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950`,
      ].join(' ')}
    >
      {primaryCta}
    </Link>
  ) : (
    <div
      className="mt-4 flex w-full items-center justify-center rounded-xl border border-zinc-800/80 bg-zinc-900/70 py-3 text-sm font-bold tracking-tight text-zinc-500"
      aria-disabled
    >
      {primaryCta}
    </div>
  )

  return (
    <article
      className={[
        compact
          ? 'group relative flex h-full min-h-[132px] flex-col overflow-hidden rounded-xl border border-zinc-800/90 bg-zinc-950/75 p-4 transition-all duration-200 ease-out sm:min-h-[150px]'
          : 'group relative flex h-full min-h-[168px] flex-col overflow-hidden rounded-2xl border bg-zinc-950/80 p-5 transition-all duration-200 ease-out sm:min-h-[220px] sm:p-6',
        clickable
          ? 'border-zinc-700/90'
          : 'border-zinc-800/80 bg-zinc-950/50 opacity-60 saturate-50',
      ].join(' ')}
      aria-disabled={!clickable}
    >
      {!clickable ? (
        <div
          className={`pointer-events-none absolute inset-0 z-[1] bg-[repeating-linear-gradient(-12deg,transparent,transparent_14px,rgba(255,255,255,0.04)_14px,rgba(255,255,255,0.04)_15px)] opacity-90 ${compact ? 'rounded-xl' : 'rounded-2xl'}`}
          aria-hidden
        />
      ) : null}
      <div
        className={`pointer-events-none absolute left-0 top-0 h-full w-1 bg-gradient-to-b ${barClass} ${!clickable ? 'opacity-50' : ''}`}
        aria-hidden
      />
      {clickable ? (
        <div
          className={`pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-gradient-to-bl ${haloClass} opacity-40 blur-2xl`}
          aria-hidden
        />
      ) : null}

      <div className={`relative z-[2] flex items-start justify-between gap-3 pl-2 ${compact ? 'mb-3' : 'mb-4'}`}>
        <div
          className={`flex items-center justify-center rounded-xl border border-zinc-700/60 bg-zinc-900/80 text-zinc-200 shadow-inner shadow-black/20 ${compact ? 'h-9 w-9' : 'h-11 w-11'} ${clickable ? '' : 'opacity-80'}`}
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
        <h2 className={`font-semibold tracking-tight text-zinc-50 ${compact ? 'text-base' : 'text-lg'}`}>
          {title}
        </h2>
        <p className={`mt-2 flex-1 leading-relaxed text-zinc-400 ${compact ? 'text-xs line-clamp-3' : 'text-sm'}`}>
          {description}
        </p>
        <div className={`border-t border-zinc-800/80 ${compact ? 'mt-3 pt-3' : 'mt-5 pt-4'}`}>
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500">{statLabel}</p>
          <p className="sk-figures mt-1 text-sm text-zinc-200">{stat}</p>
        </div>
      </div>

      <div className="relative z-[2] pl-2">{cta}</div>
    </article>
  )
}
