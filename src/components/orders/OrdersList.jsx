import { httpsCallable } from 'firebase/functions'
import {
  collection,
  increment,
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
const cancelOrderFromPortal = httpsCallable(functions, 'cancelOrderFromPortal')

const POKE_MESSAGES = {
  1: (name) =>
    `Hey ${name}, checking in — still interested in the tires? Let us know and we can have them ready.`,
  2: (name) =>
    `Hey ${name}, following up one more time. We're holding them for you but can't indefinitely — let us know either way.`,
  3: (name) =>
    `Hey ${name}, last check — tires are still available but we'll need to move on soon.`,
}

const CANCEL_DISPOSITIONS = [
  { value: 'ghost', label: 'Customer ghosted', icon: '👻' },
  { value: 'pricing', label: 'Pricing issue', icon: '💸' },
  { value: 'found_elsewhere', label: 'Found tires elsewhere', icon: '🔍' },
  { value: 'wrong_size', label: 'Wrong size / fitment', icon: '📐' },
  { value: 'timing', label: "Timing didn't work out", icon: '⏰' },
  { value: 'changed_mind', label: 'Changed their mind', icon: '🔄' },
  { value: 'no_payment', label: 'Payment fell through', icon: '🚫' },
  { value: 'weather', label: 'Weather / road conditions', icon: '🌧️' },
  { value: 'other', label: 'Other', icon: '✏️' },
]

function pokeBody(order) {
  const name = String(order.customerName || 'there').trim() || 'there'
  const next = (Number(order.pokeCount) || 0) + 1
  const key = Math.min(next, 3)
  return POKE_MESSAGES[key](name)
}

function smsDigits(contact) {
  const d = String(contact || '').replace(/\D/g, '')
  return d
}

function formatPhoneDisplay(digits) {
  const d = String(digits || '')
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
  if (d.length === 11 && d.startsWith('1')) {
    return `+1 (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`
  }
  return d || '—'
}

function buildNotifyPayload(order) {
  const digits = smsDigits(order.customerContact)
  const name = String(order.customerName || 'there').trim() || 'there'
  const logistics =
    order.logisticsMethod === 'dropoff'
      ? "We'll deliver them to you"
      : 'You can pick them up'
  const when = String(
    order.fulfillmentScheduledTime || order.scheduledTime || 'the agreed time',
  ).trim()
  const body = `Hey ${name}, your tires are ready. ${logistics} at ${when}. Reply with any questions.`
  return { digits, body, displayPhone: formatPhoneDisplay(digits) }
}

function statusBadge(status) {
  const base =
    'inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider'
  const map = {
    pending: 'bg-amber-500/15 text-amber-200 ring-1 ring-amber-500/25',
    prospective: 'bg-fuchsia-500/15 text-fuchsia-100 ring-1 ring-fuchsia-500/30',
    available: 'bg-sky-500/15 text-sky-200 ring-1 ring-sky-500/25',
    scheduled: 'bg-violet-500/15 text-violet-200 ring-1 ring-violet-500/25',
    in_transit: 'bg-cyan-500/15 text-cyan-200 ring-1 ring-cyan-500/25',
    completed: 'bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-500/25',
    rejected: 'bg-red-500/15 text-red-200 ring-1 ring-red-500/25',
    cancelled: 'bg-zinc-600/40 text-zinc-300 ring-1 ring-zinc-500/30',
  }
  return `${base} ${map[status] || map.cancelled}`
}

function orderCanCancel(status) {
  return !['completed', 'cancelled', 'rejected'].includes(String(status || ''))
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

  const [notifyModalOrder, setNotifyModalOrder] = useState(null)
  const [cancelFor, setCancelFor] = useState(null)
  const [cancelDisp, setCancelDisp] = useState('')
  const [cancelNote, setCancelNote] = useState('')
  const [cancelSubmitting, setCancelSubmitting] = useState(false)

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

  const persistCustomerNotified = useCallback(async (order) => {
    const patch = { customerNotifiedAt: serverTimestamp() }
    if (!order.firstNotifiedAt) {
      patch.firstNotifiedAt = serverTimestamp()
      patch.totalTouchpoints = 1
    }
    await updateDoc(doc(db, 'orders', order.id), patch)
  }, [])

  const openNotifyModal = useCallback((order) => {
    const { digits } = buildNotifyPayload(order)
    if (!digits) {
      window.alert('No usable phone number on this order.')
      return
    }
    setNotifyModalOrder(order)
  }, [])

  const copyNotifyMessage = useCallback(async () => {
    if (!notifyModalOrder) return
    const { body } = buildNotifyPayload(notifyModalOrder)
    try {
      await navigator.clipboard.writeText(body)
    } catch {
      window.alert('Could not copy. Select the message text manually.')
    }
    try {
      await persistCustomerNotified(notifyModalOrder)
    } catch (e) {
      console.error(e)
      window.alert('Copied, but could not save notify fields. Check Firestore rules.')
    }
  }, [notifyModalOrder, persistCustomerNotified])

  const openNotifySms = useCallback(async () => {
    if (!notifyModalOrder) return
    const { digits, body } = buildNotifyPayload(notifyModalOrder)
    const smsLink = `sms:${digits}?body=${encodeURIComponent(body)}`
    window.open(smsLink, '_blank', 'noopener,noreferrer')
    try {
      await persistCustomerNotified(notifyModalOrder)
    } catch (e) {
      console.error(e)
      window.alert('Opened Messages but could not save notify fields. Check Firestore rules.')
    }
  }, [notifyModalOrder, persistCustomerNotified])

  const pokeCustomer = useCallback(async (order) => {
    const digits = smsDigits(order.customerContact)
    if (!digits) {
      window.alert('No usable phone number on this order.')
      return
    }
    const body = pokeBody(order)
    const smsLink = `sms:${digits}?body=${encodeURIComponent(body)}`
    window.open(smsLink, '_blank', 'noopener,noreferrer')
    const firstMs = order.firstNotifiedAt?.toMillis?.()
    const notifyToPokeMinutes =
      firstMs != null ? Math.round((Date.now() - firstMs) / 60000) : 0
    const nextPoke = (Number(order.pokeCount) || 0) + 1
    try {
      await updateDoc(doc(db, 'orders', order.id), {
        pokeCount: increment(1),
        lastPokedAt: serverTimestamp(),
        notifyToPokeMinutes,
        totalTouchpoints: 1 + nextPoke,
      })
    } catch (e) {
      console.error(e)
      window.alert('Opened SMS but could not save poke fields. Check Firestore rules.')
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

  const openCancelModal = (order) => {
    setCancelDisp('')
    setCancelNote('')
    setCancelFor(order)
  }

  const submitCancel = async () => {
    if (!cancelFor) return
    if (!cancelDisp) {
      window.alert('Choose a cancellation reason.')
      return
    }
    if (cancelDisp === 'other' && !cancelNote.trim()) {
      window.alert('Add a short note when Other is selected.')
      return
    }
    setCancelSubmitting(true)
    try {
      await cancelOrderFromPortal({
        orderId: cancelFor.id,
        disposition: cancelDisp,
        cancellationNote: cancelNote.trim(),
      })
      setCancelFor(null)
    } catch (e) {
      console.error(e)
      window.alert(e?.message || String(e))
    } finally {
      setCancelSubmitting(false)
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

  const notifyPayload = notifyModalOrder ? buildNotifyPayload(notifyModalOrder) : null

  return (
    <div className="space-y-4">
      <ul className="space-y-3">
        {orders.map((o) => {
          const isHi = highlightId && o.id === highlightId
          const cancellable = orderCanCancel(o.status)
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
                  {o.repeatGhost ? (
                    <p className="mt-1 text-[11px] font-medium text-amber-400/90">
                      Repeat ghost contact
                    </p>
                  ) : null}
                </div>
                <p className="text-xs text-zinc-600">{o.id}</p>
              </div>

              <div className="mt-4 flex flex-wrap gap-2 border-t border-zinc-800/80 pt-4">
                {cancellable ? (
                  <button
                    type="button"
                    className="rounded-lg border border-red-900/50 bg-red-950/30 px-3 py-2 text-xs font-semibold text-red-100 hover:bg-red-900/40"
                    onClick={() => openCancelModal(o)}
                  >
                    Cancel order
                  </button>
                ) : null}
                {o.status === 'in_transit' ? (
                  <>
                    <button
                      type="button"
                      className="rounded-lg bg-zinc-100 px-3 py-2 text-xs font-semibold text-zinc-950 hover:bg-white"
                      onClick={() => openNotifyModal(o)}
                    >
                      Notify customer
                    </button>
                    {o.customerNotifiedAt ? (
                      <button
                        type="button"
                        className="rounded-lg border border-amber-600/50 bg-amber-950/30 px-3 py-2 text-xs font-semibold text-amber-100 hover:bg-amber-900/40"
                        onClick={() => pokeCustomer(o)}
                      >
                        Poke customer
                      </button>
                    ) : null}
                    {o.customerNotifiedAt ? (
                      <button
                        type="button"
                        className="rounded-lg border border-emerald-600/60 bg-emerald-950/40 px-3 py-2 text-xs font-semibold text-emerald-100 hover:bg-emerald-900/50"
                        onClick={() => openComplete(o)}
                      >
                        Mark complete
                      </button>
                    ) : null}
                  </>
                ) : null}
              </div>
            </li>
          )
        })}
      </ul>

      {notifyModalOrder && notifyPayload ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="notify-customer-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-900 p-5 shadow-xl">
            <h2 id="notify-customer-title" className="text-sm font-semibold text-white">
              Notify customer
            </h2>
            <p className="mt-1 text-xs text-zinc-500">
              Copy the text or open your SMS app. We record the first notify either way.
            </p>
            <p className="mt-3 text-xs font-medium text-zinc-400">
              Phone <span className="text-zinc-200">{notifyPayload.displayPhone}</span>
            </p>
            <label className="mt-3 block text-xs font-medium text-zinc-500">
              Message
              <textarea
                readOnly
                rows={4}
                value={notifyPayload.body}
                className="mt-1 w-full resize-none rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200"
              />
            </label>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-lg bg-zinc-100 px-3 py-2 text-xs font-semibold text-zinc-950 hover:bg-white"
                onClick={() => void copyNotifyMessage()}
              >
                Copy message
              </button>
              <button
                type="button"
                className="rounded-lg border border-zinc-600 px-3 py-2 text-xs font-semibold text-zinc-200 hover:bg-zinc-800"
                onClick={() => void openNotifySms()}
              >
                Open in Messages
              </button>
              <button
                type="button"
                className="ml-auto rounded-lg px-3 py-2 text-xs text-zinc-500 hover:text-zinc-300"
                onClick={() => setNotifyModalOrder(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {cancelFor ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-zinc-700 bg-zinc-900 p-5 shadow-xl">
            <h2 className="text-sm font-semibold text-white">Cancel order</h2>
            <p className="mt-1 font-mono text-xs text-zinc-500">
              {cancelFor.mspn} × {cancelFor.quantity}
            </p>
            <label className="mt-4 block text-xs font-medium text-zinc-500">
              Why cancel?
              <select
                value={cancelDisp}
                onChange={(e) => setCancelDisp(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
              >
                <option value="">Choose…</option>
                {CANCEL_DISPOSITIONS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.icon} {d.label}
                  </option>
                ))}
              </select>
            </label>
            {cancelDisp === 'other' ? (
              <label className="mt-3 block text-xs font-medium text-zinc-500">
                Details (required)
                <textarea
                  value={cancelNote}
                  onChange={(e) => setCancelNote(e.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
                  placeholder="What happened?"
                />
              </label>
            ) : null}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg px-3 py-2 text-xs text-zinc-400 hover:text-zinc-200"
                onClick={() => setCancelFor(null)}
                disabled={cancelSubmitting}
              >
                Close
              </button>
              <button
                type="button"
                className="rounded-lg bg-red-900/80 px-3 py-2 text-xs font-semibold text-red-50 hover:bg-red-800 disabled:opacity-50"
                onClick={() => void submitCancel()}
                disabled={cancelSubmitting}
              >
                {cancelSubmitting ? 'Cancelling…' : 'Confirm cancel'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

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
