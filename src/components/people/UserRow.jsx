import { crewTagFromRole } from '../../constants/peoplePermissions'
import { Popover } from '../ui/Popover.jsx'

function formatTs(ts) {
  if (!ts || typeof ts.toDate !== 'function') return '--'
  try {
    return ts.toDate().toLocaleString('en-US', {
      dateStyle: 'short',
      timeStyle: 'short',
    })
  } catch {
    return '--'
  }
}

function timeAgo(ts) {
  if (!ts || typeof ts.toMillis !== 'function') return ''
  const s = Math.max(0, Math.floor((Date.now() - ts.toMillis()) / 1000))
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

function streakLabel(n) {
  const v = Number(n) || 0
  if (v <= 0) return '--'
  return `${v}-day streak`
}

/** Short label for soonest active timed elevation, or null. `tick` bumps re-render each minute. */
function elevationCountdownLabel(u, tick) {
  const now = Date.now() + tick * 0
  const arr = Array.isArray(u.timedElevations) ? u.timedElevations : []
  let minMs = Infinity
  for (const e of arr) {
    const ms = e?.expiresAt?.toMillis?.()
    if (typeof ms !== 'number' || ms <= now) continue
    if (ms < minMs) minMs = ms
  }
  if (!Number.isFinite(minMs)) return null
  const sec = Math.floor((minMs - now) / 1000)
  if (sec <= 0) return null
  if (sec < 3600) return `${Math.max(1, Math.ceil(sec / 60))}m`
  if (sec < 86400) return `${Math.ceil(sec / 3600)}h`
  return `${Math.ceil(sec / 86400)}d`
}

function PeopleRowActionsMenu({ u, onHistory, onEdit }) {
  return (
    <div className="flex justify-end sm:hidden">
      <Popover
        label="Row actions"
        align="end"
        anchor={
          <button
            type="button"
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-zinc-600/90 bg-zinc-900/50 text-lg leading-none text-zinc-300 hover:border-zinc-500 hover:bg-zinc-800/80"
            aria-label="Row actions"
          >
            ⋯
          </button>
        }
      >
        <button
          type="button"
          className="block w-full px-3 py-2.5 text-left text-zinc-200 hover:bg-zinc-800/80"
          onClick={() => void onHistory(u)}
        >
          History
        </button>
        <button
          type="button"
          className="block w-full px-3 py-2.5 text-left text-violet-100 hover:bg-zinc-800/80"
          onClick={() => onEdit(u)}
        >
          Edit
        </button>
      </Popover>
    </div>
  )
}

export function UserRow({ u, tick, onHistory, onEdit, highlighted = false }) {
  const evLabel = elevationCountdownLabel(u, tick)
  return (
    <tr
      data-uid={u.id}
      className={[
        'group border-b border-zinc-800/80 hover:bg-zinc-900/40 transition-colors',
        highlighted ? 'bg-amber-900/25 ring-1 ring-amber-500/40' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <td className="max-w-none px-3 py-2 font-medium leading-snug text-zinc-100 sm:max-w-[220px]">
        <span className="max-sm:whitespace-normal">
          {u.firstName} {u.lastName}
        </span>
        {evLabel ? (
          <span className="ml-2 inline-flex items-center rounded-full bg-amber-950/50 px-2 py-0.5 align-middle text-[10px] font-semibold uppercase tracking-wide text-amber-200 ring-1 ring-amber-700/40 max-sm:mt-1 max-sm:ml-0 max-sm:inline-flex">
            ⏱ {evLabel}
          </span>
        ) : null}
      </td>
      <td className="hidden px-3 py-2 text-violet-300 sm:table-cell">
        {u.crewTag || crewTagFromRole(u.role)}
      </td>
      <td className="hidden px-3 py-2 text-zinc-400 sm:table-cell">{u.inviteStatus || '--'}</td>
      <td className="hidden px-3 py-2 text-zinc-400 sm:table-cell">{formatTs(u.accessExpiry)}</td>
      <td className="hidden px-3 py-2 text-zinc-300 sm:table-cell">{streakLabel(u.loginStreak)}</td>
      <td className="hidden max-w-[240px] px-3 py-2 text-xs text-zinc-400 sm:table-cell">
        {u.ghostMode ? (
          <span className="text-zinc-600">Ghost mode</span>
        ) : !u.lastLoginAt ? (
          <span className="text-zinc-600">Never signed in</span>
        ) : (
          <>
            {[u.lastLoginDevice, u.lastLoginLocation, timeAgo(u.lastLoginAt)]
              .filter((x) => x && String(x).trim())
              .join(' · ')}
          </>
        )}
      </td>
      <td className="px-2 py-2 text-right sm:hidden">
        <PeopleRowActionsMenu u={u} onHistory={onHistory} onEdit={onEdit} />
      </td>
      <td className="sticky right-0 z-[2] hidden whitespace-nowrap border-l border-zinc-800/90 bg-zinc-950 px-3 py-2 text-right pc-sticky-col-shadow group-hover:bg-zinc-900/40 sm:table-cell">
        <div className="inline-flex shrink-0 flex-nowrap items-center justify-end gap-1">
          <button
            type="button"
            className="inline-flex h-11 min-h-[44px] w-11 min-w-[44px] shrink-0 items-center justify-center rounded-md border border-zinc-600/90 bg-zinc-900/50 text-zinc-300 hover:border-zinc-500 hover:bg-zinc-800/80 hover:text-zinc-100 sm:h-9 sm:min-h-9 sm:w-9 sm:min-w-9"
            title="Access history"
            aria-label="Access history"
            onClick={(e) => {
              e.stopPropagation()
              void onHistory(u)
            }}
          >
            <svg
              className="h-4 w-4 shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden
            >
              <circle cx="12" cy="12" r="9" />
              <path strokeLinecap="round" d="M12 7v5l3 2" />
            </svg>
          </button>
          <button
            type="button"
            className="min-h-[44px] rounded-lg border border-violet-600/70 bg-violet-900/40 px-2.5 py-2 text-xs font-semibold text-violet-50 hover:bg-violet-900/60 sm:min-h-0 sm:py-1"
            onClick={() => onEdit(u)}
          >
            Edit
          </button>
        </div>
      </td>
    </tr>
  )
}
