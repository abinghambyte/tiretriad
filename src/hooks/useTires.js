import { collection, onSnapshot } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { db } from '../firebase/config'

export function useTires() {
  const [tires, setTires] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'tires'),
      (snap) => {
        const rows = snap.docs
          // Document id must win over any `id` field stored on the tire doc.
          .map((d) => ({ ...d.data(), id: d.id }))
          // Scrap-grade inventory is hidden from the margin tool (not sold).
          .filter((t) => String(t.grade || '').toLowerCase() !== 'scrap')
        setTires(rows)
        setLoading(false)
        setError(null)
      },
      (e) => {
        setError(e)
        setLoading(false)
      },
    )
    return () => unsub()
  }, [])

  return { tires, loading, error }
}
