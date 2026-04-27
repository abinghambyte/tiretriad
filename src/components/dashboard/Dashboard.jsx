import { useMemo } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useUserProfile } from '../../hooks/useUserProfile'
import { useDashboardSignals } from '../../hooks/useDashboardSignals'
import { formatPercent } from '../../utils/format'
import { timeAgo } from '../../utils/timeAgo'
import { TodayStrip } from './TodayStrip'
import { ActivityTicker } from './ActivityTicker'
import { HiddenGemsSurface } from './HiddenGemsSurface'
import { NextToPostSurface } from './NextToPostSurface.jsx'
import { flags } from '../../utils/featureFlags.js'
import { StatusPill } from '../ui/StatusPill.jsx'
import { statusPillTone } from '../ui/statusPillTone.js'
import { EmptyState } from '../shared/EmptyState.jsx'

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
  return ORDER_ACTIVITY_STATUS[k] || (k ? k.replace(/_/g, ' ') : '-')
}

function activityCustomerLine(data) {
  const name = String(data.customerName || '').trim()
  if (name) return name
  const raw = String(data.customerContact || '').replace(/\D/g, '')
  if (raw.length >= 4) return `…${raw.slice(-4)}`
  return '-'
}

function activityTireLine(data) {
  const d = String(data.description || '').trim()
  if (d) return d
  return String(data.mspn || '-').trim()
}

function activityMarginDisplay(data) {
  const v = Number(data.marginPct ?? data.catalogMarginPct)
  if (Number.isFinite(v)) return formatPercent(v, 1)
  return '-'
}

function orderIdShort(id) {
  const s = String(id || '').replace(/\s/g, '')
  if (!s) return ''
  return `#${s.slice(0, 8)}`
}

export function Dashboard() {
  const { profile, loading: profileGate } = useUserProfile()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const {
    needsRepostingCount,
    signalBar,
    recentActivity,
    hiddenGems,
    topSellers,
    allTimeMargin,
    lastSale,
    advisorRanked,
    advisorLoading,
    kylesQueueCount,
    crm,
  } = useDashboardSignals()

  const topAdvisorPick = Array.isArray(advisorRanked) && advisorRanked.length > 0 ? advisorRanked[0] : null
  const tickerChips = useMemo(() => {
    const chips = []
    const gemCount = Array.isArray(hiddenGems) ? hiddenGems.length : 0
    if (gemCount > 0) {
      chips.push({
        id: 'gems',
        kind: 'inventory',
        label: `${gemCount} hidden ${gemCount === 1 ? 'gem' : 'gems'} to post`,
      })
    }
    if (topAdvisorPick?.sku) {
      chips.push({
        id: 'advisor-top',
        kind: 'inventory',
        label: `Post next: ${topAdvisorPick.sku}`,
        href: '/tires?tab=catalog',
      })
    }
    const repostCount = Number(needsRepostingCount) || 0
    if (repostCount > 0) {
      chips.push({
        id: 'repost',
        kind: 'inventory',
        label: `${repostCount} ${repostCount === 1 ? 'listing needs' : 'listings need'} reposting`,
      })
    }
    const kq = Number(kylesQueueCount) || 0
    if (kq > 0) {
      chips.push({
        id: 'kyle-queue',
        kind: 'kyle',
        label: `${kq} in research queue`,
        href: '/my-queue',
      })
    }
    const pending = Number(signalBar?.pendingOrders) || 0
    if (pending > 0) {
      chips.push({
        id: 'pending-orders',
        kind: 'ops',
        label: `${pending} pending ${pending === 1 ? 'order' : 'orders'}`,
        href: '/orders',
      })
    }
    const crewAlerts = Number(signalBar?.crewAlerts) || 0
    if (crewAlerts > 0) {
      chips.push({
        id: 'crew',
        kind: 'ops',
        label: `${crewAlerts} crew ${crewAlerts === 1 ? 'alert' : 'alerts'}`,
        href: '/people?tab=crew',
      })
    }
    const openJobs = Number(crm?.openJobs) || 0
    if (openJobs > 0) {
      chips.push({
        id: 'crm-jobs',
        kind: 'people',
        label: `${openJobs} open CRM ${openJobs === 1 ? 'job' : 'jobs'}`,
        href: '/crm?tab=jobs',
      })
    }
    return chips
  }, [hiddenGems, topAdvisorPick, needsRepostingCount, kylesQueueCount, signalBar?.pendingOrders, signalBar?.crewAlerts, crm?.openJobs])

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

  function handleGemPost(id) {
    if (id === '__all__') {
      navigate('/tires?tab=catalog&hiddenGems=true')
    } else {
      navigate(`/tires?tab=catalog&highlight=${encodeURIComponent(id)}`)
    }
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

      <main className="relative mx-auto max-w-6xl space-y-6 px-6 py-8 sm:py-10">
        {/* Visually-hidden top-level heading. The dashboard relies on
            breadcrumbs + tab chips for visual orientation, but assistive tech
            (and WAVE) require a single h1 per page so users have a stable
            landmark to jump to. */}
        <h1 className="sr-only">Dashboard</h1>
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

        {signalBar.error ? (
          <div
            role="status"
            className="rounded-xl border border-rose-900/50 bg-rose-950/25 px-4 py-3 text-sm text-rose-100"
          >
            Live counts unavailable. Showing zeros; refresh to retry.
          </div>
        ) : null}

        <TodayStrip
          pendingOrders={signalBar.pendingOrders}
          topSellers={topSellers}
          lastSale={lastSale}
          allTimeMargin={allTimeMargin}
          loading={sigLoading}
        />

        <ActivityTicker chips={tickerChips} />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section className="pc-card rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 sm:p-5">
            <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-400">Recent activity</h2>
            {recentLoading ? (
              <ul className="mt-4 space-y-3">
                {[1, 2, 3, 4, 5].map((k) => (
                  <li key={k} className="h-14 animate-pulse rounded-lg bg-zinc-800/60" />
                ))}
              </ul>
            ) : recentActivity.orders.length === 0 ? (
              <div className="mt-4 flex flex-col items-center gap-2">
                {/* Generic inbox icon, not the brand bolt — see
                    docs/superpowers/audits/2026-04-26-comprehensive-ui-ux-audit.md
                    §0.3: the lightning bolt is wayfinding, not placeholder. */}
                <svg
                  className="h-7 w-7 text-zinc-600"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  aria-hidden
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M22 12h-6l-2 3h-4l-2-3H2" />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"
                  />
                </svg>
                <EmptyState variant="compact" title="No orders yet." />
              </div>
            ) : (
              <ul className="mt-4 divide-y divide-zinc-800/80">
                {recentActivity.orders.map(({ id, data }) => {
                  const createdAt = data.createdAt
                  const hasTireDescription = Boolean(String(data.description || '').trim())
                  const idLabel = orderIdShort(id) || '-'
                  const statusLabel = activityStatusLabel(data.status)
                  const when = timeAgo(createdAt) || '-'
                  if (!hasTireDescription) {
                    return (
                      <li key={id} className="py-3 first:pt-0">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-zinc-300">
                          <Link
                            to={`/orders?highlight=${encodeURIComponent(id)}`}
                            className="font-mono text-zinc-200 underline-offset-2 hover:underline"
                          >
                            {idLabel}
                          </Link>
                          <span className="text-zinc-600" aria-hidden>
                            ·
                          </span>
                          <StatusPill tone={statusPillTone(data.status)} label={statusLabel} />
                          <span className="text-zinc-600" aria-hidden>
                            ·
                          </span>
                          <span className="text-[11px] text-zinc-400">{when}</span>
                        </div>
                      </li>
                    )
                  }
                  return (
                    <li key={id} className="flex flex-wrap items-start justify-between gap-2 py-3 first:pt-0">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-zinc-400">
                          <Link
                            to={`/orders?highlight=${encodeURIComponent(id)}`}
                            className="font-mono text-zinc-300 underline-offset-2 hover:underline"
                          >
                            {idLabel}
                          </Link>
                        </p>
                        <p className="mt-1 text-sm font-medium text-zinc-200">{activityTireLine(data)}</p>
                        <p className="mt-0.5 text-xs text-zinc-400">{activityCustomerLine(data)}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1 text-right">
                        <StatusPill tone={statusPillTone(data.status)} label={statusLabel} />
                        <span className="font-mono text-xs text-zinc-400">{activityMarginDisplay(data)}</span>
                        <span className="text-[10px] text-zinc-600">{when}</span>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          {flags.listingAdvisor ? (
            <NextToPostSurface
              ranked={advisorRanked || []}
              loading={advisorLoading}
              onPost={handleGemPost}
            />
          ) : (
            <HiddenGemsSurface gems={hiddenGems || []} onPost={handleGemPost} />
          )}
        </div>
      </main>
    </div>
  )
}
