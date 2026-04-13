import { signOut } from 'firebase/auth'
import { doc, onSnapshot } from 'firebase/firestore'
import { useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { auth, db } from '../../firebase/config'
import { useUserProfile } from '../../hooks/useUserProfile'
import { permissionMeets } from '../../constants/peoplePermissions'
import { useAuth } from '../../hooks/useAuth'
import { useDashboardSignals } from '../../hooks/useDashboardSignals'
import { ProjectCard } from './ProjectCard'
import { PortalSessionLine } from '../layout/PortalSessionLine.jsx'

function IconTires() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden
    >
      <circle cx="12" cy="12" r="7.25" />
      <circle cx="12" cy="12" r="2.25" />
      <path strokeLinecap="round" d="M12 4.75v2M12 17.25v2M4.75 12h2M17.25 12h2" />
    </svg>
  )
}

function IconAnalytics() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden
    >
      <path strokeLinecap="round" d="M5 19V5M9 19v-6M13 19V9M17 19v-9" />
      <path strokeLinecap="round" d="M4 19h16" />
    </svg>
  )
}

function IconPeople() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden
    >
      <circle cx="9" cy="8" r="2.75" />
      <circle cx="16" cy="9" r="2.25" />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3.75 18.25v-.5a4 4 0 014-4h2.5a4 4 0 014 4v.5M14.25 18.25v-.25a3 3 0 013-3h1"
      />
    </svg>
  )
}

function IconGrowth() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 4.5l1.8 4.95 5.25.35-4 3.35 1.3 5.05L12 15.9l-4.35 2.4 1.3-5.05-4-3.35 5.25-.35L12 4.5z"
      />
    </svg>
  )
}

function IconCrm() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h10M4 18h16" />
      <circle cx="16" cy="8" r="2" fill="currentColor" />
    </svg>
  )
}

/** Tire business ops — not carrier / FedEx fleet tooling. */
function IconOpsCommand() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden
    >
      <path strokeLinecap="round" d="M6 8h12M6 12h8M6 16h10" />
      <rect x="4" y="5" width="16" height="14" rx="2" className="opacity-40" />
    </svg>
  )
}

export function Dashboard() {
  const { user } = useAuth()
  const { permissionFor, profile, loading: profileGate } = useUserProfile()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const { catalogSkuDisplay, tireSku, crm, people, completedOrders } = useDashboardSignals()
  const [djStreak, setDjStreak] = useState(undefined)

  useEffect(() => {
    const ref = doc(db, 'meta', 'djStats')
    return onSnapshot(
      ref,
      (snap) => {
        const n = snap.exists() ? Number(snap.data().currentStreak) || 0 : 0
        setDjStreak(n)
      },
      () => setDjStreak(0),
    )
  }, [])

  const tireSignal = useMemo(() => {
    if (tireSku.loading) return 'Syncing catalog…'
    const { pricedCount, avgMarginPriced } = tireSku
    const priced = pricedCount ?? 0
    if (priced === 0) {
      return `${catalogSkuDisplay} SKUs in catalog — add buy prices to unlock margin data`
    }
    const marginStr =
      avgMarginPriced != null && !Number.isNaN(avgMarginPriced)
        ? `${avgMarginPriced.toFixed(1)}% avg margin on priced SKUs`
        : 'margin pending'
    return `${catalogSkuDisplay} SKUs · ${priced} priced · ${marginStr}`
  }, [tireSku, catalogSkuDisplay])

  const crmSignal = useMemo(() => {
    if (crm.loading) return 'Loading pipeline…'
    const a = crm.accounts ?? 0
    const l = crm.leads ?? 0
    const j = crm.openJobs ?? 0
    if (a === 0 && l === 0 && j === 0) return 'Pipeline empty — add your first fleet account'
    return `${a} accounts · ${l} leads · ${j} open jobs`
  }, [crm])

  const peopleSignal = useMemo(() => {
    if (people.loading) return 'Counting crew and customers…'
    const u = people.users ?? 0
    const c = people.contacts ?? 0
    return `${u} crew · ${c} customers`
  }, [people])

  const analyticsSignal = useMemo(() => {
    if (completedOrders.loading) return 'Pulling order outcomes…'
    const n = completedOrders.count ?? 0
    const rev = completedOrders.revenue ?? 0
    if (n === 0) return 'No completed orders yet'
    const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
      rev,
    )
    return `${n} orders completed · ${money} total`
  }, [completedOrders])

  async function handleSignOut() {
    await signOut(auth)
    navigate('/', { replace: true })
  }

  const modules = [
    {
      title: 'Skedaddle Tires',
      description:
        'Margin catalog, tire orders, and listing generator — Catalog, Orders, and generate listings from the Tires workspace.',
      stat: tireSignal,
      status: 'Live',
      accent: 'amber',
      icon: <IconTires />,
      to: '/tires',
      moduleKey: 'tires',
      minLevel: 'view',
    },
    {
      title: 'Rubber CRM',
      description:
        'Lead pipeline, fleet accounts, and DJ dispatch for northern Colorado tire operations.',
      stat: crmSignal,
      status: 'Live',
      accent: 'violet',
      icon: <IconCrm />,
      to: '/crm',
      moduleKey: 'crm',
      minLevel: 'view',
    },
    {
      title: 'People Systems',
      description:
        'Crew access, invites, permission matrix, and customer contacts (Customers tab).',
      stat: peopleSignal,
      status: 'Live',
      accent: 'violet',
      icon: <IconPeople />,
      to: '/people',
      moduleKey: 'people',
      minLevel: 'manage',
    },
    {
      title: 'Analytics',
      description:
        'The Wall (completed orders), operational metrics from completions, and a revenue intelligence lane.',
      stat: analyticsSignal,
      status: 'Live',
      accent: 'blue',
      icon: <IconAnalytics />,
      to: '/analytics',
      moduleKey: 'analytics',
      minLevel: 'view',
    },
    {
      title: 'Growth Lab',
      description:
        'Automations, prototypes, and internal products before they earn a name. Nothing here ships without a deliberate pull.',
      stat: 'No public builds — access restricted',
      status: 'Locked',
      accent: 'fuchsia',
      icon: <IconGrowth />,
    },
    {
      title: 'Ops Command',
      description:
        'Future tire-business ops signals and runbooks — standing dashboards for Skedaddle operations (not carrier fleet ops).',
      stat: 'Standing signals classified',
      status: 'Buildout',
      accent: 'zinc',
      icon: <IconOpsCommand />,
    },
  ]

  const visibleModules = modules.filter((m) => {
    if (!m.moduleKey) return true
    return permissionMeets(permissionFor(m.moduleKey), m.minLevel)
  })

  if (!profileGate && profile && profile.handshakeSeen === false) {
    return <Navigate to="/handshake" replace />
  }

  const notice = searchParams.get('notice')
  function dismissNotice() {
    const next = new URLSearchParams(searchParams)
    next.delete('notice')
    setSearchParams(next, { replace: true })
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.35]"
        aria-hidden
        style={{
          backgroundImage: `
            radial-gradient(ellipse 100% 80% at 50% -30%, rgba(251, 191, 36, 0.12), transparent 55%),
            radial-gradient(ellipse 70% 50% at 100% 0%, rgba(34, 211, 238, 0.06), transparent 45%),
            linear-gradient(to bottom, rgba(9, 9, 11, 0.2), transparent 30%)
          `,
        }}
      />
      <div
        className="pointer-events-none fixed inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:64px_64px] opacity-[0.12]"
        aria-hidden
      />

      <header className="relative border-b border-zinc-800/90 bg-zinc-950/75 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-5 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
          <div className="flex min-w-0 flex-1 items-start gap-4">
            <div className="hidden h-10 w-px bg-gradient-to-b from-amber-500/50 via-zinc-600 to-cyan-500/40 sm:block" />
            <div className="min-w-0">
              <p className="hidden text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500 sm:block">
                Skedaddle OS · Operations grid
              </p>
              <h1 className="mt-0 text-xl font-semibold tracking-tight text-white sm:mt-1 sm:text-2xl">
                Operations overview
              </h1>
              <div className="mt-2 sm:hidden">
                <PortalSessionLine
                  email={user?.email || auth.currentUser?.email}
                  onSignOut={handleSignOut}
                />
              </div>
              {djStreak !== undefined ? (
                <p
                  className={`mt-2 text-sm font-medium ${
                    djStreak === 0
                      ? 'text-zinc-500'
                      : djStreak >= 3
                        ? 'text-amber-200/95'
                        : 'text-zinc-400'
                  }`}
                >
                  DJ streak: {djStreak} clean orders
                  {djStreak >= 3 ? ' 🔥' : ''}
                </p>
              ) : (
                <p className="mt-2 text-sm text-zinc-500">Loading DJ streak…</p>
              )}
            </div>
          </div>
          <div className="hidden sm:block">
            <PortalSessionLine
              email={user?.email || auth.currentUser?.email}
              onSignOut={handleSignOut}
            />
          </div>
        </div>
      </header>

      <main className="relative mx-auto max-w-6xl px-6 py-10 sm:py-12">
        {notice === 'access' ? (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-900/50 bg-amber-950/25 px-4 py-3 text-sm text-amber-100">
            <span>That module is not available for your current clearance.</span>
            <button
              type="button"
              onClick={dismissNotice}
              className="rounded-lg border border-amber-800/60 px-3 py-1 text-xs font-medium text-amber-200 hover:bg-amber-900/40"
            >
              Dismiss
            </button>
          </div>
        ) : null}
        <p className="mb-3 text-center text-xs text-zinc-600 sm:hidden">
          Scroll for more modules
        </p>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {visibleModules.map((m) => {
            const perm = m.moduleKey ? permissionFor(m.moduleKey) : 'none'
            const lockedTires =
              m.moduleKey === 'tires' &&
              m.to &&
              permissionMeets(perm, 'view') &&
              !permissionMeets(perm, 'edit')
            return (
              <ProjectCard
                key={m.title}
                title={m.title}
                description={m.description}
                stat={m.stat}
                status={m.status}
                accent={m.accent}
                icon={m.icon}
                to={m.to}
                locked={Boolean(lockedTires)}
              />
            )
          })}
        </div>
      </main>
    </div>
  )
}
