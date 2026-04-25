import { doc, onSnapshot } from 'firebase/firestore'
import { useEffect, useMemo, useState } from 'react'
import { db } from '../firebase/config'

/**
 * Subscribe to `meta/payoutConfig`. Returns the doc data, a derived
 * `marginFloorPct` (always a percent number), plus loading/error flags.
 *
 * Field-shape note: backend code (functions/researchQueue.js, scripts/) reads
 * `marginFloor` as a FRACTION (e.g. 0.15 = 15%). The visual layer wants a
 * PERCENT (15). This hook normalizes both shapes into one `marginFloorPct`
 * value with this resolution order:
 *   1. `marginFloorPct` if explicitly set (newer field, percent)
 *   2. `marginFloor * 100` if the legacy fraction is set
 *   3. 20% default when neither is present
 *
 * @returns {{
 *   config: Record<string, unknown> | null,
 *   marginFloorPct: number,
 *   loading: boolean,
 *   error: Error | null,
 * }}
 */
export function usePayoutConfig() {
  const [config, setConfig] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const ref = doc(db, 'meta', 'payoutConfig')
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setConfig(snap.exists() ? snap.data() : null)
        setLoading(false)
        setError(null)
      },
      (err) => {
        setError(err)
        setLoading(false)
      },
    )
    return () => unsub()
  }, [])

  const marginFloorPct = useMemo(() => deriveMarginFloorPct(config), [config])

  return { config, marginFloorPct, loading, error }
}

/**
 * Resolve marginFloorPct from either `marginFloorPct` (percent) or
 * `marginFloor` (fraction). Exported for unit testing.
 */
export function deriveMarginFloorPct(config) {
  if (!config) return 20
  const pct = Number(config.marginFloorPct)
  if (Number.isFinite(pct) && pct > 0) return pct
  const fraction = Number(config.marginFloor)
  if (Number.isFinite(fraction) && fraction > 0) return fraction * 100
  return 20
}
