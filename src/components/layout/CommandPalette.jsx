import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { signOut } from 'firebase/auth'
import { auth, db } from '../../firebase/config'
import { useUserProfile } from '../../hooks/useUserProfile'
import { buildPaletteActions, filterPaletteActions } from './paletteActions.js'

/**
 * Universal command palette. Cmd+K / Ctrl+K opens it. Lists:
 *   - Actions (navigation, toggle theme, sign out) — filterable by label,
 *     keyword, or hint. Permission-gated at registry build time.
 *   - Tire / order / contact / CRM search hits (only shown when the query
 *     has 2+ characters so the palette opens clean instead of firing four
 *     unbounded collection reads immediately).
 *
 * Keyboard:
 *   - ArrowUp / ArrowDown moves the highlight across actions then hits.
 *   - Enter runs the highlighted item.
 *   - Escape closes the palette.
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {'dark' | 'light'} props.theme
 * @param {() => void} props.onToggleTheme
 */
export function CommandPalette({ open, onClose, theme, onToggleTheme }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { profile, permissionFor } = useUserProfile()
  const inputRef = useRef(null)
  const listRef = useRef(null)
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [hits, setHits] = useState({
    tires: [],
    orders: [],
    contacts: [],
    crm: [],
  })
  const [selectedIdx, setSelectedIdx] = useState(0)

  const actions = useMemo(
    () =>
      buildPaletteActions({
        pathname: location.pathname,
        profile,
        permissionFor,
        theme,
        onToggleTheme,
        onSignOut: async () => {
          try {
            await signOut(auth)
            navigate('/', { replace: true })
          } catch (e) {
            console.error('sign out failed', e)
          }
        },
        navigate,
        closePalette: onClose,
      }),
    [location.pathname, profile, permissionFor, theme, onToggleTheme, navigate, onClose],
  )

  const filteredActions = useMemo(() => filterPaletteActions(actions, q), [actions, q])

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
      setSelectedIdx(0)
      return
    }
    queueMicrotask(() => inputRef.current?.focus())
  }, [open])

  // Flat index of all runnable items: actions first, then search hits grouped
  // the same way they render. Keeps arrow-key navigation in sync with the
  // visible list without reaching through refs.
  const flatItems = useMemo(() => {
    /** @type {Array<{ kind: 'action' | 'tire' | 'order' | 'contact' | 'crm', run: () => void }>} */
    const list = []
    for (const a of filteredActions) list.push({ kind: 'action', run: a.run })
    for (let i = 0; i < hits.tires.length; i += 1) {
      list.push({
        kind: 'tire',
        run: () => {
          navigate('/tires?tab=catalog')
          onClose()
          setQ('')
        },
      })
    }
    for (const o of hits.orders) {
      list.push({
        kind: 'order',
        run: () => {
          navigate(`/tires?tab=orders&highlight=${encodeURIComponent(o.id)}`)
          onClose()
          setQ('')
        },
      })
    }
    for (let i = 0; i < hits.contacts.length; i += 1) {
      list.push({
        kind: 'contact',
        run: () => {
          navigate('/people?tab=customers')
          onClose()
          setQ('')
        },
      })
    }
    for (let i = 0; i < hits.crm.length; i += 1) {
      list.push({
        kind: 'crm',
        run: () => {
          navigate('/crm')
          onClose()
          setQ('')
        },
      })
    }
    return list
  }, [filteredActions, hits, navigate, onClose])

  // Reset highlight to the top every time the query changes so typing doesn't
  // leave a stale selection off-screen. Clamp if the list shrinks to a size
  // smaller than the current index.
  useEffect(() => {
    setSelectedIdx((i) => (i >= flatItems.length ? 0 : i))
  }, [flatItems.length])

  useEffect(() => {
    setSelectedIdx(0)
  }, [q])

  useEffect(() => {
    if (!open) return undefined
    function onKey(e) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIdx((i) => (flatItems.length === 0 ? 0 : (i + 1) % flatItems.length))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIdx((i) => (flatItems.length === 0 ? 0 : (i - 1 + flatItems.length) % flatItems.length))
        return
      }
      if (e.key === 'Enter') {
        const item = flatItems[selectedIdx]
        if (!item) return
        e.preventDefault()
        item.run()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose, flatItems, selectedIdx])

  // Keep the highlighted row in view when it changes via arrow keys.
  useEffect(() => {
    if (!listRef.current) return
    const el = listRef.current.querySelector(`[data-palette-idx="${selectedIdx}"]`)
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest', behavior: 'auto' })
    }
  }, [selectedIdx])

  const totalHits = useMemo(
    () => hits.tires.length + hits.orders.length + hits.contacts.length + hits.crm.length,
    [hits],
  )

  if (!open) return null

  const actionCount = filteredActions.length
  // Indices inside the flat list for each section's first and last items;
  // used only to map `selectedIdx` to visual state.
  let idx = 0
  const actionStart = 0
  idx += actionCount
  const tireStart = idx
  idx += hits.tires.length
  const orderStart = idx
  idx += hits.orders.length
  const contactStart = idx
  idx += hits.contacts.length
  const crmStart = idx

  const rowClass = (i) =>
    `w-full rounded-lg px-3 py-2.5 text-left transition-colors duration-150 ${
      i === selectedIdx
        ? 'bg-amber-500/15 ring-1 ring-amber-500/40'
        : 'hover:bg-zinc-800/90 active:bg-zinc-800'
    }`

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center bg-black/75 p-4 pt-[10vh] backdrop-blur-sm sk-modal-backdrop-enter sm:pt-[14vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="sk-modal-panel-enter w-full max-w-lg rounded-2xl border border-zinc-700/90 bg-zinc-900/95 shadow-2xl shadow-black/50"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-zinc-800/90 px-3 py-2.5 sm:px-4">
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
            placeholder="Action, MSPN, customer, order ID, company…"
            className="min-h-[44px] flex-1 rounded-lg bg-transparent text-sm text-zinc-100 outline-none ring-0 placeholder:text-zinc-600 focus:ring-2 focus:ring-amber-500/35 sm:min-h-[40px]"
            autoComplete="off"
          />
        </div>
        <div ref={listRef} className="max-h-[min(50vh,28rem)] overflow-y-auto px-2 py-3 text-sm sm:px-3">
          {actionCount > 0 ? (
            <div>
              <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                Actions
              </p>
              <ul className="mt-1 space-y-1">
                {filteredActions.map((a, i) => {
                  const fi = actionStart + i
                  return (
                    <li key={a.id}>
                      <button
                        type="button"
                        data-palette-idx={fi}
                        onMouseEnter={() => setSelectedIdx(fi)}
                        className={rowClass(fi)}
                        onClick={() => a.run()}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-zinc-100">{a.label}</span>
                          {a.hint ? (
                            <span className="shrink-0 text-[10px] uppercase tracking-wide text-zinc-500">
                              {a.hint}
                            </span>
                          ) : null}
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          ) : null}
          {busy ? (
            <div className="mt-2 space-y-2 px-2 py-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-10 animate-pulse rounded-lg bg-zinc-800/60" />
              ))}
            </div>
          ) : null}
          {!busy && q.trim().length < 2 && actionCount === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-zinc-500">
              Type a command or search tires, orders, customers, VIP clients
            </p>
          ) : null}
          {!busy && q.trim().length >= 2 && totalHits === 0 && actionCount === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
              <span className="rounded-full border border-zinc-700 bg-zinc-800/50 p-3 text-zinc-500" aria-hidden>
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="11" cy="11" r="7" />
                  <path strokeLinecap="round" d="M20 20l-3-3" />
                </svg>
              </span>
              <p className="text-sm text-zinc-400">No matches for that query.</p>
            </div>
          ) : null}
          {hits.tires.length ? (
            <div className="mt-3">
              <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Tires</p>
              <ul className="mt-1 space-y-1">
                {hits.tires.map((t, i) => {
                  const fi = tireStart + i
                  return (
                    <li key={t.id}>
                      <button
                        type="button"
                        data-palette-idx={fi}
                        onMouseEnter={() => setSelectedIdx(fi)}
                        className={rowClass(fi)}
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
                  )
                })}
              </ul>
            </div>
          ) : null}
          {hits.orders.length ? (
            <div className="mt-3">
              <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Orders</p>
              <ul className="mt-1 space-y-1">
                {hits.orders.map((o, i) => {
                  const fi = orderStart + i
                  return (
                    <li key={o.id}>
                      <button
                        type="button"
                        data-palette-idx={fi}
                        onMouseEnter={() => setSelectedIdx(fi)}
                        className={rowClass(fi)}
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
                  )
                })}
              </ul>
            </div>
          ) : null}
          {hits.contacts.length ? (
            <div className="mt-3">
              <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Contacts</p>
              <ul className="mt-1 space-y-1">
                {hits.contacts.map((c, i) => {
                  const fi = contactStart + i
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        data-palette-idx={fi}
                        onMouseEnter={() => setSelectedIdx(fi)}
                        className={rowClass(fi)}
                        onClick={() => {
                          navigate('/people?tab=customers')
                          onClose()
                          setQ('')
                        }}
                      >
                        {c.name || '—'} · {c.phoneNumber || c.id}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          ) : null}
          {hits.crm.length ? (
            <div className="mt-3">
              <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">CRM</p>
              <ul className="mt-1 space-y-1">
                {hits.crm.map((a, i) => {
                  const fi = crmStart + i
                  return (
                    <li key={a.id}>
                      <button
                        type="button"
                        data-palette-idx={fi}
                        onMouseEnter={() => setSelectedIdx(fi)}
                        className={rowClass(fi)}
                        onClick={() => {
                          navigate('/crm')
                          onClose()
                          setQ('')
                        }}
                      >
                        {a.companyName || a.id}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-800/90 px-3 py-2 text-[10px] text-zinc-600 sm:px-4">
          <span>
            <kbd className="rounded bg-zinc-800 px-1 py-0.5">↑</kbd>
            <kbd className="ml-1 rounded bg-zinc-800 px-1 py-0.5">↓</kbd>
            <span className="ml-2">navigate</span>
          </span>
          <span>
            <kbd className="rounded bg-zinc-800 px-1 py-0.5">Enter</kbd>
            <span className="ml-2">run</span>
          </span>
          <span>
            <kbd className="rounded bg-zinc-800 px-1 py-0.5">Esc</kbd>
            <span className="ml-2">close</span>
          </span>
        </div>
      </div>
    </div>
  )
}
