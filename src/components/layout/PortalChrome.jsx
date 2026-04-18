import { useEffect, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { OrderCompletionMilestones } from '../milestones/OrderCompletionMilestones.jsx'
import { MobileBottomNav } from './MobileBottomNav.jsx'
import { useAuth } from '../../hooks/useAuth'
import { useUserProfile } from '../../hooks/useUserProfile'
import { useToast } from '../../context/ToastContext.jsx'
import { CommandPalette } from './CommandPalette.jsx'
import { PortalTopBar } from './PortalTopBar.jsx'

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
      className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-lg border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-zinc-100 sm:h-8 sm:min-h-0 sm:w-8 sm:min-w-0"
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
    <div className="relative hidden sm:block">
      <button
        type="button"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-zinc-700 text-xs font-semibold text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
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
              <kbd className="rounded bg-zinc-800 px-1">⌘</kbd>{' '}
              <kbd className="rounded bg-zinc-800 px-1">K</kbd> or{' '}
              <kbd className="rounded bg-zinc-800 px-1">Ctrl</kbd>{' '}
              <kbd className="rounded bg-zinc-800 px-1">K</kbd> — search
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
  const { profile } = useUserProfile()
  const loc = useLocation()
  const navigate = useNavigate()
  const [paletteOpen, setPaletteOpen] = useState(false)

  const hideChrome = loc.pathname === '/' || loc.pathname.startsWith('/i/')
  const hideMobileBottomNav = loc.pathname.startsWith('/handshake')

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') {
        setPaletteOpen(false)
        window.dispatchEvent(new CustomEvent('skedaddle-close-overlays'))
      }
      if ((e.metaKey || e.ctrlKey) && String(e.key).toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!user || hideChrome) {
    return <Outlet />
  }

  return (
    <>
      <div className="sticky top-0 z-[100] border-b border-zinc-800/90 bg-zinc-950/95 backdrop-blur-md">
        <SessionExpiryBanner />
        <PortalTopBar
          pathname={loc.pathname}
          navigate={navigate}
          profile={profile}
          onOpenPalette={() => setPaletteOpen(true)}
          themeToggle={<ThemeToggle />}
          shortcutHint={<ShortcutHint />}
        />
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <div
        className={
          hideMobileBottomNav ? '' : 'pb-[calc(3.5rem+env(safe-area-inset-bottom,0px))] sm:pb-0'
        }
      >
        <Outlet />
      </div>
      {hideMobileBottomNav ? null : <MobileBottomNav />}
      <OrderCompletionMilestones />
    </>
  )
}
