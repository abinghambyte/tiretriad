import { httpsCallable } from 'firebase/functions'
import {
  arrayUnion,
  collection,
  doc,
  getDoc,
  increment,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
} from 'firebase/firestore'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useToast } from '../../context/ToastContext.jsx'
import { auth, db, functions } from '../../firebase/config'
import { phoneDocIdFromContact } from '../../utils/phoneDocId'
import {
  playOrderCompleteSound,
  readSoundEnabled,
  writeSoundEnabled,
} from '../../utils/playOrderCompleteSound'
import {
  MODAL_CENTER_BACKDROP,
  MODAL_CENTER_PANEL_BASE,
} from '../ui/modalChrome.js'
import Spinner from '../ui/Spinner.jsx'
import {
  BTN_GHOST_DESTRUCTIVE,
  BTN_PRIMARY,
  BTN_SECONDARY,
} from '../ui/buttonStyles.js'
import { StatusPill } from '../ui/StatusPill.jsx'
import { statusPillTone } from '../ui/statusPillTone.js'
import { formatCurrency, formatPercent, formatQty } from '../../utils/format'
import { EmptyState, EmptyStateIcons } from '../shared/EmptyState.jsx'

const completeOrder = httpsCallable(functions, 'completeOrder')
const cancelOrderFromPortal = httpsCallable(functions, 'cancelOrderFromPortal')

const POKE_MESSAGES = {
  1: (name) =>
    `Hey ${name}, checking in. Still interested in the tires? Let us know and we can have them ready.`,
  2: (name) =>
    `Hey ${name}, following up one more time. We're holding them for you but can't indefinitely. Let us know either way.`,
  3: (name) =>
    `Hey ${name}, last check. Tires are still available but we'll need to move on soon.`,
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
  return d || '--'
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

const ORDER_STATUS_LABELS = {
  pending: 'Pending',
  available: 'Available',
  scheduled: 'Scheduled',
  in_transit: 'In Transit',
  completed: 'Completed',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
  prospective: 'Prospective',
  ready: 'Ready',
}

function orderStatusLabel(status) {
  const raw = String(status || '').trim()
  if (!raw) return '--'
  const k = raw.toLowerCase().replace(/\s+/g, '_')
  if (ORDER_STATUS_LABELS[k]) return ORDER_STATUS_LABELS[k]
  const compact = raw.replace(/_/g, '').toLowerCase()
  const alias = Object.keys(ORDER_STATUS_LABELS).find(
    (key) => key.replace(/_/g, '') === compact,
  )
  if (alias) return ORDER_STATUS_LABELS[alias]
  return 'Unknown'
}

function orderRefFromId(id) {
  const s = String(id || '').replace(/\s/g, '')
  if (!s) return ''
  return `#${s.slice(0, 8)}`
}

function fulfillmentBadgeLabel(o) {
  const f = String(o.fulfillment || '').toLowerCase()
  if (f === 'pickup') return 'Pickup'
  if (f === 'delivery') return 'Delivery'
  return 'Fulfillment'
}

function fulfillmentBadgeClass(o) {
  const f = String(o.fulfillment || '').toLowerCase()
  if (f === 'pickup') {
    return 'inline-flex items-center rounded-full bg-sky-950/50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-200 ring-1 ring-sky-800/40'
  }
  if (f === 'delivery') {
    return 'inline-flex items-center rounded-full bg-violet-950/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-200 ring-1 ring-violet-800/40'
  }
  return 'inline-flex items-center rounded-full bg-zinc-800/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400 ring-1 ring-zinc-700/60'
}

// Status tone delegated to StatusPill's statusPillTone. Kept here as a
// helper so existing callers stay tiny; the visual geometry now lives in
// the StatusPill primitive.

function orderCanCancel(status) {
  return !['completed', 'cancelled', 'rejected'].includes(String(status || ''))
}

function OrderDebriefPrompt({ order }) {
  const { toast } = useToast()
  const [notes, setNotes] = useState('')
  const [vote, setVote] = useState('maybe')
  const [busy, setBusy] = useState(false)

  const show = order.status === 'completed' && order.debrief == null
  if (!show) return null

  async function skip() {
    setBusy(true)
    try {
      await updateDoc(doc(db, 'orders', order.id), {
        debrief: {
          skipped: true,
          writtenAt: serverTimestamp(),
          writtenBy: auth.currentUser?.uid || '',
        },
      })
      toast('Debrief skipped', 'success')
    } catch (e) {
      toast(e?.message || 'Skip failed.', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function save() {
    if (!['yes', 'no', 'maybe'].includes(vote)) {
      toast('Choose Yes, No, or Maybe before saving.', 'error')
      return
    }
    setBusy(true)
    try {
      await updateDoc(doc(db, 'orders', order.id), {
        debrief: {
          notes: notes.trim(),
          repeatCustomer: vote,
          writtenAt: serverTimestamp(),
          writtenBy: auth.currentUser?.uid || '',
        },
      })
      const pk = phoneDocIdFromContact(order.customerContact)
      if (pk) {
        try {
          await updateDoc(doc(db, 'contacts', pk), { repeatCustomerVote: vote })
        } catch {
          /* contact row may not exist yet */
        }
      }
      toast('Debrief saved', 'success')
    } catch (e) {
      toast(e?.message || 'Save failed.', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-4 border-t border-zinc-800/80 pt-4">
      <p className="text-xs font-medium text-zinc-400">📝 Quick debrief (optional)</p>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={2}
        placeholder="Anything about this job?"
        className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-200"
      />
      <p className="mt-3 text-[11px] text-zinc-500">Would you work with this customer again?</p>
      <div className="mt-1 flex flex-wrap gap-2">
        {[
          { id: 'yes', label: 'Yes' },
          { id: 'no', label: 'No' },
          { id: 'maybe', label: 'Maybe' },
        ].map((v) => (
          <label
            key={v.id}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900/50 px-2 py-1 text-[11px] text-zinc-300"
          >
            <input
              type="radio"
              name={`debrief-${order.id}`}
              checked={vote === v.id}
              onChange={() => setVote(v.id)}
            />
            {v.label}
          </label>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void save()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-violet-900/50 px-3 py-1.5 text-[11px] font-semibold text-violet-100 ring-1 ring-violet-800/50 hover:bg-violet-900/70 disabled:opacity-50"
        >
          {busy && <Spinner className="h-3 w-3 text-violet-100" />}
          Save debrief
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void skip()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-600 px-3 py-1.5 text-[11px] text-zinc-400 hover:bg-zinc-800/50 disabled:opacity-50"
        >
          {busy && <Spinner className="h-3 w-3 text-zinc-400" />}
          Skip
        </button>
      </div>
    </div>
  )
}

/**
 * @param {object} props
 * @param {string | null} [props.highlightId]
 */
export function OrdersList({ highlightId }) {
  const { toast } = useToast()
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

  const prevStatusRef = useRef(new Map())
  const [soundOn, setSoundOn] = useState(() => readSoundEnabled())
  const [tiresByMspn, setTiresByMspn] = useState(() => new Map())
  const [pokingId, setPokingId] = useState(null)

  useEffect(() => {
    const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'))
    const unsub = onSnapshot(
      q,
      (snap) => {
        for (const change of snap.docChanges()) {
          if (change.type === 'modified') {
            const prev = prevStatusRef.current.get(change.doc.id)
            const next = change.doc.data().status
            if (prev && prev !== 'completed' && next === 'completed') {
              playOrderCompleteSound()
              break
            }
          }
        }
        prevStatusRef.current = new Map(
          snap.docs.map((d) => [d.id, d.data().status]),
        )
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
    const ids = [...new Set(orders.map((o) => String(o.mspn || '').trim()).filter(Boolean))].slice(0, 120)
    if (!ids.length) {
      setTiresByMspn(new Map())
      return undefined
    }
    let cancelled = false
    void (async () => {
      const entries = await Promise.all(
        ids.map(async (id) => {
          const s = await getDoc(doc(db, 'tires', id))
          return [id, s.exists() ? s.data() || {} : null]
        }),
      )
      if (!cancelled) setTiresByMspn(new Map(entries))
    })()
    return () => {
      cancelled = true
    }
  }, [orders])

  useEffect(() => {
    if (highlightId && highlightElRef.current) {
      highlightElRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [highlightId, orders])

  const dismissOrderModals = useCallback(() => {
    setNotifyModalOrder(null)
    setCancelFor(null)
    setCancelDisp('')
    setCancelNote('')
    setCompleteFor(null)
  }, [])

  useEffect(() => {
    if (!notifyModalOrder && !cancelFor && !completeFor) return undefined
    function onKeyDown(e) {
      if (e.key === 'Escape') dismissOrderModals()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [notifyModalOrder, cancelFor, completeFor, dismissOrderModals])

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
      toast('No phone number on this order.', 'error')
      return
    }
    setNotifyModalOrder(order)
  }, [toast])

  const copyNotifyMessage = useCallback(async () => {
    if (!notifyModalOrder) return
    const { body } = buildNotifyPayload(notifyModalOrder)
    try {
      await navigator.clipboard.writeText(body)
    } catch {
      toast('Could not copy. Select the text manually.', 'error')
    }
    try {
      await persistCustomerNotified(notifyModalOrder)
    } catch (e) {
      console.error(e)
      toast('Copied. Could not save notification log.', 'error')
    }
  }, [notifyModalOrder, persistCustomerNotified, toast])

  const openNotifySms = useCallback(async () => {
    if (!notifyModalOrder) return
    const { digits, body } = buildNotifyPayload(notifyModalOrder)
    const smsLink = `sms:${digits}?body=${encodeURIComponent(body)}`
    window.open(smsLink, '_blank', 'noopener,noreferrer')
    try {
      await persistCustomerNotified(notifyModalOrder)
    } catch (e) {
      console.error(e)
      toast('SMS opened. Could not save notification log.', 'error')
    }
  }, [notifyModalOrder, persistCustomerNotified, toast])

  const pokeCustomer = useCallback(async (order) => {
    const digits = smsDigits(order.customerContact)
    if (!digits) {
      toast('No phone number on this order.', 'error')
      return
    }
    const body = pokeBody(order)
    const smsLink = `sms:${digits}?body=${encodeURIComponent(body)}`
    window.open(smsLink, '_blank', 'noopener,noreferrer')
    const firstMs = order.firstNotifiedAt?.toMillis?.()
    const notifyToPokeMinutes =
      firstMs != null ? Math.round((Date.now() - firstMs) / 60000) : 0
    const nextPoke = (Number(order.pokeCount) || 0) + 1
    setPokingId(order.id)
    try {
      await updateDoc(doc(db, 'orders', order.id), {
        pokeCount: increment(1),
        lastPokedAt: serverTimestamp(),
        pokedAt: arrayUnion(Timestamp.now()),
        notifyToPokeMinutes,
        totalTouchpoints: 1 + nextPoke,
      })
    } catch (e) {
      console.error(e)
      toast('SMS opened. Could not log the follow-up.', 'error')
    } finally {
      setPokingId(null)
    }
  }, [toast])

  const openComplete = (order) => {
    setPaymentReceived(true)
    setPaymentAmount(String(order.totalPrice ?? ''))
    setCompleteFor(order.id)
  }

  const submitComplete = async () => {
    if (!completeFor) return
    const amt = Number(paymentAmount)
    if (!Number.isFinite(amt) || amt < 0) {
      toast('Enter a valid payment amount.', 'error')
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
      toast(err?.message || 'Could not complete order.', 'error')
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
      toast('Choose a cancellation reason.', 'error')
      return
    }
    if (cancelDisp === 'other' && !cancelNote.trim()) {
      toast('Add a short note for Other.', 'error')
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
      toast('Order cancelled', 'success')
    } catch (e) {
      console.error(e)
      toast(e?.message || 'Could not cancel order.', 'error')
    } finally {
      setCancelSubmitting(false)
    }
  }

  if (loading) {
    return (
      <ul className="space-y-3" aria-busy>
        {[0, 1, 2].map((i) => (
          <li
            key={i}
            className="animate-pulse rounded-xl border border-zinc-800/80 bg-zinc-900/40 px-4 py-6"
          >
            <div className="h-4 w-1/3 rounded bg-zinc-800/80" />
            <div className="mt-3 h-3 w-2/3 rounded bg-zinc-800/60" />
          </li>
        ))}
      </ul>
    )
  }
  if (error) {
    return <p className="text-sm text-red-400">{error}</p>
  }
  if (orders.length === 0) {
    return (
      <EmptyState
        icon={EmptyStateIcons.cart}
        title="No orders yet"
        description="Log a sale from the Tires catalog to create the first order."
        action={
          <Link
            to="/tires"
            className="inline-flex items-center rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-400"
          >
            Open Skedaddle Tires
          </Link>
        }
      />
    )
  }

  const notifyPayload = notifyModalOrder ? buildNotifyPayload(notifyModalOrder) : null

  function toggleSound() {
    const next = !readSoundEnabled()
    writeSoundEnabled(next)
    setSoundOn(next)
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={toggleSound}
          aria-pressed={soundOn}
          aria-label={soundOn ? 'Completion sound on' : 'Completion sound off'}
          className="inline-flex items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900/60 p-1.5 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200 aria-pressed:text-amber-200"
          title="Completion sound when an order finishes in this session"
        >
          {soundOn ? (
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden
            >
              <path d="M3 10v4a1 1 0 0 0 1 1h3l4.3 3.6a1 1 0 0 0 1.7-.8V6.2a1 1 0 0 0-1.7-.8L7 9H4a1 1 0 0 0-1 1Z" />
              <path
                d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8 8 0 0 1 0 12"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                fill="none"
              />
            </svg>
          ) : (
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden
            >
              <path d="M3 10v4a1 1 0 0 0 1 1h3l4.3 3.6a1 1 0 0 0 1.7-.8V6.2a1 1 0 0 0-1.7-.8L7 9H4a1 1 0 0 0-1 1Z" />
              <path
                d="m16 9 5 5m0-5-5 5"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                fill="none"
              />
            </svg>
          )}
        </button>
      </div>
      <ul className="space-y-3">
        {orders.map((o) => {
          const isHi = highlightId && o.id === highlightId
          const cancellable = orderCanCancel(o.status)
          const refShort = orderRefFromId(o.id)
          const mspn = String(o.mspn || '').trim()
          const tire = tiresByMspn.get(mspn)
          const brand = tire ? String(tire.brand || '').trim() : ''
          const tdesc = tire ? String(tire.description || tire.tread || '').trim() : ''
          const tireLine = [brand, tdesc].filter(Boolean).join(' · ').trim() || mspn || '--'
          const qty = Number(o.quantity) || 0
          const ppt = Number(o.pricePerTire) || 0
          const total = Number(o.totalPrice) || (qty > 0 && ppt > 0 ? qty * ppt : 0)
          const cust = String(o.customerName || '').trim()
          const missingCustomer = !cust
          const payRaw = o.paymentAmount
          const noPriceRecorded =
            payRaw == null || payRaw === '' || !Number.isFinite(Number(payRaw)) || Number(payRaw) === 0
          return (
            <li
              key={o.id}
              ref={isHi ? highlightElRef : undefined}
              className={[
                'rounded-xl border border-zinc-800 bg-zinc-900/40 p-4',
                isHi ? 'ring-2 ring-amber-500/50' : '',
                String(o.status || '') === 'prospective' ? 'opacity-60' : '',
              ].join(' ')}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill
                      tone={statusPillTone(o.status)}
                      label={orderStatusLabel(o.status)}
                      title={orderStatusLabel(o.status)}
                    />
                    <span className={fulfillmentBadgeClass(o)} title="Customer fulfillment">
                      {fulfillmentBadgeLabel(o)}
                    </span>
                    {o.pricingAnomaly ? (
                      <span
                        className="inline-flex items-center rounded-full bg-amber-950/50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-200 ring-1 ring-amber-800/40"
                        title={
                          o.pricingAnomalyPct != null
                            ? `Price ~${formatPercent(o.pricingAnomalyPct, 0)} below catalog buy`
                            : 'Pricing anomaly vs catalog'
                        }
                      >
                        ⚠ pricing
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 text-sm font-medium leading-snug text-zinc-100">{tireLine}</p>
                  <p className="mt-1 font-mono text-xs text-zinc-500">
                    {mspn || '--'} × {formatQty(qty)}
                  </p>
                  {ppt > 0 || total > 0 ? (
                    <p className="mt-2 text-sm text-zinc-300">
                      {ppt > 0 ? (
                        <>
                          <span className="text-zinc-500">Price </span>
                          {formatCurrency(ppt)}
                          <span className="text-zinc-500"> each</span>
                        </>
                      ) : null}
                      {ppt > 0 && total > 0 ? (
                        <span className="text-zinc-500"> · </span>
                      ) : null}
                      {total > 0 ? `${formatCurrency(total)} total` : null}
                    </p>
                  ) : null}
                  {noPriceRecorded ? (
                    <p className="mt-1 text-[11px] font-medium text-amber-300/90">No payment recorded yet</p>
                  ) : null}
                  {missingCustomer ? (
                    <p className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-amber-900/50 bg-amber-950/25 px-2 py-1 text-xs font-medium text-amber-200/95">
                      <span aria-hidden>⚠</span>
                      No customer
                    </p>
                  ) : (
                    <p className="mt-2 text-xs text-zinc-400">
                      {cust}
                      {o.customerContact ? (
                        <>
                          {' '}
                          · {o.customerContact}
                        </>
                      ) : null}
                    </p>
                  )}
                  {o.repeatGhost ? (
                    <p className="mt-1 text-[11px] font-medium text-amber-400/90">
                      Repeat ghost contact
                    </p>
                  ) : null}
                </div>
                {refShort ? (
                  <div className="shrink-0 text-right">
                    <p className="pc-eyebrow">Reference</p>
                    <p className="mt-0.5 flex items-center justify-end gap-1.5 font-mono text-[10px] tracking-wide text-zinc-300">
                      <span>{refShort}</span>
                      {o.priceDiscrepancy != null ? (
                        <span
                          className="text-amber-400"
                          title="Sourcer's price differs from system. Check before charging."
                          aria-label="Price discrepancy"
                        >
                          ⚠️
                        </span>
                      ) : null}
                    </p>
                  </div>
                ) : null}
              </div>

              <div className="mt-4 flex flex-wrap gap-2 border-t border-zinc-800/80 pt-4">
                {o.status === 'in_transit' ? (
                  <>
                    {o.customerNotifiedAt ? (
                      <button
                        type="button"
                        className={BTN_PRIMARY}
                        onClick={() => openComplete(o)}
                      >
                        Mark complete
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className={o.customerNotifiedAt ? BTN_SECONDARY : BTN_PRIMARY}
                      onClick={() => openNotifyModal(o)}
                    >
                      Send update
                    </button>
                    {o.customerNotifiedAt ? (
                      <button
                        type="button"
                        className={BTN_SECONDARY}
                        onClick={() => pokeCustomer(o)}
                        disabled={pokingId === o.id}
                      >
                        {pokingId === o.id && <Spinner className="h-3 w-3 text-zinc-300" />}
                        Send reminder
                      </button>
                    ) : null}
                  </>
                ) : null}
                {cancellable ? (
                  <button
                    type="button"
                    className={`${BTN_GHOST_DESTRUCTIVE} ml-auto`}
                    onClick={() => openCancelModal(o)}
                  >
                    Cancel order
                  </button>
                ) : null}
              </div>
              <OrderDebriefPrompt key={`debrief-${o.id}`} order={o} />
            </li>
          )
        })}
      </ul>

      {notifyModalOrder && notifyPayload ? (
        <div
          className={MODAL_CENTER_BACKDROP}
          role="dialog"
          aria-modal="true"
          aria-labelledby="notify-customer-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) dismissOrderModals()
          }}
        >
          <div
            className={`${MODAL_CENTER_PANEL_BASE} max-w-md p-5`}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="notify-customer-title" className="text-sm font-semibold text-white">
              Send update to customer
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
                onClick={dismissOrderModals}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {cancelFor ? (
        <div
          className={MODAL_CENTER_BACKDROP}
          role="dialog"
          aria-modal="true"
          aria-labelledby="cancel-order-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) dismissOrderModals()
          }}
        >
          <div
            className={`${MODAL_CENTER_PANEL_BASE} max-w-md p-5`}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="cancel-order-title" className="text-sm font-semibold text-white">Cancel order</h2>
            <p className="mt-1 font-mono text-xs text-zinc-500">
              {cancelFor.mspn} × {formatQty(cancelFor.quantity)}
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
                onClick={dismissOrderModals}
                disabled={cancelSubmitting}
              >
                Close
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-lg bg-red-900/80 px-3 py-2 text-xs font-semibold text-red-50 hover:bg-red-800 disabled:opacity-50"
                onClick={() => void submitCancel()}
                disabled={cancelSubmitting}
              >
                {cancelSubmitting && <Spinner className="h-3.5 w-3.5 text-red-50" />}
                {cancelSubmitting ? 'Cancelling…' : 'Confirm cancel'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {completeFor ? (
        <div
          className={MODAL_CENTER_BACKDROP}
          role="dialog"
          aria-modal="true"
          aria-labelledby="complete-order-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) dismissOrderModals()
          }}
        >
          <div
            className={`${MODAL_CENTER_PANEL_BASE} max-w-sm p-5`}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="complete-order-title" className="text-sm font-semibold text-white">Mark order complete</h2>
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
                onClick={dismissOrderModals}
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-lg bg-amber-100 px-3 py-2 text-xs font-semibold text-zinc-950 hover:bg-amber-50 disabled:opacity-50"
                onClick={submitComplete}
                disabled={submitting}
              >
                {submitting && <Spinner className="h-3.5 w-3.5 text-zinc-700" />}
                {submitting ? 'Saving…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
