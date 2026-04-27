import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { permissionMeets } from '../../constants/peoplePermissions'
import { useUserProfile } from '../../hooks/useUserProfile'
import { useDashboardSignals } from '../../hooks/useDashboardSignals.js'

function IconHome() {
  return (
    <svg className="h-6 w-6 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 10.75 12 4l8.25 6.75v8.5a1 1 0 0 1-1 1h-4.5v-6h-5.5v6h-4.5a1 1 0 0 1-1-1v-8.5Z" />
    </svg>
  )
}

function IconTires() {
  return (
    <svg className="h-6 w-6 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <circle cx="12" cy="12" r="7.25" />
      <circle cx="12" cy="12" r="2.25" />
      <path strokeLinecap="round" d="M12 4.75v2M12 17.25v2M4.75 12h2M17.25 12h2" />
    </svg>
  )
}

function IconCrm() {
  return (
    <svg className="h-6 w-6 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h10M4 18h16" />
      <circle cx="16" cy="8" r="2" fill="currentColor" />
    </svg>
  )
}

function IconPeople() {
  return (
    <svg className="h-6 w-6 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
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

function IconAnalytics() {
  return (
    <svg className="h-6 w-6 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path strokeLinecap="round" d="M5 19V5M9 19v-6M13 19V9M17 19v-9" />
      <path strokeLinecap="round" d="M4 19h16" />
    </svg>
  )
}

const navCls =
  'flex min-h-[52px] min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1 text-[11px] font-medium text-zinc-400 transition-colors duration-200 hover:bg-zinc-800/60 hover:text-zinc-200 active:bg-zinc-800/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60'
const activeCls = 'bg-amber-500/12 text-amber-200 ring-1 ring-amber-600/35 hover:bg-amber-500/15 hover:text-amber-100'

function IconOps() {
  return (
    <svg className="h-6 w-6 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path strokeLinecap="round" d="M6 8h12M6 12h8M6 16h10" />
      <rect x="4" y="5" width="16" height="14" rx="2" className="opacity-40" />
    </svg>
  )
}

function IconQueue() {
  return (
    <svg className="h-6 w-6 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <rect x="4" y="5" width="16" height="4" rx="1" />
      <rect x="4" y="11" width="16" height="4" rx="1" />
      <rect x="4" y="17" width="10" height="2.5" rx="1" />
    </svg>
  )
}

function IconAdmin() {
  return (
    <svg className="h-6 w-6 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1 1.56V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.88 1.7 1.7 0 0 0-1.56-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.88.34H9a1.7 1.7 0 0 0 1-1.56V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.56 1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.88V9a1.7 1.7 0 0 0 1.56 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.56 1Z"
      />
    </svg>
  )
}

export function MobileBottomNav() {
  const [selectionActive, setSelectionActive] = useState(false)
  const { permissionFor, profile } = useUserProfile()
  const { kylesQueueCount } = useDashboardSignals()
  const role = String(profile?.role || '').toLowerCase()
  const canTires = permissionMeets(permissionFor('tires'), 'view')
  const canCrm = permissionMeets(permissionFor('crm'), 'view')
  const canPeople = permissionMeets(permissionFor('people'), 'manage')
  const canAnalytics = permissionMeets(permissionFor('analytics'), 'view')
  const canMyQueue = role === 'sourcer' || role === 'admin'
  const queueBadge = Number.isFinite(Number(kylesQueueCount)) ? Number(kylesQueueCount) : 0

  const canOps = profile?.role === 'admin'

  useEffect(() => {
    function onSelectionChange(e) {
      setSelectionActive(Boolean(e.detail?.active))
    }
    window.addEventListener('skedaddle:tires-selection', onSelectionChange)
    return () => window.removeEventListener('skedaddle:tires-selection', onSelectionChange)
  }, [])

  // Per-item permission gating below already handles the "user has no
  // permissions" case via `.filter(Boolean)`. Always render the full nav so
  // every reachable destination is one tap away from the home screen on mobile.
  // (See docs/superpowers/audits/2026-04-26-comprehensive-ui-ux-audit.md §0.2.)
  const items = [
    { to: '/dashboard', label: 'Home', icon: <IconHome /> },
    canTires ? { to: '/tires', label: 'Tires', icon: <IconTires /> } : null,
    canMyQueue
      ? { to: '/my-queue', label: 'My Queue', icon: <IconQueue />, badge: queueBadge }
      : null,
    canCrm ? { to: '/crm', label: 'Rubber CRM', icon: <IconCrm /> } : null,
    canPeople ? { to: '/people', label: 'People', icon: <IconPeople /> } : null,
    canAnalytics ? { to: '/analytics', label: 'Analytics', icon: <IconAnalytics /> } : null,
    canOps ? { to: '/ops', label: 'Ops', icon: <IconOps /> } : null,
    canOps ? { to: '/admin', label: 'Admin', icon: <IconAdmin /> } : null,
  ].filter(Boolean)

  if (selectionActive || items.length === 0) return null

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-[120] flex border-t border-zinc-800 bg-zinc-950 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1 backdrop-blur-md sm:hidden"
      aria-label="Primary mobile"
    >
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/analytics'}
          aria-label={item.label}
          className={({ isActive }) => `${navCls} ${isActive ? activeCls : ''}`}
        >
          <span className="relative">
            {item.icon}
            {item.badge && item.badge > 0 ? (
              <span
                className="absolute -right-2 -top-1 inline-flex min-w-[16px] items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-bold text-zinc-950"
                aria-label={`${item.badge} pending`}
              >
                {item.badge}
              </span>
            ) : null}
          </span>
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
