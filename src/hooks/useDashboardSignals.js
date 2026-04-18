import {
  collection,
  getCountFromServer,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from 'firebase/firestore'
import { useEffect, useMemo, useState } from 'react'
import { db } from '../firebase/config'
import { useTires } from './useTires'
import { computeMargin } from '../utils/marginCalc'
import { tireCatalogBuyNumber } from '../utils/tireCatalogBuy'
import { listingStatus } from '../utils/listingStatus'

const CATALOG_SKU_DISPLAY = 1160

/**
 * Firestore-backed dashboard: module card copy, briefing counts, recent orders, crew preview.
 */
export function useDashboardSignals() {
  const { tires, loading: tiresLoading } = useTires()

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

  const catalogHealth = useMemo(() => {
    if (tiresLoading) {
      return { total: null, missingOverhead: null, lowMargin: null, loading: true }
    }
    if (!tires.length) {
      return { total: 0, missingOverhead: 0, lowMargin: 0, loading: false }
    }
    let missingOverhead = 0
    let lowMargin = 0
    for (const t of tires) {
      const mount = Number(t.mountCost) || 0
      const delivery = Number(t.deliveryCost) || 0
      const other = Number(t.otherCost) || 0
      const cts = Number(t.cts) || 0
      if (cts === 0 && mount === 0 && delivery === 0 && other === 0) missingOverhead += 1
      const buy = tireCatalogBuyNumber(t)
      if (buy > 0) {
        const m = computeMargin(t)
        if (m != null && !Number.isNaN(m) && m < 15) lowMargin += 1
      }
    }
    return { total: tires.length, missingOverhead, lowMargin, loading: false }
  }, [tires, tiresLoading])

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
    catalogSize: null,
    crewAlerts: null,
    loading: true,
  })

  const [recentActivity, setRecentActivity] = useState({
    orders: /** @type {Array<{ id: string, data: Record<string, unknown> }>} */ ([]),
    loading: true,
  })

  const [crewPreview, setCrewPreview] = useState({
    users: /** @type {Array<{ id: string, data: Record<string, unknown> }>} */ ([]),
    hasMore: false,
    loading: true,
  })

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
        const q = query(
          collection(db, 'orders'),
          where('status', '==', 'completed'),
          limit(5000),
        )
        const snap = await getDocs(q)
        if (cancelled) return
        let revenue = 0
        snap.forEach((d) => {
          revenue += Number(d.data()?.paymentAmount) || 0
        })
        setCompletedOrders({
          count: snap.size,
          revenue,
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
        const [pendingSnap, tiresSnap, lockedSnap] = await Promise.all([
          getCountFromServer(pendingQ),
          getCountFromServer(collection(db, 'tires')),
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
        if (cancelled) return
        setSignalBar({
          pendingOrders: pendingSnap.data().count,
          catalogSize: tiresSnap.data().count,
          crewAlerts: pendingInvites + lockedSnap.data().count,
          loading: false,
        })
      } catch (e) {
        console.error('dashboard signal bar counts', e)
        if (!cancelled) {
          setSignalBar({
            pendingOrders: 0,
            catalogSize: 0,
            crewAlerts: 0,
            loading: false,
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
        const snap = await getDocs(query(collection(db, 'users'), limit(60)))
        if (cancelled) return
        const rows = snap.docs.map((d) => ({ id: d.id, data: d.data() }))
        function rank(u) {
          const inv = String(u.data?.inviteStatus || '')
          const accepted = Boolean(u.data?.inviteAccepted)
          if (inv === 'locked') return 0
          if (inv === 'active' && !accepted) return 1
          return 2
        }
        function lastMs(u) {
          const t = u.data?.lastLoginAt
          if (t && typeof t.toMillis === 'function') return t.toMillis()
          return 0
        }
        rows.sort((a, b) => {
          const dr = rank(a) - rank(b)
          if (dr !== 0) return dr
          return lastMs(b) - lastMs(a)
        })
        const hasMore = rows.length > 8
        setCrewPreview({ users: rows.slice(0, 8), hasMore, loading: false })
      } catch (e) {
        console.error('dashboard crew preview', e)
        if (!cancelled) setCrewPreview({ users: [], hasMore: false, loading: false })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

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
    catalogHealth,
    crewPreview,
  }
}
