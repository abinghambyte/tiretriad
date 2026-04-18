import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { db } from '../firebase/config'
import { ModuleSubheader } from '../components/layout/ModuleSubheader.jsx'
import { MarginWeekLineChart } from '../components/analytics/MarginWeekLineChart.jsx'
import { formatCurrency, formatPercent, formatQty } from '../utils/format'
import { WallPage } from './WallPage'
import { addDaysToYmd, denverYm, isoWeekKey } from '../utils/isoWeekDenver.js'
import { marginPercentOfPayment, poolDollarsForOrder } from '../utils/orderPoolMargin.js'

const TAB_IDS = ['wall', 'metrics', 'revenue', 'leaderboard']

function completedMs(o) {
  const t = o?.completedAt
  return t && typeof t.toMillis === 'function' ? t.toMillis() : null
}

function denverYmdFromMs(ms) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Denver',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(ms))
  const y = parts.find((p) => p.type === 'year')?.value
  const m = parts.find((p) => p.type === 'month')?.value
  const d = parts.find((p) => p.type === 'day')?.value
  return `${y}-${m}-${d}`
}

function ymdUtcNoonMs(ymd) {
  const [y, mo, da] = ymd.split('-').map(Number)
  return Date.UTC(y, mo - 1, da, 12, 0, 0)
}

/** Consecutive Denver days with ≥1 completed order assigned to DJ (grace: start from yesterday if today empty). */
function djAssignedStreakDays(rows) {
  const daySet = new Set()
  for (const o of rows) {
    if (String(o.assignedTo || '').toLowerCase() !== 'dj') continue
    const ms = completedMs(o)
    if (ms == null) continue
    daySet.add(denverYmdFromMs(ms))
  }
  if (daySet.size === 0) return { current: 0, best: 0 }

  const sorted = [...daySet].sort()
  let best = 1
  let run = 1
  for (let i = 1; i < sorted.length; i += 1) {
    const prevY = sorted[i - 1]
    const curY = sorted[i]
    const gap = (ymdUtcNoonMs(curY) - ymdUtcNoonMs(prevY)) / 86400000
    if (gap === 1) {
      run += 1
      best = Math.max(best, run)
    } else {
      run = 1
    }
  }

  let ymd = denverYmdFromMs(Date.now())
  if (!daySet.has(ymd)) ymd = addDaysToYmd(ymd, -1)
  let cur = 0
  while (daySet.has(ymd)) {
    cur += 1
    ymd = addDaysToYmd(ymd, -1)
  }
  return { current: cur, best }
}

function flameSize(days) {
  if (days >= 14) return 'text-2xl'
  if (days >= 7) return 'text-xl'
  if (days >= 3) return 'text-lg'
  return 'text-sm opacity-70'
}

const TAB_LABELS = { wall: 'Wall', metrics: 'Metrics', revenue: 'Revenue', leaderboard: 'Leaderboard' }

export function AnalyticsPage() {
  const [searchParams] = useSearchParams()
  const rawTab = searchParams.get('tab') || 'wall'
  const tab = TAB_IDS.includes(rawTab) ? rawTab : 'wall'

  const [completedRows, setCompletedRows] = useState([])
  const [ordersLoading, setOrdersLoading] = useState(true)
  const [djStats, setDjStats] = useState(/** @type {Record<string, unknown> | null} */ (null))
  const [revenueStats, setRevenueStats] = useState(/** @type {Record<string, unknown> | null} */ (null))
  const [pokeOrders, setPokeOrders] = useState([])
  const [pokeLoading, setPokeLoading] = useState(true)
  const [tiresByMspn, setTiresByMspn] = useState(() => new Map())

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
    const q = query(collection(db, 'orders'), where('pokeCount', '>=', 1), limit(800))
    return getDocs(q).then(
      (snap) => {
        setPokeOrders(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
        setPokeLoading(false)
      },
      () => {
        setPokeOrders([])
        setPokeLoading(false)
      },
    )
  }, [])

  useEffect(() => {
    const ref = doc(db, 'meta', 'djStats')
    return onSnapshot(
      ref,
      (snap) => {
        setDjStats(snap.exists() ? snap.data() || {} : {})
      },
      () => setDjStats({}),
    )
  }, [])

  useEffect(() => {
    const ref = doc(db, 'meta', 'revenueStats')
    return onSnapshot(
      ref,
      (snap) => {
        setRevenueStats(snap.exists() ? snap.data() || {} : {})
      },
      () => setRevenueStats({}),
    )
  }, [])

  useEffect(() => {
    const ids = [...new Set(completedRows.map((r) => String(r.mspn || '').trim()).filter(Boolean))].slice(0, 200)
    if (!ids.length) {
      setTiresByMspn(new Map())
      return undefined
    }
    let cancelled = false
    void (async () => {
      const entries = await Promise.all(
        ids.map(async (id) => {
          const s = await getDoc(doc(db, 'tires', id))
          return [id, s.exists() ? s.data() || {} : {}]
        }),
      )
      if (!cancelled) setTiresByMspn(new Map(entries))
    })()
    return () => {
      cancelled = true
    }
  }, [completedRows])

  const metrics = useMemo(() => {
    const rows = completedRows
    const n = rows.length
    if (n === 0) {
      return {
        totalRevenue: 0,
        avgFulfillment: null,
        avgFriction: null,
        hatTricks: 0,
      }
    }
    let totalRevenue = 0
    let fulfillSum = 0
    let fulfillN = 0
    let frictionSum = 0
    let frictionN = 0
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
      if (o.hatTrickDay === true) hatTricks += 1
    }
    return {
      totalRevenue,
      avgFulfillment: fulfillN > 0 ? fulfillSum / fulfillN : null,
      avgFriction: frictionN > 0 ? frictionSum / frictionN : null,
      hatTricks,
    }
  }, [completedRows])

  const djStreakUi = useMemo(() => djAssignedStreakDays(completedRows), [completedRows])
  const cleanStreakMeta = djStats ? Number(djStats.longestStreak) || 0 : 0

  const pokeConversion = useMemo(() => {
    const rows = pokeOrders
    if (!rows.length) return null
    const completed = rows.filter((o) => String(o.status).toLowerCase() === 'completed').length
    return completed / rows.length
  }, [pokeOrders])

  const revenueWindows = useMemo(() => {
    const r = revenueStats || {}
    const now = Date.now() // eslint-disable-line react-hooks/purity -- calendar vs meta/revenueStats windows
    const wk = isoWeekKey(now)
    const mo = denverYm(now)
    const wtd = String(r.weeklyWindow || '') === wk ? Number(r.weeklyRevenue) || 0 : null
    const mtd = String(r.monthlyWindow || '') === mo ? Number(r.monthlyRevenue) || 0 : null
    const allTime = Number(r.allTimeRevenue) || 0
    return { wtd, mtd, allTime, wk, mo }
  }, [revenueStats])

  const revenueSampleTotal = useMemo(
    () => completedRows.reduce((s, o) => s + (Number(o.paymentAmount) || 0), 0),
    [completedRows],
  )
  const allTimeIsEstimate =
    revenueWindows.allTime <= 0 && revenueSampleTotal > 0 && completedRows.length > 0
  const allTimeRevenueDisplay = revenueWindows.allTime > 0 ? revenueWindows.allTime : revenueSampleTotal
  const allTimeRevenueHint = allTimeIsEstimate
    ? `Sum of paymentAmount on ${formatQty(completedRows.length)} completed orders in this view (estimated from loaded orders). Shown while meta/revenueStats is at $0 or missing.`
    : 'From meta/revenueStats · allTimeRevenue.'

  const avgOrderSample = useMemo(() => {
    const n = completedRows.length
    if (!n) return null
    const sum = completedRows.reduce((s, o) => s + (Number(o.paymentAmount) || 0), 0)
    return sum / n
  }, [completedRows])

  const marginWeekSeries = useMemo(() => {
    const now = Date.now() // eslint-disable-line react-hooks/purity -- last-12-weeks anchor
    const keys = []
    for (let i = 11; i >= 0; i -= 1) {
      keys.push(isoWeekKey(now - i * 7 * 86400000))
    }
    const rev = new Map()
    const margin = new Map()
    for (const k of keys) {
      rev.set(k, 0)
      margin.set(k, 0)
    }
    for (const o of completedRows) {
      const ms = completedMs(o)
      if (ms == null) continue
      const wk = isoWeekKey(ms)
      if (!rev.has(wk)) continue
      const tire = tiresByMspn.get(String(o.mspn || '').trim()) || {}
      const pay = Number(o.paymentAmount) || 0
      rev.set(wk, (rev.get(wk) || 0) + pay)
      margin.set(wk, (margin.get(wk) || 0) + poolDollarsForOrder(o, tire))
    }
    const percents = keys.map((k) => {
      const p = rev.get(k) || 0
      if (p <= 0) return null
      return (100 * (margin.get(k) || 0)) / p
    })
    return { labels: keys.map((k) => k.replace(/^\d{4}-W/, '')), percents }
  }, [completedRows, tiresByMspn])

  const topSkus = useMemo(() => {
    const by = new Map()
    for (const o of completedRows) {
      const m = String(o.mspn || '').trim()
      if (!m) continue
      const pay = Number(o.paymentAmount) || 0
      const qty = Number(o.quantity) || 0
      const tire = tiresByMspn.get(m) || {}
      const pool = poolDollarsForOrder(o, tire)
      const cur = by.get(m) || { revenue: 0, units: 0, margin: 0 }
      cur.revenue += pay
      cur.units += qty
      cur.margin += pool
      by.set(m, cur)
    }
    const sorted = [...by.entries()].sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 10)
    return sorted.map(([mspn, g], idx) => {
      const tire = tiresByMspn.get(mspn) || {}
      const desc = String(tire.description || tire.tread || mspn).trim()
      const avgMargPct = g.revenue > 0 ? (100 * g.margin) / g.revenue : null
      return { rank: idx + 1, mspn, desc, ...g, avgMargPct }
    })
  }, [completedRows, tiresByMspn])

  const leaderboard = useMemo(() => {
    const isCatalogMspn = (mspn) => /^[A-Za-z0-9]{5}$/.test(String(mspn || '').trim())
    const lbRows = completedRows.filter((o) => isCatalogMspn(o.mspn))

    let bestAll = null
    let best30 = null
    const thirty = Date.now() - 30 * 86400000 // eslint-disable-line react-hooks/purity -- 30d window
    for (const o of lbRows) {
      const ms = completedMs(o)
      if (ms == null) continue
      const tire = tiresByMspn.get(String(o.mspn || '').trim()) || {}
      const pct = marginPercentOfPayment(o, tire)
      if (pct == null || !Number.isFinite(pct)) continue
      const pay = Number(o.paymentAmount) || 0
      const pool = poolDollarsForOrder(o, tire)
      const row = { id: o.id, pct, pay, pool, customerName: o.customerName }
      if (!bestAll || pct > bestAll.pct) bestAll = row
      if (ms >= thirty && (!best30 || pct > best30.pct)) best30 = row
    }

    const byWeek = new Map()
    for (const o of lbRows) {
      const ms = completedMs(o)
      if (ms == null) continue
      const wk = isoWeekKey(ms)
      const handle = String(o.assignedTo || '').trim().toLowerCase() || 'unassigned'
      if (!byWeek.has(wk)) byWeek.set(wk, new Map())
      const m = byWeek.get(wk)
      m.set(handle, (m.get(handle) || 0) + 1)
    }
    let topCrew = { handle: '—', count: 0, week: '' }
    for (const [wk, handles] of byWeek) {
      for (const [h, c] of handles) {
        if (c > topCrew.count) topCrew = { handle: h, count: c, week: wk }
      }
    }

    const skuRev = new Map()
    for (const o of lbRows) {
      const m = String(o.mspn || '').trim()
      if (!m) continue
      skuRev.set(m, (skuRev.get(m) || 0) + (Number(o.paymentAmount) || 0))
    }
    let topSku = { mspn: '—', revenue: 0 }
    for (const [m, rev] of skuRev) {
      if (rev > topSku.revenue) topSku = { mspn: m, revenue: rev }
    }

    return { bestAll, best30, topCrew, topSku }
  }, [completedRows, tiresByMspn])

  const analyticsTabs = TAB_IDS.map((id) => ({
    key: id,
    label: TAB_LABELS[id] || id,
    to: id === 'wall' ? '/analytics' : `/analytics?tab=${id}`,
    active: tab === id,
  }))

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <ModuleSubheader
        title="Analytics"
        subtitle="Wall, operational metrics, and revenue lens"
        tabs={analyticsTabs}
        maxWidthClass="max-w-5xl"
      />

      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        {tab === 'wall' ? (
          <div className="rounded-2xl border border-zinc-800/80 bg-zinc-950/40 p-1 sm:p-2">
            <WallPage embedded />
          </div>
        ) : null}

        {tab === 'metrics' ? (
          <div className="space-y-6">
            {!ordersLoading && completedRows.length >= 4000 ? (
              <p className="rounded-lg border border-amber-800/50 bg-amber-950/20 px-3 py-2 text-xs text-amber-400">
                Showing the 4,000 most recent completed orders. Older orders are excluded from all calculations on this page.
              </p>
            ) : null}
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
                  label="Avg friction score"
                  value={metrics.avgFriction != null ? metrics.avgFriction.toFixed(1) : '—'}
                  hint="Friction score measures how many follow-ups or complications an order required before completion. Lower is smoother. Set by backend on order close."
                />
                <MetricCard
                  label="Hat trick days (3-in-1)"
                  value={String(metrics.hatTricks)}
                  hint="Orders completed on a day when 3+ orders were all finished — hat trick. Set by the backend on order completion."
                />
                <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5 shadow-sm shadow-black/20 sm:col-span-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                    DJ streak (assigned orders)
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <span className={flameSize(djStreakUi.current)} title="Streak heat">
                      🔥
                    </span>
                    <div>
                      <p className="text-2xl font-semibold tabular-nums text-zinc-50">
                        {djStreakUi.current} day{djStreakUi.current === 1 ? '' : 's'}
                      </p>
                      <p className="text-xs text-zinc-500">
                        Personal best this session: {formatQty(djStreakUi.best)} days · All-time record (server):{' '}
                        {formatQty(cleanStreakMeta)} days
                      </p>
                    </div>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-zinc-600">
                    Consecutive Denver days with at least one completed order where{' '}
                    <code className="text-zinc-400">assignedTo</code> is <code className="text-zinc-400">dj</code>.
                    Flame grows at 3 / 7 / 14 days.
                  </p>
                </div>
                <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5 shadow-sm shadow-black/20 sm:col-span-2 lg:col-span-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                    Poke conversion
                  </p>
                  <p className="mt-2 text-2xl font-semibold tabular-nums text-zinc-50">
                    {pokeLoading ? '…' : pokeConversion != null ? formatPercent(pokeConversion * 100, 1) : '—'}
                  </p>
                  <p className="mt-2 text-xs leading-relaxed text-zinc-600">
                    Share of orders with at least one poke (<code className="text-zinc-400">pokeCount</code> ≥ 1)
                    that reached <code className="text-zinc-400">completed</code>. Pokes append{' '}
                    <code className="text-zinc-400">pokedAt</code> timestamps on the order.
                  </p>
                </div>
              </div>
            )}
          </div>
        ) : null}

        {tab === 'revenue' ? (
          <div className="space-y-6">
            {!ordersLoading && completedRows.length >= 4000 ? (
              <p className="rounded-lg border border-amber-800/50 bg-amber-950/20 px-3 py-2 text-xs text-amber-400">
                Showing the 4,000 most recent completed orders. Older orders are excluded from all calculations on this page.
              </p>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-3">
              <MetricCard
                label={allTimeIsEstimate ? 'All-time revenue (estimated from loaded orders)' : 'All-time revenue (meta)'}
                value={formatCurrency(allTimeRevenueDisplay)}
                hint={allTimeRevenueHint}
              />
              <MetricCard
                label="MTD revenue (meta)"
                value={revenueWindows.mtd != null ? formatCurrency(revenueWindows.mtd) : '—'}
                hint={
                  revenueWindows.mtd != null
                    ? `Month ${revenueWindows.mo} · from meta/revenueStats.`
                    : `Not yet updated for ${revenueWindows.mo}. Written by backend after each completed order.`
                }
              />
              <MetricCard
                label="WTD revenue (meta)"
                value={revenueWindows.wtd != null ? formatCurrency(revenueWindows.wtd) : '—'}
                hint={
                  revenueWindows.wtd != null
                    ? `ISO week ${revenueWindows.wk} · from meta/revenueStats.`
                    : `Not yet updated for week ${revenueWindows.wk}. The backend job writes this after each completed order. Check meta/revenueStats in Firestore if stale.`
                }
              />
            </div>
            <MetricCard
              label="Avg order value (sample)"
              value={avgOrderSample != null ? formatCurrency(avgOrderSample) : '—'}
              hint={`Mean payment on last ${formatQty(completedRows.length)} completed orders loaded here.`}
            />
            <MarginWeekLineChart labels={marginWeekSeries.labels} percents={marginWeekSeries.percents} />
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                Top 10 SKUs by revenue (sample)
              </p>
              <ol className="mt-3 space-y-2 text-sm">
                {topSkus.length === 0 ? (
                  <li className="text-zinc-500">No data.</li>
                ) : (
                  topSkus.map((r) => (
                    <li key={r.mspn} className="flex flex-wrap gap-x-2 border-b border-zinc-800/60 py-2 text-zinc-300 max-sm:flex-col">
                      <span className="font-mono text-amber-200/90">
                        {r.rank}. {r.mspn}
                      </span>
                      <span className="text-zinc-500 max-sm:text-xs">{r.desc}</span>
                      <span className="ml-auto tabular-nums text-zinc-200 max-sm:ml-0">
                        {formatCurrency(r.revenue)} · {formatQty(r.units)} units
                        {r.avgMargPct != null ? ` · avg margin ${formatPercent(r.avgMargPct, 1)}` : ''}
                      </span>
                    </li>
                  ))
                )}
              </ol>
            </div>
          </div>
        ) : null}

        {tab === 'leaderboard' ? (
          <div className="space-y-6">
            {!ordersLoading && completedRows.length >= 4000 ? (
              <p className="rounded-lg border border-amber-800/50 bg-amber-950/20 px-3 py-2 text-xs text-amber-400">
                Showing the 4,000 most recent completed orders. Older orders are excluded from all calculations on this page.
              </p>
            ) : null}
            <div className="grid gap-6 sm:grid-cols-2">
            <LeaderBlock
              title="Biggest single order (margin %)"
              body={
                leaderboard.bestAll
                  ? `${formatPercent(leaderboard.bestAll.pct, 2)} · ${formatCurrency(leaderboard.bestAll.pay)} revenue · pool ${formatCurrency(leaderboard.bestAll.pool)} · ${String(leaderboard.bestAll.customerName || '—')}`
                  : '—'
              }
            />
            <LeaderBlock
              title="Highest margin % (last 30 days)"
              body={
                leaderboard.best30
                  ? `${formatPercent(leaderboard.best30.pct, 2)} · ${formatCurrency(leaderboard.best30.pay)}`
                  : '—'
              }
            />
            <LeaderBlock
              title="Most orders in one week (by assignee)"
              body={
                leaderboard.topCrew.count > 0
                  ? `${leaderboard.topCrew.handle} · ${formatQty(leaderboard.topCrew.count)} orders · week ${leaderboard.topCrew.week}`
                  : '—'
              }
            />
            <LeaderBlock
              title="Top SKU revenue (all time, sample)"
              body={
                leaderboard.topSku.revenue > 0
                  ? `${leaderboard.topSku.mspn} · ${formatCurrency(leaderboard.topSku.revenue)}`
                  : '—'
              }
            />
            </div>
          </div>
        ) : null}
      </main>
    </div>
  )
}

function LeaderBlock({ title, body }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{title}</p>
      <p className="mt-2 text-sm leading-relaxed text-zinc-200">{body}</p>
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
