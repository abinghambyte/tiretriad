// src/components/tires/TireDetailDrawer.jsx
import { useCallback, useEffect, useMemo, useState } from 'react'
import { formatCurrencyOrDash, formatPercent } from '../../utils/format.js'
import { effectiveCts } from '../../utils/ctsCalc.js'
import { tireCatalogBuyNumber } from '../../utils/tireCatalogBuy.js'
import { tireCatalogRetailNumber } from '../../utils/tireCatalogRetail.js'
import { timeAgo } from '../../utils/timeAgo.js'

const PLATFORMS = [
  { key: 'facebook', label: 'Facebook Marketplace' },
  { key: 'offerup', label: 'OfferUp' },
  { key: 'craigslist', label: 'Craigslist' },
  { key: 'ebay', label: 'eBay' },
  { key: 'marketplace', label: 'Marketplace' },
]

function toMillis(v) {
  if (!v) return null
  if (typeof v.toMillis === 'function') {
    try { return v.toMillis() } catch { return null }
  }
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function platformCell(tire, key) {
  const entry = tire?.platformListings?.[key]
  const ms = toMillis(entry?.lastPostedAt)
  if (!ms) return { status: 'Never listed', posted: null, tone: 'text-zinc-500' }
  const ageDays = Math.floor((Date.now() - ms) / (24 * 60 * 60 * 1000))
  const stale = ageDays >= 7
  return {
    status: stale ? 'Stale' : 'Active',
    posted: timeAgo(entry.lastPostedAt) || `${ageDays}d ago`,
    tone: stale ? 'text-amber-300' : 'text-emerald-300',
  }
}

function marginHeadroomPct(tire) {
  const retail = tireCatalogRetailNumber(tire)
  if (retail <= 0) return null
  const buy = tireCatalogBuyNumber(tire)
  const cts = effectiveCts(tire)
  return (retail - buy - cts) / retail
}

/**
 * Read-only tire profile drawer with editable policy controls (doNotList,
 * adminNotes). Slide-in from the right, matches CrmLeadDetailDrawer chrome.
 *
 * @param {object} props
 * @param {Record<string, unknown> | null} props.tire
 * @param {Array<Record<string, unknown>>} [props.orders] - orders matching this mspn
 * @param {() => void} props.onClose
 * @param {(patch: { doNotList: boolean, adminNotes: string }) => Promise<void>} props.onSave
 */
export function TireDetailDrawer({ tire, orders = [], onClose, onSave }) {
  const [doNotList, setDoNotList] = useState(Boolean(tire?.doNotList))
  const [adminNotes, setAdminNotes] = useState(String(tire?.adminNotes ?? ''))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    setDoNotList(Boolean(tire?.doNotList))
    setAdminNotes(String(tire?.adminNotes ?? ''))
    setError(null)
  }, [tire?.id, tire?.doNotList, tire?.adminNotes])

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const dirty = useMemo(() => {
    return (
      Boolean(tire?.doNotList) !== doNotList ||
      String(tire?.adminNotes ?? '') !== adminNotes
    )
  }, [tire?.doNotList, tire?.adminNotes, doNotList, adminNotes])

  const save = useCallback(async () => {
    if (!onSave || !dirty) return
    setSaving(true)
    setError(null)
    try {
      await onSave({ doNotList, adminNotes })
    } catch (e) {
      setError(String(e?.message || e))
    } finally {
      setSaving(false)
    }
  }, [onSave, dirty, doNotList, adminNotes])

  if (!tire) return null

  const retail = tireCatalogRetailNumber(tire)
  const buy = tireCatalogBuyNumber(tire)
  const cts = effectiveCts(tire)
  const headroom = marginHeadroomPct(tire)
  const priceSources = Array.isArray(tire?.priceIntel?.sources) ? tire.priceIntel.sources : []
  const latestPriceSource = priceSources.reduce((acc, cur) => {
    const ms = toMillis(cur?.at) ?? toMillis(cur?.recordedAt)
    if (ms && (!acc || ms > acc.ms)) return { ms, label: cur?.label || cur?.source || '' }
    return acc
  }, null)

  const ordersForThisTire = (orders || []).filter((o) => String(o?.mspn || '') === String(tire.mspn || ''))
  const recentOrders = ordersForThisTire
    .slice()
    .sort((a, b) => (toMillis(b?.completedAt) ?? toMillis(b?.createdAt) ?? 0) -
                    (toMillis(a?.completedAt) ?? toMillis(a?.createdAt) ?? 0))
    .slice(0, 5)

  return (
    <div
      className="fixed inset-0 z-[130] flex justify-end bg-black/70 p-0 backdrop-blur-md"
      role="dialog"
      aria-modal
      aria-labelledby="tire-drawer-title"
      onClick={onClose}
    >
      <div
        className="h-full min-h-screen w-full max-w-lg overflow-y-auto border-l border-zinc-800/90 bg-zinc-950 p-6 shadow-2xl shadow-black/40 max-sm:max-w-none max-sm:border-l-0"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-xs text-zinc-500">{tire.mspn}</p>
            <h2 id="tire-drawer-title" className="mt-1 text-lg font-semibold tracking-tight text-zinc-50">
              {tire.brand} {tire.tread}
            </h2>
            <p className="mt-0.5 text-sm text-zinc-300">{tire.description}</p>
            <p className="mt-1 text-xs text-zinc-500">LR {tire.lr || '—'}</p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-100"
          >
            <span aria-hidden className="text-xl leading-none">×</span>
          </button>
        </div>

        {/* Pricing */}
        <section className="mt-6 rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
          <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-500">Pricing</h3>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div>
              <dt className="text-xs text-zinc-500">Buy</dt>
              <dd className="font-mono text-zinc-100">{formatCurrencyOrDash(buy)}</dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500">Retail</dt>
              <dd className="font-mono text-zinc-100">{formatCurrencyOrDash(retail)}</dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500">Overhead (CTS)</dt>
              <dd className="font-mono text-zinc-100">{formatCurrencyOrDash(cts)}</dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500">Margin headroom</dt>
              <dd className={`font-mono ${headroom != null && headroom >= 0.25 ? 'text-emerald-300' : headroom != null && headroom >= 0.1 ? 'text-amber-200' : 'text-rose-300'}`}>
                {headroom == null ? '—' : formatPercent(headroom * 100, 0)}
              </dd>
            </div>
          </dl>
          {latestPriceSource ? (
            <p className="mt-3 text-[11px] text-zinc-500">
              Last retail source: {latestPriceSource.label || 'unknown'} &middot;{' '}
              {timeAgo(latestPriceSource.ms) || 'recent'}
            </p>
          ) : null}
        </section>

        {/* Platforms */}
        <section className="mt-4 rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
          <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-500">Listings</h3>
          <ul className="mt-2 space-y-1.5 text-sm">
            {PLATFORMS.map((p) => {
              const cell = platformCell(tire, p.key)
              return (
                <li key={p.key} className="flex items-center justify-between gap-3">
                  <span className="text-zinc-300">{p.label}</span>
                  <span className="flex items-center gap-2">
                    <span className={`text-xs font-medium ${cell.tone}`}>{cell.status}</span>
                    {cell.posted ? <span className="text-[11px] text-zinc-500">{cell.posted}</span> : null}
                  </span>
                </li>
              )
            })}
          </ul>
        </section>

        {/* Orders */}
        <section className="mt-4 rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
          <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-500">Order history</h3>
          {recentOrders.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-500">No orders recorded for this MSPN.</p>
          ) : (
            <>
              <p className="mt-2 text-[11px] text-zinc-500">
                {recentOrders.length} recent order{recentOrders.length === 1 ? '' : 's'}
              </p>
              <ul className="mt-1 space-y-1 text-sm">
                {recentOrders.map((o) => {
                  const ms = toMillis(o?.completedAt) ?? toMillis(o?.createdAt)
                  return (
                    <li key={o.id} className="flex items-center justify-between gap-3">
                      <span className="text-zinc-300">
                        {o.status || 'order'} &middot; qty {o.quantity ?? '?'}
                      </span>
                      <span className="text-[11px] text-zinc-500">{ms ? (timeAgo(ms) || '—') : '—'}</span>
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </section>

        {/* Policy (editable) */}
        <section className="mt-4 rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
          <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-500">Listing policy</h3>
          <label className="mt-3 flex items-center gap-2 text-sm text-zinc-200">
            <input
              type="checkbox"
              aria-label="Do not list"
              checked={doNotList}
              onChange={(e) => setDoNotList(e.target.checked)}
              className="size-4 rounded border-zinc-600 accent-amber-400"
            />
            Do not list
          </label>
          <label className="mt-3 block text-sm text-zinc-200">
            <span className="text-xs text-zinc-500">Notes</span>
            <textarea
              aria-label="Notes"
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              rows={3}
              placeholder="Private notes for this tire (not shown to customers)."
              className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-amber-500 focus:outline-none"
            />
          </label>
          {error ? <p className="mt-2 text-xs text-rose-300">{error}</p> : null}
          <div className="mt-3 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800/60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={!dirty || saving}
              className="rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-amber-400 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}
