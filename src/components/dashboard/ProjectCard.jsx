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

const ACCENT_GLOW = {
  teal: 'group-hover:shadow-teal-500/10',
  orange: 'group-hover:shadow-orange-500/10',
  slate: 'group-hover:shadow-slate-400/10',
  green: 'group-hover:shadow-green-500/10',
  rose: 'group-hover:shadow-rose-500/10',
  amber: 'group-hover:shadow-amber-500/10',
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
  teal: 'group-hover:border-teal-500/45 group-hover:ring-teal-500/25',
  orange: 'group-hover:border-orange-500/45 group-hover:ring-orange-500/25',
  slate: 'group-hover:border-slate-400/45 group-hover:ring-slate-400/20',
  green: 'group-hover:border-green-500/45 group-hover:ring-green-500/25',
  rose: 'group-hover:border-rose-500/45 group-hover:ring-rose-500/25',
  amber: 'group-hover:border-amber-500/45 group-hover:ring-amber-500/25',
}

/**
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
 * @param {{ to: string, label: string }} [props.secondaryFooter] Second CTA above primary (e.g. Launch Dispatcher)
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
  secondaryFooter,
}) {
  const clickable = Boolean(to)
  const statusClass = STATUS_STYLES[status] ?? STATUS_STYLES.Internal
  const barClass = ACCENT_BAR[accent] ?? ACCENT_BAR.teal
  const glowClass = ACCENT_GLOW[accent] ?? ''
  const haloClass = ACCENT_HALO[accent] ?? ACCENT_HALO.teal
  const ctaRing = ACCENT_CTA_RING[accent] ?? ACCENT_CTA_RING.teal

  const primaryCta = clickable ? (ctaLabel ?? 'Open') : (ctaLabel ?? 'Unavailable · under construction')
  const splitFooters = Boolean(clickable && to && secondaryFooter?.to && secondaryFooter?.label)

  const headerBlock = (
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
  )

  const bodyBlock = (
    <div className="relative z-[2] flex flex-1 flex-col pl-2">
      <h2 className="text-lg font-semibold tracking-tight text-zinc-50">{title}</h2>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-zinc-400">{description}</p>
      <div className="mt-5 border-t border-zinc-800/80 pt-4">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500">{statLabel}</p>
        <p className="sk-figures mt-1 text-sm text-zinc-200">{stat}</p>
      </div>
    </div>
  )

  const footerBlock = splitFooters ? (
    <div className="relative z-[2] mt-4 flex flex-col gap-2 pl-2">
      <Link
        to={secondaryFooter.to}
        className="flex w-full items-center justify-center rounded-xl border border-green-600/70 bg-green-950/25 py-3 text-sm font-bold tracking-tight text-green-100 ring-1 ring-green-600/30 transition hover:border-green-500/80 hover:bg-green-900/35"
      >
        {secondaryFooter.label}
      </Link>
      <Link
        to={to}
        className={[
          'flex w-full items-center justify-center rounded-xl border bg-zinc-900/70 py-3 text-sm font-bold tracking-tight ring-0 transition',
          `border-zinc-600/90 text-zinc-50 ring-1 ring-transparent ${ctaRing} hover:bg-zinc-800/90`,
        ].join(' ')}
      >
        {primaryCta}
      </Link>
    </div>
  ) : (
    <div
      className={[
        'relative z-[2] mt-4 flex w-full items-center justify-center rounded-xl border bg-zinc-900/70 py-3 text-sm font-bold tracking-tight ring-0 transition',
        clickable
          ? `border-zinc-600/90 text-zinc-50 ring-1 ring-transparent ${ctaRing} group-hover:bg-zinc-800/90`
          : 'border-zinc-800/80 text-zinc-500',
      ].join(' ')}
    >
      {primaryCta}
    </div>
  )

  const inner = (
    <article
      className={[
        'group relative flex h-full min-h-[168px] flex-col overflow-hidden rounded-2xl border bg-zinc-950/80 p-5 transition-all duration-200 ease-out sm:min-h-[220px] sm:p-6',
        clickable
          ? `cursor-pointer border-zinc-700/90 hover:border-zinc-500 hover:bg-zinc-900/70 hover:shadow-xl hover:shadow-black/50 sm:hover:-translate-y-0.5 ${glowClass}`
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

      {splitFooters && to ? (
        <>
          <Link
            to={to}
            className="relative z-[2] block flex-1 rounded-xl pl-2 outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40"
          >
            {headerBlock}
            {bodyBlock}
          </Link>
          {footerBlock}
        </>
      ) : (
        <>
          {headerBlock}
          {bodyBlock}
          <div className="pl-2">{footerBlock}</div>
        </>
      )}
    </article>
  )

  if (clickable && to && !splitFooters) {
    return (
      <Link
        to={to}
        className="block h-full rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
      >
        {inner}
      </Link>
    )
  }

  if (splitFooters) {
    return (
      <div className="h-full rounded-2xl outline-none focus-within:ring-2 focus-within:ring-amber-500/50 focus-within:ring-offset-2 focus-within:ring-offset-zinc-950">
        {inner}
      </div>
    )
  }

  return <div className="h-full">{inner}</div>
}
