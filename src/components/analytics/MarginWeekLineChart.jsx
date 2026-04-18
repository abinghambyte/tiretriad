import { formatPercent } from '../../utils/format'

/**
 * SVG line chart for weekly margin % (last N weeks, oldest → newest).
 * Mobile-friendly: Y gridlines at 0/25/50/75/100, readable labels, larger
 * points, current-week value as a headline.
 * @param {{ labels: string[], percents: (number|null)[] }} props
 */
export function MarginWeekLineChart({ labels, percents }) {
  const w = 360
  const h = 160
  const padL = 26
  const padR = 8
  const padT = 10
  const padB = 24
  const plotW = w - padL - padR
  const plotH = h - padT - padB
  const gridPcts = [0, 25, 50, 75, 100]

  const pts = percents.map((p, i) => {
    const x = padL + (i * plotW) / Math.max(1, labels.length - 1)
    const v = p == null || !Number.isFinite(p) ? null : Math.max(0, Math.min(100, p))
    const y = v == null ? null : padT + (1 - v / 100) * plotH
    return { x, y, raw: p, hasValue: v != null }
  })

  const d = pts
    .filter((p) => p.hasValue)
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ')

  const latest = (() => {
    for (let i = percents.length - 1; i >= 0; i -= 1) {
      const v = percents[i]
      if (v != null && Number.isFinite(v)) return { value: v, weekLabel: labels[i] }
    }
    return null
  })()

  // Show every other label on mobile to avoid overlap; all labels on sm+.
  const mobileLabelSkip = Math.ceil(labels.length / 6)

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 sm:p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
          Margin trend (weekly)
        </p>
        {latest ? (
          <p className="text-xs text-zinc-400">
            Week {latest.weekLabel}{' '}
            <span className="font-semibold tabular-nums text-amber-300">
              {formatPercent(latest.value, 1)}
            </span>
          </p>
        ) : null}
      </div>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        className="mt-2 h-40 w-full max-w-full text-amber-400/90 sm:h-36"
        role="img"
        aria-label="Margin percent by week"
      >
        {gridPcts.map((g) => {
          const y = padT + (1 - g / 100) * plotH
          return (
            <g key={g}>
              <line
                x1={padL}
                x2={w - padR}
                y1={y}
                y2={y}
                stroke="currentColor"
                strokeOpacity={g === 0 ? 0.25 : 0.1}
                strokeDasharray={g === 0 ? '' : '2 3'}
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
              <text
                x={padL - 4}
                y={y + 3}
                textAnchor="end"
                className="fill-zinc-500"
                style={{ fontSize: '9px' }}
              >
                {g}%
              </text>
            </g>
          )
        })}
        {d ? (
          <path
            d={d}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
        {pts.map((p, i) => {
          if (!p.hasValue) return null
          const isLatest = i === pts.length - 1
          return (
            <g key={`${labels[i] ?? 'w'}-${i}`}>
              <circle cx={p.x} cy={p.y} r={isLatest ? 5 : 4} fill="currentColor">
                <title>
                  Week {labels[i]}: {formatPercent(p.raw, 1)}
                </title>
              </circle>
              {isLatest ? (
                <circle cx={p.x} cy={p.y} r="8" fill="none" stroke="currentColor" strokeOpacity="0.4" strokeWidth="1" />
              ) : null}
            </g>
          )
        })}
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-zinc-500 sm:text-[11px]">
        {labels.map((lab, i) => {
          const showOnMobile = i === 0 || i === labels.length - 1 || i % mobileLabelSkip === 0
          return (
            <span
              key={lab}
              className={`tabular-nums ${showOnMobile ? '' : 'max-sm:invisible'}`}
              title={percents[i] == null ? '' : formatPercent(percents[i], 1)}
            >
              {lab}
            </span>
          )
        })}
      </div>
    </div>
  )
}
