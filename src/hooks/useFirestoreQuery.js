import { useEffect, useState } from 'react'
import { onSnapshot } from 'firebase/firestore'
import { db } from '../firebase/config.js'

function isThenable(value) {
  return value != null && typeof value.then === 'function'
}

export function useFirestoreQuery(buildQuery, deps = []) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    let unsubscribe = () => {}

    const built = buildQuery(db)
    if (built === null) {
      setData(null)
      setLoading(false)
      setError(null)
      return () => {
        cancelled = true
        unsubscribe()
      }
    }

    setLoading(true)
    setError(null)

    if (isThenable(built)) {
      built
        .then((snap) => {
          if (cancelled) return
          setData(snap)
          setLoading(false)
          setError(null)
        })
        .catch((err) => {
          if (cancelled) return
          setError(err)
          setLoading(false)
        })
    } else {
      unsubscribe = onSnapshot(
        built,
        (snap) => {
          if (cancelled) return
          setData(snap)
          setLoading(false)
          setError(null)
        },
        (err) => {
          if (cancelled) return
          setError(err)
          setLoading(false)
        },
      )
    }

    return () => {
      cancelled = true
      unsubscribe()
    }
    // deps list is the explicit contract (mirrors caller-controlled query inputs).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return { data, loading, error }
}
