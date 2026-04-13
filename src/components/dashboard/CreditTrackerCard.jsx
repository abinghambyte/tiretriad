import { doc, onSnapshot } from 'firebase/firestore'
import { useEffect, useMemo, useState } from 'react'
import { db } from '../../firebase/config'

function money(n) {
  const x = Number(n)
  if (!Number.isFinite(x)) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(x)
}

function sumPending(charges) {
  if (!Array.isArray(charges)) return { total: 0, count: 0, items: [] }
  let total = 0
  let count = 0
  const items = []
  for (const c of charges) {
    if (!c || (c.status && c.status !== 'pending')) continue
    total += Number(c.total) || 0
    count += 1
    items.push(c)
  }
  return { total, count, items }
}

function activeRefunds(refunds) {
  if (!Array.isArray(refunds)) return []
  return refunds.filter((r) => r && (r.status == null || r.status === 'active'))
}

/** Available = limit − balance (pending is informational only). */
function availablePower(data) {
  const limit = Number(data?.cardLimit) || 0
  const bal = Number(data?.currentBalance) || 0
  return limit - bal
}

/**
 * @param {{ compact?: boolean }} props
 */
export function CreditTrackerCard({ compact = false }) {
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
  const refunds = useMemo(() => activeRefunds(data?.refundPipeline), [data])
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

  const shell = compact
    ? 'rounded-xl border border-amber-900/35 bg-zinc-950/80 px-4 py-3 shadow-sm shadow-black/20 sm:px-5'
    : 'rounded-2xl border border-amber-900/40 bg-gradient-to-br from-zinc-950 to-amber-950/20 p-5 shadow-lg shadow-black/20'

  if (err) {
    return (
      <div
        className={`rounded-xl border border-red-900/40 bg-red-950/20 text-sm text-red-200 ${compact ? 'px-4 py-3' : 'p-5'}`}
      >
        Could not load credit tracker (Overwatch only).
      </div>
    )
  }

  if (!exists) {
    return (
      <div className={`rounded-xl border border-zinc-800 bg-zinc-900/40 text-sm text-zinc-400 ${compact ? 'px-4 py-3' : 'p-5'}`}>
        <p className="font-medium text-zinc-200">Credit tracker</p>
        {!compact ? (
          <p className="mt-2">
            No <code className="text-zinc-500">meta/creditTracker</code> document yet. Seed with{' '}
            <code className="text-zinc-500">node scripts/seed-credit-tracker.mjs</code>.
          </p>
        ) : (
          <p className="mt-1 text-xs text-zinc-500">
            Seed <code className="text-zinc-600">meta/creditTracker</code> (see script in repo).
          </p>
        )}
      </div>
    )
  }

  if (!data) {
    return (
      <div className={`rounded-xl border border-zinc-800 bg-zinc-900/40 text-sm text-zinc-500 ${compact ? 'px-4 py-3' : 'p-5'}`}>
        Loading credit tracker…
      </div>
    )
  }

  const pendingSlice = pending.items.slice(0, compact ? 4 : 12)
  const refundSlice = refunds.slice(0, compact ? 3 : 10)

  return (
    <div className={shell}>
      <div
        className={
          compact
            ? 'flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between'
            : ''
        }
      >
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-amber-600/90">
            Fleet buying power
          </p>
          <h2 className={`font-semibold text-zinc-100 ${compact ? 'text-sm sm:text-base' : 'mt-1 text-lg'}`}>
            Credit limit tracker
          </h2>
        </div>
        <div className={compact ? 'text-right sm:min-w-[8rem]' : ''}>
          <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">Available</p>
          <p className={`font-bold tabular-nums ${availClass} ${compact ? 'text-xl sm:text-2xl' : 'mt-1 text-3xl'}`}>
            {money(avail)}
          </p>
        </div>
      </div>

      <dl
        className={
          compact
            ? 'mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:mt-2 sm:flex sm:flex-wrap sm:gap-x-6'
            : 'mt-4 space-y-2 text-sm'
        }
      >
        <div className={compact ? 'flex justify-between gap-2 sm:block' : 'flex justify-between gap-4'}>
          <dt className="text-zinc-500">Limit</dt>
          <dd className={`font-mono text-zinc-200 ${compact ? 'text-xs' : ''}`}>{money(data.cardLimit)}</dd>
        </div>
        <div className={compact ? 'flex justify-between gap-2 sm:block' : 'flex justify-between gap-4'}>
          <dt className="text-zinc-500">Balance</dt>
          <dd className={`font-mono text-zinc-200 ${compact ? 'text-xs' : ''}`}>{money(data.currentBalance)}</dd>
        </div>
        <div className={compact ? 'col-span-2 flex justify-between gap-2 sm:col-auto sm:block' : 'flex justify-between gap-4'}>
          <dt className="text-zinc-500">Pending (log)</dt>
          <dd className={`font-mono text-zinc-200 ${compact ? 'text-xs' : ''}`}>
            {money(pending.total)}{' '}
            <span className="text-zinc-500">
              ({pending.count} {pending.count === 1 ? 'line' : 'lines'})
            </span>
          </dd>
        </div>
      </dl>

      {!compact ? (
        <div className="mt-4 border-t border-zinc-800/80 pt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Pending charges</p>
          {pendingSlice.length === 0 ? (
            <p className="mt-1 text-xs text-zinc-600">None</p>
          ) : (
            <ul className="mt-2 max-h-40 space-y-1.5 overflow-y-auto text-xs text-zinc-300">
              {pendingSlice.map((c) => (
                <li key={c.id || `${c.mspn}-${c.total}`} className="flex justify-between gap-2 border-b border-zinc-800/60 pb-1">
                  <span className="truncate font-mono text-zinc-400">{c.mspn}</span>
                  <span className="shrink-0 font-mono">{money(c.total)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 text-xs font-medium uppercase tracking-wide text-zinc-500">Refund pipeline</p>
          {refundSlice.length === 0 ? (
            <p className="mt-1 text-xs text-zinc-600">None active</p>
          ) : (
            <ul className="mt-2 max-h-32 space-y-1.5 overflow-y-auto text-xs text-zinc-300">
              {refundSlice.map((r, i) => (
                <li key={r.id || `r-${i}`} className="flex justify-between gap-2">
                  <span className="truncate text-zinc-400">{r.label || 'Refund'}</span>
                  <span className="shrink-0 font-mono">{money(r.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="mt-2 text-[11px] text-zinc-500">
          {pending.count > 0 ? `${pending.count} pending line(s) · ` : ''}
          {refunds.length > 0 ? `${refunds.length} active refund(s)` : 'No active refunds'}
        </div>
      )}

      <p className={`text-zinc-600 ${compact ? 'mt-2 text-[10px]' : 'mt-3 text-xs'}`}>Last updated: {updated}</p>
    </div>
  )
}
