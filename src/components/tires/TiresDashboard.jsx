import { useCallback, useMemo, useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { functions } from '../../firebase/config'
import { permissionMeets } from '../../constants/peoplePermissions'
import { useUserProfile } from '../../hooks/useUserProfile'
import { useToast } from '../../context/ToastContext.jsx'
import { OrdersList } from '../orders/OrdersList'
import { useTires } from '../../hooks/useTires'
import { computeMargin } from '../../utils/marginCalc'
import { tireCatalogBuyNumber } from '../../utils/tireCatalogBuy'
import { exportMarginCsv } from '../../utils/exportMarginCsv'
import { BulkCtsModal } from './BulkCtsModal'
import { FilterPresetsBar } from './FilterPresetsBar'
import { ListingGenerator } from './ListingGenerator'
import { MarginFilters } from './MarginFilters'
import { MarginTable } from './MarginTable'
import { SaleMessenger } from './SaleMessenger'
import { ModuleSubheader } from '../layout/ModuleSubheader.jsx'
import { useMediaQuery } from '../../hooks/useMediaQuery.js'

const createProspectiveOrder = httpsCallable(functions, 'createProspectiveOrder')
const notifyTeamQuick = httpsCallable(functions, 'notifyTeamQuick')

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) =>
    String(a).localeCompare(String(b)),
  )
}

export function TiresDashboard() {
  const { toast } = useToast()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { permissionFor } = useUserProfile()
  const { tires, loading, error } = useTires()

  const tab = searchParams.get('tab') === 'orders' ? 'orders' : 'catalog'
  const ordersHighlight = searchParams.get('highlight') || undefined
  const canViewOrders = permissionMeets(permissionFor('orders'), 'view')

  const [minMargin, setMinMargin] = useState(0)
  const [brand, setBrand] = useState('')
  const [category, setCategory] = useState('')
  const [useTag, setUseTag] = useState('')
  const [lr, setLr] = useState('')
  const [sortKey, setSortKey] = useState('margin')
  const [sortDir, setSortDir] = useState('desc')
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [listingOpen, setListingOpen] = useState(false)
  const [saleOpen, setSaleOpen] = useState(false)
  const [saleInitial, setSaleInitial] = useState(null)
  const [bulkCtsOpen, setBulkCtsOpen] = useState(false)
  const [deadStockOnly, setDeadStockOnly] = useState(false)
  const [filtersManualOpen, setFiltersManualOpen] = useState(false)
  const [mobileSelectMode, setMobileSelectMode] = useState(false)
  const isNarrowForFilters = useMediaQuery('(max-width: 639px)')

  const showFilterPanel = !isNarrowForFilters || filtersManualOpen

  const applyFilterPreset = useCallback((p) => {
    setBrand(p.brand ?? '')
    setCategory(p.category ?? '')
    setUseTag(p.useTag ?? '')
    setLr(p.lr ?? '')
    setMinMargin(Number(p.minMargin) || 0)
    setDeadStockOnly(false)
  }, [])

  const hasActiveFilters =
    minMargin > 0 || Boolean(brand || category || useTag || lr) || deadStockOnly

  const activeFilterCount = useMemo(() => {
    let n = 0
    if (minMargin > 0) n += 1
    if (brand) n += 1
    if (category) n += 1
    if (useTag) n += 1
    if (lr) n += 1
    if (deadStockOnly) n += 1
    return n
  }, [minMargin, brand, category, useTag, lr, deadStockOnly])

  function clearFilters() {
    setMinMargin(0)
    setBrand('')
    setCategory('')
    setUseTag('')
    setLr('')
    setDeadStockOnly(false)
  }

  function clearSelection() {
    setSelectedIds(new Set())
    setBulkCtsOpen(false)
  }

  const brands = useMemo(
    () => uniqueSorted(tires.map((t) => t.brand)),
    [tires],
  )
  const categories = useMemo(
    () => uniqueSorted(tires.map((t) => t.category)),
    [tires],
  )
  const lrs = useMemo(() => uniqueSorted(tires.map((t) => t.lr)), [tires])
  const useTags = useMemo(() => {
    const tags = []
    for (const t of tires) {
      if (Array.isArray(t.useTags)) tags.push(...t.useTags)
    }
    return uniqueSorted(tags)
  }, [tires])

  const enriched = useMemo(() => {
    return tires.map((t) => ({
      ...t,
      margin: computeMargin(t),
    }))
  }, [tires])

  const filtered = useMemo(() => {
    return enriched.filter((row) => {
      if (brand && row.brand !== brand) return false
      if (category && row.category !== category) return false
      if (lr && row.lr !== lr) return false
      if (useTag) {
        const tags = Array.isArray(row.useTags) ? row.useTags : []
        if (!tags.includes(useTag)) return false
      }
      if (minMargin > 0) {
        if (row.margin == null || Number.isNaN(row.margin)) return false
        if (row.margin < minMargin) return false
      }
      if (deadStockOnly && !row.deadStockFlag) return false
      return true
    })
  }, [enriched, brand, category, lr, useTag, minMargin, deadStockOnly])

  const sortedRows = useMemo(() => {
    const rows = [...filtered]
    const dir = sortDir === 'asc' ? 1 : -1
    rows.sort((a, b) => {
      if (sortKey === 'brand') {
        return dir * String(a.brand || '').localeCompare(String(b.brand || ''))
      }
      if (sortKey === 'buy') {
        const av = tireCatalogBuyNumber(a)
        const bv = tireCatalogBuyNumber(b)
        if (av === bv) return 0
        return av < bv ? -dir : dir
      }
      const am = a.margin
      const bm = b.margin
      if (am == null && bm == null) return 0
      if (am == null) return 1
      if (bm == null) return -1
      if (am === bm) return 0
      return am < bm ? -dir : dir
    })
    return rows
  }, [filtered, sortKey, sortDir])

  const emptyState = useMemo(() => {
    if (loading) return null
    if (tires.length === 0) {
      return (
        <>
          <span className="font-medium text-zinc-400">Catalog is empty.</span>
          <br />
          <span className="mt-2 inline-block text-zinc-500">
            Import rows into the Firestore{' '}
            <code className="text-zinc-400">tires</code> collection (CSV import
            script or console), then refresh.
          </span>
        </>
      )
    }
    if (hasActiveFilters) {
      return (
        <>
          No tires match the current filters.
          <br />
          <button
            type="button"
            onClick={clearFilters}
            className="mt-3 text-amber-200/90 underline decoration-amber-700/50 hover:text-amber-100"
          >
            Clear filters
          </button>
        </>
      )
    }
    return 'No rows to display.'
  }, [loading, tires.length, hasActiveFilters])

  function handleSort(key) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir(key === 'brand' ? 'asc' : 'desc')
    }
  }

  function toggle(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      if (next.size === 0) setBulkCtsOpen(false)
      return next
    })
  }

  function selectAllVisible(rows) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      for (const r of rows) next.add(r.id)
      return next
    })
  }

  function deselectAllVisible(rows) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      for (const r of rows) next.delete(r.id)
      if (next.size === 0) setBulkCtsOpen(false)
      return next
    })
  }

  const selectedTires = useMemo(
    () => tires.filter((t) => selectedIds.has(t.id)),
    [tires, selectedIds],
  )

  function selectionPrimaryMspnRows() {
    const picks = sortedRows.filter((r) => selectedIds.has(r.id))
    if (picks.length === 0) return null
    const m0 = String(picks[0].mspn || '').trim()
    if (!m0) {
      window.alert('Selected tires are missing an MSPN.')
      return null
    }
    const same = picks.filter((p) => String(p.mspn || '').trim() === m0)
    const mixed = picks.some((p) => String(p.mspn || '').trim() !== m0)
    if (mixed) {
      window.alert(
        'Selection includes multiple MSPNs. Using the first SKU and the count of rows that match it.',
      )
    }
    return { mspn: m0, rows: same }
  }

  function logSelectedSale() {
    const ctx = selectionPrimaryMspnRows()
    if (!ctx) return
    setSaleInitial({ mspn: ctx.mspn, quantity: ctx.rows.length })
    setSaleOpen(true)
  }

  async function notifySelectedQuick() {
    const ctx = selectionPrimaryMspnRows()
    if (!ctx) return
    const first = ctx.rows[0]
    try {
      await notifyTeamQuick({
        mspn: ctx.mspn,
        quantity: ctx.rows.length,
        description: String(first.description || '').trim(),
      })
      toast('Team notified in Slack', 'success')
    } catch (e) {
      console.error(e)
      toast(e?.message || 'Could not notify team.', 'error')
    }
  }

  async function logSelectedProspective() {
    const ctx = selectionPrimaryMspnRows()
    if (!ctx) return
    const first = ctx.rows[0]
    const pricePerTire = tireCatalogBuyNumber(first)
    if (!Number.isFinite(pricePerTire) || pricePerTire <= 0) {
      window.alert('Selected tire needs a valid buy price (Kyle catalog price) for a prospective order.')
      return
    }
    const quantity = ctx.rows.length
    const totalPrice = pricePerTire * quantity
    try {
      const { data } = await createProspectiveOrder({
        mspn: ctx.mspn,
        quantity,
        pricePerTire,
        totalPrice,
      })
      const id = data?.orderId
      clearSelection()
      if (id) {
        navigate(`/tires?tab=orders&highlight=${encodeURIComponent(id)}`)
      } else {
        navigate('/tires?tab=orders')
      }
    } catch (e) {
      console.error(e)
      window.alert(e?.message || 'Could not create prospective order. Deploy functions?')
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <ModuleSubheader
        title="Skedaddle Tires"
        subtitle="Margin catalog, orders, and listings"
        tabs={[
          {
            key: 'catalog',
            label: 'Catalog',
            to: '/tires',
            active: tab === 'catalog',
          },
          {
            key: 'orders',
            label: 'Orders',
            to: '/tires?tab=orders',
            active: tab === 'orders',
          },
        ]}
      />

      <main className="mx-auto max-w-7xl space-y-8 px-6 py-8">
        {error ? (
          <p className="rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-200">
            Could not load tires: {error.message}
          </p>
        ) : null}

        {tab === 'orders' ? (
          <div className="mx-auto max-w-4xl space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-zinc-100">Tire orders</h2>
              <p className="mt-1 max-w-2xl text-sm text-zinc-500">
                Slack-driven Kyle → DJ workflow. Notify customers from here and mark complete when
                paid. Bookmark{' '}
                <Link to="/orders" className="text-amber-300/90 underline-offset-2 hover:underline">
                  /orders
                </Link>{' '}
                for a direct link.
              </p>
            </div>
            {canViewOrders ? (
              <OrdersList highlightId={ordersHighlight} />
            ) : (
              <p className="text-sm text-zinc-500">
                You do not have permission to view orders. Ask an admin for the{' '}
                <span className="font-mono text-zinc-400">orders</span> module.
              </p>
            )}
          </div>
        ) : null}

        {tab === 'catalog' ? (
          <>
        {isNarrowForFilters ? (
          <div className="mb-3 flex flex-wrap items-center gap-2 sm:hidden">
            <button
              type="button"
              onClick={() => setFiltersManualOpen((v) => !v)}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900/60 px-4 py-2 text-sm font-medium text-zinc-200 hover:border-zinc-500"
              aria-expanded={filtersManualOpen}
            >
              Filters
              {activeFilterCount > 0 ? (
                <span className="rounded-full bg-amber-950/80 px-2 py-0.5 text-xs font-semibold text-amber-100 ring-1 ring-amber-800/50">
                  {activeFilterCount} active
                </span>
              ) : (
                <span className="text-xs font-normal text-zinc-500">· none active</span>
              )}
            </button>
          </div>
        ) : null}

        {showFilterPanel ? (
          <>
            <MarginFilters
              brands={brands}
              categories={categories}
              useTags={useTags}
              lrs={lrs}
              brand={brand}
              category={category}
              useTag={useTag}
              lr={lr}
              onBrand={setBrand}
              onCategory={setCategory}
              onUseTag={setUseTag}
              onLr={setLr}
              minMargin={minMargin}
              onMinMargin={setMinMargin}
              deadStockOnly={deadStockOnly}
              onDeadStockOnly={setDeadStockOnly}
              hasActiveFilters={hasActiveFilters}
              onClearAll={clearFilters}
            />

            <FilterPresetsBar
              brand={brand}
              category={category}
              useTag={useTag}
              lr={lr}
              minMargin={minMargin}
              onApplyPreset={applyFilterPreset}
            />
          </>
        ) : null}

        <div className="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-900/35 p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm text-zinc-400">
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
                  Loading inventory…
                </span>
              ) : (
                <>
                  <span className="font-medium text-zinc-300">
                    {sortedRows.length} tire{sortedRows.length === 1 ? '' : 's'} shown
                  </span>
                  <span className="text-zinc-600"> · </span>
                  {selectedIds.size > 0 ? (
                    <span className="inline-flex items-center rounded-full bg-amber-950/70 px-2.5 py-0.5 text-xs font-semibold text-amber-100 ring-1 ring-amber-800/50">
                      {selectedIds.size} selected
                    </span>
                  ) : (
                    <span className="text-zinc-500">None selected</span>
                  )}
                </>
              )}
            </p>
            <button
              type="button"
              onClick={() => setMobileSelectMode((v) => !v)}
              className="inline-flex min-h-[44px] items-center rounded-lg border border-zinc-600 px-3 py-2 text-sm text-zinc-200 hover:border-zinc-500 hover:bg-zinc-900/60 md:hidden"
            >
              {mobileSelectMode ? 'Exit select mode' : 'Select mode'}
            </button>
            </div>
            <button
              type="button"
              disabled={loading || sortedRows.length === 0}
              onClick={() => exportMarginCsv(sortedRows)}
              className="self-start rounded-lg border border-zinc-600 px-3 py-2 text-sm text-zinc-200 hover:border-zinc-500 hover:bg-zinc-900/60 disabled:cursor-not-allowed disabled:opacity-50 sm:self-center min-h-[44px] sm:min-h-0"
            >
              Export CSV
            </button>
          </div>
          {selectedIds.size > 0 ? (
            <div className="flex flex-col gap-3 border-t border-zinc-800/80 pt-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <button
                  type="button"
                  disabled={selectedTires.length === 0 || loading}
                  onClick={() => setListingOpen(true)}
                  className="min-h-[44px] rounded-xl bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-0"
                >
                  Generate listings
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => {
                    if (selectedIds.size > 0) logSelectedSale()
                    else {
                      setSaleInitial(null)
                      setSaleOpen(true)
                    }
                  }}
                  className="min-h-[44px] rounded-lg border border-amber-800/60 bg-amber-950/35 px-3 py-2 text-sm font-medium text-amber-100 hover:bg-amber-950/55 disabled:opacity-50 sm:min-h-0"
                >
                  Log sale
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void notifySelectedQuick()}
                  className="min-h-[44px] rounded-lg border border-cyan-900/50 bg-cyan-950/35 px-3 py-2 text-sm font-medium text-cyan-100 hover:bg-cyan-950/55 disabled:opacity-50 sm:min-h-0"
                >
                  Notify team
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void logSelectedProspective()}
                  className="min-h-[44px] rounded-lg border border-fuchsia-900/50 bg-fuchsia-950/30 px-3 py-2 text-sm font-medium text-fuchsia-100 hover:bg-fuchsia-950/50 disabled:opacity-50 sm:min-h-0"
                >
                  Log prospective order
                </button>
              </div>
              <div className="hidden w-px self-stretch bg-zinc-800 lg:block" aria-hidden />
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap lg:justify-end">
                <button
                  type="button"
                  onClick={clearSelection}
                  className="min-h-[44px] rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-400 hover:border-zinc-500 hover:text-zinc-200 sm:min-h-0"
                >
                  Clear selection
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => setBulkCtsOpen(true)}
                  className="min-h-[44px] rounded-lg border border-amber-800/60 bg-amber-950/35 px-3 py-2 text-sm font-medium text-amber-100 hover:bg-amber-950/55 disabled:opacity-50 sm:min-h-0"
                >
                  Bulk overhead edit
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <MarginTable
          rows={sortedRows}
          selectedIds={selectedIds}
          onToggle={toggle}
          onSelectAllVisible={selectAllVisible}
          onDeselectAllVisible={deselectAllVisible}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={handleSort}
          loading={loading}
          emptyState={emptyState}
          selectMode={mobileSelectMode}
        />
          </>
        ) : null}
      </main>

      {listingOpen ? (
        <ListingGenerator
          key={selectedTires.map((t) => t.id).sort().join('-')}
          tires={selectedTires}
          onClose={() => setListingOpen(false)}
          onUseRecommendedPrice={({ mspn, quantity, pricePerTire }) => {
            setListingOpen(false)
            setSaleInitial({ mspn, quantity, pricePerTire })
            setSaleOpen(true)
          }}
        />
      ) : null}
      {saleOpen ? (
        <SaleMessenger
          key={
            saleInitial
              ? `${saleInitial.mspn}-${saleInitial.quantity}-${saleInitial.pricePerTire ?? ''}`
              : 'sale-open'
          }
          tires={tires}
          initialMspn={saleInitial?.mspn}
          initialQuantity={saleInitial?.quantity}
          initialPricePerTire={saleInitial?.pricePerTire}
          onClose={() => {
            setSaleOpen(false)
            setSaleInitial(null)
          }}
        />
      ) : null}
      <BulkCtsModal
        open={bulkCtsOpen && selectedIds.size > 0}
        onClose={() => setBulkCtsOpen(false)}
        tires={selectedTires}
      />
    </div>
  )
}
