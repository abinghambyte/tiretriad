import { onAuthStateChanged } from 'firebase/auth'
import { useEffect, useState } from 'react'
import { auth } from '../firebase/config'
import { isTestBypassEnabled, makeBypassUser } from '../firebase/testBypass.js'

export function useAuth() {
  const [user, setUser] = useState(undefined)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if ((import.meta.env.DEV || import.meta.env.VITE_E2E_BYPASS) && isTestBypassEnabled()) {
      queueMicrotask(() => {
        setUser(makeBypassUser())
        setLoading(false)
      })
      return undefined
    }
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u ?? null)
      setLoading(false)
    })
    return () => unsub()
  }, [])

  return { user, loading, isAuthenticated: !!user }
}
