import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { crewTagFromRole } from '../../constants/peoplePermissions'

const ONLINE_WINDOW_MS = 5 * 60 * 1000

function displayName(data) {
  const first = (data?.firstName || '').trim()
  const last = (data?.lastName || '').trim()
  const full = `${first} ${last}`.trim()
  if (full) return full
  return data?.email || 'Unknown'
}

function isOnline(lastSeenAt, now) {
  if (!Number.isFinite(lastSeenAt)) return false
  return now - lastSeenAt < ONLINE_WINDOW_MS
}

/**
 * Crew directory widget. Consumes the `crewSignals` map shipped by the
 * dashboard signals hook and renders a WIP badge, today completions,
 * streak days, and an online / offline presence dot per user.
 */
export function CrewDirectoryWidget({ crew, crewSignals = {}, loading }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const h = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(h)
  }, [])

  if (loading) {
    return (
      <section className="pc-card rounded-xl bg-zinc-900/60 p-[14px]">
        <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-zinc-500">
          Crew
        </p>
        <div className="mt-3 space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-12 animate-pulse rounded-lg bg-zinc-800/60"
            />
          ))}
        </div>
      </section>
    )
  }

  const users = crew?.users || []
  const hasMore = Boolean(crew?.hasMore)

  return (
    <section className="pc-card rounded-xl bg-zinc-900/60 p-[14px]">
      <div className="flex items-center justify-between">
        <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-zinc-500">
          Crew
        </p>
        {hasMore ? (
          <Link
            to="/people"
            className="text-xs font-medium text-amber-300/90 hover:underline"
          >
            View all
          </Link>
        ) : null}
      </div>
      {users.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-500">No crew rows loaded.</p>
      ) : (
        <ul className="mt-3 divide-y divide-zinc-800/80">
          {users.map(({ id, data }) => {
            const sig = crewSignals?.[id] || {}
            const online = isOnline(sig.lastSeenAt, now)
            const tag = data?.crewTag || crewTagFromRole(data?.role || 'viewer')
            return (
              <li key={id} className="first:pt-0">
                <Link
                  to={`/people?highlight=${encodeURIComponent(id)}`}
                  className="flex items-center justify-between gap-3 rounded-md py-2.5 transition-colors hover:bg-zinc-800/40"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      aria-label={online ? 'online' : 'offline'}
                      className={`h-2 w-2 rounded-full ${online ? 'bg-[#32CD32]' : 'bg-zinc-600'}`}
                    />
                    <div className="min-w-0">
                      <p className="truncate text-[13px] text-zinc-100">
                        {displayName(data)}
                      </p>
                      <p className="truncate text-[10px] uppercase tracking-wide text-zinc-500">
                        {tag}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {sig.wipCount > 0 ? (
                      <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500/20 px-1.5 text-[10px] font-semibold text-amber-200">
                        {sig.wipCount}
                      </span>
                    ) : null}
                    <div className="text-right">
                      <p className="text-[10px] text-zinc-200">
                        {sig.todayCompletions || 0} today
                      </p>
                      <p className="text-[10px] text-zinc-500">
                        {sig.streakDays || 0} day streak
                      </p>
                    </div>
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
