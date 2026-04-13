import { signOut } from 'firebase/auth'
import { useCallback } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { auth } from '../firebase/config'
import { PeopleDashboard } from '../components/people/PeopleDashboard'
import { ContactsPage } from './ContactsPage'
import { PortalSessionLine } from '../components/layout/PortalSessionLine.jsx'
import { useAuth } from '../hooks/useAuth'

export function PeoplePage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = searchParams.get('tab') === 'customers' ? 'customers' : 'crew'

  const setTab = useCallback(
    (next) => {
      const p = new URLSearchParams(searchParams)
      if (next === 'customers') p.set('tab', 'customers')
      else p.delete('tab')
      setSearchParams(p, { replace: true })
    },
    [searchParams, setSearchParams],
  )

  async function handleSignOut() {
    await signOut(auth)
    navigate('/', { replace: true })
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="sticky top-0 z-20 border-b border-zinc-800/80 bg-zinc-950/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-4 sm:px-6 sm:py-4">
          <div className="min-w-0">
            <Link to="/dashboard" className="text-sm text-zinc-500 transition hover:text-zinc-200">
              ← Dashboard
            </Link>
            <h1 className="mt-2 text-xl font-semibold text-white">People Systems</h1>
            <p className="mt-1 text-sm text-zinc-500">Crew access and customer contacts</p>
            <div className="mt-3 flex flex-wrap gap-2" role="tablist" aria-label="People sections">
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'crew'}
                onClick={() => setTab('crew')}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition ${
                  tab === 'crew'
                    ? 'bg-violet-500/20 text-violet-100 ring-1 ring-violet-600/50'
                    : 'bg-zinc-900 text-zinc-500 ring-1 ring-zinc-800 hover:text-zinc-300'
                }`}
              >
                Crew
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'customers'}
                onClick={() => setTab('customers')}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition ${
                  tab === 'customers'
                    ? 'bg-emerald-500/15 text-emerald-100 ring-1 ring-emerald-700/45'
                    : 'bg-zinc-900 text-zinc-500 ring-1 ring-zinc-800 hover:text-zinc-300'
                }`}
              >
                Customers
              </button>
            </div>
            <div className="mt-2 sm:hidden">
              <PortalSessionLine email={user?.email || auth.currentUser?.email} onSignOut={handleSignOut} />
            </div>
          </div>
          <div className="hidden sm:block">
            <PortalSessionLine email={user?.email || auth.currentUser?.email} onSignOut={handleSignOut} />
          </div>
        </div>
      </header>

      {tab === 'crew' ? <PeopleDashboard omitPageChrome /> : <ContactsPage embedded />}
    </div>
  )
}
