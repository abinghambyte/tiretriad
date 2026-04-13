import { doc, onSnapshot } from 'firebase/firestore'
import { useEffect, useMemo, useState } from 'react'
import { db } from '../../firebase/config'

function money(n) {
  const x = Number(n)
  if (!Number.isFinite(x)) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(x)
}

function sumPending(charges) {
  if (!Array.isArray(charges)) return { total: 0, count: 0 }
  let total = 0
  let count = 0
  for (const c of charges) {
    if (!c || (c.status && c.status !== 'pending')) continue
    total += Number(c.total) || 0
    count += 1
  }
  return { total, count }
}

function sumRefunds(refunds) {
  if (!Array.isArray(refunds)) return 0
  return refunds.reduce((s, r) => s + (Number(r?.amount) || 0), 0)
}

function availablePower(data) {
  const limit = Number(data?.cardLimit) || 0
  const bal = Number(data?.currentBalance) || 0
  const { total: pending } = sumPending(data?.pendingCharges)
  const refunds = sumRefunds(data?.refundPipeline)
  return limit - bal - pending + refunds
}

export function CreditTrackerCard() {
  const [data, setData] = useState(null)
  const [exists, setExists] = useState(true)
  const [err, setErr] = useState(null)

  useEffect(() => {
    const ref = doc(db, 'meta', 'creditTracker')
    return onSnapshot(
      ref,
      (snap) => {
        setErr(null)
        if (!snap.exists()) {
          setExists(false)
          setData(null)
          return
        }
        setExists(true)
        setData(snap.data())
      },
      (e) => {
        console.error(e)
        setErr(e)
      },
    )
  }, [])

  const pending = useMemo(() => sumPending(data?.pendingCharges), [data])
  const refundTotal = useMemo(() => sumRefunds(data?.refundPipeline), [data])
  const avail = useMemo(() => (data ? availablePower(data) : null), [data])

  const availClass =
    avail == null || !Number.isFinite(avail)
      ? 'text-zinc-200'
      : avail < 1000
        ? 'text-red-400'
        : avail < 3000
          ? 'text-amber-300'
          : 'text-emerald-300'

  const updated =
    data?.updatedAt?.toDate?.() instanceof Date
      ? data.updatedAt.toDate().toLocaleString('en-US', {
          dateStyle: 'medium',
          timeStyle: 'short',
        })
      : '—'

  if (err) {
    return (
      <div className="rounded-2xl border border-red-900/40 bg-red-950/20 p-5 text-sm text-red-200">
        Could not load credit tracker (Overwatch only).
      </div>
    )
  }

  if (!exists) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 text-sm text-zinc-400">
        <p className="font-medium text-zinc-200">Credit tracker</p>
        <p className="mt-2">
          No <code className="text-zinc-500">meta/creditTracker</code> document yet. Seed with{' '}
          <code className="text-zinc-500">node scripts/seed-credit-tracker.mjs</code>.
        </p>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 text-sm text-zinc-500">
        Loading credit tracker…
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-amber-900/40 bg-gradient-to-br from-zinc-950 to-amber-950/20 p-5 shadow-lg shadow-black/20">
      <p className="text-xs font-semibold uppercase tracking-widest text-amber-600/90">
        Fleet buying power
      </p>
      <h2 className="mt-1 text-lg font-semibold text-zinc-100">Credit limit tracker</h2>
      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-zinc-500">Credit limit</dt>
          <dd className="font-mono text-zinc-200">{money(data.cardLimit)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-zinc-500">Current balance</dt>
          <dd className="font-mono text-zinc-200">{money(data.currentBalance)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-zinc-500">Pending charges</dt>
          <dd className="font-mono text-zinc-200">
            {money(pending.total)}{' '}
            <span className="text-zinc-500">
              ({pending.count} {pending.count === 1 ? 'order' : 'orders'})
            </span>
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-zinc-500">Refund pipeline</dt>
          <dd className="font-mono text-zinc-200">{money(refundTotal)} coming back</dd>
        </div>
      </dl>
      <div className="mt-5 border-t border-zinc-800/80 pt-4">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Available buying power
        </p>
        <p className={`mt-1 text-3xl font-bold tabular-nums ${availClass}`}>{money(avail)}</p>
      </div>
      <p className="mt-3 text-xs text-zinc-600">Last updated: {updated}</p>
    </div>
  )
}
