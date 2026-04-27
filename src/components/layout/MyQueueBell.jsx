import { Link } from 'react-router-dom'
import { Popover } from '../ui/Popover.jsx'
import { useUserProfile } from '../../hooks/useUserProfile'
import { useDashboardSignals } from '../../hooks/useDashboardSignals'

/**
 * My Queue bell — patch-628.
 *
 * Replaces the previous /my-queue nav entry. Renders in <PortalTopBar>
 * between the role pill and sign-out (desktop) and inside the profile
 * dropdown (mobile, via PortalTopBar's existing Popover).
 *
 * Hidden for roles without a queue surface (viewer, mechanic with no
 * assignments). The full /my-queue route still exists as a fallback for
 * deep links.
 */
export function MyQueueBell() {
  const { profile } = useUserProfile()
  const { myQueueItems = [], myQueueCount = 0 } = useDashboardSignals()
  const role = String(profile?.role || '').toLowerCase()

  if (role !== 'admin' && role !== 'sourcer') return null

  const top5 = myQueueItems.slice(0, 5)

  return (
    <Popover
      label="My Queue"
      align="end"
      anchor={
        <button
          type="button"
          aria-label={`My Queue: ${myQueueCount} ${myQueueCount === 1 ? 'item' : 'items'}`}
          className="relative inline-flex h-11 min-h-[44px] w-11 min-w-[44px] shrink-0 items-center justify-center rounded-lg border border-zinc-700 text-zinc-300 transition-colors hover:border-zinc-500 hover:text-zinc-100"
        >
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
              d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2a2 2 0 01-.6 1.4L4 17h5m6 0a3 3 0 11-6 0"
            />
          </svg>
          {myQueueCount > 0 ? (
            <span
              className="absolute -right-1 -top-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-zinc-950"
              aria-label={`${myQueueCount} pending`}
            >
              {myQueueCount > 9 ? '9+' : myQueueCount}
            </span>
          ) : null}
        </button>
      }
    >
      <div className="w-72 max-w-[90vw]">
        <div className="border-b border-zinc-800 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
          My Queue · {myQueueCount}
        </div>
        {top5.length === 0 ? (
          <p className="px-3 py-3 text-sm text-zinc-500">Nothing in your queue.</p>
        ) : (
          <ul className="divide-y divide-zinc-800/80">
            {top5.map((item) => (
              <li key={item.id}>
                <Link
                  to={item.href || `/my-queue?focus=${item.id}`}
                  className="block px-3 py-2.5 text-sm text-zinc-200 hover:bg-zinc-800/80"
                >
                  <p className="truncate">{item.label}</p>
                  <p className="mt-0.5 text-xs text-zinc-500">{item.relativeTime}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Link
          to="/my-queue"
          className="block border-t border-zinc-800 px-3 py-2 text-center text-xs text-amber-300 hover:bg-zinc-800/80"
        >
          Open full queue →
        </Link>
      </div>
    </Popover>
  )
}
