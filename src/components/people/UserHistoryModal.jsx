import { MODAL_CENTER_BACKDROP_TOP, MODAL_CENTER_PANEL } from '../ui/modalChrome.js'

function formatTs(ts) {
  if (!ts || typeof ts.toDate !== 'function') return '-'
  try {
    return ts.toDate().toLocaleString('en-US', {
      dateStyle: 'short',
      timeStyle: 'short',
    })
  } catch {
    return '-'
  }
}

/**
 * Per-user history of admin actions. Reads from `adminAuditLog` filtered by
 * `targetId == user.id`; the parent loader sorts by `at` desc.
 *
 * Each row in `accessLog` (kept for prop name back-compat) has the shape:
 *   { id, at, uid, email, action, targetId, payload, ip, ua }
 */
export function UserHistoryModal({ open, onClose, historyForUser, logLoading, accessLog }) {
  if (!open) return null

  return (
    <div
      className={MODAL_CENTER_BACKDROP_TOP}
      role="dialog"
      aria-modal="true"
      aria-labelledby="access-history-title"
      onClick={onClose}
    >
      <div
        className={`${MODAL_CENTER_PANEL} border-zinc-800 bg-zinc-950 p-6 sm:max-h-[80vh]`}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="access-history-title" className="text-lg font-semibold text-white">
          Access history
        </h3>
        {historyForUser ? (
          <p className="mt-1 text-sm text-zinc-500">
            {historyForUser.firstName} {historyForUser.lastName}{' '}
            <span className="font-mono text-xs text-zinc-600">({historyForUser.email})</span>
          </p>
        ) : null}
        <p className="mt-2 text-xs text-zinc-500">
          Who did what: timestamp, action key, and the full payload from the audit log.
        </p>
        {logLoading ? (
          <p className="mt-4 text-sm text-zinc-500">Loading...</p>
        ) : accessLog.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-500">No log entries yet.</p>
        ) : (
          <ul className="mt-4 space-y-3 text-xs text-zinc-400">
            {accessLog.map((row) => (
              <li key={row.id} className="rounded-lg border border-zinc-800/80 p-3">
                <p className="font-mono text-zinc-300">{formatTs(row.at)}</p>
                <p className="mt-1 text-zinc-400">
                  <span className="text-zinc-500">By </span>
                  <span className="font-mono text-[11px] text-zinc-300">
                    {row.email || row.uid || '-'}
                  </span>
                </p>
                <p className="mt-1 text-zinc-500">Action: {row.action || '-'}</p>
                <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-all text-[10px] text-zinc-600">
                  {JSON.stringify(row.payload ?? {}, null, 2)}
                </pre>
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          className="mt-6 rounded-lg border border-zinc-600 px-4 py-2 text-sm text-zinc-300"
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </div>
  )
}
