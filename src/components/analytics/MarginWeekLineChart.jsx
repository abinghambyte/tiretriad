import { useLayoutEffect, useRef, useState } from 'react'
import { formatPercent } from '../../utils/format'

/**
 * SVG line chart for weekly margin % (last N weeks, oldest to newest).
 * Measures its own container so the SVG viewBox matches rendered width,
 * preventing horizontal text distortion on wide cards.
 * @param {{ labels: string[], percents: (number|null)[] }} props
 */
export function MarginWeekLineChart({ labels, percents }) {
  const wrapRef = useRef(null)
  const [w, setW] = useState(720)

  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return undefined
    const ro = new ResizeObserver((entries) => {
      const cw = entries[0]?.contentRect?.width
      if (cw && cw > 0) setW(Math.max(320, Math.round(cw)))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const h = 160
  const padL = 36
  const padR = 12
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

  const mobileLabelSkip = Math.ceil(labels.length / 6)

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 sm:p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
          Margin trend (weekly)
        </p>
        {latest ? (
          <p className="text-xs text-zinc-400">
            {latest.weekLabel}{' '}
            <span className="font-semibold tabular-nums text-amber-300">
              {formatPercent(latest.value, 1)}
            </span>
          </p>
        ) : null}
      </div>
      <div ref={wrapRef} className="mt-2">
        <svg
          viewBox={`0 0 ${w} ${h}`}
          className="block w-full text-amber-400/90"
          style={{ height: h }}
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
                />
                <text
                  x={padL - 6}
                  y={y + 3}
                  textAnchor="end"
                  className="fill-zinc-500"
                  style={{ fontSize: '10px' }}
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
            />
          ) : null}
          {pts.map((p, i) => {
            if (!p.hasValue) return null
            const isLatest = i === pts.length - 1
            return (
              <g key={`${labels[i] ?? 'w'}-${i}`}>
                <circle cx={p.x} cy={p.y} r={isLatest ? 5 : 4} fill="currentColor">
                  <title>
                    {labels[i]}: {formatPercent(p.raw, 1)}
                  </title>
                </circle>
                {isLatest ? (
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r="8"
                    fill="none"
                    stroke="currentColor"
                    strokeOpacity="0.4"
                    strokeWidth="1"
                  />
                ) : null}
              </g>
            )
          })}
        </svg>
      </div>
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
