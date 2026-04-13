import { signOut } from 'firebase/auth'
import { collection, doc, getDocs, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { auth, db } from '../firebase/config'
import { PortalSessionLine } from '../components/layout/PortalSessionLine.jsx'
import { useAuth } from '../hooks/useAuth'
import { formatCurrency, formatPercent } from '../utils/format'
import { WallPage } from './WallPage'

const TAB_IDS = ['wall', 'metrics', 'revenue']

export function AnalyticsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const rawTab = searchParams.get('tab') || 'wall'
  const tab = TAB_IDS.includes(rawTab) ? rawTab : 'wall'

  const [completedRows, setCompletedRows] = useState([])
  const [ordersLoading, setOrdersLoading] = useState(true)
  const [djStreak, setDjStreak] = useState(undefined)

  useEffect(() => {
    const q = query(
      collection(db, 'orders'),
      where('status', '==', 'completed'),
      orderBy('completedAt', 'desc'),
      limit(4000),
    )
    return getDocs(q).then(
      (snap) => {
        setCompletedRows(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
        setOrdersLoading(false)
      },
      (e) => {
        console.error(e)
        setCompletedRows([])
        setOrdersLoading(false)
      },
    )
  }, [])

  useEffect(() => {
    const ref = doc(db, 'meta', 'djStats')
    return onSnapshot(
      ref,
      (snap) => {
        const n = snap.exists() ? Number(snap.data().currentStreak) || 0 : 0
        setDjStreak(n)
      },
      () => setDjStreak(0),
    )
  }, [])

  const metrics = useMemo(() => {
    const rows = completedRows
    const n = rows.length
    if (n === 0) {
      return {
        totalRevenue: 0,
        avgFulfillment: null,
        pokeRate: null,
        avgFriction: null,
        hatTricks: 0,
      }
    }
    let totalRevenue = 0
    let fulfillSum = 0
    let fulfillN = 0
    let frictionSum = 0
    let frictionN = 0
    let poked = 0
    let hatTricks = 0
    for (const o of rows) {
      totalRevenue += Number(o.paymentAmount) || 0
      const fm = o.fulfillmentTimeMinutes
      if (fm != null && Number.isFinite(Number(fm))) {
        fulfillSum += Number(fm)
        fulfillN += 1
      }
      const fs = o.frictionScore
      if (fs != null && Number.isFinite(Number(fs))) {
        frictionSum += Number(fs)
        frictionN += 1
      }
      if (o.convertedAfterPoke === true) poked += 1
      if (o.hatTrickDay === true) hatTricks += 1
    }
    return {
      totalRevenue,
      avgFulfillment: fulfillN > 0 ? fulfillSum / fulfillN : null,
      pokeRate: n > 0 ? poked / n : null,
      avgFriction: frictionN > 0 ? frictionSum / frictionN : null,
      hatTricks,
    }
  }, [completedRows])

  function setTab(next) {
    const p = new URLSearchParams(searchParams)
    if (next === 'wall') p.delete('tab')
    else p.set('tab', next)
    setSearchParams(p, { replace: true })
  }

  async function handleSignOut() {
    await signOut(auth)
    navigate('/', { replace: true })
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="sticky top-0 z-20 border-b border-zinc-800/80 bg-zinc-950/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-4 sm:px-6 sm:py-4">
          <div className="min-w-0">
            <Link to="/dashboard" className="text-sm text-zinc-500 hover:text-zinc-200">
              ← Dashboard
            </Link>
            <h1 className="mt-2 text-xl font-semibold text-white">Analytics</h1>
            <p className="mt-1 text-sm text-zinc-500">Wall, operational metrics, and revenue lens</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {[
                { id: 'wall', label: 'Wall' },
                { id: 'metrics', label: 'Metrics' },
                { id: 'revenue', label: 'Revenue' },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition ${
                    tab === t.id
                      ? 'bg-amber-500/20 text-amber-100 ring-1 ring-amber-600/50'
                      : 'bg-zinc-900 text-zinc-500 ring-1 ring-zinc-800 hover:text-zinc-300'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="mt-2 sm:hidden">
              <PortalSessionLine email={user?.email} onSignOut={handleSignOut} />
            </div>
          </div>
          <div className="hidden sm:block">
            <PortalSessionLine email={user?.email} onSignOut={handleSignOut} />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        {tab === 'wall' ? (
          <div className="rounded-2xl border border-zinc-800/80 bg-zinc-950/40 p-1 sm:p-2">
            <WallPage embedded />
          </div>
        ) : null}

        {tab === 'metrics' ? (
          <div className="space-y-6">
            {ordersLoading ? (
              <p className="text-sm text-zinc-500">Loading completed orders…</p>
            ) : completedRows.length === 0 ? (
              <p className="rounded-2xl border border-zinc-800 bg-zinc-900/40 px-4 py-8 text-center text-sm text-zinc-500">
                No completed orders in the sampled window yet.
              </p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <MetricCard
                  label="Total revenue (sample)"
                  value={formatCurrency(metrics.totalRevenue)}
                  hint={`Based on up to ${completedRows.length} most recent completed orders.`}
                />
                <MetricCard
                  label="Avg fulfillment time"
                  value={
                    metrics.avgFulfillment != null
                      ? `${metrics.avgFulfillment.toFixed(1)} min`
                      : '—'
                  }
                  hint="Orders with fulfillment minutes recorded."
                />
                <MetricCard
                  label="Poke → conversion rate"
                  value={
                    metrics.pokeRate != null ? formatPercent(metrics.pokeRate * 100, 1) : '—'
                  }
                  hint="Share of completed orders where convertedAfterPoke is true."
                />
                <MetricCard
                  label="Avg friction score"
                  value={
                    metrics.avgFriction != null ? metrics.avgFriction.toFixed(1) : '—'
                  }
                  hint="Mean of numeric frictionScore across completed orders."
                />
                <MetricCard
                  label="DJ streak (clean orders)"
                  value={djStreak === undefined ? '…' : String(djStreak)}
                  hint="From Firestore meta/djStats · currentStreak."
                />
                <MetricCard
                  label="Hat trick days"
                  value={String(metrics.hatTricks)}
                  hint="Completed orders with hatTrickDay set true."
                />
              </div>
            )}
          </div>
        ) : null}

        {tab === 'revenue' ? (
          <div className="rounded-2xl border border-zinc-800 bg-gradient-to-b from-zinc-900/80 to-zinc-950/90 p-8 shadow-inner shadow-black/40 sm:p-10">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-500/90">
              Revenue intelligence
            </p>
            <h2 className="mt-3 text-lg font-semibold text-zinc-100">Coming soon</h2>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-zinc-400">
              Deeper revenue curves, cohort views, and margin attribution will land here — same dark
              glass treatment as the rest of the portal, not a raw placeholder.
            </p>
            <ul className="mt-6 space-y-2 text-sm text-zinc-500">
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500/70" aria-hidden />
                Fleet and retail mix breakdowns
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-cyan-500/60" aria-hidden />
                Export-ready revenue snapshots
              </li>
            </ul>
          </div>
        ) : null}
      </main>
    </div>
  )
}

function MetricCard({ label, value, hint }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5 shadow-sm shadow-black/20">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-zinc-50">{value}</p>
      {hint ? <p className="mt-2 text-xs leading-relaxed text-zinc-600">{hint}</p> : null}
    </div>
  )
}
