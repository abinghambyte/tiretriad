import { httpsCallable } from 'firebase/functions'
import { doc, onSnapshot } from 'firebase/firestore'
import { useEffect, useMemo, useState } from 'react'
import { db, functions } from '../../firebase/config'
import { phoneDocIdFromContact } from '../../utils/phoneDocId'
import { formatSaleMessage } from '../../utils/saleMessenger'
import { MODAL_CENTER_BACKDROP, MODAL_CENTER_PANEL } from '../ui/modalChrome.js'
import { cmdEnterSubmitKeyDown } from '../../utils/cmdEnterSubmit.js'
import { formatCurrency } from '../../utils/format'
import { tireCatalogBuyNumber } from '../../utils/tireCatalogBuy'
import { timeAgo } from '../../utils/timeAgo'

function datetimeLocalValue(d) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** One callable instance -- same reference as form submit and DEV test button. */
const sendTireSaleSms = httpsCallable(functions, 'sendTireSaleSms')

/**
 * @param {object} props
 * @param {() => void} props.onClose
 * @param {object[]} props.tires
 * @param {string} [props.initialMspn]
 * @param {number} [props.initialQuantity]
 * @param {number} [props.initialPricePerTire] Sale price per tire (e.g. AI listing advisor recommendation)
 */
export function SaleMessenger({ onClose, tires, initialMspn, initialQuantity, initialPricePerTire }) {
  const [mspn, setMspn] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [pricePerTire, setPricePerTire] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerContact, setCustomerContact] = useState('')
  const [fulfillment, setFulfillment] = useState('Pickup')
  const [deliveredBy, setDeliveredBy] = useState(null)
  const [fulfillmentNotes, setFulfillmentNotes] = useState('')
  const [completedAtLocal, setCompletedAtLocal] = useState('')
  const [additionalNotes, setAdditionalNotes] = useState('')
  const [sending, setSending] = useState(false)
  const [status, setStatus] = useState(null)
  const [contactRow, setContactRow] = useState(null)
  const [ghostRow, setGhostRow] = useState(null)

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    if (initialMspn == null || String(initialMspn).trim() === '') return
    const v = String(initialMspn).trim()
    setMspn(v)
    const t = tires.find((x) => x.mspn === v)
    const rec = Number(initialPricePerTire)
    if (Number.isFinite(rec) && rec > 0) {
      setPricePerTire(String(rec))
      return
    }
    const n = tireCatalogBuyNumber(t)
    if (t && n > 0) {
      setPricePerTire(String(n))
    } else {
      setPricePerTire('')
    }
  }, [initialMspn, initialPricePerTire, tires])

  useEffect(() => {
    if (initialQuantity != null && Number(initialQuantity) >= 1) {
      setQuantity(Number(initialQuantity))
    }
  }, [initialQuantity])

  // Reset deliveredBy whenever fulfillment moves away from Delivery.
  useEffect(() => {
    if (fulfillment !== 'Delivery' && deliveredBy !== null) {
      setDeliveredBy(null)
    }
  }, [fulfillment, deliveredBy])

  useEffect(() => {
    const id = phoneDocIdFromContact(customerContact.trim())
    if (!id) {
      setContactRow(null)
      setGhostRow(null)
      return undefined
    }
    const u1 = onSnapshot(
      doc(db, 'contacts', id),
      (s) => {
        setContactRow(s.exists() ? { id, ...s.data() } : null)
      },
      () => setContactRow(null),
    )
    const u2 = onSnapshot(
      doc(db, 'ghostContacts', id),
      (s) => {
        setGhostRow(s.exists() ? s.data() : null)
      },
      () => setGhostRow(null),
    )
    return () => {
      u1()
      u2()
    }
  }, [customerContact])

  const mspnOptions = useMemo(() => {
    const set = new Map()
    for (const t of tires) {
      if (t.mspn) set.set(t.mspn, t)
    }
    return [...set.keys()].sort()
  }, [tires])

  function handleMspnChange(value) {
    setMspn(value)
    const t = tires.find((x) => x.mspn === value)
    const n = tireCatalogBuyNumber(t)
    if (t && n > 0) {
      setPricePerTire(String(n))
    } else {
      setPricePerTire('')
    }
  }

  const totalPrice = useMemo(() => {
    const q = Math.max(0, Number(quantity) || 0)
    const p = Number(pricePerTire)
    if (Number.isNaN(p)) return 0
    return q * p
  }, [quantity, pricePerTire])

  const preview = useMemo(() => {
    if (!mspn) return ''
    return formatSaleMessage({
      mspn,
      quantity: Number(quantity) || 0,
      pricePerTire: Number(pricePerTire) || 0,
      totalPrice,
      customerName: customerName || '--',
      customerContact: customerContact || '--',
      fulfillment,
      fulfillmentNotes,
      additionalNotes,
    })
  }, [
    mspn,
    quantity,
    pricePerTire,
    totalPrice,
    customerName,
    customerContact,
    fulfillment,
    fulfillmentNotes,
    additionalNotes,
  ])

  async function handleSubmit(e) {
    e.preventDefault()
    setStatus(null)
    if (!mspn.trim()) {
      setStatus({ type: 'error', text: 'Choose a SKU (MSPN).' })
      return
    }
    const completedAtMs =
      completedAtLocal.trim() === '' ? NaN : Date.parse(completedAtLocal)
    if (completedAtLocal.trim() !== '' && !Number.isFinite(completedAtMs)) {
      setStatus({ type: 'error', text: 'Completed at is not a valid date.' })
      return
    }
    setSending(true)
    try {
      const payload = {
        mspn: mspn.trim(),
        quantity: Number(quantity) || 0,
        pricePerTire: Number(pricePerTire) || 0,
        totalPrice,
        customerName: customerName.trim(),
        customerContact: customerContact.trim(),
        fulfillment,
        fulfillmentNotes: fulfillmentNotes.trim(),
        additionalNotes: additionalNotes.trim(),
        deliveredBy: fulfillment === 'Delivery' ? deliveredBy : null,
      }
      if (Number.isFinite(completedAtMs)) {
        payload.completedAtMs = completedAtMs
      }
      await sendTireSaleSms(payload)
      setStatus({
        type: 'ok',
        text: 'Team notified via Slack. Check the channel for the message.',
      })
    } catch (err) {
      setStatus({
        type: 'error',
        text:
          err?.message ||
          'Could not notify team. Deploy functions and set SLACK_BOT_TOKEN (Block Kit) or NOTIFY_WEBHOOK_URL (webhook).',
      })
    } finally {
      setSending(false)
    }
  }

  return (
    <div
      className={MODAL_CENTER_BACKDROP}
      role="dialog"
      aria-modal="true"
      aria-labelledby="sale-ms-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className={`${MODAL_CENTER_PANEL} border-zinc-800 bg-zinc-950 p-0`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-zinc-800 px-5 py-4">
          <div>
            <h2
              id="sale-ms-title"
              className="text-lg font-semibold text-zinc-100"
            >
              Log sale / notify team
            </h2>
            <p className="mt-1 text-sm text-zinc-400">
              Posts the sale summary to Slack via incoming webhook.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-zinc-400 hover:bg-zinc-800 hover:text-white"
          >
            Close
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          onKeyDown={cmdEnterSubmitKeyDown}
          className="space-y-4 px-5 py-5"
        >
          {status ? (
            <p
              className={`rounded-lg px-3 py-2 text-sm ${
                status.type === 'ok'
                  ? 'bg-emerald-950/50 text-emerald-200'
                  : 'bg-red-950/50 text-red-200'
              }`}
            >
              {status.text}
            </p>
          ) : null}

          <div>
            <label className="text-xs font-medium text-zinc-400">
              SKU (MSPN)
            </label>
            <input
              list="tire-mspn-options"
              value={mspn}
              onChange={(e) => handleMspnChange(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
              placeholder="Type or pick MSPN"
              autoComplete="off"
            />
            <datalist id="tire-mspn-options">
              {mspnOptions.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-zinc-400">
                Quantity sold
              </label>
              <input
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-400">
                Price / tire
              </label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={pricePerTire}
                onChange={(e) => setPricePerTire(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-zinc-400">
              Total (auto)
            </label>
            <input
              readOnly
              value={totalPrice ? formatCurrency(totalPrice) : '--'}
              className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-400"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-zinc-400">
              Customer name
            </label>
            <input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-zinc-400">
              Customer phone / contact
            </label>
            <input
              value={customerContact}
              onChange={(e) => setCustomerContact(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
            />
            {contactRow ? (
              <div className="mt-2 rounded-lg border border-zinc-800/80 bg-zinc-900/40 px-3 py-2 text-[11px] leading-relaxed text-zinc-400">
                <span className="font-medium text-zinc-300">👤 {contactRow.name || '--'}</span>
                {' · '}
                {contactRow.orderCount ?? 0} {contactRow.orderCount === 1 ? 'order' : 'orders'} ·{' '}
                {formatCurrency(Number(contactRow.totalSpend) || 0)}{' '}
                lifetime
                <br />
                <span className="text-zinc-400">
                  Last: {contactRow.lastMspn || '--'}{' '}
                  {contactRow.lastOrderAt?.toDate
                    ? contactRow.lastOrderAt.toDate().toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })
                    : ''}
                </span>
                {ghostRow?.repeatGhost ? (
                  <p className="mt-1 text-amber-400/90">
                    👻 Repeat ghost. Flagged {Number(ghostRow.ghostCount) || 0} times.
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          <fieldset className="space-y-2">
            <legend className="text-xs font-medium text-zinc-400">
              Fulfillment
            </legend>
            <label className="mr-4 inline-flex items-center gap-2 text-sm text-zinc-300">
              <input
                type="radio"
                name="fulfillment"
                checked={fulfillment === 'Pickup'}
                onChange={() => setFulfillment('Pickup')}
              />
              Pickup
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-zinc-300">
              <input
                type="radio"
                name="fulfillment"
                checked={fulfillment === 'Delivery'}
                onChange={() => setFulfillment('Delivery')}
              />
              Delivery
            </label>
          </fieldset>

          {fulfillment === 'Delivery' ? (
            <fieldset className="space-y-2" data-testid="delivered-by-fieldset">
              <legend className="text-xs font-medium text-zinc-400">
                Who delivered?
              </legend>
              {[
                { value: 'alex', label: 'Alex' },
                { value: 'dj', label: 'DJ' },
                { value: 'kyle', label: 'Kyle' },
              ].map((opt) => (
                <label
                  key={opt.value}
                  className="mr-4 inline-flex items-center gap-2 text-sm text-zinc-300"
                >
                  <input
                    type="radio"
                    name="deliveredBy"
                    checked={deliveredBy === opt.value}
                    onChange={() => setDeliveredBy(opt.value)}
                  />
                  {opt.label}
                </label>
              ))}
              <label className="inline-flex items-center gap-2 text-sm text-zinc-300">
                <input
                  type="radio"
                  name="deliveredBy"
                  checked={deliveredBy === null}
                  onChange={() => setDeliveredBy(null)}
                />
                Mark later
              </label>
            </fieldset>
          ) : null}

          <div>
            <label className="text-xs font-medium text-zinc-400">
              Pickup / delivery notes
            </label>
            <textarea
              value={fulfillmentNotes}
              onChange={(e) => setFulfillmentNotes(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-zinc-400">
              Completed at (optional)
            </label>
            <input
              type="datetime-local"
              value={completedAtLocal}
              onChange={(e) => setCompletedAtLocal(e.target.value)}
              min={datetimeLocalValue(new Date(Date.now() - 30 * 86_400_000))}
              max={datetimeLocalValue(new Date())}
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
              placeholder="Defaults to now. Max: 30 days back."
            />
            <p className="mt-1 text-[11px] text-zinc-600">
              Defaults to now. Max: 30 days back.
            </p>
            {completedAtLocal.trim() !== '' && Number.isFinite(Date.parse(completedAtLocal)) ? (
              <p className="mt-1 text-[11px] text-zinc-400">
                Recording as {timeAgo(Date.parse(completedAtLocal)) || '--'}
              </p>
            ) : null}
          </div>

          <div>
            <label className="text-xs font-medium text-zinc-400">
              Additional notes
            </label>
            <textarea
              value={additionalNotes}
              onChange={(e) => setAdditionalNotes(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
            />
          </div>

          <div>
            <p className="text-xs font-medium text-zinc-400">Preview</p>
            <pre className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 text-xs text-zinc-400">
              {preview || 'Fill the form to preview the message.'}
            </pre>
          </div>

          <button
            type="submit"
            disabled={sending}
            className="w-full rounded-xl bg-amber-100 py-3 text-sm font-semibold text-zinc-950 hover:bg-amber-50 disabled:opacity-60"
          >
            {sending ? 'Sending…' : 'Notify team (webhook)'}
          </button>
        </form>
      </div>
    </div>
  )
}
