import { NavLink } from 'react-router-dom'
import { permissionMeets } from '../../constants/peoplePermissions'
import { useUserProfile } from '../../hooks/useUserProfile'

function IconTires() {
  return (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <circle cx="12" cy="12" r="7.25" />
      <circle cx="12" cy="12" r="2.25" />
      <path strokeLinecap="round" d="M12 4.75v2M12 17.25v2M4.75 12h2M17.25 12h2" />
    </svg>
  )
}

function IconCrm() {
  return (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h10M4 18h16" />
      <circle cx="16" cy="8" r="2" fill="currentColor" />
    </svg>
  )
}

function IconPeople() {
  return (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
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
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path strokeLinecap="round" d="M5 19V5M9 19v-6M13 19V9M17 19v-9" />
      <path strokeLinecap="round" d="M4 19h16" />
    </svg>
  )
}

const navCls =
  'flex min-h-[52px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-1 text-[10px] font-medium text-zinc-500 transition hover:text-zinc-300'
const activeCls = 'text-amber-300'

export function MobileBottomNav() {
  const { permissionFor } = useUserProfile()
  const canTires = permissionMeets(permissionFor('tires'), 'view')
  const canCrm = permissionMeets(permissionFor('crm'), 'view')
  const canPeople = permissionMeets(permissionFor('people'), 'manage')
  const canAnalytics = permissionMeets(permissionFor('analytics'), 'view')

  const items = [
    canTires ? { to: '/tires', label: 'Tires', icon: <IconTires /> } : null,
    canCrm ? { to: '/crm', label: 'Rubber CRM', icon: <IconCrm /> } : null,
    canPeople ? { to: '/people', label: 'People', icon: <IconPeople /> } : null,
    canAnalytics ? { to: '/analytics', label: 'Analytics', icon: <IconAnalytics /> } : null,
  ].filter(Boolean)

  if (items.length === 0) return null

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-[120] flex border-t border-zinc-800 bg-zinc-950/98 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1 backdrop-blur-md sm:hidden"
      aria-label="Primary mobile"
    >
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/analytics'}
          className={({ isActive }) => `${navCls} ${isActive ? activeCls : ''}`}
        >
          {item.icon}
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
