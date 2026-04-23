// src/hooks/useAdvisorSignals.js
import { useEffect, useMemo, useRef, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useTires } from './useTires.js'
import { rankTires } from '../utils/listingAdvisor/ranker.js'
import { DEFAULT_ADVISOR_MODE } from '../utils/listingAdvisor/modeWeights.js'

const MS_PER_DAY = 24 * 60 * 60 * 1000

function toMillis(maybeTs) {
  if (!maybeTs) return null
  if (typeof maybeTs.toMillis === 'function') return maybeTs.toMillis()
  if (maybeTs instanceof Date) return maybeTs.getTime()
  const n = Number(maybeTs)
  return Number.isFinite(n) ? n : null
}

export function computeDaysSincePriceChange(tire, nowMs) {
  const hist = Array.isArray(tire?.priceHistory) ? tire.priceHistory : []
  let latest = 0
  for (const entry of hist) {
    const ms = toMillis(entry?.at)
    if (ms && ms > latest) latest = ms
  }
  if (!latest) return 0
  const diffDays = Math.floor((nowMs - latest) / MS_PER_DAY)
  return diffDays < 0 ? 0 : diffDays
}

export function computeAvgDaysToSell(orders) {
  const acc = {}
  for (const o of orders || []) {
    if (!o || o.status !== 'completed') continue
    const intakeMs = toMillis(o.intakeAt)
    const completedMs = toMillis(o.completedAt)
    if (!intakeMs || !completedMs) continue
    const key = `${o.size || ''}|${o.lr || ''}`
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
  const price = Number(tire?.price) || 0
  if (price <= 0) return 0
  const buy = Number(tire?.buyPrice) || 0
  const cts = Number(tire?.ctsTotal) || 0
  return (price - buy - cts) / price
}

function missingPlatforms(tire) {
  let n = 0
  if (!tire?.listedEbay) n += 1
  if (!tire?.listedMarketplace) n += 1
  if (!tire?.listedCraigslist) n += 1
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
      missingPlatformCount: missingPlatforms(t),
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

  const velocityBySize = useMemo(() => computeAvgDaysToSell(completedOrders), [completedOrders])

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
