import { signOut } from 'firebase/auth'
import { Link } from 'react-router-dom'
import { auth } from '../../firebase/config'
import { displayFirstName } from '../../utils/displayFirstName'
import { moduleTitleFromPath, showDashboardBackLink } from '../../utils/moduleTitleFromPath'
import { portalCrewTagFromRole } from '../../utils/portalCrewTag.js'

/**
 * @param {object} props
 * @param {string} props.pathname
 * @param {import('react-router-dom').NavigateFunction} props.navigate
 * @param {import('firebase/auth').User | null} props.user
 * @param {Record<string, unknown> | null} props.profile
 * @param {() => void} props.onOpenPalette
 * @param {import('react').ReactNode} props.themeToggle
 * @param {import('react').ReactNode} props.shortcutHint
 */
export function PortalTopBar({ pathname, navigate, user, profile, onOpenPalette, themeToggle, shortcutHint }) {
  const showBack = showDashboardBackLink(pathname)
  const title = moduleTitleFromPath(pathname)
  const first = displayFirstName(profile, user)
  const tag = portalCrewTagFromRole(String(profile?.role || 'viewer'))

  async function onSignOut() {
    await signOut(auth)
    navigate('/', { replace: true })
  }

  return (
    <div className="mx-auto grid w-full max-w-6xl grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 py-2.5 sm:px-4">
      <div className="flex min-w-0 items-center justify-start">
        {showBack ? (
          <Link
            to="/dashboard"
            className="shrink-0 rounded-md px-2 py-1.5 text-xs font-medium text-zinc-500 transition hover:bg-zinc-800/60 hover:text-zinc-200 sm:text-sm"
          >
            ← Dashboard
          </Link>
        ) : (
          <span className="w-px" aria-hidden />
        )}
      </div>
      <h1 className="min-w-0 truncate text-center text-base font-bold tracking-tight text-white sm:text-xl">
        {title}
      </h1>
      <div className="flex min-w-0 items-center justify-end gap-1.5 sm:gap-2">
        <button
          type="button"
          onClick={onOpenPalette}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-700 text-zinc-400 transition hover:border-zinc-500 hover:text-zinc-100 sm:h-8 sm:w-8"
          aria-label="Open search"
          title="Search (⌘K / Ctrl+K)"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path strokeLinecap="round" d="M20 20l-3-3" />
          </svg>
        </button>
        {themeToggle}
        {shortcutHint}
        <div className="ml-1 flex max-w-[min(200px,42vw)] items-center gap-2 rounded-full border border-zinc-700/90 bg-zinc-900/90 px-2.5 py-1 sm:max-w-none sm:px-3">
          <span className="truncate text-xs font-semibold text-zinc-100 sm:text-sm">{first}</span>
          <span className="shrink-0 rounded-md bg-zinc-800/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-300">
            {tag}
          </span>
        </div>
        <button
          type="button"
          onClick={() => void onSignOut()}
          className="shrink-0 rounded-lg border border-zinc-600 px-2.5 py-1.5 text-xs font-semibold text-zinc-300 transition hover:border-zinc-500 hover:bg-zinc-800/80 hover:text-white sm:px-3 sm:text-sm"
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
