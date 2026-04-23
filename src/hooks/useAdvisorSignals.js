// src/hooks/useAdvisorSignals.js
import { useEffect, useMemo, useRef, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useTires } from './useTires.js'
import { rankTires } from '../utils/listingAdvisor/ranker.js'
import { DEFAULT_ADVISOR_MODE } from '../utils/listingAdvisor/modeWeights.js'
import { tireCatalogBuyNumber } from '../utils/tireCatalogBuy'
import { tireCatalogRetailNumber } from '../utils/tireCatalogRetail'
import { effectiveCts } from '../utils/ctsCalc'

const MS_PER_DAY = 24 * 60 * 60 * 1000
// Match listingStatus.js: anything posted within 7 days counts as active.
const LISTING_STALE_MS = 7 * MS_PER_DAY
const PLATFORMS = ['facebook', 'offerup', 'craigslist']

function toMillis(maybeTs) {
  if (!maybeTs) return null
  if (typeof maybeTs.toMillis === 'function') return maybeTs.toMillis()
  if (maybeTs instanceof Date) return maybeTs.getTime()
  const n = Number(maybeTs)
  return Number.isFinite(n) ? n : null
}

/**
 * Days since the tire's price was last written. Reads the canonical
 * `priceIntel.sources` audit trail (see AGENTS.md: "All price changes logged
 * to priceIntel.sources array"). Backend writers use either `at`
 * (tirePriceResearch.js) or `recordedAt` (priceIntelSlack.js) as the
 * timestamp field, so both are checked.
 */
export function computeDaysSincePriceChange(tire, nowMs) {
  const sources = Array.isArray(tire?.priceIntel?.sources) ? tire.priceIntel.sources : []
  let latest = 0
  for (const entry of sources) {
    const ms = toMillis(entry?.at) ?? toMillis(entry?.recordedAt)
    if (ms && ms > latest) latest = ms
  }
  if (!latest) return 0
  const diffDays = Math.floor((nowMs - latest) / MS_PER_DAY)
  return diffDays < 0 ? 0 : diffDays
}

/**
 * Per size+LR average days from tire intake to order completion. Joins
 * completed orders to their tire via `order.mspn -> tire.mspn` (tire docs
 * are keyed by MSPN in this codebase, but the join explicitly matches on
 * the mspn field to stay decoupled from that convention). Days-to-sell is
 * measured against `tire.createdAt` (inventory intake), not `order.createdAt`.
 */
export function computeAvgDaysToSell(orders, tires) {
  const tireByMspn = new Map()
  for (const t of tires || []) {
    const key = String(t?.mspn || t?.id || '').trim()
    if (!key) continue
    if (!tireByMspn.has(key)) tireByMspn.set(key, t)
  }
  const acc = {}
  for (const o of orders || []) {
    if (!o || o.status !== 'completed') continue
    const completedMs = toMillis(o.completedAt)
    if (!completedMs) continue
    const mspn = String(o?.mspn || '').trim()
    const tire = mspn ? tireByMspn.get(mspn) : null
    const intakeMs = toMillis(tire?.createdAt)
    if (!intakeMs) continue
    const size = String(tire?.size || o.size || '').trim()
    const lr = String(tire?.lr || o.lr || '').trim()
    const key = `${size}|${lr}`
    if (!acc[key]) acc[key] = { sumDays: 0, sampleSize: 0 }
    acc[key].sumDays += Math.max(0, (completedMs - intakeMs) / MS_PER_DAY)
    acc[key].sampleSize += 1
  }
  const out = {}
  for (const [key, { sumDays, sampleSize }] of Object.entries(acc)) {
    out[key] = { avgDaysToSell: Math.round(sumDays / sampleSize), sampleSize }
  }
  return out
}

function marginHeadroomPct(tire) {
  const retail = tireCatalogRetailNumber(tire)
  if (retail <= 0) return 0
  const buy = tireCatalogBuyNumber(tire)
  const cts = effectiveCts(tire)
  return (retail - buy - cts) / retail
}

function missingPlatforms(tire, nowMs) {
  let n = 0
  for (const p of PLATFORMS) {
    const ts = tire?.platformListings?.[p]?.lastPostedAt
    const ms = toMillis(ts)
    const isActive = ms != null && nowMs - ms < LISTING_STALE_MS
    if (!isActive) n += 1
  }
  return n
}

export function buildEnrichedTires(tires, velocityBySize, nowMs) {
  return (tires || []).map((t) => {
    const key = `${t?.size || ''}|${t?.lr || ''}`
    const v = velocityBySize[key] || { avgDaysToSell: null, sampleSize: 0 }
    return {
      ...t,
      daysSincePriceChange: computeDaysSincePriceChange(t, nowMs),
      avgDaysToSell: v.avgDaysToSell,
      velocitySampleSize: v.sampleSize,
      marginHeadroomPct: marginHeadroomPct(t),
      missingPlatformCount: missingPlatforms(t, nowMs),
      doNotList: Boolean(t?.doNotList),
      kyleFrozen: Boolean(t?.kyleFrozen),
    }
  })
}

/**
 * Subscribes to completed orders + tires and returns a ranked list per mode.
 * Caller owns the `mode` state; the hook memoizes the ranked result on (tires,
 * completed orders, mode) so ranker re-runs only when inputs actually change.
 */
export function useAdvisorSignals(mode = DEFAULT_ADVISOR_MODE) {
  const { tires, loading: tiresLoading } = useTires()
  const [completedOrders, setCompletedOrders] = useState([])
  const [ordersLoading, setOrdersLoading] = useState(true)
  const nowRef = useRef(Date.now())

  useEffect(() => {
    const q = query(collection(db, 'orders'), where('status', '==', 'completed'))
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
        setCompletedOrders(rows)
        setOrdersLoading(false)
      },
      () => setOrdersLoading(false),
    )
    return unsub
  }, [])

  const velocityBySize = useMemo(
    () => computeAvgDaysToSell(completedOrders, tires),
    [completedOrders, tires],
  )

  const ranked = useMemo(() => {
    const enriched = buildEnrichedTires(tires || [], velocityBySize, nowRef.current)
    return rankTires(enriched, mode)
  }, [tires, velocityBySize, mode])

  return {
    ranked,
    loading: tiresLoading || ordersLoading,
    mode,
  }
}
