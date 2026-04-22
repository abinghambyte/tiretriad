import { Link } from 'react-router-dom'
import { formatCurrency, formatQty } from '../../utils/format'
import { TopSellersCard } from './TopSellersCard'

/**
 * Today strip. Four-card grid: Pending Orders (1fr), Top Sellers (2fr),
 * Today Revenue hero (1fr), Total Profit (1fr). Stacks to 1-col under md
 * and 2-col md to keep TopSellers rank digits from crashing into the SKU
 * column between 640-900 px. Hero revenue is emerald at 34 px.
 */
export function TodayStrip({
  pendingOrders,
  topSellers = [],
  todayRevenue,
  allTimeMargin,
  rollingAverageRevenue = null,
  loading,
}) {
  const pendingValue = loading ? null : Number(pendingOrders ?? 0)
  const pendingTone = pendingValue != null && pendingValue > 0 ? 'text-amber-200' : 'text-zinc-100'
  const todayNum = Number(todayRevenue ?? 0)
  const avgNum = Number(rollingAverageRevenue)
  const hot =
    !loading &&
    Number.isFinite(avgNum) &&
    avgNum > 0 &&
    todayNum > avgNum

  return (
    <section
      aria-label="Today"
      className="grid grid-cols-1 gap-[10px] md:grid-cols-2 lg:grid-cols-[1fr_2fr_1fr_1fr]"
    >
      <Link
        to="/orders"
        className="pc-card rounded-xl bg-zinc-900/60 p-[14px] transition-colors hover:bg-zinc-900/80"
      >
        <p className="pc-eyebrow">Pending orders</p>
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

      <div className="pc-card rounded-xl bg-gradient-to-b from-emerald-500/10 to-transparent p-[14px]">
        <p className="pc-eyebrow">Today revenue</p>
        {loading ? (
          <div className="mt-2 h-10 w-24 animate-pulse rounded-md bg-zinc-800/80" />
        ) : (
          <p
            data-testid="hero-revenue"
            data-hot={hot ? 'true' : 'false'}
            className={[
              'mt-1 text-[34px] font-bold tabular-nums tracking-[-0.02em]',
              hot
                ? 'text-[#32CD32] drop-shadow-[0_0_10px_rgba(50,205,50,0.35)]'
                : 'text-emerald-300',
            ].join(' ')}
            title={
              hot
                ? 'Today is above the 7-day rolling average'
                : undefined
            }
          >
            {formatCurrency(todayNum)}
          </p>
        )}
      </div>

      <Link
        to="/analytics?tab=revenue"
        className="pc-card rounded-xl bg-zinc-900/60 p-[14px] transition-colors hover:bg-zinc-900/80"
      >
        <p className="pc-eyebrow">Total profit</p>
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
