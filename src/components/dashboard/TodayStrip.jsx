import { Link } from 'react-router-dom'
import { formatCurrency, formatQty } from '../../utils/format'
import { TopSellersCard } from './TopSellersCard'

const LABEL_CLASS = 'text-[9px] font-bold uppercase tracking-[0.12em] text-zinc-500'

/**
 * Today strip. Four-card grid: Pending Orders (1fr), Top Sellers (2fr),
 * Today Revenue hero (1fr), Total Profit (1fr). Top Sellers takes double
 * width per the v16 mockup. Hero revenue is emerald at 34 px.
 */
export function TodayStrip({
  pendingOrders,
  topSellers = [],
  todayRevenue,
  allTimeMargin,
  loading,
}) {
  const pendingValue = loading ? null : Number(pendingOrders ?? 0)
  const pendingTone = pendingValue != null && pendingValue > 0 ? 'text-amber-200' : 'text-zinc-100'

  return (
    <section
      aria-label="Today"
      className="grid gap-[10px]"
      style={{ gridTemplateColumns: '1fr 2fr 1fr 1fr' }}
    >
      <Link
        to="/orders"
        className="pc-card rounded-xl bg-zinc-900/60 p-[14px] transition-colors hover:bg-zinc-900/80"
      >
        <p className={LABEL_CLASS}>Pending orders</p>
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
        <p className={LABEL_CLASS}>Today revenue</p>
        {loading ? (
          <div className="mt-2 h-10 w-24 animate-pulse rounded-md bg-zinc-800/80" />
        ) : (
          <p
            data-testid="hero-revenue"
            className="mt-1 text-[34px] font-bold tabular-nums tracking-[-0.02em] text-emerald-300"
          >
            {formatCurrency(Number(todayRevenue ?? 0))}
          </p>
        )}
      </div>

      <Link
        to="/analytics?tab=revenue"
        className="pc-card rounded-xl bg-zinc-900/60 p-[14px] transition-colors hover:bg-zinc-900/80"
      >
        <p className={LABEL_CLASS}>Total profit</p>
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
