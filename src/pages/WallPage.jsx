import { signOut } from 'firebase/auth'
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { auth, db } from '../firebase/config'
import { PortalSessionLine } from '../components/layout/PortalSessionLine.jsx'
import { useAuth } from '../hooks/useAuth'
import { formatCurrency, formatQty } from '../utils/format'
import { denverDayEndExclusiveMs, denverDayStartMs } from '../utils/isoWeekDenver.js'
import { LoadingBlock } from '../components/shared/LoadingBlock.jsx'
import { EmptyState } from '../components/shared/EmptyState.jsx'

function logisticsLine(o) {
  const f = String(o.fulfillment || '').toLowerCase()
  const cust =
    f === 'pickup' ? 'Customer pickup' : f === 'delivery' ? 'Delivery to customer' : f || '--'
  const m = o.logisticsMethod
  const bridge =
    m === 'dropoff' ? 'Drop-off (Source to Field)' : m === 'pickup' ? 'Pickup (Field to Source)' : ''
  return [bridge, cust].filter(Boolean).join(' · ')
}

function crewLine(o) {
  const hb = o.handledBy || {}
  const s = hb.supplier || 'Source'
  const m = hb.mechanic || 'Field'
  return `Source (${s}) to Field (${m})`
}

function isCatalogMspn(mspn) {
  return /^[A-Za-z0-9]{5}$/.test(String(mspn || '').trim())
}

function completedLabel(ts) {
  if (!ts || typeof ts.toDate !== 'function') return '--'
  try {
    const d = ts.toDate()
    const now = new Date()
    const sameDay =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate()
    if (sameDay) {
      return `Today ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
    }
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  } catch {
    return '--'
  }
}

/**
 * @param {{ embedded?: boolean }} props
 * When `embedded` is true, renders feed only (no page chrome) for use inside Analytics.
 */
export function WallPage({ embedded = false }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [minRevenue, setMinRevenue] = useState('')

  useEffect(() => {
    const q = query(
      collection(db, 'orders'),
      where('status', '==', 'completed'),
      orderBy('completedAt', 'desc'),
      limit(400),
    )
    return onSnapshot(
      q,
      (snap) => {
        setRows(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
        setLoading(false)
      },
      (e) => {
        console.error(e)
        setLoading(false)
      },
    )
  }, [])

  const filtered = useMemo(() => {
    const min = Number(minRevenue)
    const hasMin = Number.isFinite(min) && min > 0
    const fromMs = fromDate ? denverDayStartMs(fromDate) : null
    const toExclusiveMs = toDate ? denverDayEndExclusiveMs(toDate) : null
    return rows.filter((o) => {
      const pay = Number(o.paymentAmount) || 0
      if (hasMin && pay < min) return false
      const ms = o.completedAt?.toMillis?.()
      if (fromMs != null && Number.isFinite(fromMs) && (ms == null || ms < fromMs)) return false
      if (
        toExclusiveMs != null &&
        Number.isFinite(toExclusiveMs) &&
        (ms == null || ms >= toExclusiveMs)
      )
        return false
      return true
    })
  }, [rows, fromDate, toDate, minRevenue])

  async function handleSignOut() {
    await signOut(auth)
    navigate('/', { replace: true })
  }

  const body = (
    <main
      className={
        embedded
          ? 'mx-auto max-w-4xl space-y-6 px-2 py-4 sm:px-4'
          : 'mx-auto max-w-4xl space-y-6 px-6 py-8'
      }
    >
        <div className="flex flex-wrap items-end gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
          <label className="text-xs text-zinc-500">
            From
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="mt-1 block rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-200"
            />
          </label>
          <label className="text-xs text-zinc-500">
            To
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="mt-1 block rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-200"
            />
          </label>
          <label className="text-xs text-zinc-500">
            Min revenue
            <input
              type="number"
              min={0}
              step="0.01"
              placeholder="0"
              value={minRevenue}
              onChange={(e) => setMinRevenue(e.target.value)}
              className="mt-1 block w-32 rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-200"
            />
          </label>
        </div>

        {loading ? (
          <LoadingBlock label="Loading feed…" />
        ) : filtered.length === 0 ? (
          <EmptyState title="No completions in this range." />
        ) : (
          <ul className="space-y-3">
            {filtered.map((o) => (
              <li
                key={o.id}
                className="rounded-2xl border border-zinc-800/90 bg-zinc-900/50 p-4 shadow-sm shadow-black/20 transition-shadow hover:shadow-md hover:shadow-black/30"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-emerald-400" aria-hidden>
                      ✅
                    </span>
                    {isCatalogMspn(o.mspn) ? (
                      <span className="font-mono text-sm font-medium text-zinc-100">
                        {o.mspn} × {formatQty(o.quantity)}
                      </span>
                    ) : (
                      <span className="inline-flex flex-wrap items-center gap-1.5 font-mono text-sm text-zinc-500">
                        <span>{String(o.mspn ?? '--')}</span>
                        <span>× {formatQty(o.quantity)}</span>
                        <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-600">(test)</span>
                      </span>
                    )}
                    {o.hatTrickDay ? (
                      <span className="text-xs" title="Hat trick day" aria-hidden="true">
                        🎩
                      </span>
                    ) : null}
                    {o.convertedAfterPoke ? (
                      <span className="text-xs text-sky-300" title="Converted after poke" aria-hidden="true">
                        👉
                      </span>
                    ) : null}
                    {Number(o.frictionScore) > 50 ? (
                      <span
                        className="rounded-full bg-rose-950/40 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-rose-200/90 ring-1 ring-rose-800/40"
                        title="Higher friction score on this order"
                      >
                        Friction
                      </span>
                    ) : null}
                  </div>
                  <p className="text-sm font-semibold text-emerald-200">
                    {Number.isFinite(Number(o.paymentAmount)) ? formatCurrency(o.paymentAmount) : '--'}
                  </p>
                </div>
                <p className="mt-2 text-sm text-zinc-300">{o.customerName || '--'}</p>
                <p className="mt-1 text-xs text-zinc-500">
                  <span aria-hidden="true">⏱</span>{' '}
                  {o.fulfillmentTimeMinutes != null
                    ? `${o.fulfillmentTimeMinutes} min`
                    : '--'}{' '}
                  · {crewLine(o)}
                </p>
                <p className="mt-1 text-xs text-zinc-500">{logisticsLine(o)}</p>
                <p className="mt-2 text-[11px] text-zinc-600">{completedLabel(o.completedAt)}</p>
              </li>
            ))}
          </ul>
        )}
      </main>
  )

  if (embedded) {
    return (
      <div className="text-zinc-100">
        <div className="mb-4 border-b border-zinc-800/80 pb-3">
          <h2 className="text-sm font-semibold text-zinc-200">The Wall</h2>
          <p className="mt-0.5 text-xs text-zinc-500">Live completed orders. Read-only view.</p>
        </div>
        {body}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="sticky top-0 z-20 border-b border-zinc-800/80 bg-zinc-950/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-4xl flex-col gap-3 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-4 sm:px-6 sm:py-4">
          <div className="min-w-0">
            <Link to="/dashboard" className="text-sm text-zinc-500 hover:text-zinc-200">
              ← Dashboard
            </Link>
            <h1 className="mt-2 text-xl font-semibold text-white">The Wall</h1>
            <p className="mt-1 text-sm text-zinc-500">Live completed orders. Read-only view.</p>
            <div className="mt-2 sm:hidden">
              <PortalSessionLine email={user?.email} onSignOut={handleSignOut} />
            </div>
          </div>
          <div className="hidden sm:block">
            <PortalSessionLine email={user?.email} onSignOut={handleSignOut} />
          </div>
        </div>
      </header>
      {body}
    </div>
  )
}
