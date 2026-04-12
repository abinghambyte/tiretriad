import { httpsCallable } from 'firebase/functions'
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  doc,
} from 'firebase/firestore'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { db, functions } from '../../firebase/config'

const completeOrder = httpsCallable(functions, 'completeOrder')

function smsDigits(contact) {
  const d = String(contact || '').replace(/\D/g, '')
  return d
}

function statusBadge(status) {
  const base =
    'inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider'
  const map = {
    pending: 'bg-amber-500/15 text-amber-200 ring-1 ring-amber-500/25',
    available: 'bg-sky-500/15 text-sky-200 ring-1 ring-sky-500/25',
    scheduled: 'bg-violet-500/15 text-violet-200 ring-1 ring-violet-500/25',
    in_transit: 'bg-cyan-500/15 text-cyan-200 ring-1 ring-cyan-500/25',
    completed: 'bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-500/25',
    rejected: 'bg-red-500/15 text-red-200 ring-1 ring-red-500/25',
    cancelled: 'bg-zinc-600/40 text-zinc-300 ring-1 ring-zinc-500/30',
  }
  return `${base} ${map[status] || map.cancelled}`
}

/**
 * @param {object} props
 * @param {string | null} [props.highlightId]
 */
export function OrdersList({ highlightId }) {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const highlightElRef = useRef(null)
  const [completeFor, setCompleteFor] = useState(null)
  const [paymentReceived, setPaymentReceived] = useState(true)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'))
    const unsub = onSnapshot(
      q,
      (snap) => {
        setOrders(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
        setLoading(false)
        setError(null)
      },
      (err) => {
        console.error(err)
        setError(err.message || 'Could not load orders.')
        setLoading(false)
      },
    )
    return () => unsub()
  }, [])

  useEffect(() => {
    if (highlightId && highlightElRef.current) {
      highlightElRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [highlightId, orders])

  const notifyCustomer = useCallback(async (order) => {
    const digits = smsDigits(order.customerContact)
    if (!digits) {
      window.alert('No usable phone number on this order.')
      return
    }
    const name = String(order.customerName || 'there').trim() || 'there'
    const logistics =
      order.logisticsMethod === 'dropoff'
        ? "We'll deliver them to you"
        : 'You can pick them up'
    const when = String(order.scheduledTime || 'the agreed time').trim()
    const body = `Hey ${name}, your tires are ready. ${logistics} at ${when}. Reply with any questions.`
    const smsLink = `sms:${digits}?body=${encodeURIComponent(body)}`
    window.open(smsLink, '_blank', 'noopener,noreferrer')
    try {
      await updateDoc(doc(db, 'orders', order.id), {
        customerNotifiedAt: serverTimestamp(),
      })
    } catch (e) {
      console.error(e)
      window.alert('Opened SMS but could not save customerNotifiedAt. Check Firestore rules.')
    }
  }, [])

  const openComplete = (order) => {
    setPaymentReceived(true)
    setPaymentAmount(String(order.totalPrice ?? ''))
    setCompleteFor(order.id)
  }

  const submitComplete = async () => {
    if (!completeFor) return
    const amt = Number(paymentAmount)
    if (!Number.isFinite(amt) || amt < 0) {
      window.alert('Enter a valid payment amount.')
      return
    }
    setSubmitting(true)
    try {
      await completeOrder({
        orderId: completeFor,
        paymentReceived,
        paymentAmount: amt,
      })
      setCompleteFor(null)
    } catch (err) {
      console.error(err)
      window.alert(err?.message || String(err))
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <p className="text-sm text-zinc-500">Loading orders…</p>
  }
  if (error) {
    return <p className="text-sm text-red-400">{error}</p>
  }
  if (orders.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        No orders yet. Log a sale from{' '}
        <Link to="/tires" className="text-amber-300 underline-offset-2 hover:underline">
          Skedaddle Tires
        </Link>{' '}
        to create one.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <ul className="space-y-3">
        {orders.map((o) => {
          const isHi = highlightId && o.id === highlightId
          return (
            <li
              key={o.id}
              ref={isHi ? highlightElRef : undefined}
              className={[
                'rounded-xl border border-zinc-800 bg-zinc-900/40 p-4',
                isHi ? 'ring-2 ring-amber-500/50' : '',
              ].join(' ')}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <span className={statusBadge(o.status)}>{o.status}</span>
                  <p className="mt-2 font-mono text-sm text-zinc-200">
                    {o.mspn} × {o.quantity}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {o.customerName} · {o.customerContact}
                  </p>
                </div>
                <p className="text-xs text-zinc-600">{o.id}</p>
              </div>

              {o.status === 'in_transit' ? (
                <div className="mt-4 flex flex-wrap gap-2 border-t border-zinc-800/80 pt-4">
                  <button
                    type="button"
                    className="rounded-lg bg-zinc-100 px-3 py-2 text-xs font-semibold text-zinc-950 hover:bg-white"
                    onClick={() => notifyCustomer(o)}
                  >
                    Notify customer
                  </button>
                  {o.customerNotifiedAt ? (
                    <button
                      type="button"
                      className="rounded-lg border border-emerald-600/60 bg-emerald-950/40 px-3 py-2 text-xs font-semibold text-emerald-100 hover:bg-emerald-900/50"
                      onClick={() => openComplete(o)}
                    >
                      Mark complete
                    </button>
                  ) : null}
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>

      {completeFor ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm rounded-2xl border border-zinc-700 bg-zinc-900 p-5 shadow-xl">
            <h2 className="text-sm font-semibold text-white">Mark order complete</h2>
            <p className="mt-1 text-xs text-zinc-500">Payment received and amount for the record.</p>
            <label className="mt-4 flex items-center gap-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                checked={paymentReceived}
                onChange={(e) => setPaymentReceived(e.target.checked)}
              />
              Payment received
            </label>
            <label className="mt-3 block text-xs font-medium text-zinc-500">
              Payment amount (USD)
              <input
                type="number"
                min={0}
                step="0.01"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
              />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg px-3 py-2 text-xs text-zinc-400 hover:text-zinc-200"
                onClick={() => setCompleteFor(null)}
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-lg bg-amber-100 px-3 py-2 text-xs font-semibold text-zinc-950 hover:bg-amber-50 disabled:opacity-50"
                onClick={submitComplete}
                disabled={submitting}
              >
                {submitting ? 'Saving…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
