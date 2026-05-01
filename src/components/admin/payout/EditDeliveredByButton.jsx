import { httpsCallable } from 'firebase/functions'
import { useEffect, useState } from 'react'
import { functions } from '../../../firebase/config'
import { useToast } from '../../../context/ToastContext.jsx'
import {
  MODAL_CENTER_BACKDROP,
  MODAL_CENTER_PANEL,
} from '../../ui/modalChrome.js'

const EDIT_WINDOW_MS = 7 * 86_400_000

const editOrderDeliveredBy = httpsCallable(functions, 'editOrderDeliveredBy')

function readCompletedMs(order) {
  if (!order) return 0
  const raw = order.completedAtMs ?? order.completedAt
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (raw && typeof raw.toMillis === 'function') {
    try {
      return raw.toMillis()
    } catch {
      return 0
    }
  }
  if (raw instanceof Date) return raw.getTime()
  const parsed = Date.parse(String(raw))
  return Number.isFinite(parsed) ? parsed : 0
}

/**
 * Admin-only edit button for retroactively setting / clearing the
 * `deliveredBy` field on a completed delivery order. Hidden outside the
 * 7-day edit window or for non-delivery orders.
 *
 * @param {object} props
 * @param {{ id: string, fulfillment?: string, completedAtMs?: number, completedAt?: unknown, deliveredBy?: string | null }} props.order
 * @param {string} props.currentUserRole
 */
export function EditDeliveredByButton({ order, currentUserRole }) {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState(null)
  const [reason, setReason] = useState('')
  const [pending, setPending] = useState(false)

  const fulfillment = String(order?.fulfillment || '').toLowerCase()
  const completedMs = readCompletedMs(order)
  const withinWindow =
    completedMs > 0 && Date.now() - completedMs <= EDIT_WINDOW_MS

  useEffect(() => {
    if (!open) return undefined
    function onKey(e) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (currentUserRole !== 'admin') return null
  if (fulfillment !== 'delivery') return null
  if (!withinWindow) return null

  function openModal() {
    setPicked(order?.deliveredBy ?? null)
    setReason('')
    setOpen(true)
  }

  async function save() {
    if (!order?.id) return
    setPending(true)
    try {
      await editOrderDeliveredBy({
        orderId: order.id,
        deliveredBy: picked,
        reason: reason.trim(),
      })
      toast('Deliverer updated.', 'success')
      setOpen(false)
    } catch (err) {
      toast(err?.message || 'Could not update deliverer.', 'error')
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className="inline-flex items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-800"
      >
        Edit deliverer
      </button>

      {open ? (
        <div
          className={MODAL_CENTER_BACKDROP}
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-delivered-by-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false)
          }}
        >
          <div
            className={`${MODAL_CENTER_PANEL} border-zinc-800 bg-zinc-950 p-0`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-zinc-800 px-5 py-4">
              <h2
                id="edit-delivered-by-title"
                className="text-lg font-semibold text-zinc-100"
              >
                Edit deliverer
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg px-2 py-1 text-sm text-zinc-400 hover:bg-zinc-800 hover:text-white"
              >
                Close
              </button>
            </div>

            <div className="space-y-4 px-5 py-5">
              <fieldset className="space-y-2">
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
                      name="edit-delivered-by"
                      checked={picked === opt.value}
                      onChange={() => setPicked(opt.value)}
                    />
                    {opt.label}
                  </label>
                ))}
                <label className="inline-flex items-center gap-2 text-sm text-zinc-300">
                  <input
                    type="radio"
                    name="edit-delivered-by"
                    checked={picked === null}
                    onChange={() => setPicked(null)}
                  />
                  Clear
                </label>
              </fieldset>

              <div>
                <label className="text-xs font-medium text-zinc-400">
                  Reason (optional)
                </label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
                  placeholder="e.g. fixing a typo from close-out"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={pending}
                  className="rounded-lg bg-amber-100 px-3 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-amber-50 disabled:opacity-60"
                >
                  {pending ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
