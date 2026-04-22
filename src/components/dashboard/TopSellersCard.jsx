import { useEffect, useState } from 'react'
import { paletteForRank } from './topSellersPalette'

const FLIP_INTERVAL_MS = 3000

/**
 * Top Sellers card. Flips through the provided sellers list every
 * FLIP_INTERVAL_MS and pauses on hover. Left half: rank digit and sold
 * count share a baseline with a `SOLD` caption 8px below. Right half:
 * SKU / description / category for the current seller.
 */
export function TopSellersCard({ sellers = [] }) {
  const [idx, setIdx] = useState(0)
  const [paused, setPaused] = useState(false)
  const sellersLength = Array.isArray(sellers) ? sellers.length : 0

  useEffect(() => {
    if (paused) return undefined
    if (sellersLength <= 1) return undefined
    const handle = setInterval(() => {
      setIdx((i) => (i + 1) % sellersLength)
    }, FLIP_INTERVAL_MS)
    return () => clearInterval(handle)
  }, [paused, sellersLength])

  if (!sellers || sellers.length === 0) {
    return (
      <div className="pc-card rounded-xl bg-zinc-900/60 p-[14px]">
        <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-zinc-500">
          Top Sellers
        </p>
        <p className="mt-2 text-sm text-zinc-500">No sales yet</p>
      </div>
    )
  }

  const safeIdx = Math.min(idx, sellers.length - 1)
  const current = sellers[safeIdx] || sellers[0]
  const palette = paletteForRank(current.rank)

  return (
    <div
      className="pc-card relative rounded-xl bg-zinc-900/60 p-[14px]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <p className="mb-2 text-[9px] font-bold uppercase tracking-[0.12em] text-zinc-500">
        Top Sellers
      </p>
      <div
        className="grid items-center"
        style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 0 }}
      >
        <div className="flex items-baseline justify-center gap-[22px] border-r border-zinc-800/60">
          <div
            className="text-center font-extrabold tabular-nums"
            style={{
              width: 96,
              fontSize: 52,
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
                fontSize: 52,
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
          <p className="mt-1 text-[10px] uppercase tracking-wide text-zinc-500">
            {current.category}
          </p>
        </div>
      </div>
    </div>
  )
}
