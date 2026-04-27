import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatCurrency, formatQty } from '../../utils/format'
import { BrandBolt } from '../ui/BrandBolt.jsx'
import { TopSellersCard } from './TopSellersCard'

const MS_PER_DAY = 86_400_000

function daysAgoLabel(ms, now) {
  if (!Number.isFinite(ms) || ms <= 0) return null
  const diff = now - ms
  if (diff < 0) return 'just now'
  const days = Math.floor(diff / MS_PER_DAY)
  if (days <= 0) return 'today'
  if (days === 1) return '1 day ago'
  return `${days} days ago`
}

/**
 * Today strip. Four-card grid: Pending Orders (1fr), Top Sellers (2fr),
 * Last Sale hero (1fr), Total Profit (1fr). Stacks to 1-col under md
 * and 2-col md to keep TopSellers rank digits from crashing into the SKU
 * column between 640-900 px. Hero last-sale amount is emerald at 34 px;
 * "N days ago" caption turns amber past 7 days to nudge a fresh post.
 */
export function TodayStrip({
  pendingOrders,
  topSellers = [],
  lastSale = null,
  allTimeMargin,
  loading,
}) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const h = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(h)
  }, [])

  const pendingValue = loading ? null : Number(pendingOrders ?? 0)
  const pendingTone = pendingValue != null && pendingValue > 0 ? 'text-amber-200' : 'text-zinc-100'
  const saleAmount =
    lastSale && lastSale.amount != null && Number.isFinite(Number(lastSale.amount))
      ? Number(lastSale.amount)
      : null
  const saleMs = lastSale && Number.isFinite(Number(lastSale.completedAtMs))
    ? Number(lastSale.completedAtMs)
    : null
  const ageLabel = saleMs != null ? daysAgoLabel(saleMs, now) : null
  const daysSince = saleMs != null ? Math.floor((now - saleMs) / MS_PER_DAY) : null
  const stale = !loading && daysSince != null && daysSince >= 7
  const fresh = !loading && daysSince != null && daysSince <= 1

  return (
    <section
      aria-label="Today"
      className="grid grid-cols-1 gap-[10px] md:grid-cols-2 lg:grid-cols-[1fr_2fr_1fr_1fr]"
    >
      <Link
        to="/orders"
        aria-label={
          loading
            ? 'Pending orders, loading'
            : `Pending orders: ${formatQty(pendingValue ?? 0)}`
        }
        className="pc-card rounded-xl bg-zinc-900/60 p-[14px] transition-colors hover:bg-zinc-900/80"
      >
        <h2 className="pc-eyebrow">Pending orders</h2>
        {loading ? (
          <div className="mt-2 h-8 w-12 animate-pulse rounded-md bg-zinc-800/80" />
        ) : (
          <p
            className={`mt-1 text-[28px] font-semibold tabular-nums ${pendingTone}`}
          >
            {formatQty(pendingValue ?? 0)}
          </p>
        )}
      </Link>

      <div className="pc-card">
        <TopSellersCard sellers={topSellers} />
      </div>

      <Link
        to="/orders?status=completed"
        aria-label={
          loading
            ? 'Last sale, loading'
            : saleAmount == null
              ? 'Last sale: no sales yet, waiting on first completed order'
              : `Last sale: ${formatCurrency(saleAmount)}${ageLabel ? `, ${ageLabel}` : ''}`
        }
        className={[
          'pc-card rounded-xl bg-gradient-to-b from-emerald-500/10 to-transparent p-[14px] transition-colors hover:from-emerald-500/15',
          fresh ? 'ring-1 ring-violet-500/40 shadow-[0_0_20px_rgba(126,20,255,0.15)]' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <h2 className="pc-eyebrow">Last sale</h2>
        {loading ? (
          <div className="mt-2 h-10 w-24 animate-pulse rounded-md bg-zinc-800/80" />
        ) : saleAmount == null ? (
          <>
            <p
              data-testid="hero-last-sale"
              className="mt-1 text-[24px] font-semibold tabular-nums text-zinc-600 dark:text-zinc-400"
            >
              No sales yet
            </p>
            <p className="mt-1 text-[11px] text-zinc-700 dark:text-zinc-500">
              Waiting on first completed order
            </p>
          </>
        ) : (
          <>
            <p
              data-testid="hero-last-sale"
              data-stale={stale ? 'true' : 'false'}
              data-fresh={fresh ? 'true' : 'false'}
              className="mt-1 flex items-baseline gap-2 text-[34px] font-bold tabular-nums tracking-[-0.02em] text-emerald-300"
            >
              {formatCurrency(saleAmount)}
              {fresh ? <BrandBolt size={16} tone="glow" /> : null}
            </p>
            <p
              className={[
                'mt-1 text-[11px] font-medium',
                stale ? 'text-amber-300' : 'text-zinc-400',
              ].join(' ')}
              title={stale ? 'More than a week since the last sale' : undefined}
            >
              {ageLabel || '-'}
            </p>
          </>
        )}
      </Link>

      <Link
        to="/analytics?tab=revenue"
        aria-label={
          loading
            ? 'Total profit, loading'
            : `Total profit: ${formatCurrency(Number(allTimeMargin ?? 0))}`
        }
        className="pc-card rounded-xl bg-zinc-900/60 p-[14px] transition-colors hover:bg-zinc-900/80"
      >
        <h2 className="pc-eyebrow">Total profit</h2>
        {loading ? (
          <div className="mt-2 h-8 w-20 animate-pulse rounded-md bg-zinc-800/80" />
        ) : (
          <p className="mt-1 text-[24px] font-semibold tabular-nums text-zinc-100">
            {formatCurrency(Number(allTimeMargin ?? 0))}
          </p>
        )}
      </Link>
    </section>
  )
}
