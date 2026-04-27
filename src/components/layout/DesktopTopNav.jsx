import { NavLink } from 'react-router-dom'
import { permissionMeets } from '../../constants/peoplePermissions'
import { useUserProfile } from '../../hooks/useUserProfile'

/**
 * Desktop-only primary navigation strip. Mirrors the link set + permission
 * gating of MobileBottomNav (which handles sm and down). Rendered by
 * PortalChrome directly beneath PortalTopBar, inside the same sticky wrapper.
 */
const linkBase =
  'relative -mb-px flex min-h-[40px] items-center rounded-md border-b-2 border-transparent px-3 py-2 text-sm font-medium text-zinc-400 transition-colors duration-200 hover:text-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60'
const linkActive = 'border-amber-500 text-amber-100'

export function DesktopTopNav() {
  const { permissionFor, profile } = useUserProfile()
  const canTires = permissionMeets(permissionFor('tires'), 'view')
  const canCrm = permissionMeets(permissionFor('crm'), 'view')
  const canPeople = permissionMeets(permissionFor('people'), 'manage')
  const canAnalytics = permissionMeets(permissionFor('analytics'), 'view')
  const canOps = profile?.role === 'admin'

  // Patch-628: My Queue moved to a header bell + dashboard widget.
  // /my-queue route still works as a deep-link fallback; not in nav.
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
          <span>{item.label}</span>
          {item.badge && item.badge > 0 ? (
            <span
              className="ml-2 inline-flex min-w-[20px] items-center justify-center rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-200 ring-1 ring-amber-600/40"
              aria-label={`${item.badge} pending`}
            >
              {item.badge}
            </span>
          ) : null}
        </NavLink>
      ))}
    </nav>
  )
}
