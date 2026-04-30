import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { functions } from '../../firebase/config'
import { TIRE_CATEGORY_KEYS } from '../../constants/tireCategory.js'
import { permissionMeets } from '../../constants/peoplePermissions'
import { useUserProfile } from '../../hooks/useUserProfile'
import { useToast } from '../../context/ToastContext.jsx'
import { OrdersList } from '../orders/OrdersList'
import { useTires } from '../../hooks/useTires'
import { selectCategoryForTire, useDashboardSignals } from '../../hooks/useDashboardSignals'
import { usePayoutConfig } from '../../hooks/usePayoutConfig.js'
import { computeMargin, computeListingMargin } from '../../utils/marginCalc'
import { tireCatalogBuyNumber } from '../../utils/tireCatalogBuy'
import { tireCatalogRetailNumber } from '../../utils/tireCatalogRetail'
import { deriveTireTags } from '../../utils/deriveTireTags'
import { listingStatus } from '../../utils/listingStatus'
import { effectiveCts } from '../../utils/ctsCalc'
import { exportMarginCsv } from '../../utils/exportMarginCsv'
import { computeOpportunityScore } from '../../utils/opportunityScore'
import { matchesQuery } from '../../utils/tireSearchHaystack'
import { setTireSelection } from '../../context/tireSelectionStore'
import { BulkCtsModal } from './BulkCtsModal'
import { HaggleSheet } from './HaggleSheet'
import { ListingGenerator } from './ListingGenerator'
import { CategoryTabs } from './CategoryTabs.jsx'
import { categoryMapAgeStatus } from './categoryMapAgeStatus.js'
import { MarginFilters } from './MarginFilters'
import { MarginTable } from './MarginTable'
import { QuoteCalculator } from './QuoteCalculator'
import { SaleMessenger } from './SaleMessenger'
import { TireCardMobile } from './TireCardMobile'
import { TirePhotoGallery } from './TirePhotoGallery.jsx'
import { TiresFilterOverlay } from './TiresFilterOverlay.jsx'
import { SelectAllToggle } from './SelectAllToggle.jsx'
import { ModuleSubheader } from '../layout/ModuleSubheader.jsx'
import Spinner from '../ui/Spinner.jsx'
import { BrandBolt } from '../ui/BrandBolt.jsx'
import { Popover } from '../ui/Popover.jsx'

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
  { key: 'listed', label: 'Listed', defaultVisible: false },
  { key: 'photos', label: 'Photos', defaultVisible: true },
  { key: 'buy', label: 'Buy Price', defaultVisible: true },
  { key: 'retail', label: 'Retail', defaultVisible: true },
  { key: 'fet', label: 'FET', defaultVisible: false },
  { key: 'overhead', label: 'Overhead', defaultVisible: false },
  { key: 'net', label: 'Net $', defaultVisible: true },
  { key: 'floor', label: 'Floor', defaultVisible: false },
  { key: 'margin', label: 'Margin %', defaultVisible: true },
]

const SORT_LABELS = {
  brand: 'Brand',
  description: 'Description',
  mspn: 'MSPN',
  lr: 'LR',
  listed: 'Listed',
  photos: 'Photos',
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

function tireKey(tire) {
  return tire?.mspn || tire?.id || ''
}

function tirePhotoKey(photo) {
  return photo?.storagePath || photo?.url || ''
}

function mergeTirePhotos(serverPhotos, pendingAdds = [], pendingDeletes = []) {
  const deleted = new Set(pendingDeletes)
  const base = (Array.isArray(serverPhotos) ? serverPhotos : []).filter(
    (photo) => !deleted.has(tirePhotoKey(photo)),
  )
  const existing = new Set(base.map(tirePhotoKey))
  const additions = pendingAdds.filter((photo) => {
    const key = tirePhotoKey(photo)
    return key && !existing.has(key) && !deleted.has(key)
  })
  return [...base, ...additions]
}

function samePendingPhotoState(a, b) {
  return JSON.stringify(a) === JSON.stringify(b)
}

export function TiresDashboard() {
  const { toast } = useToast()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { permissionFor } = useUserProfile()
  const { tires, loading, error } = useTires()
  const { categoryMap } = useDashboardSignals()
  const { marginFloorPct: floorPct } = usePayoutConfig()

  const tab = searchParams.get('tab') === 'orders' ? 'orders' : 'catalog'
  const highlightParam = searchParams.get('highlight') || ''
  const ordersHighlight = tab === 'orders' && highlightParam ? highlightParam : undefined
  const catalogHighlight = tab === 'catalog' && highlightParam ? highlightParam : ''
  const catalogRisk = searchParams.get('risk') || ''
  const hiddenGemsFilter = searchParams.get('hiddenGems') === 'true'
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
  const [selectedCategory, setSelectedCategoryState] = useState(() => {
    const fromUrl = searchParams.get('cat')
    return TIRE_CATEGORY_KEYS.includes(fromUrl) ? fromUrl : 'all'
  })

  const setSelectedCategory = useCallback(
    (cat) => {
      setSelectedCategoryState(cat)
      // Reset within-category filters on tab switch; keep search/sort/selection.
      setBrand('')
      setUseTagFilters([])
      setLrFilters([])
      setMinMargin(0)
      setNeedsReposting(false)
      // Sync URL via the same setSearchParams used for q/risk/highlight, so the
      // `?cat=` param can never be clobbered by a stale searchParams snapshot.
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (cat === 'all') next.delete('cat')
          else next.set('cat', cat)
          return next
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )
  const [columnVisibility, setColumnVisibility] = useState(() => readColumnVisibility())
  const [haggleDiscount, setHaggleDiscount] = useState(() => readHaggleDiscount())
  const [haggleTire, setHaggleTire] = useState(null)
  const [photoGalleryTire, setPhotoGalleryTire] = useState(null)
  const [pendingPhotoAdds, setPendingPhotoAdds] = useState({})
  const [pendingPhotoDeletes, setPendingPhotoDeletes] = useState({})
  const [justJumpedToId, setJustJumpedToId] = useState(null)
  const marginTableRef = useRef(null)
  const jumpHighlightTimerRef = useRef(null)
  const toolbarRef = useRef(null)

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
    needsReposting ||
    hiddenGemsFilter

  const activeFilterCount = useMemo(() => {
    let n = 0
    if (minMargin > 0) n += 1
    if (brand) n += 1
    if (useTagFilters.length > 0) n += 1
    if (lrFilters.length > 0) n += 1
    if (needsReposting) n += 1
    if (hiddenGemsFilter) n += 1
    if (query.trim()) n += 1
    return n
  }, [minMargin, brand, useTagFilters, lrFilters, needsReposting, hiddenGemsFilter, query])

  const clearFilters = useCallback(() => {
    setMinMargin(0)
    setBrand('')
    setUseTagFilters([])
    setLrFilters([])
    setNeedsReposting(false)
    if (hiddenGemsFilter) {
      const next = new URLSearchParams(searchParams)
      next.delete('hiddenGems')
      setSearchParams(next, { replace: true })
    }
  }, [hiddenGemsFilter, searchParams, setSearchParams])

  function clearSelection() {
    setSelectedIds(new Set())
    setBulkCtsOpen(false)
  }

  function onMobilePhotoUploaded(tire, photo) {
    const key = tireKey(tire)
    setPendingPhotoAdds((prev) => ({
      ...prev,
      [key]: [...(prev[key] || []), photo],
    }))
  }

  function onGalleryPhotoDeleted(tire, photo) {
    const key = tireKey(tire)
    const photoKey = tirePhotoKey(photo)
    setPendingPhotoAdds((prev) => ({
      ...prev,
      [key]: (prev[key] || []).filter((p) => tirePhotoKey(p) !== photoKey),
    }))
    setPendingPhotoDeletes((prev) => ({
      ...prev,
      [key]: [...(prev[key] || []), photoKey],
    }))
    setPhotoGalleryTire((current) =>
      current && tireKey(current) === key
        ? {
            ...current,
            photos: (current.photos || []).filter((p) => tirePhotoKey(p) !== photoKey),
          }
        : current,
    )
  }

  const brands = useMemo(
    () => uniqueSorted(tires.map((t) => t.brand)),
    [tires],
  )
  const lrs = useMemo(() => uniqueSorted(tires.map((t) => t.lr)), [tires])
  const enriched = useMemo(() => {
    return tires.map((t) => {
      const key = tireKey(t)
      return {
        ...t,
        photos: mergeTirePhotos(t.photos, pendingPhotoAdds[key], pendingPhotoDeletes[key]),
        margin: computeMargin(t),
        listingMargin: computeListingMargin(t),
        derivedUseTags: deriveTireTags(t),
        opportunity: computeOpportunityScore(t, { haggleDiscount }),
      }
    })
  }, [tires, haggleDiscount, pendingPhotoAdds, pendingPhotoDeletes])

  const categorizedRows = useMemo(() => {
    const buckets = { all: [], passenger: [], lightTruck: [], truck: [] }
    if (loading || !Array.isArray(enriched)) return buckets
    for (const t of enriched) {
      const cat = selectCategoryForTire(t, categoryMap)
      buckets.all.push(t)
      buckets[cat].push(t)
    }
    return buckets
  }, [enriched, loading, categoryMap])

  useEffect(() => {
    if (Object.keys(pendingPhotoAdds).length === 0 && Object.keys(pendingPhotoDeletes).length === 0) return
    const nextAdds = {}
    const nextDeletes = {}
    for (const tire of tires) {
      const key = tireKey(tire)
      const serverKeys = new Set((Array.isArray(tire.photos) ? tire.photos : []).map(tirePhotoKey))
      const adds = (pendingPhotoAdds[key] || []).filter((photo) => !serverKeys.has(tirePhotoKey(photo)))
      const deletes = (pendingPhotoDeletes[key] || []).filter((photoKey) => serverKeys.has(photoKey))
      if (adds.length > 0) nextAdds[key] = adds
      if (deletes.length > 0) nextDeletes[key] = deletes
    }
    if (!samePendingPhotoState(nextAdds, pendingPhotoAdds)) setPendingPhotoAdds(nextAdds)
    if (!samePendingPhotoState(nextDeletes, pendingPhotoDeletes)) setPendingPhotoDeletes(nextDeletes)
  }, [tires, pendingPhotoAdds, pendingPhotoDeletes])

  const useTags = useMemo(() => {
    const tags = []
    for (const row of enriched) {
      if (Array.isArray(row.derivedUseTags)) tags.push(...row.derivedUseTags)
    }
    return uniqueSorted(tags)
  }, [enriched])

  const trimmedQuery = query.trim()
  const hasQuery = trimmedQuery.length > 0

  // Single memo for filter plus sort so MarginTable only sees a new rows
  // reference when inputs that affect ordering or membership actually change.
  const sortedRows = useMemo(() => {
    const source = categorizedRows[selectedCategory] || []
    const filtered = source.filter((row) => {
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
      if (hiddenGemsFilter) {
        if (!row?.marginConfirmed) return false
        const listings = row.platformListings || {}
        const activeCount = Object.keys(listings).filter(
          (p) => listings[p]?.status === 'active',
        ).length
        if (activeCount >= 2) return false
      }
      if (hasQuery) {
        if (!matchesQuery(row, trimmedQuery)) return false
      }
      return true
    })

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
      if (sortKey === 'photos') {
        return numCmp(Array.isArray(a.photos) ? a.photos.length : 0, Array.isArray(b.photos) ? b.photos.length : 0)
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
      // Default fallthrough: sort by Margin % column (sortKey === 'margin').
      // The cell renders computeListingMargin (retail-based) per PR #34, so
      // sort matches by reading row.listingMargin — using row.margin
      // (markup-headroom) here causes apparent out-of-order display.
      const am = a.listingMargin
      const bm = b.listingMargin
      if (am == null && bm == null) return 0
      if (am == null) return 1
      if (bm == null) return -1
      if (am === bm) return 0
      return am < bm ? -dir : dir
    })
    return rows
  }, [
    categorizedRows,
    selectedCategory,
    brand,
    lrFilters,
    useTagFilters,
    minMargin,
    needsReposting,
    hasQuery,
    trimmedQuery,
    catalogRisk,
    hiddenGemsFilter,
    sortKey,
    sortDir,
  ])

  const emptyState = useMemo(() => {
    if (loading) return null
    if (tires.length === 0) {
      return (
        <>
          <span className="font-medium text-zinc-400">Catalog is empty.</span>
          <br />
          <span className="mt-2 inline-block text-zinc-400">
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

  const onSortChange = useCallback((nextKey, nextDir) => {
    setSortKey(nextKey)
    setSortDir(nextDir)
  }, [])

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

  // Catalog deep-link: when `/tires?highlight=<id>` lands on the catalog
  // tab, scroll that row into view once rows are resolved. Drops the
  // param afterward so a page refresh does not re-trigger the jump.
  useEffect(() => {
    if (!catalogHighlight) return
    if (loading) return
    if (sortedRows.length === 0) return
    jumpToTire(catalogHighlight)
    const next = new URLSearchParams(searchParams)
    next.delete('highlight')
    setSearchParams(next, { replace: true })
  }, [catalogHighlight, loading, sortedRows, jumpToTire, searchParams, setSearchParams])

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

  // Two-stage Select All derived state. Today there is no pagination so
  // `pageRows === sortedRows` and `moreBeyondVisible` is always false; the
  // abstraction is kept so a future virtualized/paginated table can flip
  // the secondary "Select all M matching" link on without further toolbar
  // surgery.
  const pageRows = sortedRows
  const allVisibleSelected =
    pageRows.length > 0 && pageRows.every((r) => selectedIds.has(r.id))
  const allMatchingSelected =
    sortedRows.length > 0 && sortedRows.every((r) => selectedIds.has(r.id))
  const moreBeyondVisible = sortedRows.length > pageRows.length

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

  // Publish selection + action runners to the module-level store so the
  // command palette (mounted in PortalChrome, outside this route tree) can
  // offer context-aware actions. Runners read from a ref so they always see
  // the latest `sortedRows` / selection helpers -- omitting the function
  // identities from the dep array would let `logSelectedSale` close over a
  // stale `sortedRows` after the user re-sorts or re-filters, logging a
  // sale against the wrong tires.
  const runnersRef = useRef({
    logSelectedSale,
    clearSelection,
    setQuoteOpen,
    setListingOpen,
    setBulkCtsOpen,
  })
  runnersRef.current = {
    logSelectedSale,
    clearSelection,
    setQuoteOpen,
    setListingOpen,
    setBulkCtsOpen,
  }

  useEffect(() => {
    const count = selectedIds.size
    if (count === 0) {
      setTireSelection(null)
      return undefined
    }
    setTireSelection({
      count,
      canQuote: !loading && selectedTires.length === 1,
      canLogSale: !loading,
      canGenerateListings: !loading && selectedTires.length > 0,
      canBulkOverhead: !loading,
      runQuote: () => runnersRef.current.setQuoteOpen(true),
      runLogSale: () => runnersRef.current.logSelectedSale(),
      runGenerateListings: () => runnersRef.current.setListingOpen(true),
      runBulkOverhead: () => runnersRef.current.setBulkCtsOpen(true),
      runClearSelection: () => runnersRef.current.clearSelection(),
    })
    return undefined
  }, [selectedIds, selectedTires, loading])

  useEffect(() => {
    return () => setTireSelection(null)
  }, [])

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('skedaddle:tires-selection', {
      detail: { active: selectedIds.size > 0 },
    }))
    return () => {
      window.dispatchEvent(new CustomEvent('skedaddle:tires-selection', {
        detail: { active: false },
      }))
    }
  }, [selectedIds.size])

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
              <p className="mt-1 max-w-2xl text-sm text-zinc-400">
                Sourcer to Field crew workflow via Slack. Notify customers from here and mark complete when
                paid.
              </p>
            </div>
            {canViewOrders ? (
              <OrdersList highlightId={ordersHighlight} />
            ) : (
              <p className="text-sm text-zinc-400">
                You do not have permission to view orders. Ask an admin for the{' '}
                <span className="font-mono text-zinc-400">orders</span> module.
              </p>
            )}
          </div>
        ) : null}

        {tab === 'catalog' ? (
          <>
            {catalogRisk === 'missingOverhead' || catalogRisk === 'lowMargin' ? (
              <div className="-mx-2 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-900/50 bg-amber-950/20 px-3 py-2 text-sm">
                <span className="text-amber-100/95">
                  <span className="text-zinc-400">Filtered from Dashboard: </span>
                  <span className="font-medium">
                    {catalogRisk === 'missingOverhead' ? 'tires missing overhead' : 'tires below 15% margin'}
                  </span>
                </span>
                <div className="flex items-center gap-2">
                  {catalogRisk === 'missingOverhead' && sortedRows.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => {
                        selectAllVisible(sortedRows)
                        setBulkCtsOpen(true)
                      }}
                      className="rounded-md border border-amber-600/60 bg-amber-500/15 px-2.5 py-1 text-xs font-medium text-amber-100 transition-colors duration-200 hover:border-amber-500 hover:bg-amber-500/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60"
                    >
                      Set overhead for all {sortedRows.length}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => {
                      const next = new URLSearchParams(searchParams)
                      next.delete('risk')
                      setSearchParams(next, { replace: true })
                    }}
                    className="rounded-md border border-amber-800/60 px-2 py-1 text-xs font-medium text-amber-200 transition-colors duration-200 hover:border-amber-700 hover:bg-amber-950/40 hover:text-amber-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60"
                  >
                    Clear filter
                  </button>
                </div>
              </div>
            ) : null}

            {(() => {
              const { status, ageDays } = categoryMapAgeStatus(categoryMap)
              if (status === 'missing') {
                return (
                  <div className="mb-2 rounded-lg border border-zinc-700 bg-zinc-900/60 px-3 py-2 text-xs text-zinc-300">
                    Categorization data unavailable. Using fallback heuristic for all SKUs.{' '}
                    <span className="text-zinc-500">
                      Run <code className="font-mono text-zinc-300">npm run import:efleet</code> to populate.
                    </span>
                  </div>
                )
              }
              if (status === 'stale') {
                return (
                  <div className="mb-2 rounded-lg border border-amber-700/60 bg-amber-950/30 px-3 py-2 text-xs text-amber-200">
                    Categorization data is {ageDays} days old. Refresh recommended.
                  </div>
                )
              }
              if (status === 'unknown') {
                return (
                  <div className="mb-2 rounded-lg border border-amber-700/60 bg-amber-950/30 px-3 py-2 text-xs text-amber-200">
                    Categorization data has an unparseable import timestamp. Re-run{' '}
                    <code className="font-mono text-amber-100">npm run import:efleet</code> to refresh.
                  </div>
                )
              }
              return null
            })()}

            <CategoryTabs
              selected={selectedCategory}
              counts={{
                all: categorizedRows.all.length,
                passenger: categorizedRows.passenger.length,
                lightTruck: categorizedRows.lightTruck.length,
                truck: categorizedRows.truck.length,
              }}
              onSelect={setSelectedCategory}
            />

            <div ref={toolbarRef} className="sticky top-[92px] z-[15] -mx-2 rounded-t-xl border-x border-t border-zinc-800 bg-zinc-900 px-2 py-2 shadow-[0_4px_12px_-6px_rgba(0,0,0,0.6)] backdrop-blur sm:top-[108px]">
              <div className="flex flex-col gap-2">
                <label className="block">
                  <span className="sr-only">Search by MSPN or description</span>
                  <div className="relative">
                    <svg
                      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
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
                      className="min-h-[44px] w-full rounded-lg border border-zinc-700 bg-zinc-900/60 py-2 pl-9 pr-9 text-sm text-zinc-100 outline-none placeholder:text-zinc-400 focus:border-zinc-500 sm:min-h-0"
                    />
                    {query ? (
                      <button
                        type="button"
                        onClick={() => setQuery('')}
                        aria-label="Clear search"
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-zinc-400 hover:bg-zinc-800/70 hover:text-zinc-200"
                      >
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                          <path strokeLinecap="round" d="m18 6-12 12M6 6l12 12" />
                        </svg>
                      </button>
                    ) : null}
                  </div>
                </label>
              </div>

              <div className="mt-2 flex flex-col gap-3 border-t border-zinc-800/60 pt-2">
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
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
                  {loading ? (
                    <span className="inline-flex items-center gap-2 text-sm text-zinc-400">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
                      Loading inventory…
                    </span>
                  ) : null}
                  {!loading && sortedRows.length > 0 ? (
                    <span
                      aria-live="polite"
                      className="truncate whitespace-nowrap text-[11px] font-medium text-zinc-400"
                    >
                      {`Showing 1-${sortedRows.length} of ${sortedRows.length} · ${sortDir === 'asc' ? '↑' : '↓'} ${visibleColumnLabel}`}
                    </span>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2 self-start sm:self-center">
                  {!loading && sortedRows.length > 0 ? (
                    <SelectAllToggle
                      pageCount={pageRows.length}
                      totalCount={sortedRows.length}
                      selectedCount={selectedIds.size}
                      visibleSelected={allVisibleSelected}
                      allMatchingSelected={allMatchingSelected}
                      moreBeyondVisible={moreBeyondVisible}
                      onTogglePage={() => {
                        if (allVisibleSelected) {
                          clearSelection()
                        } else {
                          toggleAllFilteredSelection(pageRows)
                        }
                      }}
                      onSelectAllMatching={() =>
                        toggleAllFilteredSelection(sortedRows)
                      }
                    />
                  ) : null}
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
                    className={`min-h-[44px] whitespace-nowrap rounded-lg border px-3 py-2 text-sm sm:min-h-0 ${
                      sortKey === 'opportunity'
                        ? 'border-amber-600 bg-amber-950/40 text-amber-100 hover:border-amber-500 hover:bg-amber-950/60'
                        : 'border-zinc-600 text-zinc-200 hover:border-zinc-500 hover:bg-zinc-900/60'
                    }`}
                  >
                    {`Sort: ${visibleColumnLabel}`}
                  </button>
                  <Popover
                    label="Table options"
                    align="end"
                    anchor={
                      <button
                        type="button"
                        className="min-h-[44px] whitespace-nowrap rounded-lg border border-zinc-600 px-3 py-2 text-sm text-zinc-200 hover:border-zinc-500 hover:bg-zinc-900/60 sm:min-h-0"
                      >
                        Table options
                      </button>
                    }
                  >
                    <div className="w-72 p-3">
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
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
                      <div className="mt-3 border-t border-zinc-800 pt-3">
                        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                          Haggle discount {Math.round(haggleDiscount * 100)}%
                        </p>
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
                      </div>
                      <div className="mt-3 flex items-center justify-between border-t border-zinc-800 pt-3">
                        <button
                          type="button"
                          onClick={() => setColumnVisibility(defaultColumnVisibility())}
                          className="text-[11px] font-medium text-zinc-400 hover:text-zinc-200"
                        >
                          Reset columns
                        </button>
                        <button
                          type="button"
                          disabled={loading || sortedRows.length === 0}
                          onClick={() => exportMarginCsv(sortedRows)}
                          className="rounded-md border border-zinc-600 px-2 py-1 text-[11px] font-medium text-zinc-200 hover:border-zinc-500 hover:bg-zinc-800/70 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Export CSV
                        </button>
                      </div>
                    </div>
                  </Popover>
                </div>
              </div>
              {selectedIds.size > 0 ? (
                <div className="hidden sm:block">
                  <div
                    role="toolbar"
                    aria-label="Selected tire actions"
                    className="flex flex-col gap-3 border-t border-zinc-800/80 pt-3 lg:flex-row lg:items-center lg:justify-between"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap" role="group" aria-label="Selling actions">
                      <button
                        type="button"
                        disabled={selectedTires.length === 0 || loading}
                        onClick={() => setListingOpen(true)}
                        className="min-h-[44px] rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-0"
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
                        {loggingProspective ? (
                          <Spinner className="h-4 w-4 text-fuchsia-100" />
                        ) : (
                          <BrandBolt size={14} tone="solid" />
                        )}
                        {loggingProspective ? 'Logging…' : 'Log prospective order'}
                      </button>
                    </div>
                    <div className="hidden w-px self-stretch bg-zinc-800 lg:block" aria-hidden />
                    <div
                      className="flex flex-col gap-2 sm:flex-row sm:flex-wrap lg:justify-end"
                      role="group"
                      aria-label="Admin actions"
                    >
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
                </div>
              ) : null}
              </div>
            </div>

            <TiresFilterOverlay
              open={filtersOpen}
              onClose={() => setFiltersOpen(false)}
            >
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
                onApplyPreset={applyFilterPreset}
              />
            </TiresFilterOverlay>

            {selectedIds.size > 0 ? (
              <div
                role="toolbar"
                aria-label="Tire selection actions"
                className="fixed inset-x-0 bottom-0 z-[125] flex items-center gap-2 border-t border-zinc-800 bg-zinc-950 px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:hidden"
              >
                <button
                  type="button"
                  aria-label="Clear selection"
                  onClick={clearSelection}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:bg-zinc-800/60"
                >
                  ×
                </button>
                <span className="flex-1 text-sm font-medium text-zinc-200">
                  {selectedIds.size} selected
                </span>
                <button
                  type="button"
                  onClick={() => setQuoteOpen(true)}
                  disabled={loading || selectedTires.length !== 1}
                  className="min-h-[40px] rounded-lg bg-amber-500 px-4 text-sm font-semibold text-zinc-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Quote
                </button>
                <button
                  type="button"
                  onClick={() => setListingOpen(true)}
                  disabled={selectedTires.length === 0 || loading}
                  className="min-h-[40px] rounded-lg border border-zinc-600 bg-zinc-900 px-4 text-sm font-medium text-zinc-100 hover:border-zinc-500 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  List
                </button>
              </div>
            ) : null}

            <div className="sm:hidden">
              {sortedRows.length > 0 ? (
                <ul className="space-y-2 px-1 pt-2">
                  {sortedRows.map((tire) => (
                    <li key={tire.id}>
                      <TireCardMobile
                        tire={tire}
                        selected={selectedIds.has(tire.id)}
                        onTestOffer={(t) => setHaggleTire(t)}
                        onToggleSelect={(t) => toggle(t.id)}
                        onPhotoUploaded={onMobilePhotoUploaded}
                        onOpenPhotos={setPhotoGalleryTire}
                      />
                    </li>
                  ))}
                </ul>
              ) : loading ? (
                <ul className="space-y-2 px-1 pt-2" aria-label="Loading tires">
                  {[1, 2, 3].map((k) => (
                    <li
                      key={k}
                      className="h-32 animate-pulse rounded-xl bg-zinc-900/60"
                    />
                  ))}
                </ul>
              ) : (
                <div className="px-3 py-8 text-center" role="status">
                  <p className="text-sm font-medium text-zinc-300">
                    Catalog is empty
                  </p>
                  <p className="mt-2 text-xs text-zinc-400">
                    Import rows into the Firestore{' '}
                    <code className="text-zinc-400">tires</code> collection
                    (CSV import script or console), then refresh.
                  </p>
                </div>
              )}
            </div>
            <div className="hidden sm:block -mx-2 rounded-b-xl border-x border-b border-zinc-800 overflow-hidden">
              <MarginTable
                rows={sortedRows}
                selectedIds={selectedIds}
                onToggle={toggle}
                sortKey={sortKey}
                sortDir={sortDir}
                onSortChange={onSortChange}
                loading={loading}
                emptyState={emptyState}
                columnVisibility={columnVisibility}
                externalListRef={marginTableRef}
                justJumpedToId={justJumpedToId}
              />
            </div>
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
      {haggleTire ? (
        <HaggleSheet
          tire={haggleTire}
          floorPct={floorPct}
          onClose={() => setHaggleTire(null)}
          onAccept={(offer) => {
            const target = haggleTire
            setHaggleTire(null)
            setSaleInitial({
              mspn: target?.mspn,
              quantity: 1,
              pricePerTire: offer,
            })
            setSaleOpen(true)
          }}
        />
      ) : null}
      {photoGalleryTire ? (
        <TirePhotoGallery
          tire={photoGalleryTire}
          open
          onClose={() => setPhotoGalleryTire(null)}
          onDeleted={(photo) => onGalleryPhotoDeleted(photoGalleryTire, photo)}
        />
      ) : null}
    </div>
  )
}
