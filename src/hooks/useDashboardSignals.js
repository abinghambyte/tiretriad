import {
  collection,
  getCountFromServer,
  getDocs,
  limit,
  query,
  where,
} from 'firebase/firestore'
import { useEffect, useMemo, useState } from 'react'
import { db } from '../firebase/config'
import { useTires } from './useTires'
import { computeMargin } from '../utils/marginCalc'
import { tireCatalogBuyNumber } from '../utils/tireCatalogBuy'

const CATALOG_SKU_DISPLAY = 1160

/**
 * Firestore-backed dashboard card signals (counts + tire margin blend).
 */
export function useDashboardSignals() {
  const { tires, loading: tiresLoading } = useTires()

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

  return {
    catalogSkuDisplay: CATALOG_SKU_DISPLAY,
    tireSku,
    priceIntelResearched,
    crm,
    people,
    completedOrders,
  }
}
