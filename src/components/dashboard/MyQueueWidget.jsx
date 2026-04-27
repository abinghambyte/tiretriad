import { Link } from 'react-router-dom'
import { useUserProfile } from '../../hooks/useUserProfile'
import { useDashboardSignals } from '../../hooks/useDashboardSignals'

/**
 * My Queue widget — patch-628.
 *
 * Renders below the dashboard module grid (post patch-627) above Recent
 * Activity. Companion to <MyQueueBell> in the top bar; same data source,
 * different ergonomics. Hidden for roles without a queue.
 */
export function MyQueueWidget() {
  const { profile } = useUserProfile()
  const { myQueueItems = [], myQueueCount = 0 } = useDashboardSignals()
  const role = String(profile?.role || '').toLowerCase()

  if (role !== 'admin' && role !== 'sourcer') return null

  const top10 = myQueueItems.slice(0, 10)

  return (
    <section
      aria-label="My Queue"
      className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 sm:p-5"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-300">
          My Queue · {myQueueCount}
        </h2>
        <Link to="/my-queue" className="text-xs text-amber-300 hover:underline">
          Open full →
        </Link>
      </div>
      {top10.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-500">Nothing in your queue.</p>
      ) : (
        <ul className="mt-3 divide-y divide-zinc-800/80">
          {top10.map((item) => (
            <li key={item.id} className="py-2">
              <Link
                to={item.href || `/my-queue?focus=${item.id}`}
                className="block hover:underline"
              >
                <p className="text-sm text-zinc-200">{item.label}</p>
                <p className="mt-0.5 text-xs text-zinc-500">{item.relativeTime}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
