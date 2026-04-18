import { useMemo } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { useUserProfile } from '../../hooks/useUserProfile'
import { WORKFORCE_URL } from '../../constants/externalUrls'
import { crewTagFromRole, permissionMeets } from '../../constants/peoplePermissions'
import { useDashboardSignals } from '../../hooks/useDashboardSignals'
import { formatCurrency, formatPercent, formatQty } from '../../utils/format'
import { timeAgo } from '../../utils/timeAgo'
import { CreditTrackerCard } from './CreditTrackerCard.jsx'
import { ProjectCard } from './ProjectCard'

const ORDER_ACTIVITY_STATUS = {
  pending: 'Pending',
  available: 'Available',
  scheduled: 'Scheduled',
  in_transit: 'In transit',
  completed: 'Complete',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
  prospective: 'Prospective',
  ready: 'Ready',
}

function activityStatusLabel(status) {
  const k = String(status || '').trim()
  return ORDER_ACTIVITY_STATUS[k] || (k ? k.replace(/_/g, ' ') : '—')
}

function activityCustomerLine(data) {
  const name = String(data.customerName || '').trim()
  if (name) return name
  const raw = String(data.customerContact || '').replace(/\D/g, '')
  if (raw.length >= 4) return `…${raw.slice(-4)}`
  return '—'
}

function activityTireLine(data) {
  const d = String(data.description || '').trim()
  if (d) return d
  return String(data.mspn || '—').trim()
}

function activityMarginDisplay(data) {
  const v = Number(data.marginPct ?? data.catalogMarginPct)
  if (Number.isFinite(v)) return formatPercent(v, 1)
  return '—'
}

function crewDisplayName(data) {
  const n = `${data.firstName || ''} ${data.lastName || ''}`.trim()
  return n || String(data.email || '—').trim()
}

function crewStatusLabel(data) {
  if (String(data.inviteStatus || '') === 'locked') return 'Locked'
  if (String(data.inviteStatus || '') === 'active' && !data.inviteAccepted) return 'Pending invite'
  return 'Active'
}

function crewRowTone(data) {
  if (String(data.inviteStatus || '') === 'locked') return 'bg-red-950/15 border-l-2 border-l-red-800/50'
  if (String(data.inviteStatus || '') === 'active' && !data.inviteAccepted) {
    return 'bg-amber-950/10 border-l-2 border-l-amber-700/40'
  }
  return ''
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

function SignalCard({ label, value, warn, to, loading }) {
  const n = value == null ? null : Number(value)
  const show = !loading && n != null
  const amber = warn && show && n > 0
  return (
    <Link
      to={to}
      className={[
        'block rounded-xl border p-4 transition-colors duration-200',
        amber
          ? 'border-amber-700/40 bg-amber-950/10 hover:border-amber-600/50 hover:bg-amber-950/20'
          : 'border-zinc-800 bg-zinc-900 hover:border-zinc-700 hover:bg-zinc-900/90',
      ].join(' ')}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      {loading ? (
        <div className="mt-2 h-8 w-16 animate-pulse rounded-md bg-zinc-800/80" />
      ) : (
        <p className="sk-figures mt-1 text-2xl font-semibold tabular-nums text-zinc-50">{show ? formatQty(n) : '—'}</p>
      )}
    </Link>
  )
}

export function Dashboard() {
  const { permissionFor, profile, loading: profileGate } = useUserProfile()
  const [searchParams, setSearchParams] = useSearchParams()
  const {
    catalogSkuDisplay,
    needsRepostingCount,
    tireSku,
    priceIntelResearched,
    crm,
    people,
    completedOrders,
    signalBar,
    recentActivity,
    catalogHealth,
    crewPreview,
  } = useDashboardSignals()

  const tireSignal = useMemo(() => {
    if (tireSku.loading || priceIntelResearched.loading) return 'Syncing catalog…'
    const n = priceIntelResearched.count ?? 0
    if (n === 0) {
      return `${formatQty(catalogSkuDisplay)} SKUs · price intel active — researching nightly`
    }
    return `${formatQty(catalogSkuDisplay)} SKUs · ${formatQty(n)} prices researched · intel active`
  }, [tireSku, priceIntelResearched, catalogSkuDisplay])

  const crmSignal = useMemo(() => {
    if (crm.loading) return 'Loading pipeline…'
    const a = crm.accounts ?? 0
    const l = crm.leads ?? 0
    const j = crm.openJobs ?? 0
    if (a === 0 && l === 0 && j === 0) return 'Pipeline empty — add your first VIP client'
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
    return `${n} orders completed · ${formatCurrency(rev)} total`
  }, [completedOrders])

  const modules = [
    {
      title: 'Skedaddle Tires',
      description:
        'Margin catalog, tire orders, and listing generator — Catalog, Orders, and generate listings from the Tires workspace.',
      stat: tireSignal,
      statLabel: 'Catalog',
      ctaLabel: 'Open Catalog',
      status: 'Live',
      accent: 'teal',
      icon: <IconTires />,
      to: '/tires',
      moduleKey: 'tires',
      minLevel: 'view',
    },
    {
      title: 'Rubber CRM',
      description:
        'Lead pipeline, VIP clients, and DJ dispatch for northern Colorado tire operations.',
      stat: crmSignal,
      statLabel: 'Pipeline',
      ctaLabel: 'View Pipeline',
      status: 'Live',
      accent: 'orange',
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
      statLabel: 'Crew',
      ctaLabel: 'Manage Crew',
      status: 'Live',
      accent: 'slate',
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
      statLabel: 'Outcomes',
      ctaLabel: 'See the Numbers',
      status: 'Live',
      accent: 'green',
      icon: <IconAnalytics />,
      to: '/analytics',
      moduleKey: 'analytics',
      minLevel: 'view',
    },
    {
      title: 'Growth Lab',
      description:
        'Automations, prototypes, and internal products before they earn a name. Task dispatcher routes work to the right model.',
      stat: 'Task routing · Overwatch workspace',
      statLabel: 'Status',
      ctaLabel: 'Open Lab',
      status: 'Live',
      accent: 'amber',
      icon: <IconGrowth />,
      to: '/growth',
      adminOnly: true,
    },
    {
      title: 'Ops Command',
      description:
        'Expenses, tax-prep CSV export, reorder queue, and inbound SMS relay to Slack (#fleet-ops).',
      stat: 'Admin runway',
      statLabel: 'Runway',
      ctaLabel: 'Run Ops',
      status: 'Live',
      accent: 'rose',
      icon: <IconOpsCommand />,
      to: '/ops',
      adminOnly: true,
    },
  ]

  const visibleModules = modules.filter((m) => {
    if (m.adminOnly && profile?.role !== 'admin') return false
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

  const sigLoading = signalBar.loading
  const recentLoading = recentActivity.loading
  const healthLoading = catalogHealth.loading
  const crewLoading = crewPreview.loading

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

      <main className="relative mx-auto max-w-6xl space-y-8 px-6 py-8 sm:py-10">
        {notice === 'access' ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-900/50 bg-amber-950/25 px-4 py-3 text-sm text-amber-100">
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

        <section aria-label="Operational signals">
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-500">Today</h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <SignalCard
              label="Pending orders"
              value={signalBar.pendingOrders}
              warn
              to="/orders"
              loading={sigLoading}
            />
            <SignalCard
              label="Needs Reposting"
              value={needsRepostingCount}
              warn
              to="/tires?needsReposting=true"
              loading={tireSku.loading}
            />
            <SignalCard
              label="Catalog size"
              value={signalBar.catalogSize}
              warn={false}
              to="/tires"
              loading={sigLoading}
            />
            <SignalCard
              label="Crew alerts"
              value={signalBar.crewAlerts}
              warn
              to="/people"
              loading={sigLoading}
            />
          </div>
        </section>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 sm:p-5">
            <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-500">Recent activity</h2>
            {recentLoading ? (
              <ul className="mt-4 space-y-3">
                {[1, 2, 3, 4, 5].map((k) => (
                  <li key={k} className="h-14 animate-pulse rounded-lg bg-zinc-800/60" />
                ))}
              </ul>
            ) : recentActivity.orders.length === 0 ? (
              <p className="mt-4 text-sm text-zinc-500">
                No orders yet.{' '}
                <Link to="/tires" className="text-amber-300 underline-offset-2 hover:underline">
                  Open the tire catalog
                </Link>{' '}
                to log a sale.
              </p>
            ) : (
              <ul className="mt-4 divide-y divide-zinc-800/80">
                {recentActivity.orders.map(({ id, data }) => {
                  const createdAt = data.createdAt
                  return (
                    <li key={id} className="flex flex-wrap items-start justify-between gap-2 py-3 first:pt-0">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-zinc-200">{activityTireLine(data)}</p>
                        <p className="mt-0.5 text-xs text-zinc-500">{activityCustomerLine(data)}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1 text-right">
                        <span className="rounded-full bg-zinc-800/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-300">
                          {activityStatusLabel(data.status)}
                        </span>
                        <span className="font-mono text-xs text-zinc-500">{activityMarginDisplay(data)}</span>
                        <span className="text-[10px] text-zinc-600">{timeAgo(createdAt) || '—'}</span>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 sm:p-5">
            <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-500">Catalog health</h2>
            {healthLoading ? (
              <div className="mt-4 space-y-3">
                {[1, 2, 3].map((k) => (
                  <div key={k} className="h-10 animate-pulse rounded-lg bg-zinc-800/60" />
                ))}
              </div>
            ) : (
              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex items-center justify-between gap-3 border-b border-zinc-800/60 pb-3">
                  <dt className="text-zinc-400">Total tires</dt>
                  <dd className="font-mono font-semibold tabular-nums text-zinc-100">
                    {formatQty(catalogHealth.total ?? 0)}
                  </dd>
                </div>
                <Link
                  to="/tires?overhead=missing"
                  className="group flex items-center justify-between gap-3 border-b border-zinc-800/60 pb-3 transition-colors hover:text-zinc-100"
                  title="Open the tires catalog filtered to rows still missing mount/delivery/other cost"
                >
                  <dt className="text-zinc-400 group-hover:text-zinc-200">Missing overhead</dt>
                  <dd
                    className={`font-mono font-semibold tabular-nums ${
                      (catalogHealth.missingOverhead ?? 0) > 0 ? 'text-amber-300' : 'text-zinc-100'
                    }`}
                  >
                    {formatQty(catalogHealth.missingOverhead ?? 0)}
                  </dd>
                </Link>
                <Link
                  to="/tires?margin=below-15"
                  className="group flex items-center justify-between gap-3 transition-colors hover:text-zinc-100"
                  title="Open the tires catalog filtered to rows under 15% listing margin"
                >
                  <dt className="text-zinc-400 group-hover:text-zinc-200">Below 15% margin</dt>
                  <dd
                    className={`font-mono font-semibold tabular-nums ${
                      (catalogHealth.lowMargin ?? 0) > 0 ? 'text-red-400' : 'text-zinc-100'
                    }`}
                  >
                    {formatQty(catalogHealth.lowMargin ?? 0)}
                  </dd>
                </Link>
              </dl>
            )}
          </section>
        </div>

        <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-500">Crew</h2>
            {crewPreview.hasMore ? (
              <Link to="/people" className="text-xs font-medium text-amber-300/90 hover:underline">
                View all →
              </Link>
            ) : null}
          </div>
          {crewLoading ? (
            <div className="mt-4 space-y-2">
              {[1, 2, 3, 4].map((k) => (
                <div key={k} className="h-10 animate-pulse rounded-lg bg-zinc-800/60" />
              ))}
            </div>
          ) : crewPreview.users.length === 0 ? (
            <p className="mt-4 text-sm text-zinc-500">No crew rows loaded.</p>
          ) : (
            <ul className="mt-4 divide-y divide-zinc-800/80">
              {crewPreview.users.map(({ id, data }) => (
                <li
                  key={id}
                  className={`flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0 ${crewRowTone(data)}`}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-zinc-200">{crewDisplayName(data)}</p>
                    <p className="text-[11px] text-zinc-500">
                      {String(data.crewTag || crewTagFromRole(data.role || 'viewer'))}
                    </p>
                  </div>
                  <div className="text-right text-xs text-zinc-400">
                    <p>{crewStatusLabel(data)}</p>
                    <p className="mt-0.5 font-mono text-[10px] text-zinc-600">
                      {timeAgo(data.lastLoginAt) || 'never'}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {!profileGate && profile?.role === 'admin' ? (
          <section aria-label="Credit tracker" className="rounded-xl border border-zinc-800/90 bg-zinc-950/60 p-1">
            <CreditTrackerCard compact />
          </section>
        ) : null}

        {/*
          Module tiles: secondary navigation. Bottom nav + sidebar already cover most routes on mobile,
          so tiles are hidden below sm. If these feel redundant on desktop too, confirm with Alex before removing.
        */}
        <section aria-label="Modules" className="hidden sm:block">
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-500">Modules</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visibleModules.map((m) => {
              const perm = m.moduleKey ? permissionFor(m.moduleKey) : 'none'
              const lockedTires =
                m.moduleKey === 'tires' &&
                m.to &&
                permissionMeets(perm, 'view') &&
                !permissionMeets(perm, 'edit')
              const isOverwatch =
                profile?.role === 'admin' || String(profile?.crewTag || '').trim() === 'Overwatch'
              const secondaryFooter =
                m.title === 'Growth Lab' && isOverwatch
                  ? { href: WORKFORCE_URL, label: 'Launch Dispatcher', external: true }
                  : undefined
              return (
                <ProjectCard
                  key={m.title}
                  title={m.title}
                  description={m.description}
                  stat={m.stat}
                  statLabel={m.statLabel}
                  ctaLabel={m.ctaLabel}
                  status={m.status}
                  accent={m.accent}
                  icon={m.icon}
                  to={m.to}
                  locked={Boolean(lockedTires)}
                  secondaryFooter={secondaryFooter}
                  compact
                />
              )
            })}
          </div>
        </section>
      </main>
    </div>
  )
}
