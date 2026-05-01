import { useEffect, useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import { doc, onSnapshot } from 'firebase/firestore'
import { db, functions } from '../../firebase/config'
import { useToast } from '../../context/ToastContext.jsx'

const ackFn = httpsCallable(functions, 'acknowledgeAdjustment')

const NAME_BY_KEY = { alex: 'Alex', dj: 'DJ', kyle: 'Kyle' }

function fmtUSD(n) {
  const v = Number(n) || 0
  const sign = v < 0 ? '-' : ''
  return `${sign}$${Math.abs(v).toFixed(2)}`
}

export function PendingAdjustmentsPanel({ crewKey }) {
  const [member, setMember] = useState(null)
  const [acking, setAcking] = useState(null)
  const { toast } = useToast()

  useEffect(() => {
    const ref = doc(db, 'meta', 'crewEarnings')
    return onSnapshot(ref, (snap) => {
      const data = snap.exists() ? snap.data() : {}
      setMember(((data?.members) || {})[crewKey] || null)
    })
  }, [crewKey])

  const adjustments = Array.isArray(member?.adjustments) ? member.adjustments : []
  const pending = adjustments.filter((a) => !a.acknowledgedBy)

  async function ack(adjustmentId) {
    setAcking(adjustmentId)
    try {
      await ackFn({ crewKey, adjustmentId })
      toast('Acknowledged', 'success')
    } catch (err) {
      toast(String(err?.message || err), 'error')
    } finally {
      setAcking(null)
    }
  }

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 sm:p-6">
      <header className="flex items-baseline justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-zinc-100">{NAME_BY_KEY[crewKey]} balance</h2>
          <p className="mt-1 text-2xl font-mono text-zinc-100">{fmtUSD(member?.balance)}</p>
        </div>
        <div className="text-xs text-zinc-400 text-right">
          <p>Earned: {fmtUSD(member?.totalEarned)}</p>
          <p>Paid: {fmtUSD(member?.totalPaid)}</p>
        </div>
      </header>
      <div className="mt-5 border-t border-zinc-800 pt-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Pending adjustments ({pending.length})
        </h3>
        {pending.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">All caught up.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {pending.map((a) => (
              <li
                key={a.adjustmentId || a.orderId}
                className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <p className="text-zinc-200">
                    Order <span className="font-mono">{a.orderId}</span> · {a.reason || 'reconcile'}
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {fmtUSD(a.oldBalance)} {'->'} {fmtUSD(a.newBalance)} (delta {fmtUSD(a.delta)})
                  </p>
                </div>
                <button
                  type="button"
                  disabled={!a.adjustmentId || acking === a.adjustmentId}
                  onClick={() => void ack(a.adjustmentId)}
                  className="rounded-lg border border-zinc-700 px-3 py-1 text-xs text-zinc-200 hover:bg-zinc-800/60 disabled:opacity-40"
                >
                  {acking === a.adjustmentId ? 'Acking...' : 'Acknowledge'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
