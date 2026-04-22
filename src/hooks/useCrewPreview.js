import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  Timestamp,
  where,
} from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { db } from '../firebase/config'
import { useTires } from './useTires'
import { deriveCrewSignals } from './useDashboardSignals'

const STREAK_CAP = 99

/**
 * Shared crew-preview loader. Returns the same `crewPreview` and `crewSignals`
 * shapes that `useDashboardSignals` exposes, but without the rest of the
 * dashboard payload. Used by any surface that wants the crew widget without
 * dragging in the full dashboard signals hook (e.g. /people).
 */
export function useCrewPreview() {
  const { tires } = useTires()

  const [crewPreview, setCrewPreview] = useState({
    users: /** @type {Array<{ id: string, data: Record<string, unknown> }>} */ ([]),
    hasMore: false,
    loading: true,
  })

  const [crewSignals, setCrewSignals] = useState(
    /** @type {{ map: Record<string, { wipCount: number, todayCompletions: number, streakDays: number, queueCount: number, lastSeenAt: number | null }>, loading: boolean }} */
    ({ map: {}, loading: true }),
  )

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
        console.error('crew preview', e)
        if (!cancelled) setCrewPreview({ users: [], hasMore: false, loading: false })
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
        const startTs = Timestamp.fromMillis(Date.now() - STREAK_CAP * 86400000)
        const [usersSnap, wipSnap, completedSnap] = await Promise.all([
          getDocs(query(collection(db, 'users'), limit(200))),
          getDocs(
            query(collection(db, 'orders'), where('status', 'not-in', ['completed', 'cancelled'])),
          ),
          getDocs(
            query(
              collection(db, 'orders'),
              where('status', '==', 'completed'),
              where('completedAt', '>=', startTs),
              orderBy('completedAt', 'desc'),
              limit(2000),
            ),
          ),
        ])
        if (cancelled) return
        const users = usersSnap.docs.map((d) => ({ id: d.id, data: d.data() }))
        const orders = [
          ...wipSnap.docs.map((d) => ({ id: d.id, data: d.data() })),
          ...completedSnap.docs.map((d) => ({ id: d.id, data: d.data() })),
        ]
        const map = deriveCrewSignals(users, orders, tires || [], Date.now())
        setCrewSignals({ map, loading: false })
      } catch (e) {
        console.error('crew signals', e)
        if (!cancelled) setCrewSignals({ map: {}, loading: false })
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { crewPreview, crewSignals }
}
