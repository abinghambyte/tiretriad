import { doc, onSnapshot } from 'firebase/firestore'
import { useEffect, useMemo, useRef, useState, startTransition } from 'react'
import { db } from '../../firebase/config'
import { formatCurrency } from '../../utils/format'

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
  const [expanded, setExpanded] = useState(false)

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

  const prevAvailRef = useRef(/** @type {number | null} */ (null))
  const [availAnimKey, setAvailAnimKey] = useState(0)
  useEffect(() => {
    if (avail == null || !Number.isFinite(avail)) return
    const prev = prevAvailRef.current
    prevAvailRef.current = avail
    if (prev != null && Math.abs(prev - avail) > 0.005) {
      startTransition(() => {
        setAvailAnimKey((k) => k + 1)
      })
    }
  }, [avail])

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
    ? 'rounded-lg border border-zinc-800/90 bg-zinc-950/90 px-3 py-2 shadow-sm shadow-black/20 sm:px-4'
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
      <div className={`rounded-xl border border-zinc-800 bg-zinc-900/40 ${compact ? 'px-4 py-3' : 'p-5'}`}>
        <div className="space-y-3 animate-pulse">
          <div className="h-3 w-32 rounded-md bg-zinc-800/80" />
          <div className="h-8 w-48 max-w-full rounded-md bg-zinc-800/70" />
          <div className="h-3 w-full rounded-md bg-zinc-800/50" />
        </div>
      </div>
    )
  }

  const pendingSlice = pending.items.slice(0, compact ? 8 : 12)
  const refundSlice = refunds.slice(0, compact ? 6 : 10)

  if (compact) {
    return (
      <div className={shell}>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full flex-col gap-1 text-left sm:flex-row sm:flex-wrap sm:items-baseline sm:justify-between sm:gap-x-6 sm:gap-y-1"
          aria-expanded={expanded}
        >
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Available</span>
            <span
              key={availAnimKey}
              className={`sk-figures text-lg font-bold tabular-nums sm:text-xl ${availClass} ${availAnimKey > 0 ? 'sk-credit-flash rounded-md' : ''}`}
            >
              {avail != null && Number.isFinite(avail) ? formatCurrency(avail) : '—'}
            </span>
          </div>
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5 text-xs text-zinc-400 sm:text-sm">
            <span>
              <span className="text-zinc-500">Balance</span>{' '}
              <span className="font-mono font-semibold text-zinc-200">{formatCurrency(data.currentBalance)}</span>
            </span>
            <span>
              <span className="text-zinc-500">Limit</span>{' '}
              <span className="font-mono font-semibold text-zinc-200">{formatCurrency(data.cardLimit)}</span>
            </span>
          </div>
          <span className="text-[10px] text-zinc-600 sm:ml-auto">
            {expanded ? 'Hide detail' : 'Pending & refunds'}
            <span className="ml-1 text-zinc-500" aria-hidden>
              {expanded ? '▴' : '▾'}
            </span>
          </span>
        </button>
        {expanded ? (
          <div className="mt-3 border-t border-zinc-800/80 pt-3">
            <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">Pending charges</p>
            {pendingSlice.length === 0 ? (
              <p className="mt-1 text-xs text-zinc-600">None</p>
            ) : (
              <ul className="mt-2 max-h-36 space-y-1 overflow-y-auto text-xs text-zinc-300">
                {pendingSlice.map((c) => (
                  <li key={c.id || `${c.mspn}-${c.total}`} className="flex justify-between gap-2 border-b border-zinc-800/60 pb-1">
                    <span className="truncate font-mono text-zinc-400">{c.mspn}</span>
                    <span className="shrink-0 font-mono">{formatCurrency(c.total)}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-[10px] font-medium uppercase tracking-wide text-zinc-500">Refund pipeline</p>
            {refundSlice.length === 0 ? (
              <p className="mt-1 text-xs text-zinc-600">None active</p>
            ) : (
              <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto text-xs text-zinc-300">
                {refundSlice.map((r, i) => (
                  <li key={r.id || `r-${i}`} className="flex justify-between gap-2">
                    <span className="truncate text-zinc-400">{r.label || 'Refund'}</span>
                    <span className="shrink-0 font-mono">{formatCurrency(r.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
        <p className="mt-2 text-[10px] text-zinc-600">Updated {updated}</p>
      </div>
    )
  }

  return (
    <div className={shell}>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-amber-600/90">
          Fleet buying power
        </p>
        <h2 className="mt-1 text-lg font-semibold text-zinc-100">Credit limit tracker</h2>
        <p
          key={availAnimKey}
          className={`sk-figures mt-2 text-3xl font-bold tabular-nums ${availClass} ${availAnimKey > 0 ? 'sk-credit-flash inline-block rounded-md' : ''}`}
        >
          {avail != null && Number.isFinite(avail) ? formatCurrency(avail) : '—'}
        </p>
        <p className="mt-1 text-xs text-zinc-500">Available (limit − balance)</p>
      </div>

      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-zinc-500">Limit</dt>
          <dd className="font-mono text-zinc-200">{formatCurrency(data.cardLimit)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-zinc-500">Balance</dt>
          <dd className="font-mono text-zinc-200">{formatCurrency(data.currentBalance)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-zinc-500">Pending (log)</dt>
          <dd className="font-mono text-zinc-200">
            {formatCurrency(pending.total)}{' '}
            <span className="text-zinc-500">
              ({pending.count} {pending.count === 1 ? 'line' : 'lines'})
            </span>
          </dd>
        </div>
      </dl>

      <div className="mt-4 border-t border-zinc-800/80 pt-4">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Pending charges</p>
        {pendingSlice.length === 0 ? (
          <p className="mt-1 text-xs text-zinc-600">None</p>
        ) : (
          <ul className="mt-2 max-h-40 space-y-1.5 overflow-y-auto text-xs text-zinc-300">
            {pendingSlice.map((c) => (
              <li key={c.id || `${c.mspn}-${c.total}`} className="flex justify-between gap-2 border-b border-zinc-800/60 pb-1">
                <span className="truncate font-mono text-zinc-400">{c.mspn}</span>
                <span className="shrink-0 font-mono">{formatCurrency(c.total)}</span>
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
                <span className="shrink-0 font-mono">{formatCurrency(r.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="mt-3 text-xs text-zinc-600">Last updated: {updated}</p>
    </div>
  )
}
