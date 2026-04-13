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

function formatMoney(n) {
  if (n == null || Number.isNaN(Number(n))) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
    Number(n),
  )
}

function logisticsLine(o) {
  const f = String(o.fulfillment || '').toLowerCase()
  const cust =
    f === 'pickup' ? 'Customer pickup' : f === 'delivery' ? 'Delivery to customer' : f || '—'
  const m = o.logisticsMethod
  const bridge =
    m === 'dropoff' ? 'Drop-off (Source → Field)' : m === 'pickup' ? 'Pickup (Field → Source)' : ''
  return [bridge, cust].filter(Boolean).join(' · ')
}

function crewLine(o) {
  const hb = o.handledBy || {}
  const s = hb.supplier || 'Source'
  const m = hb.mechanic || 'Field'
  return `Source (${s}) → Field (${m})`
}

function completedLabel(ts) {
  if (!ts || typeof ts.toDate !== 'function') return '—'
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
    return '—'
  }
}

export function WallPage() {
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
    const fromMs = fromDate ? new Date(`${fromDate}T00:00:00`).getTime() : null
    const toMs = toDate ? new Date(`${toDate}T23:59:59.999`).getTime() : null
    return rows.filter((o) => {
      const pay = Number(o.paymentAmount) || 0
      if (hasMin && pay < min) return false
      const ms = o.completedAt?.toMillis?.()
      if (fromMs != null && Number.isFinite(fromMs) && (ms == null || ms < fromMs)) return false
      if (toMs != null && Number.isFinite(toMs) && (ms == null || ms > toMs)) return false
      return true
    })
  }, [rows, fromDate, toDate, minRevenue])

  async function handleSignOut() {
    await signOut(auth)
    navigate('/', { replace: true })
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
            <p className="mt-1 text-sm text-zinc-500">Live completed orders — read only</p>
            <div className="mt-2 sm:hidden">
              <PortalSessionLine email={user?.email} onSignOut={handleSignOut} />
            </div>
          </div>
          <div className="hidden sm:block">
            <PortalSessionLine email={user?.email} onSignOut={handleSignOut} />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 px-6 py-8">
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
          <p className="text-sm text-zinc-500">Loading feed…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-zinc-500">No completions in this range.</p>
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
                    <span className="font-mono text-sm font-medium text-zinc-100">
                      {o.mspn} × {o.quantity}
                    </span>
                    {o.hatTrickDay ? (
                      <span className="text-xs" title="Hat trick day">
                        🎩
                      </span>
                    ) : null}
                    {o.convertedAfterPoke ? (
                      <span className="text-xs text-sky-300" title="Converted after poke">
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
                    {formatMoney(o.paymentAmount)}
                  </p>
                </div>
                <p className="mt-2 text-sm text-zinc-300">{o.customerName || '—'}</p>
                <p className="mt-1 text-xs text-zinc-500">
                  ⏱{' '}
                  {o.fulfillmentTimeMinutes != null
                    ? `${o.fulfillmentTimeMinutes} min`
                    : '—'}{' '}
                  · {crewLine(o)}
                </p>
                <p className="mt-1 text-xs text-zinc-500">{logisticsLine(o)}</p>
                <p className="mt-2 text-[11px] text-zinc-600">{completedLabel(o.completedAt)}</p>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}
