import { useState } from 'react'
import { BTN_PRIMARY, BTN_SECONDARY, BTN_GHOST_DESTRUCTIVE } from '../ui/buttonStyles.js'
import { formatCurrency, formatPercent } from '../../utils/format.js'
import { tireCatalogRetailNumber } from '../../utils/tireCatalogRetail.js'
import { computeListingMargin } from '../../utils/marginCalc.js'

const REASON_CHIP = {
  'below-margin-floor': {
    label: 'BELOW FLOOR',
    className: 'bg-amber-950/85 text-amber-200 ring-amber-900/55',
  },
  'unutilized-needs-research': {
    label: 'NEEDS RESEARCH',
    className: 'bg-zinc-800 text-zinc-200 ring-zinc-600/60',
  },
}

function ReasonChip({ reason }) {
  const meta = REASON_CHIP[reason] || {
    label: String(reason || 'UNKNOWN').toUpperCase(),
    className: 'bg-zinc-800 text-zinc-300 ring-zinc-600/60',
  }
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ${meta.className}`}
    >
      {meta.label}
    </span>
  )
}

/**
 * Presentational row for a single research-queue entry. Dispatches resolution
 * intent through `onResolve(outcome, extras)` so the page can handle the
 * callable wiring and optimistic updates in one place.
 *
 * @param {object} props
 * @param {Record<string, unknown>} props.tire
 * @param {(outcome: 'retail-wrong' | 'confirm-archive' | 'punt', extras?: { newRetail?: number }) => Promise<unknown> | unknown} props.onResolve
 * @param {boolean} [props.readOnly] Hide action buttons (used in Analytics oversight view).
 * @param {string} [props.resolvedBy] Optional resolved-by label when rendered in oversight view.
 */
export function QueueRow({ tire, onResolve, readOnly = false, resolvedBy }) {
  const [mode, setMode] = useState(/** @type {'idle' | 'retail-form' | 'confirm-archive'} */ ('idle'))
  const [busy, setBusy] = useState(false)
  const [retailInput, setRetailInput] = useState(() => {
    const current = tireCatalogRetailNumber(tire)
    return current > 0 ? String(current) : ''
  })
  const [retailError, setRetailError] = useState('')

  const mspn = String(tire?.mspn || tire?.id || '').trim()
  const description = String(tire?.description || tire?.tread || '').trim()
  const currentRetail = tireCatalogRetailNumber(tire)
  const marginPct = computeListingMargin(tire)
  const reason = String(tire?.researchQueue?.reason || '')

  async function dispatch(outcome, extras) {
    if (busy) return
    setBusy(true)
    try {
      await onResolve(outcome, extras)
    } finally {
      setBusy(false)
    }
  }

  function submitRetail() {
    setRetailError('')
    const parsed = Number(retailInput)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setRetailError('Enter a positive number.')
      return
    }
    void dispatch('retail-wrong', { newRetail: parsed }).then(() => {
      setMode('idle')
    })
  }

  return (
    <li className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 shadow-sm shadow-black/20">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={`/tires?tab=catalog&q=${encodeURIComponent(mspn)}`}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-sm font-semibold text-amber-200 hover:text-amber-100"
            >
              {mspn || '—'}
            </a>
            <ReasonChip reason={reason} />
          </div>
          {description ? (
            <p className="mt-1 text-xs text-zinc-400">{description}</p>
          ) : null}
          <p className="mt-2 text-xs text-zinc-500">
            Retail{' '}
            <span className="tabular-nums text-zinc-200">
              {currentRetail > 0 ? formatCurrency(currentRetail) : '—'}
            </span>
            {' · '}
            Margin{' '}
            <span className="tabular-nums text-zinc-200">
              {marginPct != null ? formatPercent(marginPct, 1) : '—'}
            </span>
            {readOnly && resolvedBy ? (
              <>
                {' · '}
                <span className="text-zinc-400">Resolved by {resolvedBy}</span>
              </>
            ) : null}
          </p>
        </div>

        {!readOnly ? (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={BTN_SECONDARY}
              disabled={busy}
              onClick={() => setMode((m) => (m === 'retail-form' ? 'idle' : 'retail-form'))}
            >
              Retail was wrong
            </button>
            <button
              type="button"
              className={BTN_PRIMARY}
              disabled={busy}
              onClick={() => setMode('confirm-archive')}
            >
              Confirm and archive
            </button>
            <button
              type="button"
              className={BTN_GHOST_DESTRUCTIVE}
              disabled={busy}
              onClick={() => dispatch('punt')}
            >
              Punt
            </button>
          </div>
        ) : null}
      </div>

      {!readOnly && mode === 'retail-form' ? (
        <form
          className="mt-3 flex flex-wrap items-center gap-2 border-t border-zinc-800/70 pt-3"
          onSubmit={(e) => {
            e.preventDefault()
            submitRetail()
          }}
        >
          <label className="text-xs text-zinc-400" htmlFor={`retail-input-${tire?.id}`}>
            Corrected retail
          </label>
          <input
            id={`retail-input-${tire?.id}`}
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            className="w-28 rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm text-zinc-100 focus:border-amber-500 focus:outline-none"
            value={retailInput}
            onChange={(e) => setRetailInput(e.target.value)}
          />
          <button type="submit" className={BTN_PRIMARY} disabled={busy}>
            Update retail
          </button>
          <button
            type="button"
            className={BTN_SECONDARY}
            disabled={busy}
            onClick={() => {
              setMode('idle')
              setRetailError('')
            }}
          >
            Cancel
          </button>
          {retailError ? (
            <p className="basis-full text-xs text-rose-300">{retailError}</p>
          ) : null}
        </form>
      ) : null}

      {!readOnly && mode === 'confirm-archive' ? (
        <div className="mt-3 rounded-xl border border-amber-900/40 bg-amber-950/20 p-3">
          <p className="text-sm text-amber-100">
            This will archive {mspn || 'this tire'} as permanently sub-floor. It will only be
            visible to admins in Analytics &gt; Margin archive.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={BTN_PRIMARY}
              disabled={busy}
              onClick={() =>
                dispatch('confirm-archive').then(() => {
                  setMode('idle')
                })
              }
            >
              Archive
            </button>
            <button
              type="button"
              className={BTN_SECONDARY}
              disabled={busy}
              onClick={() => setMode('idle')}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </li>
  )
}
