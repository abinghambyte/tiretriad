import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { formatCurrency } from '../../utils/format'
import { bundleMath } from '../../utils/bundleMath'

/**
 * Bottom-anchored haggle sheet — lets the admin stress-test a customer offer
 * against the margin floor in real time. Renders via a portal at z-150 so it
 * floats above modals.
 *
 * Math (matches the single-tire flow):
 *   buyAllIn    = buy + cts + fet
 *   profit      = testOffer - bundleCost
 *   testMargin  = profit / testOffer * 100
 *   counter     = bundleCost / (1 - floorPct/100)   // price at floor margin
 *
 * @param {object} props
 * @param {Array<{ description?: string, mspn?: string, buy?: number, retail?: number,
 *           cts?: number, fet?: number }>} props.tires
 * @param {{ description?: string, mspn?: string, buy?: number, retail?: number,
 *           cts?: number, fet?: number }} [props.tire] Legacy single tire fallback.
 * @param {number} props.floorPct  Minimum acceptable margin percent (e.g. 20).
 * @param {() => void} props.onClose
 * @param {(testOffer: number) => void} props.onAccept
 */
export function HaggleSheet({ tire, tires, floorPct, onClose, onAccept }) {
  const [testOffer, setTestOffer] = useState('')
  const [qtyByMspn, setQtyByMspn] = useState({})
  const inputId = useId()
  const inputRef = useRef(null)
  const quoteTires = useMemo(
    () => (Array.isArray(tires) && tires.length > 0 ? tires : tire ? [tire] : []),
    [tire, tires],
  )

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

  const math = bundleMath(quoteTires, qtyByMspn, floorPct, testOffer)
  const testOfferNum = Number(testOffer) || 0
  const belowFloor = testOfferNum > 0 && math.testMargin < floorPct

  let marginColor = 'text-zinc-300'
  if (testOfferNum > 0) {
    if (math.testMargin <= 0) marginColor = 'text-rose-300'
    else if (math.testMargin < floorPct) marginColor = 'text-amber-300'
    else marginColor = 'text-emerald-300'
  }

  const acceptDisabled = testOfferNum <= 0

  function handleAccept() {
    if (acceptDisabled) return
    onAccept?.(testOfferNum)
    onClose?.()
  }

  function updateQty(row, index, delta) {
    const key = lineKey(row, index)
    setQtyByMspn((prev) => ({
      ...prev,
      [key]: clampQty((Number(prev[key]) || 1) + delta),
    }))
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
        className="fixed inset-x-0 bottom-0 max-h-[92vh] overflow-y-auto rounded-t-2xl bg-zinc-900 p-4 shadow-2xl ring-1 ring-zinc-800 sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl"
      >
        <div className="border-b border-zinc-800 pb-3">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            {quoteTires.length > 1 ? 'Bundle quote' : 'Quote'}
          </p>
        </div>

        <div className="space-y-2 border-b border-zinc-800 py-3">
          {quoteTires.map((row, index) => {
            const key = lineKey(row, index)
            const qty = clampQty(qtyByMspn[key] ?? 1)
            const buy = Number(row?.buy || 0) + Number(row?.cts || 0)
            const sell = Number(row?.retail || 0)
            const rowMargin = sell > 0 ? ((sell - buy) / sell) * 100 : 0
            const mspn = String(row?.mspn || key)
            return (
              <div
                key={key}
                className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-zinc-100">
                      {row?.description || 'Unknown tire'}
                    </p>
                    <p className="mt-1 font-mono text-xs text-zinc-400">{mspn}</p>
                  </div>
                  <div
                    className="inline-flex items-center rounded-lg border border-zinc-700 bg-zinc-900"
                    aria-label={`Quantity for ${mspn}`}
                  >
                    <button
                      type="button"
                      aria-label={`Decrease quantity for ${mspn}`}
                      onClick={() => updateQty(row, index, -1)}
                      disabled={qty <= 1}
                      className="h-8 w-8 rounded-l-lg text-zinc-300 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:text-zinc-600"
                    >
                      -
                    </button>
                    <span className="min-w-8 px-2 text-center font-mono text-sm text-zinc-100">
                      {qty}
                    </span>
                    <button
                      type="button"
                      aria-label={`Increase quantity for ${mspn}`}
                      onClick={() => updateQty(row, index, 1)}
                      disabled={qty >= 99}
                      className="h-8 w-8 rounded-r-lg text-zinc-300 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:text-zinc-600"
                    >
                      +
                    </button>
                  </div>
                </div>
                <p className="mt-2 text-right font-mono text-xs text-zinc-400">
                  Buy: <span className="text-zinc-200">{formatCurrency(buy)}</span>
                  {' · '}
                  Sell: <span className="text-zinc-200">{formatCurrency(sell)}</span>
                  {' · '}
                  Margin:{' '}
                  <span className="text-zinc-200">{sell > 0 ? `${rowMargin.toFixed(0)}%` : '--'}</span>
                </p>
              </div>
            )
          })}
        </div>

        {quoteTires.length > 1 ? (
          <div className="mt-3 rounded-lg bg-zinc-950 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Bundle
            </p>
            <BundleLine label="Quantity" value={`${totalQty(quoteTires, qtyByMspn)} tires`} testId="bundle-quantity" />
            <BundleLine label="Revenue" value={formatCurrency(math.revenue)} testId="bundle-revenue" />
            <BundleLine label="Cost" value={formatCurrency(math.cost)} testId="bundle-cost" />
            <BundleLine label="Profit" value={formatCurrency(math.profit)} testId="bundle-profit" />
            <BundleLine label="Margin" value={`${math.margin.toFixed(1)}%`} testId="bundle-margin" />
          </div>
        ) : null}

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
              {testOfferNum > 0 ? `${math.testMargin.toFixed(1)}%` : '--'}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
              Profit
            </p>
            <p className="font-mono text-lg font-semibold text-zinc-100">
              {testOfferNum > 0 ? formatCurrency(math.testProfit) : '--'}
            </p>
          </div>
        </div>

        {belowFloor && math.counterOffer != null ? (
          <div
            role="alert"
            className="mt-3 rounded-lg border border-amber-700/50 bg-amber-950/40 px-3 py-2 text-sm text-amber-100"
          >
            Below {floorPct}% floor &mdash; counter at{' '}
            <span className="font-mono font-semibold">
              {formatCurrency(math.counterOffer)}
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

function lineKey(tire, index) {
  return String(tire?.mspn || tire?.id || index)
}

function clampQty(value) {
  const n = Number(value) || 1
  return Math.min(99, Math.max(1, Math.trunc(n)))
}

function totalQty(tires, qtyByMspn) {
  return tires.reduce((sum, tire, index) => sum + clampQty(qtyByMspn[lineKey(tire, index)] ?? 1), 0)
}

function BundleLine({ label, value, testId }) {
  return (
    <div className="flex items-center justify-between gap-3 py-0.5 text-sm">
      <span className="text-zinc-400">{label}</span>
      <span data-testid={testId} className="font-mono font-semibold text-zinc-100">
        {value}
      </span>
    </div>
  )
}
