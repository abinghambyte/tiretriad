// src/hooks/useAdvisorSignals.js
import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useTires } from './useTires.js'
import { rankTires } from '../utils/listingAdvisor/ranker.js'
import { DEFAULT_ADVISOR_MODE } from '../utils/listingAdvisor/modeWeights.js'
import { tireLandedBuyNumber } from '../utils/tireLandedBuy.js'
import { tireCatalogRetailNumber } from '../utils/tireCatalogRetail'
import { effectiveCts } from '../utils/ctsCalc'
import { usePayoutConfig } from './usePayoutConfig.js'

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
 * Intake timestamp for a tire. Falls back to the earliest priceIntel source
 * timestamp when `createdAt` is not set (most tires in prod).
 */
function tireIntakeMs(tire) {
  const created = toMillis(tire?.createdAt)
  if (created) return created
  const sources = Array.isArray(tire?.priceIntel?.sources) ? tire.priceIntel.sources : []
  let earliest = null
  for (const entry of sources) {
    const ms = toMillis(entry?.at) ?? toMillis(entry?.recordedAt)
    if (ms && (!earliest || ms < earliest)) earliest = ms
  }
  return earliest
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
    // Use the tire's computed intake (createdAt or earliest priceIntel source)
    // so velocity math works for tires that never got a createdAt stamp.
    const intakeMs = tire ? tireIntakeMs(tire) : null
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

function marginHeadroomPct(tire, taxes) {
  const retail = tireCatalogRetailNumber(tire)
  if (retail <= 0) return 0
  const buy = tireLandedBuyNumber(tire, taxes)
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

/**
 * Days since the SKU was last posted on any platform. When the SKU has never
 * been posted anywhere, fall back to days since catalog intake so the ranker
 * has a meaningful "been sitting unposted for N days" signal. Without the
 * fallback, never-posted tires tie at 0 on this dimension and the mode
 * weights cannot differentiate them.
 */
export function computeDaysSinceLastListed(tire, nowMs) {
  const listings = tire?.platformListings || {}
  let latest = 0
  for (const p of PLATFORMS) {
    const ms = toMillis(listings[p]?.lastPostedAt)
    if (ms && ms > latest) latest = ms
  }
  if (!latest) {
    const intake = tireIntakeMs(tire)
    if (!intake) return null
    const diff = Math.floor((nowMs - intake) / MS_PER_DAY)
    return diff < 0 ? 0 : diff
  }
  const diffDays = Math.floor((nowMs - latest) / MS_PER_DAY)
  return diffDays < 0 ? 0 : diffDays
}

export function buildEnrichedTires(tires, velocityBySize, nowMs, taxes) {
  return (tires || []).map((t) => {
    const key = `${t?.size || ''}|${t?.lr || ''}`
    const v = velocityBySize[key] || { avgDaysToSell: null, sampleSize: 0 }
    return {
      ...t,
      daysSinceLastListed: computeDaysSinceLastListed(t, nowMs),
      daysSincePriceChange: computeDaysSincePriceChange(t, nowMs),
      avgDaysToSell: v.avgDaysToSell,
      velocitySampleSize: v.sampleSize,
      marginHeadroomPct: marginHeadroomPct(t, taxes),
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
  const { config: payoutCfg } = usePayoutConfig()
  const taxes = payoutCfg && typeof payoutCfg === 'object' ? payoutCfg.taxes : null
  const [completedOrders, setCompletedOrders] = useState([])
  const [ordersLoading, setOrdersLoading] = useState(true)
  // Lazy init keeps "now" stable for the hook's lifetime without calling an
  // impure function during render (React Compiler purity rule).
  const [nowMs] = useState(() => Date.now())

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
    const enriched = buildEnrichedTires(tires || [], velocityBySize, nowMs, taxes)
    return rankTires(enriched, mode)
  }, [tires, velocityBySize, mode, nowMs, taxes])

  return {
    ranked,
    loading: tiresLoading || ordersLoading,
    mode,
  }
}
