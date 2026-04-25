import { doc, onSnapshot } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { db } from '../firebase/config'

/**
 * Subscribe to `meta/payoutConfig`. Returns the doc data plus a loading
 * flag. Used wherever the app needs the admin-configured floor margin,
 * crew payout split, etc.
 *
 * @returns {{
 *   config: Record<string, unknown> | null,
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

  return { config, loading, error }
}
