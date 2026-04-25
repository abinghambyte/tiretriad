import { useEffect, useMemo, useState } from 'react'
import { computeBundleQuote, marginBadgeClass, marginBadgeLabel } from '../../utils/marginCalc'
import { effectiveCts } from '../../utils/ctsCalc'
import { tireCatalogBuyNumber } from '../../utils/tireCatalogBuy'
import { tireCatalogRetailNumber } from '../../utils/tireCatalogRetail'
import { formatCurrency, formatCurrencyOrDash, formatPercent } from '../../utils/format'
import { MODAL_CENTER_BACKDROP, MODAL_CENTER_PANEL } from '../ui/modalChrome.js'

/**
 * Lightweight inline "Quote" calculator: pick a tire, set qty + sale price,
 * see cost / revenue / margin across the bundle. Sits between the listing
 * generator (which scripts the ad copy) and SaleMessenger (which logs an
 * actual sale). Read-only on the catalog row, no Firestore writes.
 *
 * Defaults:
 *  - quantity: 4 (Skedaddle's typical set-of-four sale)
 *  - sale price per tire: researched retail, falling back to Kyle buy if no
 *    retail has been researched yet. User can override either freely.
 *
 * @param {object} props
 * @param {Record<string, unknown>} props.tire  The single selected tire row.
 * @param {() => void} props.onClose
 * @param {(ctx: { mspn: string, quantity: number, pricePerTire: number }) => void} [props.onLogSale]
 *   Optional callback to hand the current qty/price off to SaleMessenger.
 *   When omitted, the "Log sale" button is hidden.
 */
export function QuoteCalculator({ tire, onClose, onLogSale }) {
  const buyPerTire = tireCatalogBuyNumber(tire)
  const overheadPerTire = effectiveCts(tire)
  const retailPerTire = tireCatalogRetailNumber(tire)
  const fetPerTire = Number(tire?.fet) || 0

  const defaultPrice = retailPerTire > 0 ? retailPerTire : buyPerTire

  const [quantity, setQuantity] = useState(4)
  const [salePrice, setSalePrice] = useState(() =>
    defaultPrice > 0 ? String(defaultPrice.toFixed(2)) : '',
  )

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const quote = useMemo(
    () =>
      computeBundleQuote({
        qty: Number(quantity) || 0,
        salePrice: Number(salePrice) || 0,
        buyPerTire,
        overheadPerTire,
        // FET is already folded into the catalog buy number. Pass 0 so the
        // Quote modal shows the FET row for transparency without double-
        // counting it in the cost total. `fetTotal` is still surfaced on
        // its own line below for reference.
        fetPerTire: 0,
      }),
    [quantity, salePrice, buyPerTire, overheadPerTire],
  )

  // Separate reference calc so the FET line shows qty × FET without it
  // affecting the bundle cost / margin totals.
  const fetReferenceTotal = quote.qty * fetPerTire

  const marginLabel = marginBadgeLabel(quote.marginPct)
  const marginClasses = marginBadgeClass(quote.marginPct)

  const brand = String(tire?.brand || '').trim() || '--'
  const description = String(tire?.description || '').trim() || '--'
  const mspn = String(tire?.mspn || '').trim() || '--'

  const canLog =
    typeof onLogSale === 'function' &&
    quote.qty >= 1 &&
    quote.salePrice > 0 &&
    mspn !== '--'

  return (
    <div
      className={MODAL_CENTER_BACKDROP}
      role="dialog"
      aria-modal="true"
      aria-labelledby="quote-calc-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className={`${MODAL_CENTER_PANEL} border-zinc-800 bg-zinc-950 p-0`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-zinc-800 px-5 py-4">
          <div className="min-w-0">
            <h2
              id="quote-calc-title"
              className="text-lg font-semibold text-zinc-100"
            >
              Quote
            </h2>
            <p className="mt-0.5 text-xs text-zinc-400">
              Total cost, revenue, and margin across the bundle.
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

        <div className="space-y-5 px-5 py-5">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
              Tire
            </p>
            <div className="mt-1 flex flex-col gap-0.5">
              <p className="text-sm font-semibold text-zinc-100">
                <span className="text-zinc-400">{brand}</span>
                <span className="mx-1.5 text-zinc-600">/</span>
                <span className="break-words">{description}</span>
              </p>
              <p className="sk-figures text-xs text-zinc-400">
                MSPN <span className="text-zinc-300">{mspn}</span>
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label
                htmlFor="quote-qty"
                className="mb-1 block text-xs font-medium text-zinc-400"
              >
                Quantity
              </label>
              <input
                id="quote-qty"
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                value={quantity}
                onChange={(e) => {
                  const raw = e.target.value
                  if (raw === '') {
                    setQuantity('')
                    return
                  }
                  const n = Math.max(1, Math.floor(Number(raw) || 0))
                  setQuantity(n)
                }}
                onBlur={() => {
                  if (quantity === '' || Number(quantity) < 1) setQuantity(1)
                }}
                className="sk-figures w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-amber-600/70"
              />
            </div>
            <div>
              <label
                htmlFor="quote-sale-price"
                className="mb-1 block text-xs font-medium text-zinc-400"
              >
                Sale price / tire
              </label>
              <input
                id="quote-sale-price"
                type="number"
                inputMode="decimal"
                min={0}
                step={0.01}
                value={salePrice}
                onChange={(e) => setSalePrice(e.target.value)}
                className="sk-figures w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-amber-600/70"
              />
              {retailPerTire > 0 ? (
                <p className="mt-1 text-[11px] text-zinc-400">
                  Default: researched retail{' '}
                  <span className="sk-figures text-zinc-300">
                    {formatCurrency(retailPerTire)}
                  </span>
                </p>
              ) : buyPerTire > 0 ? (
                <p className="mt-1 text-[11px] text-zinc-400">
                  Default: catalog buy{' '}
                  <span className="sk-figures text-zinc-300">
                    {formatCurrency(buyPerTire)}
                  </span>{' '}
                  (no researched retail yet)
                </p>
              ) : null}
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-zinc-800">
            <dl className="divide-y divide-zinc-800 text-sm">
              <QuoteRow
                label="Buy cost total"
                sub={`${quote.qty} × ${formatCurrencyOrDash(buyPerTire)}`}
                value={formatCurrency(quote.buyTotal)}
              />
              <QuoteRow
                label="Overhead total"
                sub={`${quote.qty} × ${formatCurrencyOrDash(overheadPerTire)}`}
                value={formatCurrency(quote.overheadTotal)}
              />
              {fetPerTire > 0 ? (
                <QuoteRow
                  label="FET total"
                  sub={`${quote.qty} × ${formatCurrencyOrDash(fetPerTire)} (already in buy)`}
                  value={formatCurrency(fetReferenceTotal)}
                  muted
                />
              ) : null}
              <QuoteRow
                label="Revenue total"
                sub={`${quote.qty} × ${formatCurrencyOrDash(quote.salePrice)}`}
                value={formatCurrency(quote.revenueTotal)}
                accent
              />
              <QuoteRow
                label="Profit"
                sub="Revenue − (buy + overhead)"
                value={formatCurrency(quote.profitTotal)}
                accent
              />
            </dl>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                Bundle margin %
              </p>
              <p className="mt-1 text-[11px] text-zinc-400">
                (revenue − cost) / revenue
              </p>
            </div>
            <span className={`${marginClasses} sk-figures`} title={marginLabel}>
              {quote.marginPct == null
                ? 'no revenue yet'
                : `${formatPercent(quote.marginPct, 1)} · ${marginLabel}`}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-zinc-800 bg-zinc-950 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-600 px-4 py-2 text-sm text-zinc-300 hover:border-zinc-500 hover:text-white"
          >
            Close
          </button>
          {typeof onLogSale === 'function' ? (
            <button
              type="button"
              disabled={!canLog}
              onClick={() =>
                onLogSale({
                  mspn,
                  quantity: quote.qty,
                  pricePerTire: quote.salePrice,
                })
              }
              className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Log sale
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

/**
 * @param {object} props
 * @param {string} props.label
 * @param {string} [props.sub]
 * @param {string} props.value
 * @param {boolean} [props.muted]
 * @param {boolean} [props.accent]
 */
function QuoteRow({ label, sub, value, muted, accent }) {
  const labelClass = muted
    ? 'text-sm font-medium text-zinc-400'
    : accent
      ? 'text-sm font-semibold text-zinc-100'
      : 'text-sm font-medium text-zinc-200'
  const valueClass = muted
    ? 'sk-figures text-sm font-medium text-zinc-400'
    : accent
      ? 'sk-figures text-sm font-semibold text-amber-200/95'
      : 'sk-figures text-sm font-semibold text-zinc-100'
  return (
    <div className="flex items-center justify-between gap-3 bg-zinc-900/40 px-4 py-2.5">
      <div className="min-w-0">
        <dt className={labelClass}>{label}</dt>
        {sub ? (
          <dd className="sk-figures mt-0.5 text-[11px] text-zinc-400">{sub}</dd>
        ) : null}
      </div>
      <dd className={`whitespace-nowrap ${valueClass}`}>{value}</dd>
    </div>
  )
}
