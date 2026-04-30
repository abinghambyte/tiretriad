import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase/config'

/**
 * Live reader for `meta/categoryMap`. Returns `{ categoryMap, loading }`.
 *
 * `categoryMap` is `null` when the doc is missing or before the first
 * snapshot lands. Otherwise it's the doc's `data()` shape:
 * `{ mspns: Record<string, 'passenger' | 'lightTruck' | 'truck'>, importedAt, ... }`.
 *
 * Extracted from `useDashboardSignals` so consumers that only need this slice
 * do not pay for the rest of the dashboard data load.
 */
export function useCategoryMap() {
  const [categoryMap, setCategoryMap] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const ref = doc(db, 'meta', 'categoryMap')
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setCategoryMap(snap.exists() ? snap.data() || null : null)
        setLoading(false)
      },
      (err) => {
        console.error('useCategoryMap snapshot error', err)
        setLoading(false)
      },
    )
    return () => unsub()
  }, [])

  return { categoryMap, loading }
}
