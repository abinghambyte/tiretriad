/**
 * Unified status pill. One radius (rounded-full), one font-size tier, and
 * a fixed palette of tones so "pending", "in transit", "cancelled", and
 * "unknown" don't each reinvent their own badge geometry across modules.
 *
 * Tones map to semantic status families; the dashed `unknown` tone makes
 * missing-state reads visibly different from `cancelled` (they were near-
 * identical before).
 *
 * @param {object} props
 * @param {'amber'|'emerald'|'sky'|'violet'|'rose'|'zinc'|'unknown'} [props.tone]
 * @param {string} [props.label]   visible text; prefer over children for a11y
 * @param {React.ReactNode} [props.children]
 * @param {string} [props.className]  extra layout classes when composing
 * @param {string} [props.title]
 */
export function StatusPill({ tone = 'zinc', label, children, className = '', title }) {
  const base =
    'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium'
  const tones = {
    amber: 'bg-amber-500/15 text-amber-200 ring-1 ring-amber-500/30',
    emerald: 'bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-500/30',
    sky: 'bg-sky-500/15 text-sky-200 ring-1 ring-sky-500/30',
    violet: 'bg-violet-500/15 text-violet-200 ring-1 ring-violet-500/30',
    rose: 'bg-rose-500/15 text-rose-200 ring-1 ring-rose-500/30',
    zinc: 'bg-zinc-600/30 text-zinc-300 ring-1 ring-zinc-500/30',
    unknown: 'bg-transparent text-zinc-400 ring-1 ring-dashed ring-zinc-600',
  }
  const content = label != null ? label : children
  return (
    <span className={`${base} ${tones[tone] || tones.zinc} ${className}`} title={title}>
      {content}
    </span>
  )
}

