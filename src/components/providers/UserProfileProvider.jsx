import { httpsCallable } from 'firebase/functions'
import { doc, onSnapshot } from 'firebase/firestore'
import { useEffect, useMemo, useState } from 'react'
import { UserProfileContext } from '../../context/UserProfileContext.jsx'
import { db, functions } from '../../firebase/config'
import { useAuth } from '../../hooks/useAuth'

const ensureUserDocument = httpsCallable(functions, 'ensureUserDocument')

export function UserProfileProvider({ children }) {
  const { user, loading: authLoading } = useAuth()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (authLoading) return undefined

    if (!user) {
      queueMicrotask(() => {
        setProfile(null)
        setLoading(false)
        setError(null)
      })
      return undefined
    }

    queueMicrotask(() => setLoading(true))
    const ref = doc(db, 'users', user.uid)

    const unsub = onSnapshot(
      ref,
      async (snap) => {
        if (!snap.exists()) {
          try {
            await ensureUserDocument()
          } catch (e) {
            console.error(e)
            setError(e)
            setLoading(false)
          }
          return
        }
        setProfile({ uid: snap.id, ...snap.data() })
        setError(null)
        setLoading(false)
      },
      (e) => {
        console.error(e)
        setError(e)
        setLoading(false)
      },
    )

    return () => unsub()
  }, [user, authLoading])

  const value = useMemo(
    () => ({
      profile,
      loading: authLoading || (Boolean(user) && loading),
      error,
      permissionFor(module) {
        const p = profile?.permissions?.[module]
        return typeof p === 'string' ? p : 'none'
      },
    }),
    [profile, loading, authLoading, user, error],
  )

  return (
    <UserProfileContext.Provider value={value}>{children}</UserProfileContext.Provider>
  )
}
