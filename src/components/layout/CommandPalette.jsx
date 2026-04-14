import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../../firebase/config'

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 */
export function CommandPalette({ open, onClose }) {
  const navigate = useNavigate()
  const inputRef = useRef(null)
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [hits, setHits] = useState({
    tires: [],
    orders: [],
    contacts: [],
    crm: [],
  })

  const runSearch = useCallback(async (raw) => {
    const needle = raw.trim().toLowerCase()
    if (needle.length < 2) {
      setHits({ tires: [], orders: [], contacts: [], crm: [] })
      return
    }
    setBusy(true)
    try {
      const [tSnap, oSnap, cSnap, aSnap] = await Promise.all([
        getDocs(query(collection(db, 'tires'), limit(400))).catch(() => ({ docs: [] })),
        getDocs(query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(80))).catch(() => ({ docs: [] })),
        getDocs(query(collection(db, 'contacts'), limit(300))).catch(() => ({ docs: [] })),
        getDocs(query(collection(db, 'crmAccounts'), limit(200))).catch(() => ({ docs: [] })),
      ])
      const tires = tSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter(
          (t) =>
            String(t.mspn || '')
              .toLowerCase()
              .includes(needle) ||
            String(t.description || '')
              .toLowerCase()
              .includes(needle),
        )
        .slice(0, 12)
      const orders = oSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter(
          (o) =>
            String(o.id || '')
              .toLowerCase()
              .includes(needle) ||
            String(o.mspn || '')
              .toLowerCase()
              .includes(needle) ||
            String(o.customerName || '')
              .toLowerCase()
              .includes(needle),
        )
        .slice(0, 12)
      const contacts = cSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter(
          (c) =>
            String(c.name || '')
              .toLowerCase()
              .includes(needle) ||
            String(c.phoneNumber || c.id || '')
              .toLowerCase()
              .includes(needle),
        )
        .slice(0, 10)
      const crm = aSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((a) =>
          String(a.companyName || '')
            .toLowerCase()
            .includes(needle),
        )
        .slice(0, 10)
      setHits({ tires, orders, contacts, crm })
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    const t = window.setTimeout(() => void runSearch(q), 280)
    return () => window.clearTimeout(t)
  }, [q, runSearch])

  useEffect(() => {
    if (!open) {
      setQ('')
      setHits({ tires: [], orders: [], contacts: [], crm: [] })
      return
    }
    queueMicrotask(() => inputRef.current?.focus())
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    function onKey(e) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const totalHits = useMemo(
    () => hits.tires.length + hits.orders.length + hits.contacts.length + hits.crm.length,
    [hits],
  )

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center bg-black/70 p-4 pt-[12vh] sm:pt-[15vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-zinc-700 bg-zinc-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-zinc-800 px-3 py-2">
          <span className="text-zinc-500" aria-hidden>
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="11" cy="11" r="7" />
              <path strokeLinecap="round" d="M20 20l-3-3" />
            </svg>
          </span>
          <input
            ref={inputRef}
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="MSPN, customer, order ID, company…"
            className="min-h-[40px] flex-1 bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-600"
            autoComplete="off"
          />
          <kbd className="hidden shrink-0 rounded border border-zinc-700 bg-zinc-950 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500 sm:inline">
            Esc
          </kbd>
        </div>
        <div className="max-h-[50vh] overflow-y-auto px-2 py-2 text-sm">
          {busy ? <p className="px-2 py-3 text-xs text-zinc-500">Searching…</p> : null}
          {!busy && q.trim().length < 2 ? (
            <p className="px-2 py-4 text-center text-xs text-zinc-500">Type at least 2 characters to search.</p>
          ) : null}
          {!busy && q.trim().length >= 2 && totalHits === 0 ? (
            <p className="px-2 py-4 text-center text-xs text-zinc-500">No matches.</p>
          ) : null}
          {hits.tires.length ? (
            <div className="mt-1">
              <p className="px-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Tires</p>
              <ul className="mt-1 space-y-0.5">
                {hits.tires.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      className="w-full rounded-lg px-2 py-2 text-left text-zinc-200 hover:bg-zinc-800/80"
                      onClick={() => {
                        navigate(`/tires?tab=catalog`)
                        onClose()
                        setQ('')
                      }}
                    >
                      <span className="font-mono text-xs text-amber-200/90">{t.mspn}</span>{' '}
                      <span className="text-zinc-500">{t.description}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {hits.orders.length ? (
            <div className="mt-2">
              <p className="px-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Orders</p>
              <ul className="mt-1 space-y-0.5">
                {hits.orders.map((o) => (
                  <li key={o.id}>
                    <button
                      type="button"
                      className="w-full rounded-lg px-2 py-2 text-left hover:bg-zinc-800/80"
                      onClick={() => {
                        navigate(`/tires?tab=orders&highlight=${encodeURIComponent(o.id)}`)
                        onClose()
                        setQ('')
                      }}
                    >
                      <span className="font-mono text-[10px] text-zinc-500">{o.id}</span>
                      <span className="ml-2 text-zinc-300">
                        {o.customerName || '—'} · {o.mspn}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {hits.contacts.length ? (
            <div className="mt-2">
              <p className="px-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Contacts</p>
              <ul className="mt-1 space-y-0.5">
                {hits.contacts.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      className="w-full rounded-lg px-2 py-2 text-left hover:bg-zinc-800/80"
                      onClick={() => {
                        navigate('/people?tab=customers')
                        onClose()
                        setQ('')
                      }}
                    >
                      {c.name || '—'} · {c.phoneNumber || c.id}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {hits.crm.length ? (
            <div className="mt-2">
              <p className="px-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">CRM</p>
              <ul className="mt-1 space-y-0.5">
                {hits.crm.map((a) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      className="w-full rounded-lg px-2 py-2 text-left hover:bg-zinc-800/80"
                      onClick={() => {
                        navigate('/crm')
                        onClose()
                        setQ('')
                      }}
                    >
                      {a.companyName || a.id}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
