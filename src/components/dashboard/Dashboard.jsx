import { signOut } from 'firebase/auth'
import { doc, onSnapshot } from 'firebase/firestore'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { auth, db } from '../../firebase/config'
import { useAuth } from '../../hooks/useAuth'
import { usePortalRegisteredUserCount } from '../../hooks/usePortalRegisteredUserCount'
import { useTires } from '../../hooks/useTires'
import { marginPercent } from '../../utils/marginCalc'
import { ProjectCard } from './ProjectCard'

function IconOrders() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden
    >
      <path strokeLinecap="round" d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
    </svg>
  )
}

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

function IconOps() {
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
        d="M12 2l8 4v8l-8 4-8-4V6l8-4z"
      />
      <circle cx="12" cy="12" r="2" fill="currentColor" />
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

function IconRevenue() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden
    >
      <path strokeLinecap="round" d="M5 18V6M9 18V10M13 18v-5M17 18V8" />
      <path strokeLinecap="round" d="M4 18h16" />
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

export function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { tires, loading: tiresLoading } = useTires()
  const { count: registeredUsers, loading: registryLoading } =
    usePortalRegisteredUserCount()
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

  const tireSummary = useMemo(() => {
    if (tiresLoading) {
      return { n: 0, avg: null, loading: true }
    }
    const n = tires.length
    const margins = tires
      .map((t) => marginPercent(t.retailPrice, t.cts))
      .filter((m) => m != null && !Number.isNaN(m))
    const avg =
      margins.length > 0
        ? margins.reduce((a, b) => a + b, 0) / margins.length
        : null
    return { n, avg, loading: false }
  }, [tires, tiresLoading])

  const tireSignal = useMemo(() => {
    if (tireSummary.loading) return 'Syncing catalog…'
    const { n, avg } = tireSummary
    const skuPart =
      n === 0 ? '0 SKUs in catalog' : `${n} SKU${n === 1 ? '' : 's'} in tire catalog`
    const marginPart =
      avg != null ? ` · ${avg.toFixed(1)}% blended margin (CTS basis)` : ' · Margin data pending'
    return `${skuPart}${marginPart}`
  }, [tireSummary])

  const analyticsSignal = useMemo(() => {
    if (tireSummary.loading) return 'Pulling operational lens…'
    const { n, avg } = tireSummary
    const sku = n === 0 ? '0 SKUs' : `${n} SKU${n === 1 ? '' : 's'}`
    const margin =
      avg != null
        ? ` · ${avg.toFixed(1)}% blended margin (tire catalog)`
        : ' · margin band pending'
    return `Tire ops telemetry · ${sku}${margin}`
  }, [tireSummary])

  const revenueSignal = useMemo(() => {
    if (tireSummary.loading) return 'Margin channel loading…'
    const { avg } = tireSummary
    if (avg != null) {
      return `Revenue & margin (tire line) · ${avg.toFixed(1)}% vs CTS / retail`
    }
    return 'Revenue & margin (tire line) · CTS / retail spread pending'
  }, [tireSummary])

  const peopleSignal = useMemo(() => {
    if (registryLoading) return 'Resolving registered users…'
    if (typeof registeredUsers === 'number') {
      return `${registeredUsers} registered user${registeredUsers === 1 ? '' : 's'}`
    }
    return 'Registered users — not published to dashboard'
  }, [registeredUsers, registryLoading])

  async function handleSignOut() {
    await signOut(auth)
    navigate('/', { replace: true })
  }

  const modules = [
    {
      title: 'Skedaddle Tires',
      description:
        'Margin intelligence, marketplace listing scripts, and instant sale notifications to the fulfillment team.',
      stat: tireSignal,
      status: 'Live',
      accent: 'amber',
      icon: <IconTires />,
      to: '/tires',
    },
    {
      title: 'Tire Orders',
      description:
        'Slack-driven Kyle → DJ workflow. Notify customers via SMS link and mark orders complete when paid.',
      stat: 'Fleet-ops queue · customer SMS + completion',
      status: 'Live',
      accent: 'amber',
      icon: <IconOrders />,
      to: '/orders',
    },
    {
      title: 'Ops Command',
      description:
        'The leadership layer: posture across the operating fabric — what moves, what waits, and what is held in reserve. Compartmented detail; visibility by clearance.',
      stat: 'Executive grid · standing signals classified',
      status: 'Buildout',
      accent: 'cyan',
      icon: <IconOps />,
    },
    {
      title: 'Analytics',
      description:
        'Operational oversight through a single metrics lens — utilization, throughput, and exception bands. Framed for how the network actually runs, not slide decks.',
      stat: analyticsSignal,
      status: 'Buildout',
      accent: 'blue',
      icon: <IconAnalytics />,
    },
    {
      title: 'People Systems',
      description:
        'User management, team assignment, cadence, access control, pipeline delegation — the people layer at the edge of definition. Scope deliberately unfinished.',
      stat: peopleSignal,
      status: 'Internal',
      accent: 'violet',
      icon: <IconPeople />,
    },
    {
      title: 'Revenue & Margin',
      description:
        'Settlement posture, cost load, and profitability — distilled for decisions on the ground. Tire-line economics surfaced first; other lines follow.',
      stat: revenueSignal,
      status: 'Buildout',
      accent: 'emerald',
      icon: <IconRevenue />,
    },
    {
      title: 'Growth Lab',
      description:
        'Automations, prototypes, and internal products before they earn a name. Nothing here ships without a deliberate pull.',
      stat: 'No public builds · access restricted',
      status: 'Locked',
      accent: 'fuchsia',
      icon: <IconGrowth />,
    },
  ]

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
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-5">
          <div className="flex min-w-0 flex-1 items-center gap-4">
            <div className="hidden h-10 w-px bg-gradient-to-b from-amber-500/50 via-zinc-600 to-cyan-500/40 sm:block" />
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
                Skedaddle OS · Operations grid
              </p>
              <h1 className="mt-1 text-xl font-semibold tracking-tight text-white sm:text-2xl">
                Operations overview
              </h1>
              {djStreak !== undefined ? (
                <p className="mt-2 text-sm font-medium text-amber-200/95">
                  DJ streak: {djStreak} clean orders 🔥
                </p>
              ) : (
                <p className="mt-2 text-sm text-zinc-500">Loading DJ streak…</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden max-w-[220px] truncate text-sm text-zinc-400 sm:inline">
              {user?.email}
            </span>
            <button
              type="button"
              onClick={handleSignOut}
              className="rounded-lg border border-zinc-600/80 bg-zinc-900/50 px-3 py-2 text-sm text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-800/80 hover:text-white"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="relative mx-auto max-w-6xl px-6 py-10 sm:py-12">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {modules.map((m) => (
            <ProjectCard
              key={m.title}
              title={m.title}
              description={m.description}
              stat={m.stat}
              status={m.status}
              accent={m.accent}
              icon={m.icon}
              to={m.to}
            />
          ))}
        </div>
      </main>
    </div>
  )
}
