import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useUserProfile } from '../hooks/useUserProfile'
import { permissionMeets } from '../constants/peoplePermissions'

/**
 * @param {object} props
 * @param {import('react').ReactNode} props.children
 * @param {string} [props.module] Firestore permissions key: tires | orders | people | …
 * @param {'none'|'view'|'edit'|'act'|'manage'} [props.level] Required permission rank
 * @param {boolean} [props.requireAdmin] Overwatch (admin role) only — others go to dashboard
 */
export function ProtectedRoute({ children, module, level, requireAdmin }) {
  const { user, loading: authLoading } = useAuth()
  const { profile, loading: profileLoading, error, permissionFor } = useUserProfile()
  const location = useLocation()

  const loading = authLoading || (Boolean(user) && profileLoading)

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-400">
        <p className="animate-pulse text-sm tracking-wide">Loading…</p>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/" replace state={{ from: location.pathname }} />
  }

  if (error && !profile) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-zinc-950 px-6 text-center text-red-300">
        <p className="max-w-md text-sm">
          Could not load your profile. Try signing out and back in, or contact an admin.
        </p>
        <p className="font-mono text-xs text-red-400/80">{String(error.message || error)}</p>
      </div>
    )
  }

  if (requireAdmin && String(profile?.role || '') !== 'admin') {
    return <Navigate to="/dashboard" replace />
  }

  if (module && level) {
    const current = permissionFor(module)
    if (!permissionMeets(current, level)) {
      return (
        <Navigate
          to="/dashboard?notice=access"
          replace
          state={{ from: location.pathname, module, level }}
        />
      )
    }
  }

  return children
}
