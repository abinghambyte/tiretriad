import { NavLink } from 'react-router-dom'
import { permissionMeets } from '../../constants/peoplePermissions'
import { useUserProfile } from '../../hooks/useUserProfile'

/**
 * Desktop-only primary navigation strip. Mirrors the link set + permission
 * gating of MobileBottomNav (which handles sm and down). Rendered by
 * PortalChrome directly beneath PortalTopBar, inside the same sticky wrapper.
 */
const linkBase =
  'relative -mb-px flex min-h-[40px] items-center border-b-2 border-transparent px-3 py-2 text-sm font-medium text-zinc-400 transition-colors duration-200 hover:text-zinc-100'
const linkActive = 'border-amber-500 text-amber-100'

export function DesktopTopNav() {
  const { permissionFor, profile } = useUserProfile()
  const canTires = permissionMeets(permissionFor('tires'), 'view')
  const canCrm = permissionMeets(permissionFor('crm'), 'view')
  const canPeople = permissionMeets(permissionFor('people'), 'manage')
  const canAnalytics = permissionMeets(permissionFor('analytics'), 'view')
  const canOps = profile?.role === 'admin'

  const items = [
    { to: '/dashboard', label: 'Dashboard', show: true },
    { to: '/tires', label: 'Tires', show: canTires },
    { to: '/crm', label: 'CRM', show: canCrm },
    { to: '/people', label: 'People', show: canPeople },
    { to: '/analytics', label: 'Analytics', show: canAnalytics },
    { to: '/ops', label: 'Ops', show: canOps },
    { to: '/admin', label: 'Admin', show: canOps },
  ].filter((i) => i.show)

  if (items.length === 0) return null

  return (
    <nav
      aria-label="Primary"
      className="mx-auto hidden w-full max-w-6xl items-center gap-1 border-t border-zinc-800/80 px-3 sm:flex sm:px-4"
    >
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/dashboard'}
          className={({ isActive }) => `${linkBase} ${isActive ? linkActive : ''}`}
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  )
}
