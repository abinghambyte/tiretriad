import { httpsCallable } from 'firebase/functions'
import { useEffect, useState } from 'react'
import { functions } from '../../../firebase/config'
import { useToast } from '../../../context/ToastContext.jsx'
import {
  MODAL_CENTER_BACKDROP,
  MODAL_CENTER_PANEL,
} from '../../ui/modalChrome.js'

const EDIT_WINDOW_MS = 7 * 86_400_000

const setOrderAdCost = httpsCallable(functions, 'setOrderAdCost')

function readCompletedMs(order) {
  if (!order) return 0
  const raw = order.completedMs ?? order.completedAtMs ?? order.completedAt
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
 * Edit-the-ad-cost button for a completed order. Visible to admins or to
 * the user who closed the order out (`order.completedBy === uid`), within
 * a 7-day window after completion. Calls `setOrderAdCost` which atomically
 * recomputes the crew earnings via applyOrderAdCostChange.
 *
 * @param {object} props
 * @param {{ id: string, completedMs?: number, completedAtMs?: number, completedAt?: unknown, completedBy?: string|null, adCost?: number|null }} props.order
 * @param {string} props.currentUserRole
 * @param {string|null|undefined} props.currentUserUid
 */
export function EditAdCostButton({ order, currentUserRole, currentUserUid }) {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  const [pending, setPending] = useState(false)

  const completedMs = readCompletedMs(order)
  const withinWindow =
    completedMs > 0 && Date.now() - completedMs <= EDIT_WINDOW_MS
  const isAdmin = currentUserRole === 'admin'
  const isCloser =
    !!currentUserUid && !!order?.completedBy && order.completedBy === currentUserUid

  useEffect(() => {
    if (!open) return undefined
    function onKey(e) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (!isAdmin && !isCloser) return null
  if (!withinWindow) return null

  function openModal() {
    const cur = Number(order?.adCost)
    setValue(Number.isFinite(cur) && cur > 0 ? String(cur) : '')
    setOpen(true)
  }

  async function save() {
    if (!order?.id) return
    const trimmed = String(value).trim()
    const parsed = trimmed === '' ? 0 : Number(trimmed)
    if (!Number.isFinite(parsed) || parsed < 0) {
      toast('Enter a valid amount.', 'error')
      return
    }
    setPending(true)
    try {
      await setOrderAdCost({
        orderId: order.id,
        adCost: parsed,
      })
      toast('Ad cost updated.', 'success')
      setOpen(false)
    } catch (err) {
      toast(err?.message || 'Could not update ad cost.', 'error')
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
        Edit ad cost
      </button>

      {open ? (
        <div
          className={MODAL_CENTER_BACKDROP}
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-ad-cost-title"
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
                id="edit-ad-cost-title"
                className="text-lg font-semibold text-zinc-100"
              >
                Edit ad cost
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
              <label className="block text-xs font-medium text-zinc-400">
                Ad cost (USD)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="$ spent on FB ads / boosts for this listing"
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
                />
              </label>
              <p className="text-xs text-zinc-500">
                Comes out of the margin pool, so the crew shares it via
                splits and the delivery bump.
              </p>

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
