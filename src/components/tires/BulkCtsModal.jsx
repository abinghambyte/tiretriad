import { useEffect, useState } from 'react'
import { doc, writeBatch } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { useToast } from '../../context/ToastContext.jsx'
import { computeCts } from '../../utils/ctsCalc'
import { formatCurrency } from '../../utils/format'
import { MODAL_CENTER_BACKDROP, MODAL_CENTER_PANEL } from '../ui/modalChrome.js'

function num(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/**
 * @param {{ open: boolean, onClose: () => void, tires: { id: string }[] }} props
 */
export function BulkCtsModal({ open, onClose, tires }) {
  const { toast } = useToast()
  const [mountCost, setMountCost] = useState(0)
  const [deliveryCost, setDeliveryCost] = useState(0)
  const [otherCost, setOtherCost] = useState(0)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setMountCost(0)
      setDeliveryCost(0)
      setOtherCost(0)
    }
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const previewOverhead = computeCts({
    mountCost: num(mountCost),
    deliveryCost: num(deliveryCost),
    otherCost: num(otherCost),
  })

  async function handleSave() {
    if (tires.length === 0) return
    setSaving(true)
    try {
      const chunkSize = 400
      for (let i = 0; i < tires.length; i += chunkSize) {
        const chunk = tires.slice(i, i + chunkSize)
        const batch = writeBatch(db)
        const m = num(mountCost)
        const d = num(deliveryCost)
        const o = num(otherCost)
        const cts = computeCts({ mountCost: m, deliveryCost: d, otherCost: o })
        for (const t of chunk) {
          batch.update(doc(db, 'tires', t.id), {
            mountCost: m,
            deliveryCost: d,
            otherCost: o,
            cts,
          })
        }
        await batch.commit()
      }
      onClose()
    } catch (e) {
      console.error(e)
      toast(
        e instanceof Error
          ? e.message
          : 'Bulk save failed. Check Firestore rules and your connection.',
        'error',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className={`${MODAL_CENTER_BACKDROP} backdrop-blur-sm`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="bulk-overhead-title"
      onClick={onClose}
    >
      <div
        className={`${MODAL_CENTER_PANEL} border-zinc-700 bg-zinc-950 p-6`}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="bulk-overhead-title" className="text-lg font-semibold text-zinc-100">
          Bulk overhead edit
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          Apply the same mount, delivery, and other overhead to{' '}
          <span className="font-medium text-zinc-300">{tires.length}</span> selected tire
          {tires.length === 1 ? '' : 's'}. FET stays in Kyle&apos;s buy price and is not changed.
          Preview overhead total:{' '}
          <span className="font-mono text-amber-200/90">{formatCurrency(previewOverhead)}</span>
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <NumberField label="Mount" value={mountCost} onChange={setMountCost} id="bulk-mount" />
          <NumberField
            label="Delivery"
            value={deliveryCost}
            onChange={setDeliveryCost}
            id="bulk-delivery"
          />
          <NumberField label="Other" value={otherCost} onChange={setOtherCost} id="bulk-other" />
        </div>

        <div className="mt-8 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-zinc-600 px-4 py-2 text-sm text-zinc-300 hover:border-zinc-500 hover:text-white disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || tires.length === 0}
            className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save to all selected'}
          </button>
        </div>
      </div>
    </div>
  )
}

function NumberField({ id, label, value, onChange }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-zinc-500">
        {label}
      </label>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        min={0}
        step={0.01}
        value={Number.isFinite(Number(value)) ? value : 0}
        onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
        className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-sm text-zinc-100 outline-none focus:border-amber-600/70"
      />
    </div>
  )
}
