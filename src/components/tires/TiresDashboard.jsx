import { useCallback, useMemo, useState } from 'react'
import { signOut } from 'firebase/auth'
import { Link, useNavigate } from 'react-router-dom'
import { auth } from '../../firebase/config'
import { useAuth } from '../../hooks/useAuth'
import { useTires } from '../../hooks/useTires'
import { marginPercent } from '../../utils/marginCalc'
import { exportMarginCsv } from '../../utils/exportMarginCsv'
import { BulkCtsModal } from './BulkCtsModal'
import { FilterPresetsBar } from './FilterPresetsBar'
import { ListingGenerator } from './ListingGenerator'
import { MarginFilters } from './MarginFilters'
import { MarginTable } from './MarginTable'
import { SaleMessenger } from './SaleMessenger'

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) =>
    String(a).localeCompare(String(b)),
  )
}

export function TiresDashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { tires, loading, error } = useTires()

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
  const [bulkCtsOpen, setBulkCtsOpen] = useState(false)

  const applyFilterPreset = useCallback((p) => {
    setBrand(p.brand ?? '')
    setCategory(p.category ?? '')
    setUseTag(p.useTag ?? '')
    setLr(p.lr ?? '')
    setMinMargin(Number(p.minMargin) || 0)
  }, [])

  const hasActiveFilters =
    minMargin > 0 || Boolean(brand || category || useTag || lr)

  function clearFilters() {
    setMinMargin(0)
    setBrand('')
    setCategory('')
    setUseTag('')
    setLr('')
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
    return tires.map((t) => {
      const rp = t.retailPrice ?? t.price
      const retailNum = rp != null && rp !== '' ? Number(rp) : NaN
      return {
        ...t,
        retailPrice: Number.isFinite(retailNum) ? retailNum : t.retailPrice,
        margin: marginPercent(Number.isFinite(retailNum) ? retailNum : NaN, t.cts),
      }
    })
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
      return true
    })
  }, [enriched, brand, category, lr, useTag, minMargin])

  const sortedRows = useMemo(() => {
    const rows = [...filtered]
    const dir = sortDir === 'asc' ? 1 : -1
    rows.sort((a, b) => {
      if (sortKey === 'brand') {
        return dir * String(a.brand || '').localeCompare(String(b.brand || ''))
      }
      if (sortKey === 'retail') {
        const av = Number(a.retailPrice) || 0
        const bv = Number(b.retailPrice) || 0
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

  function toggleAllVisible(rows) {
    const allOn = rows.length > 0 && rows.every((r) => selectedIds.has(r.id))
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (allOn) {
        for (const r of rows) next.delete(r.id)
      } else {
        for (const r of rows) next.add(r.id)
      }
      if (next.size === 0) setBulkCtsOpen(false)
      return next
    })
  }

  const selectedTires = useMemo(
    () => tires.filter((t) => selectedIds.has(t.id)),
    [tires, selectedIds],
  )

  async function handleSignOut() {
    await signOut(auth)
    navigate('/', { replace: true })
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="sticky top-0 z-30 border-b border-zinc-800/80 bg-zinc-950/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-4">
            <Link
              to="/dashboard"
              className="text-sm text-zinc-500 transition hover:text-zinc-200"
            >
              ← Dashboard
            </Link>
            <div>
              <p className="text-xs font-medium uppercase tracking-widest text-zinc-500">
                Tool
              </p>
              <h1 className="text-xl font-semibold text-zinc-100">
                Skedaddle Tires
              </h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="hidden text-sm text-zinc-500 lg:inline max-w-[200px] truncate">
              {user?.email}
            </span>
            <button
              type="button"
              onClick={() => setSaleOpen(true)}
              className="rounded-lg border border-amber-900/60 bg-amber-950/30 px-3 py-1.5 text-sm text-amber-100 hover:bg-amber-950/50"
            >
              Log sale / notify team
            </button>
            <button
              type="button"
              onClick={handleSignOut}
              className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:border-zinc-500"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-8 px-6 py-8">
        {error ? (
          <p className="rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-200">
            Could not load tires: {error.message}
          </p>
        ) : null}

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

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-zinc-400">
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
                Loading inventory…
              </span>
            ) : (
              <>
                <span className="font-medium text-zinc-300">
                  {sortedRows.length} tire{sortedRows.length === 1 ? '' : 's'}{' '}
                  shown
                </span>
                <span className="text-zinc-600"> · </span>
                <span>{selectedIds.size} selected</span>
              </>
            )}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {selectedIds.size > 0 ? (
              <button
                type="button"
                onClick={clearSelection}
                className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
              >
                Clear selection
              </button>
            ) : null}
            <button
              type="button"
              disabled={loading || sortedRows.length === 0}
              onClick={() => exportMarginCsv(sortedRows)}
              className="rounded-lg border border-zinc-600 px-3 py-2 text-sm text-zinc-200 hover:border-zinc-500 hover:bg-zinc-900/60 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Export CSV
            </button>
            {selectedIds.size > 0 ? (
              <button
                type="button"
                disabled={loading}
                onClick={() => setBulkCtsOpen(true)}
                className="rounded-lg border border-amber-800/60 bg-amber-950/35 px-3 py-2 text-sm font-medium text-amber-100 hover:bg-amber-950/55 disabled:opacity-50"
              >
                Bulk edit CTS
              </button>
            ) : null}
            <button
              type="button"
              disabled={selectedTires.length === 0 || loading}
              onClick={() => setListingOpen(true)}
              className="rounded-xl bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Generate listings
            </button>
          </div>
        </div>

        <MarginTable
          rows={sortedRows}
          selectedIds={selectedIds}
          onToggle={toggle}
          onToggleAllVisible={toggleAllVisible}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={handleSort}
          loading={loading}
          emptyState={emptyState}
        />
      </main>

      {listingOpen ? (
        <ListingGenerator
          key={selectedTires.map((t) => t.id).sort().join('-')}
          tires={selectedTires}
          onClose={() => setListingOpen(false)}
        />
      ) : null}
      {saleOpen ? (
        <SaleMessenger tires={tires} onClose={() => setSaleOpen(false)} />
      ) : null}
      <BulkCtsModal
        open={bulkCtsOpen && selectedIds.size > 0}
        onClose={() => setBulkCtsOpen(false)}
        tireIds={Array.from(selectedIds)}
      />
    </div>
  )
}
