import { useEffect, useState } from 'react'
import { paletteForRank } from './topSellersPalette'

const FLIP_INTERVAL_MS = 3000

function prefersReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Top Sellers card. Flips through the provided sellers list every
 * FLIP_INTERVAL_MS and pauses on hover. Respects prefers-
 * reduced-motion (freezes on the current seller). Left half: rank digit
 * and sold count share a baseline with a `SOLD` caption 8px below.
 * Right half: SKU / description / category for the current seller.
 */
export function TopSellersCard({ sellers = [] }) {
  const [idx, setIdx] = useState(0)
  const [paused, setPaused] = useState(false)
  const sellersLength = Array.isArray(sellers) ? sellers.length : 0

  useEffect(() => {
    if (paused) return undefined
    if (prefersReducedMotion()) return undefined
    if (sellersLength <= 1) return undefined
    const handle = setInterval(() => {
      setIdx((i) => (i + 1) % sellersLength)
    }, FLIP_INTERVAL_MS)
    return () => clearInterval(handle)
  }, [paused, sellersLength])

  if (!sellers || sellers.length === 0) {
    return (
      <div className="pc-card rounded-xl bg-zinc-900/60 p-[14px]">
        <p className="pc-eyebrow">Top Sellers</p>
        <p className="mt-2 text-sm text-zinc-400">No sales yet.</p>
      </div>
    )
  }

  const safeIdx = Math.min(idx, sellers.length - 1)
  const current = sellers[safeIdx] || sellers[0]
  const palette = paletteForRank(current.rank)

  return (
    <div
      className="pc-card relative rounded-xl bg-zinc-900/60 p-[14px] focus-within:ring-1 focus-within:ring-amber-500/40"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      role="region"
      aria-label="Top sellers, rotating"
      aria-live="polite"
    >
      <p className="pc-eyebrow mb-2">Top Sellers</p>
      <div
        className="grid items-center"
        style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 0 }}
      >
        <div className="flex items-baseline justify-center gap-[22px] border-r border-zinc-800/60">
          <div
            className="text-center font-extrabold tabular-nums"
            style={{
              width: 96,
              fontSize: 'clamp(28px, 5vw, 52px)',
              color: palette.primary,
              lineHeight: 1,
            }}
          >
            <span
              className="font-medium"
              style={{
                fontSize: '0.6em',
                verticalAlign: '0.35em',
                marginRight: 2,
                color: palette.accent,
              }}
            >
              #
            </span>
            {current.rank}
          </div>
          <div className="relative" style={{ width: 96 }}>
            <div
              className="text-center font-extrabold tabular-nums"
              style={{
                fontSize: 'clamp(28px, 5vw, 52px)',
                color: palette.primary,
                lineHeight: 1,
              }}
            >
              {current.salesCount}
            </div>
            <div
              className="absolute text-center font-bold uppercase"
              style={{
                left: -20,
                right: -20,
                top: 'calc(100% + 8px)',
                fontSize: 13,
                letterSpacing: '0.22em',
                color: palette.accent,
              }}
            >
              SOLD
            </div>
          </div>
        </div>
        <div className="min-w-0 pl-4">
          <p className="truncate font-mono text-[18px] text-zinc-100">{current.sku}</p>
          <p className="truncate text-[13px] text-zinc-300">{current.description}</p>
          <p className="mt-1 text-[10px] uppercase tracking-wide text-zinc-400">
            {current.category}
          </p>
        </div>
      </div>
    </div>
  )
}
