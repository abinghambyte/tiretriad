import { formatPercent } from '../../utils/format'

/**
 * Simple SVG line chart for weekly margin % (last N weeks, oldest → newest).
 * @param {{ labels: string[], percents: (number|null)[] }} props
 */
export function MarginWeekLineChart({ labels, percents }) {
  const w = 360
  const h = 120
  const pad = 8
  const pts = percents.map((p, i) => {
    const x = pad + (i * (w - pad * 2)) / Math.max(1, labels.length - 1)
    const v = p == null || !Number.isFinite(p) ? 0 : Math.max(0, Math.min(100, p))
    const y = pad + (1 - v / 100) * (h - pad * 2)
    return { x, y, raw: p }
  })
  const d = pts
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ')

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
        Margin trend (weekly)
      </p>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="mt-2 w-full max-w-full text-amber-400/90"
        role="img"
        aria-label="Margin percent by week"
      >
        <path
          d={d}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {pts.map((p, i) => (
          <circle key={`${labels[i] ?? 'w'}-${i}`} cx={p.x} cy={p.y} r="3" fill="currentColor" />
        ))}
      </svg>
      <div className="mt-1 flex flex-wrap justify-between gap-1 text-[9px] text-zinc-500 max-sm:text-[8px]">
        {labels.map((lab, i) => (
          <span key={lab} className="tabular-nums" title={percents[i] == null ? '' : formatPercent(percents[i], 1)}>
            {lab}
          </span>
        ))}
      </div>
    </div>
  )
}
