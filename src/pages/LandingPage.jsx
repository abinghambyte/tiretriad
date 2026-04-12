import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { LoginForm } from '../components/auth/LoginForm'
import { useAuth } from '../hooks/useAuth'

function postLoginPath(state) {
  const from = state?.from
  if (
    typeof from === 'string' &&
    from.startsWith('/') &&
    !from.startsWith('//') &&
    !from.includes('..')
  ) {
    return from
  }
  return '/dashboard'
}

export function LandingPage() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const savedFrom = location.state?.from

  useEffect(() => {
    if (!loading && user) {
      navigate(postLoginPath({ from: savedFrom }), { replace: true })
    }
  }, [user, loading, navigate, savedFrom])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-500">
        <p className="animate-pulse text-sm">Loading…</p>
      </div>
    )
  }

  if (user) return null

  return (
    <div className="relative min-h-screen overflow-hidden bg-zinc-950 text-zinc-100">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background:
            'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(120, 120, 180, 0.25), transparent), radial-gradient(ellipse 60% 40% at 100% 100%, rgba(60, 60, 80, 0.4), transparent)',
        }}
      />
      <div className="pointer-events-none absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%2240%22%20height=%2240%22%3E%3Cfilter%20id=%22n%22%3E%3CfeTurbulence%20type=%22fractalNoise%22%20baseFrequency=%220.9%22%20numOctaves=%223%22%20stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect%20width=%22100%25%22%20height=%22100%25%22%20filter=%22url(%23n)%22%20opacity=%220.06%22/%3E%3C/svg%3E')]" />

      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-6 py-16">
        <div className="sk-animate-fade-up mb-12">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900/60 text-2xl font-semibold tracking-tight text-zinc-100 shadow-lg shadow-black/40">
            S
          </div>
          <h1 className="text-center text-3xl font-light tracking-[0.2em] text-zinc-100 sm:text-4xl">
            SKEDADDLE
          </h1>
        </div>
        <LoginForm
          onSuccess={() =>
            navigate(postLoginPath({ from: savedFrom }), { replace: true })
          }
        />
      </div>
    </div>
  )
}
