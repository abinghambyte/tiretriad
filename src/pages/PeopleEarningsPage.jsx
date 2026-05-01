import { useState, useMemo } from 'react'
import { useUserProfile } from '../hooks/useUserProfile'
import { PendingAdjustmentsPanel } from '../components/people/PendingAdjustmentsPanel.jsx'

const SPLIT_KEYS = ['alex', 'dj', 'kyle']
const NAME_BY_KEY = { alex: 'Alex', dj: 'DJ', kyle: 'Kyle' }

function profileToCrewKey(profile) {
  const ck = profile?.crewKey
  if (typeof ck === 'string' && SPLIT_KEYS.includes(ck)) return ck
  const dn = String(profile?.displayName || profile?.name || '').toLowerCase()
  if (dn.includes('alex')) return 'alex'
  if (dn.includes('dj')) return 'dj'
  if (dn.includes('kyle')) return 'kyle'
  return null
}

export function PeopleEarningsPage() {
  const { profile } = useUserProfile()
  const role = String(profile?.role || '').toLowerCase()
  const isAdmin = role === 'admin'
  const ownKey = useMemo(() => profileToCrewKey(profile), [profile])
  const [tab, setTab] = useState(isAdmin ? 'alex' : ownKey)

  if (!profile) return null
  if (!isAdmin && !ownKey) {
    return (
      <div className="mx-auto max-w-3xl p-4 sm:p-6">
        <p className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 text-sm text-zinc-300">
          No crew member matched your account. Ask an admin to set your crewKey.
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <header>
        <h1 className="text-lg font-semibold text-zinc-100">Earnings</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Balance, totals, and any pending reconcile adjustments.
        </p>
      </header>
      {isAdmin ? (
        <div role="tablist" className="flex gap-2">
          {SPLIT_KEYS.map((k) => (
            <button
              key={k}
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={`rounded-lg border px-3 py-1.5 text-sm ${
                tab === k
                  ? 'border-amber-600 bg-amber-950/40 text-amber-100'
                  : 'border-zinc-700 text-zinc-300 hover:bg-zinc-800/40'
              }`}
            >
              {NAME_BY_KEY[k]}
            </button>
          ))}
        </div>
      ) : null}
      <PendingAdjustmentsPanel crewKey={isAdmin ? tab : ownKey} />
    </div>
  )
}
