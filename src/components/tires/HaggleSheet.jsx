import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { formatCurrency } from '../../utils/format'

/**
 * Bottom-anchored haggle sheet — lets the admin stress-test a customer offer
 * against the margin floor in real time. Renders via a portal at z-150 so it
 * floats above modals.
 *
 * Math:
 *   buyAllIn    = buy + cts + fet
 *   profit      = testOffer - buyAllIn
 *   testMargin  = profit / testOffer * 100
 *   counter     = buyAllIn / (1 - floorPct/100)   // price at floor margin
 *
 * @param {object} props
 * @param {{ description?: string, mspn?: string, buy?: number, retail?: number,
 *           cts?: number, fet?: number }} props.tire
 * @param {number} props.floorPct  Minimum acceptable margin percent (e.g. 20).
 * @param {() => void} props.onClose
 * @param {(testOffer: number) => void} props.onAccept
 */
export function HaggleSheet({ tire, floorPct, onClose, onAccept }) {
  const [testOffer, setTestOffer] = useState('')
  const inputId = useId()
  const inputRef = useRef(null)

  // Escape closes the sheet
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose?.()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Focus the test-offer input on mount (programmatic alternative to autoFocus
  // — the offer input is the entire reason for opening the sheet, so focusing
  // it is the expected interaction).
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const buyAllIn = Number(tire?.buy || 0) + Number(tire?.cts || 0) + Number(tire?.fet || 0)
  const testOfferNum = Number(testOffer) || 0
  const profit = testOfferNum - buyAllIn
  const testMargin = testOfferNum > 0 ? (profit / testOfferNum) * 100 : 0
  const counterOffer = floorPct < 100 ? buyAllIn / (1 - floorPct / 100) : null
  const belowFloor = testOfferNum > 0 && testMargin < floorPct

  let marginColor = 'text-zinc-300'
  if (testOfferNum > 0) {
    if (testMargin <= 0) marginColor = 'text-rose-300'
    else if (testMargin < floorPct) marginColor = 'text-amber-300'
    else marginColor = 'text-emerald-300'
  }

  const acceptDisabled = testOfferNum <= 0

  function handleAccept() {
    if (acceptDisabled) return
    onAccept?.(testOfferNum)
    onClose?.()
  }

  const portalTarget = typeof document !== 'undefined' ? document.body : null
  if (!portalTarget) return null

  return createPortal(
    <div className="fixed inset-0 z-[150]" data-haggle-sheet>
      <button
        type="button"
        aria-label="Close"
        onClick={() => onClose?.()}
        className="fixed inset-0 h-full w-full cursor-default bg-black/60 backdrop-blur-sm"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Test customer offer"
        className="fixed inset-x-0 bottom-0 rounded-t-2xl bg-zinc-900 p-4 shadow-2xl ring-1 ring-zinc-800 sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl"
      >
        <div className="border-b border-zinc-800 pb-3">
          <p className="line-clamp-2 text-sm font-semibold text-zinc-100">
            {tire?.description}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-400">
            <span className="font-mono text-zinc-300">{tire?.mspn}</span>
            <span aria-hidden="true">&middot;</span>
            <span>
              Current sell:{' '}
              <span className="font-mono text-zinc-100">
                {formatCurrency(tire?.retail)}
              </span>
            </span>
          </div>
        </div>

        <div className="pt-3">
          <label
            htmlFor={inputId}
            className="block text-xs font-medium uppercase tracking-wide text-zinc-400"
          >
            Test offer
          </label>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-2xl text-zinc-500">$</span>
            <input
              ref={inputRef}
              id={inputId}
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={testOffer}
              onChange={(e) => setTestOffer(e.target.value)}
              aria-label="Test offer"
              className="block w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-2xl font-semibold text-zinc-100 outline-none focus:border-amber-500"
              placeholder="0.00"
            />
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-zinc-950 p-3">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
              New margin
            </p>
            <p
              data-testid="haggle-margin"
              className={`font-mono text-lg font-semibold ${marginColor}`}
            >
              {testOfferNum > 0 ? `${testMargin.toFixed(1)}%` : '--'}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
              Profit
            </p>
            <p className="font-mono text-lg font-semibold text-zinc-100">
              {testOfferNum > 0 ? formatCurrency(profit) : '--'}
            </p>
          </div>
        </div>

        {belowFloor && counterOffer != null ? (
          <div
            role="alert"
            className="mt-3 rounded-lg border border-amber-700/50 bg-amber-950/40 px-3 py-2 text-sm text-amber-100"
          >
            Below {floorPct}% floor &mdash; counter at{' '}
            <span className="font-mono font-semibold">
              {formatCurrency(counterOffer)}
            </span>{' '}
            for floor margin
          </div>
        ) : null}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => onClose?.()}
            className="flex-1 min-h-[44px] rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleAccept}
            disabled={acceptDisabled}
            className="flex-1 min-h-[44px] rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
          >
            Accept this offer
          </button>
        </div>
      </div>
    </div>,
    portalTarget,
  )
}
