import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { functions } from '../../firebase/config'
import { permissionMeets } from '../../constants/peoplePermissions'
import { useUserProfile } from '../../hooks/useUserProfile'
import { useToast } from '../../context/ToastContext.jsx'
import { OrdersList } from '../orders/OrdersList'
import { useTires } from '../../hooks/useTires'
import { computeMargin, computeListingMargin } from '../../utils/marginCalc'
import { tireCatalogBuyNumber } from '../../utils/tireCatalogBuy'
import { tireCatalogRetailNumber } from '../../utils/tireCatalogRetail'
import { deriveTireTags } from '../../utils/deriveTireTags'
import { listingStatus } from '../../utils/listingStatus'
import { effectiveCts } from '../../utils/ctsCalc'
import { exportMarginCsv } from '../../utils/exportMarginCsv'
import { computeOpportunityScore } from '../../utils/opportunityScore'
import { matchesQuery } from '../../utils/tireSearchHaystack'
import { BulkCtsModal } from './BulkCtsModal'
import { FilterPresetsBar } from './FilterPresetsBar'
import { ListingGenerator } from './ListingGenerator'
import { MarginFilters } from './MarginFilters'
import { MarginTable } from './MarginTable'
import { QuoteCalculator } from './QuoteCalculator'
import { SaleMessenger } from './SaleMessenger'
import { TopOpportunities } from './TopOpportunities'
import { ModuleSubheader } from '../layout/ModuleSubheader.jsx'
import Spinner from '../ui/Spinner.jsx'

const createProspectiveOrder = httpsCallable(functions, 'createProspectiveOrder')
const notifyTeamQuick = httpsCallable(functions, 'notifyTeamQuick')

const FILTERS_OPEN_KEY = 'skedaddle-tires-filters-open'
const COLUMNS_KEY = 'skedaddle-tires-columns-v1'
const HAGGLE_KEY = 'skedaddle-tires-haggle-discount'
const DEFAULT_HAGGLE = 0.1
const MAX_HAGGLE = 0.3

const TIRE_COLUMNS = [
  { key: 'brand', label: 'Brand', defaultVisible: true },
  { key: 'description', label: 'Description', defaultVisible: true },
  { key: 'mspn', label: 'MSPN', defaultVisible: true },
  { key: 'lr', label: 'LR', defaultVisible: true },
  { key: 'listed', label: 'Listed', defaultVisible: true },
  { key: 'buy', label: 'Buy Price', defaultVisible: true },
  { key: 'retail', label: 'Retail', defaultVisible: true },
  { key: 'fet', label: 'FET', defaultVisible: false },
  { key: 'overhead', label: 'Overhead', defaultVisible: true },
  { key: 'net', label: 'Net $', defaultVisible: false },
  { key: 'floor', label: 'Floor', defaultVisible: false },
  { key: 'margin', label: 'Margin %', defaultVisible: true },
]

const SORT_LABELS = {
  brand: 'Brand',
  description: 'Description',
  mspn: 'MSPN',
  lr: 'LR',
  listed: 'Listed',
  buy: 'Buy Price',
  retail: 'Retail',
  fet: 'FET',
  overhead: 'Overhead',
  net: 'Net $',
  floor: 'Floor',
  margin: 'Margin %',
  opportunity: 'Opportunity',
}

function readHaggleDiscount() {
  try {
    const raw = localStorage.getItem(HAGGLE_KEY)
    if (raw == null) return DEFAULT_HAGGLE
    const n = Number(raw)
    if (!Number.isFinite(n)) return DEFAULT_HAGGLE
    if (n < 0) return 0
    if (n > MAX_HAGGLE) return MAX_HAGGLE
    return n
  } catch {
    return DEFAULT_HAGGLE
  }
}

function writeHaggleDiscount(v) {
  try {
    localStorage.setItem(HAGGLE_KEY, String(v))
  } catch (e) {
    console.error(e)
  }
}

function defaultColumnVisibility() {
  const base = {}
  for (const c of TIRE_COLUMNS) base[c.key] = c.defaultVisible
  return base
}

function readColumnVisibility() {
  try {
    const raw = localStorage.getItem(COLUMNS_KEY)
    if (!raw) return defaultColumnVisibility()
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return defaultColumnVisibility()
    const base = defaultColumnVisibility()
    for (const c of TIRE_COLUMNS) {
      if (typeof parsed[c.key] === 'boolean') base[c.key] = parsed[c.key]
    }
    return base
  } catch {
    return defaultColumnVisibility()
  }
}

function writeColumnVisibility(v) {
  try {
    localStorage.setItem(COLUMNS_KEY, JSON.stringify(v))
  } catch (e) {
    console.error(e)
  }
}

function readFiltersOpen() {
  try {
    const raw = localStorage.getItem(FILTERS_OPEN_KEY)
    if (raw == null) return false
    return raw === '1' || raw === 'true'
  } catch {
    return false
  }
}

function writeFiltersOpen(open) {
  try {
    localStorage.setItem(FILTERS_OPEN_KEY, open ? '1' : '0')
  } catch (e) {
    console.error(e)
  }
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) =>
    String(a).localeCompare(String(b)),
  )
}

function compareStrings(a, b) {
  return String(a || '').localeCompare(String(b || ''), undefined, {
    numeric: true,
    sensitivity: 'base',
  })
}

function listedScore(row) {
  // Count active platforms first, then stale, then never. Used as sort key.
  let active = 0
  let stale = 0
  for (const p of ['facebook', 'offerup', 'craigslist']) {
    const st = listingStatus(row, p)
    if (st === 'active') active += 1
    else if (st === 'stale') stale += 1
  }
  return active * 10 + stale
}

export function TiresDashboard() {
  const { toast } = useToast()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { permissionFor } = useUserProfile()
  const { tires, loading, error } = useTires()

  const tab = searchParams.get('tab') === 'orders' ? 'orders' : 'catalog'
  const ordersHighlight = searchParams.get('highlight') || undefined
  const catalogRisk = searchParams.get('risk') || ''
  const canViewOrders = permissionMeets(permissionFor('orders'), 'view')

  const [minMargin, setMinMargin] = useState(0)
  const [brand, setBrand] = useState('')
  const [useTagFilters, setUseTagFilters] = useState([])
  const [lrFilters, setLrFilters] = useState([])
  const [sortKey, setSortKey] = useState('margin')
  const [sortDir, setSortDir] = useState('desc')
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [listingOpen, setListingOpen] = useState(false)
  const [saleOpen, setSaleOpen] = useState(false)
  const [saleInitial, setSaleInitial] = useState(null)
  const [quoteOpen, setQuoteOpen] = useState(false)
  const [bulkCtsOpen, setBulkCtsOpen] = useState(false)
  const [notifyingTeam, setNotifyingTeam] = useState(false)
  const [loggingProspective, setLoggingProspective] = useState(false)
  const [needsReposting, setNeedsReposting] = useState(() => {
    const v = searchParams.get('needsReposting')
    return v === '1' || v === 'true'
  })

  const [query, setQuery] = useState(() => searchParams.get('q') || '')
  const [filtersOpen, setFiltersOpen] = useState(() => readFiltersOpen())
  const [columnVisibility, setColumnVisibility] = useState(() => readColumnVisibility())
  const [columnsPopoverOpen, setColumnsPopoverOpen] = useState(false)
  const [haggleDiscount, setHaggleDiscount] = useState(() => readHaggleDiscount())
  const [justJumpedToId, setJustJumpedToId] = useState(null)
  const columnsPopoverRef = useRef(null)
  const columnsButtonRef = useRef(null)
  const marginTableRef = useRef(null)
  const jumpHighlightTimerRef = useRef(null)

  useEffect(() => {
    return () => {
      if (jumpHighlightTimerRef.current) {
        clearTimeout(jumpHighlightTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    writeColumnVisibility(columnVisibility)
  }, [columnVisibility])

  useEffect(() => {
    writeHaggleDiscount(haggleDiscount)
  }, [haggleDiscount])

  useEffect(() => {
    // The Quote modal is single-tire only. Auto-close if the selection
    // changes to zero or many so we don't render against a stale tire.
    if (quoteOpen && selectedIds.size !== 1) setQuoteOpen(false)
  }, [quoteOpen, selectedIds])

  useEffect(() => {
    writeFiltersOpen(filtersOpen)
  }, [filtersOpen])

  useEffect(() => {
    if (catalogRisk === 'lowMargin' || catalogRisk === 'missingOverhead') {
      setFiltersOpen(true)
    }
  }, [catalogRisk])

  // Sync `q` search param with URL for shareable deep-links.
  useEffect(() => {
    const current = searchParams.get('q') || ''
    if (current === query) return
    const next = new URLSearchParams(searchParams)
    if (query) next.set('q', query)
    else next.delete('q')
    setSearchParams(next, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  // Close columns popover on outside click / Escape.
  useEffect(() => {
    if (!columnsPopoverOpen) return
    function onDown(e) {
      const pop = columnsPopoverRef.current
      const btn = columnsButtonRef.current
      if (pop && pop.contains(e.target)) return
      if (btn && btn.contains(e.target)) return
      setColumnsPopoverOpen(false)
    }
    function onKey(e) {
      if (e.key === 'Escape') setColumnsPopoverOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [columnsPopoverOpen])

  const toggleColumnVisibility = useCallback((key) => {
    setColumnVisibility((prev) => ({ ...prev, [key]: !prev[key] }))
  }, [])

  const applyFilterPreset = useCallback((p) => {
    setBrand(p.brand ?? '')
    const lrArr = Array.isArray(p.lrFilters) ? p.lrFilters : p.lr ? [p.lr] : []
    const tagArr = Array.isArray(p.useTagFilters)
      ? p.useTagFilters
      : p.useTag
        ? [p.useTag]
        : []
    setLrFilters(lrArr.map(String).filter(Boolean))
    setUseTagFilters(tagArr.map(String).filter(Boolean))
    setMinMargin(Number(p.minMargin) || 0)
    setNeedsReposting(Boolean(p.needsReposting))
  }, [])

  const hasActiveFilters =
    minMargin > 0 ||
    Boolean(brand) ||
    useTagFilters.length > 0 ||
    lrFilters.length > 0 ||
    needsReposting

  const activeFilterCount = useMemo(() => {
    let n = 0
    if (minMargin > 0) n += 1
    if (brand) n += 1
    if (useTagFilters.length > 0) n += 1
    if (lrFilters.length > 0) n += 1
    if (needsReposting) n += 1
    return n
  }, [minMargin, brand, useTagFilters, lrFilters, needsReposting])

  const clearFilters = useCallback(() => {
    setMinMargin(0)
    setBrand('')
    setUseTagFilters([])
    setLrFilters([])
    setNeedsReposting(false)
  }, [])

  function clearSelection() {
    setSelectedIds(new Set())
    setBulkCtsOpen(false)
  }

  const brands = useMemo(
    () => uniqueSorted(tires.map((t) => t.brand)),
    [tires],
  )
  const lrs = useMemo(() => uniqueSorted(tires.map((t) => t.lr)), [tires])
  const enriched = useMemo(() => {
    return tires.map((t) => ({
      ...t,
      margin: computeMargin(t),
      listingMargin: computeListingMargin(t),
      derivedUseTags: deriveTireTags(t),
      opportunity: computeOpportunityScore(t, haggleDiscount),
    }))
  }, [tires, haggleDiscount])

  const useTags = useMemo(() => {
    const tags = []
    for (const row of enriched) {
      if (Array.isArray(row.derivedUseTags)) tags.push(...row.derivedUseTags)
    }
    return uniqueSorted(tags)
  }, [enriched])

  const trimmedQuery = query.trim()
  const hasQuery = trimmedQuery.length > 0

  const filtered = useMemo(() => {
    return enriched.filter((row) => {
      if (catalogRisk === 'lowMargin') {
        // Uses listingMargin (researched-retail based) per PR #34.
        const m = row.listingMargin
        if (m == null || Number.isNaN(m) || m >= 15) return false
      }
      if (catalogRisk === 'missingOverhead') {
        const mount = Number(row.mountCost) || 0
        const delivery = Number(row.deliveryCost) || 0
        const other = Number(row.otherCost) || 0
        const cts = Number(row.cts) || 0
        if (cts > 0 || mount > 0 || delivery > 0 || other > 0) return false
      }
      if (brand && row.brand !== brand) return false
      if (lrFilters.length > 0) {
        const l = String(row.lr || '')
        if (!lrFilters.includes(l)) return false
      }
      if (useTagFilters.length > 0) {
        const tags = Array.isArray(row.derivedUseTags)
          ? row.derivedUseTags
          : []
        const hit = useTagFilters.some((t) => tags.includes(t))
        if (!hit) return false
      }
      if (minMargin > 0) {
        if (row.margin == null || Number.isNaN(row.margin)) return false
        if (row.margin < minMargin) return false
      }
      if (needsReposting) {
        // Only show tires that were ever posted but are now stale on all platforms
        const everPosted = ['facebook', 'offerup', 'craigslist'].some(
          (p) => row?.platformListings?.[p]?.lastPostedAt,
        )
        if (!everPosted) return false
        const allInactive = ['facebook', 'offerup', 'craigslist'].every(
          (p) => listingStatus(row, p) !== 'active',
        )
        if (!allInactive) return false
      }
      if (hasQuery) {
        if (!matchesQuery(row, trimmedQuery)) return false
      }
      return true
    })
  }, [enriched, brand, lrFilters, useTagFilters, minMargin, needsReposting, hasQuery, trimmedQuery, catalogRisk])

  const sortedRows = useMemo(() => {
    const rows = [...filtered]
    const dir = sortDir === 'asc' ? 1 : -1
    function numCmp(av, bv, { zeroLast = false } = {}) {
      if (av === bv) return 0
      if (zeroLast) {
        if (av === 0) return 1
        if (bv === 0) return -1
      }
      return av < bv ? -dir : dir
    }
    rows.sort((a, b) => {
      if (sortKey === 'brand') {
        return dir * compareStrings(a.brand, b.brand)
      }
      if (sortKey === 'description') {
        return dir * compareStrings(a.description, b.description)
      }
      if (sortKey === 'mspn') {
        return dir * compareStrings(a.mspn, b.mspn)
      }
      if (sortKey === 'lr') {
        return dir * compareStrings(a.lr, b.lr)
      }
      if (sortKey === 'listed') {
        return numCmp(listedScore(a), listedScore(b))
      }
      if (sortKey === 'buy') {
        return numCmp(tireCatalogBuyNumber(a), tireCatalogBuyNumber(b))
      }
      if (sortKey === 'retail') {
        return numCmp(tireCatalogRetailNumber(a), tireCatalogRetailNumber(b), {
          zeroLast: true,
        })
      }
      if (sortKey === 'fet') {
        return numCmp(Number(a.fet) || 0, Number(b.fet) || 0)
      }
      if (sortKey === 'overhead') {
        return numCmp(effectiveCts(a), effectiveCts(b))
      }
      if (sortKey === 'net') {
        const an = a.opportunity ? a.opportunity.netPerTire : null
        const bn = b.opportunity ? b.opportunity.netPerTire : null
        if (an == null && bn == null) return 0
        if (an == null) return 1
        if (bn == null) return -1
        if (an === bn) return 0
        return an < bn ? -dir : dir
      }
      if (sortKey === 'floor') {
        const af = a.opportunity ? a.opportunity.floor : null
        const bf = b.opportunity ? b.opportunity.floor : null
        if (af == null && bf == null) return 0
        if (af == null) return 1
        if (bf == null) return -1
        if (af === bf) return 0
        return af < bf ? -dir : dir
      }
      if (sortKey === 'opportunity') {
        const as = a.opportunity ? a.opportunity.opportunity : null
        const bs = b.opportunity ? b.opportunity.opportunity : null
        if (as == null && bs == null) return 0
        if (as == null) return 1
        if (bs == null) return -1
        if (as === bs) return 0
        return as < bs ? -dir : dir
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
    if (hasActiveFilters || hasQuery) {
      return (
        <>
          No tires match your filters.
          <br />
          <button
            type="button"
            onClick={() => {
              clearFilters()
              setQuery('')
            }}
            className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-lg border border-amber-700/50 bg-amber-950/30 px-4 py-2 text-sm font-medium text-amber-100 transition-colors duration-200 hover:border-amber-600/60 hover:bg-amber-950/50 sm:min-h-0"
          >
            Clear filters
          </button>
        </>
      )
    }
    return 'No rows to display.'
  }, [loading, tires.length, hasActiveFilters, hasQuery, clearFilters])

  /**
   * Tri-state sort cycle: first click ascending, second click descending, third click
   * resets to the default sort (`margin` descending). Sort plumbing lives here so
   * MarginTable stays presentational.
   */
  function handleSort(key) {
    if (sortKey !== key) {
      setSortKey(key)
      setSortDir('asc')
      return
    }
    if (sortDir === 'asc') {
      setSortDir('desc')
      return
    }
    // Third click clears back to the default sort.
    setSortKey('margin')
    setSortDir('desc')
  }

  const jumpToTire = useCallback(
    (tireId) => {
      if (!tireId) return
      const idx = sortedRows.findIndex((r) => r.id === tireId)
      if (idx < 0) return
      const list = marginTableRef.current
      if (list && typeof list.scrollToRow === 'function') {
        list.scrollToRow({ index: idx, align: 'center', behavior: 'smooth' })
      }
      setJustJumpedToId(tireId)
      if (jumpHighlightTimerRef.current) clearTimeout(jumpHighlightTimerRef.current)
      jumpHighlightTimerRef.current = setTimeout(() => {
        setJustJumpedToId(null)
        jumpHighlightTimerRef.current = null
      }, 1500)
    },
    [sortedRows],
  )

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

  function toggleAllFilteredSelection(rows) {
    // If every visible row is already selected, clear them; otherwise select all.
    const allSelected = rows.length > 0 && rows.every((r) => selectedIds.has(r.id))
    if (allSelected) {
      deselectAllVisible(rows)
    } else {
      selectAllVisible(rows)
    }
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
      toast('Selected tires are missing an MSPN.', 'error')
      return null
    }
    const same = picks.filter((p) => String(p.mspn || '').trim() === m0)
    const mixed = picks.some((p) => String(p.mspn || '').trim() !== m0)
    if (mixed) {
      toast('Mixed MSPNs selected. Using first SKU and matching rows only.', 'error')
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
    setNotifyingTeam(true)
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
    } finally {
      setNotifyingTeam(false)
    }
  }

  async function logSelectedProspective() {
    const ctx = selectionPrimaryMspnRows()
    if (!ctx) return
    const first = ctx.rows[0]
    const pricePerTire = tireCatalogBuyNumber(first)
    if (!Number.isFinite(pricePerTire) || pricePerTire <= 0) {
      toast('Selected tire needs a valid buy price (Sourcer catalog price).', 'error')
      return
    }
    const quantity = ctx.rows.length
    const totalPrice = pricePerTire * quantity
    setLoggingProspective(true)
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
      toast(e?.message || 'Could not create order. Are functions deployed?', 'error')
    } finally {
      setLoggingProspective(false)
    }
  }

  const visibleColumnLabel = SORT_LABELS[sortKey] || 'Margin %'
  const visibleDirLabel = sortDir === 'asc' ? 'ascending' : 'descending'

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

      <main className="mx-auto max-w-6xl space-y-8 px-6 py-8">
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
                Sourcer to Field crew workflow via Slack. Notify customers from here and mark complete when
                paid.
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
            <TopOpportunities
              tires={enriched}
              haggleDiscount={haggleDiscount}
              onJumpToTire={jumpToTire}
            />

            {filtersOpen ? (
              <div id="tires-filter-panel" className="space-y-4">
                <MarginFilters
                  brands={brands}
                  useTags={useTags}
                  lrs={lrs}
                  brand={brand}
                  useTagFilters={useTagFilters}
                  lrFilters={lrFilters}
                  onBrand={setBrand}
                  onUseTagFilters={setUseTagFilters}
                  onLrFilters={setLrFilters}
                  minMargin={minMargin}
                  onMinMargin={setMinMargin}
                  needsReposting={needsReposting}
                  onNeedsReposting={setNeedsReposting}
                  hasActiveFilters={hasActiveFilters}
                  onClearAll={clearFilters}
                />

                <FilterPresetsBar
                  brand={brand}
                  useTagFilters={useTagFilters}
                  lrFilters={lrFilters}
                  minMargin={minMargin}
                  needsReposting={needsReposting}
                  onApplyPreset={applyFilterPreset}
                />
              </div>
            ) : null}

            <div className="sticky top-[92px] z-10 -mx-2 rounded-xl border border-zinc-800 bg-zinc-950/90 px-2 py-2 backdrop-blur supports-[backdrop-filter]:bg-zinc-950/75 sm:top-[108px]">
              <div className="flex flex-col gap-2">
                <label className="block">
                  <span className="sr-only">Search by MSPN or description</span>
                  <div className="relative">
                    <svg
                      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      aria-hidden
                    >
                      <circle cx="11" cy="11" r="7" />
                      <path strokeLinecap="round" d="m20 20-3-3" />
                    </svg>
                    <input
                      type="search"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search by MSPN or description…"
                      autoComplete="off"
                      className="min-h-[44px] w-full rounded-lg border border-zinc-700 bg-zinc-900/60 py-2 pl-9 pr-9 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-zinc-500 sm:min-h-0"
                    />
                    {query ? (
                      <button
                        type="button"
                        onClick={() => setQuery('')}
                        aria-label="Clear search"
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-zinc-500 hover:bg-zinc-800/70 hover:text-zinc-200"
                      >
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                          <path strokeLinecap="round" d="m18 6-12 12M6 6l12 12" />
                        </svg>
                      </button>
                    ) : null}
                  </div>
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setFiltersOpen((v) => !v)}
                    aria-expanded={filtersOpen}
                    aria-controls="tires-filter-panel"
                    className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900/50 px-3 py-1.5 text-sm font-medium text-zinc-200 hover:border-zinc-500 hover:text-zinc-100 sm:min-h-0"
                  >
                    <svg
                      className={`h-4 w-4 text-zinc-400 transition-transform duration-150 ${filtersOpen ? 'rotate-90' : ''}`}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      aria-hidden
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="m9 6 6 6-6 6" />
                    </svg>
                    <span>Filters</span>
                    <span
                      className={[
                        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1',
                        activeFilterCount > 0
                          ? 'bg-amber-950/70 text-amber-100 ring-amber-800/50'
                          : 'bg-zinc-800/80 text-zinc-400 ring-zinc-700/60',
                      ].join(' ')}
                    >
                      {activeFilterCount > 0 ? `${activeFilterCount} active` : 'none active'}
                    </span>
                  </button>
                  {hasActiveFilters ? (
                    <button
                      type="button"
                      onClick={clearFilters}
                      className="rounded-lg border border-zinc-700 px-2.5 py-1.5 text-xs font-medium text-zinc-300 hover:border-zinc-500 hover:text-white"
                    >
                      Clear filters
                    </button>
                  ) : null}
                  <label className="ml-auto hidden min-w-[220px] items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-1.5 text-xs text-zinc-300 sm:inline-flex">
                    <span className="whitespace-nowrap font-medium text-zinc-400">
                      Haggle discount {Math.round(haggleDiscount * 100)}%
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={30}
                      step={1}
                      value={Math.round(haggleDiscount * 100)}
                      onChange={(e) => setHaggleDiscount(Number(e.target.value) / 100)}
                      aria-label="Haggle discount assumed when scoring opportunities"
                      className="h-1 w-full cursor-pointer accent-amber-400"
                    />
                  </label>
                </div>
              </div>

              <div className="mt-2 flex flex-col gap-3 border-t border-zinc-800/60 pt-2">
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm text-zinc-400">
                    {loading ? (
                      <span className="inline-flex items-center gap-2">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
                        Loading inventory…
                      </span>
                    ) : selectedIds.size > 0 ? (
                      <span className="inline-flex items-center rounded-full bg-amber-950/70 px-2.5 py-0.5 text-xs font-semibold text-amber-100 ring-1 ring-amber-800/50">
                        {selectedIds.size} selected
                      </span>
                    ) : (
                      <span className="text-zinc-500">None selected</span>
                    )}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 self-start sm:self-center">
                  <button
                    type="button"
                    onClick={() => {
                      if (sortKey === 'opportunity') {
                        // Second press resets to the default margin sort so
                        // the ranking is a toggle, not a dead end.
                        setSortKey('margin')
                        setSortDir('desc')
                      } else {
                        setSortKey('opportunity')
                        setSortDir('desc')
                      }
                    }}
                    aria-pressed={sortKey === 'opportunity'}
                    title="Sort catalog by expected profit per tire after haggle, weighted by retail confidence."
                    className={`min-h-[44px] rounded-lg border px-3 py-2 text-sm sm:min-h-0 ${
                      sortKey === 'opportunity'
                        ? 'border-amber-600 bg-amber-950/40 text-amber-100 hover:border-amber-500 hover:bg-amber-950/60'
                        : 'border-zinc-600 text-zinc-200 hover:border-zinc-500 hover:bg-zinc-900/60'
                    }`}
                  >
                    {sortKey === 'opportunity' ? 'Sort: Opportunity \u2713' : 'Sort: Opportunity'}
                  </button>
                  <div className="relative">
                    <button
                      ref={columnsButtonRef}
                      type="button"
                      onClick={() => setColumnsPopoverOpen((v) => !v)}
                      aria-expanded={columnsPopoverOpen}
                      aria-haspopup="dialog"
                      aria-controls="tires-columns-popover"
                      className="min-h-[44px] rounded-lg border border-zinc-600 px-3 py-2 text-sm text-zinc-200 hover:border-zinc-500 hover:bg-zinc-900/60 sm:min-h-0"
                    >
                      Columns
                    </button>
                    {columnsPopoverOpen ? (
                      <div
                        id="tires-columns-popover"
                        ref={columnsPopoverRef}
                        role="dialog"
                        aria-label="Visible columns"
                        className="absolute right-0 top-full z-30 mt-1 w-56 rounded-lg border border-zinc-700 bg-zinc-900 p-3 shadow-xl"
                      >
                        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                          Visible columns
                        </p>
                        <ul className="space-y-1">
                          {TIRE_COLUMNS.map((col) => (
                            <li key={col.key}>
                              <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm text-zinc-200 hover:bg-zinc-800/70">
                                <input
                                  type="checkbox"
                                  checked={Boolean(columnVisibility[col.key])}
                                  onChange={() => toggleColumnVisibility(col.key)}
                                  className="size-4 rounded border-zinc-600"
                                />
                                <span>{col.label}</span>
                              </label>
                            </li>
                          ))}
                        </ul>
                        <div className="mt-2 flex justify-end border-t border-zinc-800 pt-2">
                          <button
                            type="button"
                            onClick={() => setColumnVisibility(defaultColumnVisibility())}
                            className="text-[11px] font-medium text-zinc-400 hover:text-zinc-200"
                          >
                            Reset defaults
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    disabled={loading || sortedRows.length === 0}
                    onClick={() => exportMarginCsv(sortedRows)}
                    className="min-h-[44px] rounded-lg border border-zinc-600 px-3 py-2 text-sm text-zinc-200 hover:border-zinc-500 hover:bg-zinc-900/60 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-0"
                  >
                    Export CSV
                  </button>
                </div>
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
                      disabled={loading || selectedTires.length !== 1}
                      onClick={() => setQuoteOpen(true)}
                      title={
                        selectedTires.length === 1
                          ? 'Open the bundle quote calculator'
                          : 'Select exactly one tire to open a bundle quote'
                      }
                      className="min-h-[44px] rounded-lg border border-sky-900/60 bg-sky-950/35 px-3 py-2 text-sm font-medium text-sky-100 hover:bg-sky-950/55 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-0"
                    >
                      Quote
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
                      disabled={loading || notifyingTeam}
                      onClick={() => void notifySelectedQuick()}
                      className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-cyan-900/50 bg-cyan-950/35 px-3 py-2 text-sm font-medium text-cyan-100 hover:bg-cyan-950/55 disabled:opacity-50 sm:min-h-0"
                    >
                      {notifyingTeam && <Spinner className="h-4 w-4 text-cyan-100" />}
                      {notifyingTeam ? 'Notifying…' : 'Notify team'}
                    </button>
                    <button
                      type="button"
                      disabled={loading || loggingProspective}
                      onClick={() => void logSelectedProspective()}
                      className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-fuchsia-900/50 bg-fuchsia-950/30 px-3 py-2 text-sm font-medium text-fuchsia-100 hover:bg-fuchsia-950/50 disabled:opacity-50 sm:min-h-0"
                    >
                      {loggingProspective && <Spinner className="h-4 w-4 text-fuchsia-100" />}
                      {loggingProspective ? 'Logging…' : 'Log prospective order'}
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
            </div>

            <MarginTable
              rows={sortedRows}
              selectedIds={selectedIds}
              onToggle={toggle}
              onToggleAllFiltered={toggleAllFilteredSelection}
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
              loading={loading}
              emptyState={emptyState}
              columnVisibility={columnVisibility}
              sortColumnLabel={visibleColumnLabel}
              sortDirLabel={visibleDirLabel}
              externalListRef={marginTableRef}
              justJumpedToId={justJumpedToId}
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
      {quoteOpen && selectedTires.length === 1 ? (
        <QuoteCalculator
          key={selectedTires[0].id}
          tire={selectedTires[0]}
          onClose={() => setQuoteOpen(false)}
          onLogSale={({ mspn, quantity, pricePerTire }) => {
            setQuoteOpen(false)
            setSaleInitial({ mspn, quantity, pricePerTire })
            setSaleOpen(true)
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
