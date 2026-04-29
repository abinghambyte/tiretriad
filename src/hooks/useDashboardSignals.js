import {
  collection,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { useEffect, useMemo, useState } from 'react'
import { db, functions } from '../firebase/config'
import { useTires } from './useTires'
import { useUserProfile } from './useUserProfile'
import { useCrewPreview } from './useCrewPreview'
import { useAdvisorSignals } from './useAdvisorSignals.js'
import { DEFAULT_ADVISOR_MODE } from '../utils/listingAdvisor/modeWeights.js'
import { computeMargin } from '../utils/marginCalc'
import { tireCatalogBuyNumber } from '../utils/tireCatalogBuy'
import { listingStatus } from '../utils/listingStatus'

const CATALOG_SKU_DISPLAY = 1160

/**
 * Pure fallback heuristic for SKUs that aren't in the eFleet authoritative
 * map. Looks at description size pattern + LR field. Used by
 * {@link selectCategoryForTire} when the map is missing or doesn't cover
 * the tire (typically the ~243 portal-only off-program Michelin SKUs).
 *
 * @param {object | null | undefined} tire
 * @returns {'passenger' | 'lightTruck' | 'truck'}
 */
export function fallbackHeuristic(tire) {
  const desc = String(tire?.desc || '').toUpperCase().trim()
  const lr = String(tire?.lr || '').toUpperCase().trim()
  const m = desc.match(/R([0-9]+(?:\.[0-9]+)?)/)
  const wheel = m ? parseFloat(m[1]) : null

  if ((wheel !== null && wheel >= 22.5) || ['H', 'J', 'L', 'M'].includes(lr)) {
    return 'truck'
  }
  if (desc.startsWith('LT') || ['C', 'D', 'E', 'F', 'G'].includes(lr)) {
    return 'lightTruck'
  }
  return 'passenger'
}

/**
 * Resolve the category for a tire in priority order:
 *   1. tire.categoryOverride (admin manual correction)
 *   2. categoryMap.mspns[tire.mspn] (Michelin eFleet authoritative)
 *   3. fallbackHeuristic(tire) (size+LR rule for off-program SKUs)
 *
 * @param {object | null | undefined} tire
 * @param {{ mspns?: Record<string, 'passenger' | 'lightTruck' | 'truck'> } | null | undefined} categoryMap
 * @returns {'passenger' | 'lightTruck' | 'truck'}
 */
export function selectCategoryForTire(tire, categoryMap) {
  if (tire?.categoryOverride) {
    const v = String(tire.categoryOverride)
    if (v === 'passenger' || v === 'lightTruck' || v === 'truck') return v
  }
  const mspn = String(tire?.mspn ?? '').trim()
  const mapped = categoryMap?.mspns?.[mspn]
  if (mapped === 'passenger' || mapped === 'lightTruck' || mapped === 'truck') {
    return mapped
  }
  return fallbackHeuristic(tire)
}

/**
 * Selector: tires that are margin-confirmed but live on fewer than two
 * active platform listings. Returns a list of "hidden gem" rows ready
 * for the Hidden Gems surface on the dashboard.
 */
export function selectHiddenGems(tires) {
  const out = []
  for (const t of tires || []) {
    if (!t?.marginConfirmed) continue
    const listings = t.platformListings || {}
    const active = Object.keys(listings).filter(
      (p) => listings[p]?.status === 'active',
    )
    if (active.length >= 2) continue
    let lastPostedAt = null
    for (const p of Object.keys(listings)) {
      const raw = listings[p]?.lastPostedAt
      const ms = toMillisSafe(raw)
      if (ms != null && (lastPostedAt === null || ms > lastPostedAt)) {
        lastPostedAt = ms
      }
    }
    out.push({
      id: String(t.id || t.mspn || ''),
      sku: String(t.mspn || t.sku || t.id || ''),
      description: String(t.description || ''),
      platformCount: active.length,
      platforms: active,
      lastPostedAt,
    })
  }
  return out
}

/**
 * Selector: pulls the `topSellers` array off a `meta/revenueStats`
 * snapshot. Returns `[]` when the field is absent or not an array so
 * consumers can render an empty-state without null-checking.
 */
export function selectTopSellersFromRevenueDoc(docData) {
  const list = docData?.topSellers
  return Array.isArray(list) ? list : []
}

/**
 * Selector: 7-day rolling revenue average computed from the
 * `dailyHistory` map on `meta/revenueStats`. The "current day" key
 * (`dailyWindow`) is excluded so today's partial total does not drag
 * the baseline. Returns `null` when fewer than three closed days are
 * available - the UI uses that to skip the hot-state comparison until
 * there is enough signal to compare against.
 */
export function selectRollingAverageRevenue(docData) {
  const history =
    docData?.dailyHistory && typeof docData.dailyHistory === 'object'
      ? docData.dailyHistory
      : null
  if (!history) return null
  const todayKey = String(docData?.dailyWindow || '')
  const entries = Object.keys(history)
    .filter((k) => k !== todayKey)
    .sort()
    .slice(-7)
    .map((k) => Number(history[k]) || 0)
  if (entries.length < 3) return null
  const total = entries.reduce((a, b) => a + b, 0)
  return total / entries.length
}

/** Status values considered "work in progress" for a given user's WIP count. */
const WIP_ORDER_STATUSES = new Set([
  'pending',
  'available',
  'scheduled',
  'in_transit',
  'ready',
  'prospective',
])

/** Max streak value surfaced to the UI. */
const STREAK_CAP = 99

const getDashboardStatsCallable = httpsCallable(functions, 'getDashboardStats')

function toMillisSafe(value) {
  if (!value) return null
  if (typeof value.toMillis === 'function') return value.toMillis()
  if (typeof value.seconds === 'number') {
    return value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1e6)
  }
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'number') return value
  return null
}

function localYmdFromMs(ms) {
  const d = new Date(ms)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const da = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${da}`
}

function ymdUtcNoonMs(ymd) {
  const [y, mo, da] = String(ymd).split('-').map(Number)
  return Date.UTC(y, (mo || 1) - 1, da || 1, 12, 0, 0)
}

function addDaysToYmd(ymd, delta) {
  const ms = ymdUtcNoonMs(ymd) + delta * 86400000
  const d = new Date(ms)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

/**
 * Pure crew-signals selector. Returns a map keyed by user uid with per-user
 * pill metrics derived from the passed-in Firestore documents. Existing
 * signals in the hook are untouched.
 *
 * @param {Array<{ id: string, data: Record<string, unknown> }>} users
 * @param {Array<{ id: string, data: Record<string, unknown> }>} orders
 * @param {Array<Record<string, unknown>>} tires catalog rows (post `researchQueue`)
 * @param {number} nowMs
 */
/**
 * Count open research-queue entries across the tire catalog. Any tire with a
 * `researchQueue` object whose `resolvedAt` is null counts, regardless of
 * reason or assignee. Matches the filter `MyQueuePage` uses to render rows,
 * so the nav badge and the page never disagree.
 *
 * @param {Array<Record<string, unknown>>} tires
 * @param {boolean} loading pass-through from the source hook; returns null
 *   while loading so consumers can render a placeholder instead of a misleading 0
 * @returns {number | null}
 */
export function deriveKylesQueueCount(tires, loading) {
  if (loading) return null
  if (!Array.isArray(tires)) return 0
  let n = 0
  for (const t of tires) {
    const rq = t?.researchQueue
    if (!rq || typeof rq !== 'object') continue
    if (rq.resolvedAt != null) continue
    n += 1
  }
  return n
}

/**
 * Derive list of top-N queue items for the My Queue bell + widget (patch-628).
 * Currently a thin wrapper over Kyle's research queue; extends as more queue
 * sources land (e.g., field-crew assigned jobs from CRM, admin moderation).
 *
 * @param {Array<Record<string, unknown>>} tires
 * @param {{ role?: string } | null | undefined} profile
 * @param {number} limit how many items to return
 * @returns {Array<{ id: string, label: string, relativeTime: string, href: string }>}
 */
export function deriveMyQueueItems(tires, profile, limit = 10) {
  const role = String(profile?.role || '').toLowerCase()
  if (role !== 'admin' && role !== 'sourcer') return []
  if (!Array.isArray(tires)) return []
  const items = []
  for (const t of tires) {
    const rq = t?.researchQueue
    if (!rq || typeof rq !== 'object') continue
    if (rq.resolvedAt != null) continue
    const enqueuedMs = typeof rq.enqueuedAt?.toMillis === 'function'
      ? rq.enqueuedAt.toMillis()
      : 0
    items.push({
      id: t.id,
      label: `Research ${t.mspn || t.id} — ${rq.reason || 'queued'}`,
      sortMs: enqueuedMs,
      href: `/my-queue?focus=${encodeURIComponent(t.id)}`,
    })
  }
  // Newest first (recently enqueued surfaces first)
  items.sort((a, b) => b.sortMs - a.sortMs)
  return items.slice(0, limit).map((it) => ({
    id: it.id,
    label: it.label,
    relativeTime: it.sortMs ? relativeFromMs(it.sortMs) : '—',
    href: it.href,
  }))
}

function relativeFromMs(ms) {
  const diff = Date.now() - ms
  if (diff < 60_000) return 'just now'
  const m = Math.floor(diff / 60_000)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

export function deriveCrewSignals(users, orders, tires, nowMs) {
  const now = Number.isFinite(nowMs) ? nowMs : Date.now()
  const todayYmd = localYmdFromMs(now)

  // Normalise user list to a role lookup. Role may live on `data.role`.
  const userRole = new Map()
  for (const u of users || []) {
    userRole.set(u.id, String(u?.data?.role || '').toLowerCase())
  }

  // Pre-index orders by assignee for cheap aggregation.
  /** @type {Map<string, { wip: number, today: number, daySet: Set<string> }>} */
  const perUid = new Map()
  function ensure(uid) {
    let slot = perUid.get(uid)
    if (!slot) {
      slot = { wip: 0, today: 0, daySet: new Set() }
      perUid.set(uid, slot)
    }
    return slot
  }

  for (const o of orders || []) {
    const data = o?.data || {}
    const uid = String(data.assignedTo || '').trim()
    if (!uid) continue
    const status = String(data.status || '').trim()
    if (WIP_ORDER_STATUSES.has(status)) {
      ensure(uid).wip += 1
    }
    if (status === 'completed') {
      const ms = toMillisSafe(data.completedAt)
      if (ms != null) {
        const ymd = localYmdFromMs(ms)
        const slot = ensure(uid)
        slot.daySet.add(ymd)
        if (ymd === todayYmd) slot.today += 1
      }
    }
  }

  // Sourcer queue counts -- Patch Q introduces `researchQueue`; until Q ships
  // we treat the field as absent and default to zero for everyone. Once Q is
  // merged, `researchQueue.resolvedAt == null` means an open row.
  let perSourcerQueue = 0
  for (const t of tires || []) {
    const rq = t?.researchQueue
    if (rq && rq.resolvedAt == null) perSourcerQueue += 1
  }

  const result = {}
  for (const u of users || []) {
    const uid = u.id
    const slot = perUid.get(uid) || { wip: 0, today: 0, daySet: new Set() }
    // Streak: consecutive prior days ending at today (or yesterday if today
    // empty, matching Analytics grace), capped at STREAK_CAP.
    let streakDays = 0
    let cursor = slot.daySet.has(todayYmd) ? todayYmd : addDaysToYmd(todayYmd, -1)
    while (slot.daySet.has(cursor) && streakDays < STREAK_CAP) {
      streakDays += 1
      cursor = addDaysToYmd(cursor, -1)
    }
    const role = userRole.get(uid) || ''
    const isSourcer = role === 'sourcer'
    const lastSeenAt = toMillisSafe(u?.data?.presence?.lastSeenAt)
    result[uid] = {
      wipCount: slot.wip,
      todayCompletions: slot.today,
      streakDays,
      queueCount: isSourcer ? perSourcerQueue : 0,
      lastSeenAt,
    }
  }
  return result
}

/**
 * Firestore-backed dashboard: module card copy, briefing counts, recent orders, crew preview.
 */
export function useDashboardSignals() {
  const { tires, loading: tiresLoading } = useTires()
  const { crewPreview, crewSignals: crewSignalsState } = useCrewPreview()
  const advisor = useAdvisorSignals(DEFAULT_ADVISOR_MODE)
  const { profile } = useUserProfile()

  const needsRepostingCount = useMemo(() => {
    if (tiresLoading) return null
    let n = 0
    for (const t of tires) {
      // Only flag tires that were ever posted on at least one platform
      const everPosted = ['facebook', 'offerup', 'craigslist'].some(
        (p) => t?.platformListings?.[p]?.lastPostedAt,
      )
      if (!everPosted) continue
      // And are now stale on all platforms (none currently active)
      const allInactive = ['facebook', 'offerup', 'craigslist'].every(
        (p) => listingStatus(t, p) !== 'active',
      )
      if (allInactive) n += 1
    }
    return n
  }, [tires, tiresLoading])

  const tireSku = useMemo(() => {
    if (tiresLoading) return { pricedCount: null, avgMarginPriced: null, loading: true }
    const priced = tires.filter((t) => tireCatalogBuyNumber(t) > 0)
    const pricedCount = priced.length
    const margins = priced
      .map((t) => computeMargin(t))
      .filter((m) => m != null && !Number.isNaN(m))
    const avgMarginPriced =
      margins.length > 0 ? margins.reduce((a, b) => a + b, 0) / margins.length : null
    return { pricedCount, avgMarginPriced, loading: false }
  }, [tires, tiresLoading])

  // Count of open research-queue entries. Feeds Kyle's crew-widget pill and
  // the `My Queue` nav badge, so it must match what `MyQueuePage` renders:
  // every tire with an unresolved `researchQueue` entry, regardless of reason
  // (`below-margin-floor` or `unutilized-needs-research`) or assignee in v1.
  const kylesQueueCount = useMemo(
    () => deriveKylesQueueCount(tires, tiresLoading),
    [tires, tiresLoading],
  )

  // Patch-628: top-N items for the My Queue bell + dashboard widget.
  const myQueueItems = useMemo(
    () => deriveMyQueueItems(tires, profile, 10),
    [tires, profile],
  )
  const myQueueCount = myQueueItems.length

  const [crm, setCrm] = useState({
    accounts: null,
    leads: null,
    openJobs: null,
    loading: true,
  })

  const [people, setPeople] = useState({
    users: null,
    contacts: null,
    loading: true,
  })

  const [completedOrders, setCompletedOrders] = useState({
    count: null,
    revenue: null,
    loading: true,
  })

  const [priceIntelResearched, setPriceIntelResearched] = useState({
    count: null,
    loading: true,
  })

  const [signalBar, setSignalBar] = useState({
    pendingOrders: null,
    /** Denver-day revenue from meta/revenueStats (aligns with Analytics). */
    todayRevenue: null,
    crewAlerts: null,
    loading: true,
    /** True when the top-level counts query failed (not just a nested sub-read). */
    error: false,
  })

  /** Full `meta/revenueStats` doc snapshot; feeds topSellers + allTimeMargin. */
  const [revenueStatsDoc, setRevenueStatsDoc] = useState(
    /** @type {null | Record<string, unknown>} */ (null),
  )

  const [recentActivity, setRecentActivity] = useState({
    orders: /** @type {Array<{ id: string, data: Record<string, unknown> }>} */ ([]),
    loading: true,
  })

  const [lastSale, setLastSale] = useState(
    /** @type {{ amount: number | null, completedAtMs: number | null, loading: boolean }} */ ({
      amount: null,
      completedAtMs: null,
      loading: true,
    }),
  )

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const q = query(collection(db, 'tires'), where('priceIntel.activeBuyPrice', '>', 0))
        const snap = await getCountFromServer(q)
        if (!cancelled) {
          setPriceIntelResearched({ count: snap.data().count, loading: false })
        }
      } catch (e) {
        console.error('dashboard priceIntel researched count', e)
        if (!cancelled) {
          setPriceIntelResearched({ count: 0, loading: false })
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [aSnap, lSnap, jobsTotalSnap, jobsDoneSnap] = await Promise.all([
          getCountFromServer(collection(db, 'crmAccounts')),
          getCountFromServer(collection(db, 'crmLeads')),
          getCountFromServer(collection(db, 'crmJobs')),
          getCountFromServer(
            query(collection(db, 'crmJobs'), where('completionStatus', '==', 'Done')),
          ),
        ])
        if (cancelled) return
        const total = jobsTotalSnap.data().count
        const done = jobsDoneSnap.data().count
        setCrm({
          accounts: aSnap.data().count,
          leads: lSnap.data().count,
          openJobs: Math.max(0, total - done),
          loading: false,
        })
      } catch (e) {
        console.error('dashboard CRM counts', e)
        if (!cancelled) {
          setCrm({ accounts: 0, leads: 0, openJobs: 0, loading: false })
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [uSnap, cSnap] = await Promise.all([
          getCountFromServer(collection(db, 'users')),
          getCountFromServer(collection(db, 'contacts')),
        ])
        if (cancelled) return
        setPeople({
          users: uSnap.data().count,
          contacts: cSnap.data().count,
          loading: false,
        })
      } catch (e) {
        console.error('dashboard people counts', e)
        if (!cancelled) setPeople({ users: 0, contacts: 0, loading: false })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await getDashboardStatsCallable({ windowDays: 90 })
        if (cancelled) return
        const payload = res.data || {}
        setCompletedOrders({
          count: Number(payload.orderCount) || 0,
          revenue: Number(payload.totalRevenue) || 0,
          loading: false,
        })
      } catch (e) {
        console.error('dashboard completed orders', e)
        if (!cancelled) setCompletedOrders({ count: 0, revenue: 0, loading: false })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const pendingQ = query(
          collection(db, 'orders'),
          where('status', 'not-in', ['completed', 'cancelled']),
        )
        const [pendingSnap, lockedSnap] = await Promise.all([
          getCountFromServer(pendingQ),
          getCountFromServer(query(collection(db, 'users'), where('inviteStatus', '==', 'locked'))),
        ])
        let pendingInvites = 0
        try {
          const invSnap = await getCountFromServer(
            query(
              collection(db, 'users'),
              where('inviteStatus', '==', 'active'),
              where('inviteAccepted', '==', false),
            ),
          )
          pendingInvites = invSnap.data().count
        } catch (e) {
          console.error('dashboard pending invite count', e)
        }
        let todayRevenue = 0
        let revenueDocData = null
        try {
          const revenueSnap = await getDoc(doc(db, 'meta', 'revenueStats'))
          if (revenueSnap.exists()) {
            revenueDocData = revenueSnap.data() || null
            todayRevenue = Number(revenueDocData?.dailyRevenue) || 0
          }
        } catch (e) {
          console.error('dashboard revenueStats read', e)
        }
        if (!cancelled) setRevenueStatsDoc(revenueDocData)
        if (cancelled) return
        setSignalBar({
          pendingOrders: pendingSnap.data().count,
          todayRevenue,
          crewAlerts: pendingInvites + lockedSnap.data().count,
          loading: false,
          error: false,
        })
      } catch (e) {
        console.error('dashboard signal bar counts', e)
        if (!cancelled) {
          setSignalBar({
            pendingOrders: 0,
            todayRevenue: 0,
            crewAlerts: 0,
            loading: false,
            error: true,
          })
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(5))
        const snap = await getDocs(q)
        if (cancelled) return
        setRecentActivity({
          orders: snap.docs.map((d) => ({ id: d.id, data: d.data() })),
          loading: false,
        })
      } catch (e) {
        console.error('dashboard recent orders', e)
        if (!cancelled) setRecentActivity({ orders: [], loading: false })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const q = query(
          collection(db, 'orders'),
          where('status', '==', 'completed'),
          orderBy('completedAt', 'desc'),
          limit(1),
        )
        const snap = await getDocs(q)
        if (cancelled) return
        if (snap.empty) {
          setLastSale({ amount: null, completedAtMs: null, loading: false })
          return
        }
        const data = snap.docs[0].data() || {}
        const amount = Number(data.paymentAmount ?? data.totalPrice) || 0
        const completedAt = data.completedAt
        const completedAtMs =
          completedAt && typeof completedAt.toMillis === 'function'
            ? completedAt.toMillis()
            : null
        setLastSale({ amount, completedAtMs, loading: false })
      } catch (e) {
        console.error('dashboard last sale', e)
        if (!cancelled) setLastSale({ amount: null, completedAtMs: null, loading: false })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const hiddenGems = useMemo(() => {
    if (tiresLoading) return []
    return selectHiddenGems(tires)
  }, [tires, tiresLoading])

  const topSellers = useMemo(
    () => selectTopSellersFromRevenueDoc(revenueStatsDoc),
    [revenueStatsDoc],
  )

  const allTimeMargin = useMemo(
    () => Number(revenueStatsDoc?.allTimeMargin) || 0,
    [revenueStatsDoc],
  )

  const rollingAverageRevenue = useMemo(
    () => selectRollingAverageRevenue(revenueStatsDoc),
    [revenueStatsDoc],
  )

  return {
    catalogSkuDisplay: CATALOG_SKU_DISPLAY,
    needsRepostingCount,
    tireSku,
    priceIntelResearched,
    crm,
    people,
    completedOrders,
    signalBar,
    recentActivity,
    crewPreview,
    crewSignals: crewSignalsState,
    kylesQueueCount,
    myQueueItems,
    myQueueCount,
    hiddenGems,
    topSellers,
    allTimeMargin,
    rollingAverageRevenue,
    lastSale,
    advisorRanked: advisor.ranked,
    advisorLoading: advisor.loading,
  }
}
