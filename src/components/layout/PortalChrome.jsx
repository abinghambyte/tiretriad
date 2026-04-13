import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { OrderCompletionMilestones } from '../milestones/OrderCompletionMilestones.jsx'
import { MobileBottomNav } from './MobileBottomNav.jsx'
import { db } from '../../firebase/config'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../../context/ToastContext.jsx'

const THEME_KEY = 'skedaddle-theme'

function applyTheme(mode) {
  const m = mode === 'light' ? 'light' : 'dark'
  document.documentElement.dataset.theme = m
}

function SessionExpiryBanner() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!user) return undefined
    let cancelled = false
    const id = window.setInterval(async () => {
      try {
        const r = await user.getIdTokenResult()
        const expMs = new Date(r.expirationTime).getTime()
        const left = expMs - Date.now()
        if (!cancelled && left > 0 && left < 5 * 60 * 1000) {
          setVisible(true)
        } else if (!cancelled && left >= 5 * 60 * 1000) {
          setVisible(false)
        }
      } catch {
        if (!cancelled) setVisible(false)
      }
    }, 60_000)
    void user.getIdTokenResult().then((r) => {
      const expMs = new Date(r.expirationTime).getTime()
      if (!cancelled && expMs - Date.now() < 5 * 60 * 1000) setVisible(true)
    })
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [user])

  async function refresh() {
    try {
      await user?.getIdToken(true)
      setVisible(false)
      toast('Session refreshed', 'success')
    } catch (e) {
      toast(e?.message || 'Could not refresh session', 'error')
    }
  }

  if (!visible || !user) return null

  return (
    <div className="border-b border-amber-900/50 bg-amber-950/90 px-4 py-2 text-center text-sm text-amber-100">
      Your session expires soon —{' '}
      <button type="button" className="font-semibold underline" onClick={() => void refresh()}>
        click to stay signed in
      </button>
      <button
        type="button"
        className="ml-3 text-amber-300/80 hover:text-amber-100"
        onClick={() => setVisible(false)}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  )
}

function ThemeToggle() {
  const [mode, setMode] = useState(() => {
    try {
      return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark'
    } catch {
      return 'dark'
    }
  })

  useEffect(() => {
    applyTheme(mode)
    try {
      localStorage.setItem(THEME_KEY, mode)
    } catch {
      /* ignore */
    }
  }, [mode])

  return (
    <button
      type="button"
      title={mode === 'dark' ? 'Light mode' : 'Dark mode'}
      onClick={() => setMode((m) => (m === 'dark' ? 'light' : 'dark'))}
      className="min-h-[44px] min-w-[44px] rounded-lg border border-zinc-700 p-2 text-zinc-300 hover:border-zinc-500 hover:text-zinc-100 sm:min-h-0 sm:min-w-0"
      aria-label="Toggle color theme"
    >
      {mode === 'dark' ? (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="12" cy="12" r="4" />
          <path strokeLinecap="round" d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      ) : (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 14.5A8.5 8.5 0 019.5 3a8.38 8.38 0 007 12.5z"
          />
        </svg>
      )}
    </button>
  )
}

function ShortcutHint() {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        type="button"
        className="min-h-[44px] min-w-[44px] rounded-lg border border-zinc-700 px-2 py-1.5 text-xs font-semibold text-zinc-400 hover:border-zinc-500 hover:text-zinc-200 sm:min-h-0 sm:min-w-0"
        aria-label="Keyboard shortcuts"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        ?
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-[300] mt-1 w-56 rounded-lg border border-zinc-700 bg-zinc-900 p-3 text-left text-[11px] text-zinc-300 shadow-xl">
          <p className="font-semibold text-zinc-100">Shortcuts</p>
          <ul className="mt-2 space-y-1">
            <li>
              <kbd className="rounded bg-zinc-800 px-1">/</kbd> focus search
            </li>
            <li>
              <kbd className="rounded bg-zinc-800 px-1">Esc</kbd> close overlays
            </li>
          </ul>
        </div>
      ) : null}
    </div>
  )
}

export function PortalChrome() {
  const { user } = useAuth()
  const loc = useLocation()
  const navigate = useNavigate()
  const inputRef = useRef(null)
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [hits, setHits] = useState(
    /** @type {{ tires: any[], orders: any[], contacts: any[], crm: any[] }} */ {
      tires: [],
      orders: [],
      contacts: [],
      crm: [],
    },
  )

  const hideChrome = loc.pathname === '/' || loc.pathname.startsWith('/i/')
  const hideMobileBottomNav = loc.pathname.startsWith('/handshake')

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
        getDocs(query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(60))).catch(
          () => ({ docs: [] }),
        ),
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
            String(o.mspn || '')
              .toLowerCase()
              .includes(needle) ||
            String(o.customerName || '')
              .toLowerCase()
              .includes(needle),
        )
        .slice(0, 10)
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
    const t = window.setTimeout(() => void runSearch(q), 380)
    return () => window.clearTimeout(t)
  }, [q, runSearch])

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') {
        setOpen(false)
        window.dispatchEvent(new CustomEvent('skedaddle-close-overlays'))
      }
      if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const tag = (e.target && e.target.tagName) || ''
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
        e.preventDefault()
        inputRef.current?.focus()
        setOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const totalHits = useMemo(
    () => hits.tires.length + hits.orders.length + hits.contacts.length + hits.crm.length,
    [hits],
  )

  if (!user || hideChrome) {
    return <Outlet />
  }

  return (
    <>
      <div className="sticky top-0 z-[100] border-b border-zinc-800/90 bg-zinc-950/95 backdrop-blur-md">
        <SessionExpiryBanner />
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-3 py-2 sm:px-4">
          <input
            ref={inputRef}
            type="search"
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            placeholder="Search tires, orders, contacts, CRM…"
            className="min-h-[44px] min-w-[160px] flex-1 rounded-lg border border-zinc-700 bg-zinc-900/80 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 sm:min-h-0"
            autoComplete="off"
          />
          {busy ? <span className="text-xs text-zinc-500">Searching…</span> : null}
          <ThemeToggle />
          <ShortcutHint />
        </div>
        {open && q.trim().length >= 2 ? (
          <div className="mx-auto max-w-6xl border-t border-zinc-800/80 px-3 pb-3 sm:px-4">
            {totalHits === 0 && !busy ? (
              <p className="mt-2 text-xs text-zinc-500">No matches.</p>
            ) : (
              <div className="mt-2 max-h-[50vh] overflow-y-auto text-sm">
                {hits.tires.length ? (
                  <div className="mt-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                      Tires
                    </p>
                    <ul className="mt-1 space-y-1">
                      {hits.tires.map((t) => (
                        <li key={t.id}>
                          <button
                            type="button"
                            className="w-full rounded-lg px-2 py-1.5 text-left text-zinc-200 hover:bg-zinc-800/80"
                            onClick={() => {
                              navigate(`/tires?tab=catalog`)
                              setOpen(false)
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
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                      Orders
                    </p>
                    <ul className="mt-1 space-y-1">
                      {hits.orders.map((o) => (
                        <li key={o.id}>
                          <button
                            type="button"
                            className="w-full rounded-lg px-2 py-1.5 text-left hover:bg-zinc-800/80"
                            onClick={() => {
                              navigate(`/tires?tab=orders&highlight=${encodeURIComponent(o.id)}`)
                              setOpen(false)
                              setQ('')
                            }}
                          >
                            {o.customerName || '—'} · {o.mspn}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {hits.contacts.length ? (
                  <div className="mt-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                      Contacts
                    </p>
                    <ul className="mt-1 space-y-1">
                      {hits.contacts.map((c) => (
                        <li key={c.id}>
                          <button
                            type="button"
                            className="w-full rounded-lg px-2 py-1.5 text-left hover:bg-zinc-800/80"
                            onClick={() => {
                              navigate('/people?tab=customers')
                              setOpen(false)
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
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                      CRM
                    </p>
                    <ul className="mt-1 space-y-1">
                      {hits.crm.map((a) => (
                        <li key={a.id}>
                          <button
                            type="button"
                            className="w-full rounded-lg px-2 py-1.5 text-left hover:bg-zinc-800/80"
                            onClick={() => {
                              navigate('/crm')
                              setOpen(false)
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
            )}
          </div>
        ) : null}
      </div>
      <div
        className={
          hideMobileBottomNav
            ? ''
            : 'pb-[calc(3.5rem+env(safe-area-inset-bottom,0px))] sm:pb-0'
        }
      >
        <Outlet />
      </div>
      {hideMobileBottomNav ? null : <MobileBottomNav />}
      <OrderCompletionMilestones />
    </>
  )
}
