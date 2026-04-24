import { useCallback, useEffect, useState } from 'react'
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
} from 'firebase/firestore'
import { db } from '../../firebase/config'
import Spinner from '../ui/Spinner.jsx'

const PAGE_SIZE = 50

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
 * Global audit feed for the Admin page. Reads `adminAuditLog` ordered by
 * `at desc` with cursor pagination. Read access is gated by Firestore rules
 * (`userRole == 'admin' || canManagePeople()`); the parent route additionally
 * blocks non-admins from rendering this page at all.
 */
export function AuditLogPanel() {
  const [rows, setRows] = useState([])
  const [cursor, setCursor] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  const loadPage = useCallback(async (afterDoc) => {
    const base = collection(db, 'adminAuditLog')
    const q = afterDoc
      ? query(base, orderBy('at', 'desc'), startAfter(afterDoc), limit(PAGE_SIZE))
      : query(base, orderBy('at', 'desc'), limit(PAGE_SIZE))
    const snap = await getDocs(q)
    const next = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    return { next, lastDoc: snap.docs[snap.docs.length - 1] || null, exhausted: snap.docs.length < PAGE_SIZE }
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    loadPage(null)
      .then(({ next, lastDoc, exhausted }) => {
        if (cancelled) return
        setRows(next)
        setCursor(lastDoc)
        setDone(exhausted)
      })
      .catch((e) => {
        if (cancelled) return
        setError(e?.message || 'Failed to load audit log.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [loadPage])

  async function loadMore() {
    if (!cursor || loadingMore || done) return
    setLoadingMore(true)
    try {
      const { next, lastDoc, exhausted } = await loadPage(cursor)
      setRows((prev) => [...prev, ...next])
      setCursor(lastDoc || cursor)
      if (exhausted) setDone(true)
    } catch (e) {
      setError(e?.message || 'Failed to load more.')
    } finally {
      setLoadingMore(false)
    }
  }

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 sm:p-6">
      <h2 className="text-lg font-semibold text-white">Audit log</h2>
      <p className="mt-2 text-sm text-zinc-400">
        Append-only feed of admin-sensitive actions: user invites, role changes, expense edits,
        reorder queue updates, dispatcher overrides, and Slack admin commands. Newest first.
      </p>

      {loading ? (
        <div className="mt-4 flex items-center gap-2 text-sm text-zinc-500">
          <Spinner className="h-4 w-4 text-zinc-400" /> Loading...
        </div>
      ) : error ? (
        <p className="mt-4 text-sm text-rose-400">{error}</p>
      ) : rows.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-500">No audit entries yet.</p>
      ) : (
        <ul className="mt-4 space-y-3 text-xs text-zinc-400">
          {rows.map((row) => (
            <li key={row.id} className="rounded-lg border border-zinc-800/80 p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <p className="font-mono text-[11px] text-zinc-300">{formatTs(row.at)}</p>
                <p className="font-mono text-[11px] text-cyan-300/90">{row.action || '-'}</p>
              </div>
              <p className="mt-1 text-zinc-400">
                <span className="text-zinc-500">By </span>
                <span className="font-mono text-[11px] text-zinc-300">{row.email || row.uid || '-'}</span>
                {row.targetId ? (
                  <>
                    <span className="text-zinc-500"> on </span>
                    <span className="font-mono text-[11px] text-zinc-300">{row.targetId}</span>
                  </>
                ) : null}
              </p>
              {row.payload && Object.keys(row.payload).length > 0 ? (
                <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all text-[10px] text-zinc-600">
                  {JSON.stringify(row.payload, null, 2)}
                </pre>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {!loading && !error && !done ? (
        <button
          type="button"
          onClick={() => void loadMore()}
          disabled={loadingMore}
          className="mt-4 inline-flex items-center justify-center gap-2 rounded-lg border border-zinc-700 px-4 py-2 text-xs font-semibold text-zinc-200 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loadingMore ? <Spinner className="h-3 w-3 text-zinc-400" /> : null}
          {loadingMore ? 'Loading...' : 'Load more'}
        </button>
      ) : null}
    </section>
  )
}
