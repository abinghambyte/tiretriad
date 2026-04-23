// src/hooks/useAdvisorNarrate.js
import { useCallback } from 'react'
import { httpsCallable } from 'firebase/functions'
import { functions } from '../firebase/config'

const advisorNarrateCallable = httpsCallable(functions, 'advisorNarrate')

const PLATFORMS = ['facebook', 'offerup', 'craigslist']
const MS_PER_DAY = 24 * 60 * 60 * 1000

function tireCreatedMs(tire) {
  const raw = tire?.createdAt
  if (!raw) return null
  if (typeof raw.toMillis === 'function') return raw.toMillis()
  if (raw instanceof Date) return raw.getTime()
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

function missingPlatformNames(tire) {
  const pl = tire?.platformListings || {}
  // Anything not currently "active" on a platform (missing OR stale) counts
  // as missing here. The listing-advisor ranker already decided what "active"
  // means when computing missingPlatformCount; we just forward the names.
  const STALE_MS = 7 * MS_PER_DAY
  const now = Date.now()
  const out = []
  for (const p of PLATFORMS) {
    const ts = pl[p]?.lastPostedAt
    const ms = ts?.toMillis ? ts.toMillis() : Number(ts)
    if (!Number.isFinite(ms) || now - ms >= STALE_MS) out.push(p)
  }
  return out
}

/**
 * Build the signals payload forwarded alongside `tireId` + `mode`. Mirrors
 * spec § Payload. The server re-sanitizes (so we only need to be roughly
 * correct here); unknown fields get dropped server-side.
 */
export function buildSignalsFromTire(tire) {
  if (!tire || typeof tire !== 'object') return null
  const createdMs = tireCreatedMs(tire)
  const daysInStock = createdMs ? Math.max(0, Math.floor((Date.now() - createdMs) / MS_PER_DAY)) : null
  // buildEnrichedTires exposes these directly on the ranked tire.
  return {
    daysInStock,
    daysSincePriceChange: tire.daysSincePriceChange ?? null,
    avgDaysToSell: tire.avgDaysToSell ?? null,
    velocitySampleSize: tire.velocitySampleSize ?? null,
    missingPlatforms: missingPlatformNames(tire),
    margin: {
      // Raw numbers; server normalizes shape.
      retail: tire?.priceIntel?.retailPrice ?? null,
      buy: tire?.priceIntel?.activeBuyPrice ?? tire?.price ?? null,
      overhead:
        Number(tire?.mountCost || 0) + Number(tire?.deliveryCost || 0) + Number(tire?.otherCost || 0),
      headroomPct: tire.marginHeadroomPct ?? null,
    },
    rankScore: tire.rankScore ?? null,
    signalBreakdown: tire.signalBreakdown ?? null,
  }
}

export function useAdvisorNarrate() {
  return useCallback(async (tireId, mode, tire = null) => {
    const signals = tire ? buildSignalsFromTire(tire) : null
    const res = await advisorNarrateCallable({ tireId, mode, signals })
    return res.data || { narrative: '', shadowFlag: '' }
  }, [])
}
