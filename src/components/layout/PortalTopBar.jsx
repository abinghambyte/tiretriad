import { signOut } from 'firebase/auth'
import { Link } from 'react-router-dom'
import { auth } from '../../firebase/config'
import { Popover } from '../ui/Popover.jsx'
import { BrandBolt } from '../ui/BrandBolt.jsx'
import { displayFirstName } from '../../utils/displayFirstName'
import { buildBreadcrumbs } from '../../utils/moduleTitleFromPath'
import { portalCrewTagFromRole } from '../../utils/portalCrewTag.js'

/**
 * @param {object} props
 * @param {string} props.pathname
 * @param {string | null | undefined} [props.tab] value from `?tab=` on current route, optional
 * @param {import('react-router-dom').NavigateFunction} props.navigate
 * @param {Record<string, unknown> | null} props.profile
 * @param {() => void} props.onOpenPalette
 * @param {import('react').ReactNode} props.themeToggle
 * @param {import('react').ReactNode} props.shortcutHint
 */
export function PortalTopBar({ pathname, tab, navigate, profile, onOpenPalette, themeToggle, shortcutHint }) {
  const crumbs = buildBreadcrumbs(pathname, tab || null)
  const first = displayFirstName(profile, auth.currentUser?.email || undefined)
  const tagLabel = portalCrewTagFromRole(String(profile?.role || 'viewer'))
  const nameBadge = `${first} · ${tagLabel}`

  async function onSignOut() {
    await signOut(auth)
    navigate('/', { replace: true })
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl items-center gap-2 px-3 py-2.5 sm:px-4">
      <Link
        to="/"
        aria-label="Skedaddle - go to dashboard"
        className="flex shrink-0 items-center rounded-md p-1 transition-colors hover:bg-zinc-800/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60"
      >
        <BrandBolt size={18} tone="solid" />
      </Link>
      <nav aria-label="Breadcrumb" className="min-w-0 flex-1 overflow-hidden">
        {crumbs.length === 0 ? (
          <span className="inline-block max-w-full truncate align-middle text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400 sm:text-xs sm:tracking-[0.2em]">
            Skedaddle
          </span>
        ) : (
          <ol className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5 text-xs font-medium text-zinc-400 sm:text-sm">
            {crumbs.map((c, i) => {
              const isLast = i === crumbs.length - 1
              return (
                <li key={`${c.label}-${i}`} className="flex min-w-0 items-center gap-1">
                  {i > 0 ? (
                    <span className="text-zinc-600" aria-hidden>
                      /
                    </span>
                  ) : null}
                  {isLast || !c.to ? (
                    <span className="truncate text-zinc-200" aria-current={isLast ? 'page' : undefined}>
                      {c.label}
                    </span>
                  ) : (
                    <Link
                      to={c.to}
                      className="truncate rounded px-1 py-0.5 text-zinc-400 transition-colors duration-200 hover:bg-zinc-800/60 hover:text-zinc-100"
                    >
                      {c.label}
                    </Link>
                  )}
                </li>
              )
            })}
          </ol>
        )}
      </nav>
      <div className="flex shrink-0 items-center justify-end gap-1.5 sm:gap-2">
        <button
          type="button"
          onClick={onOpenPalette}
          className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-lg border border-zinc-700 text-zinc-400 transition-all duration-200 hover:border-amber-600/40 hover:bg-zinc-800/80 hover:text-zinc-100 hover:ring-1 hover:ring-amber-500/25 sm:h-8 sm:min-h-0 sm:w-8 sm:min-w-0"
          aria-label="Open search"
          title="Search (⌘K / Ctrl+K)"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path strokeLinecap="round" d="M20 20l-3-3" />
          </svg>
        </button>
        {shortcutHint}
        {/* Desktop (≥ sm): theme toggle + role pill + sign out */}
        <div className="hidden sm:flex sm:items-center sm:gap-2">
          {themeToggle}
          {/*
            No `title` attribute: WAVE / WCAG flag "Redundant title text" when
            a `title` duplicates the element's visible content (it's announced
            twice by some screen readers). The truncate is wide enough at
            220px / 48vw that "Alex · Overwatch" almost never clips; if it
            does, the user can hover to expand on a wider viewport rather
            than relying on a tooltip.
          */}
          <div
            className="ml-1 max-w-[min(220px,48vw)] truncate rounded-full border border-zinc-700/90 bg-zinc-900/90 px-2.5 py-1 text-xs font-semibold text-zinc-100 sm:max-w-xs sm:px-3 sm:text-sm"
          >
            {nameBadge}
          </div>
          <button
            type="button"
            onClick={() => void onSignOut()}
            className="shrink-0 rounded-lg border border-zinc-600 px-2.5 py-1.5 text-xs font-semibold text-zinc-300 transition-colors duration-200 hover:border-zinc-500 hover:bg-zinc-800/90 hover:text-white sm:px-3 sm:text-sm"
          >
            Sign out
          </button>
        </div>
        {/* Mobile (< sm): avatar dropdown collapses role pill + sign-out */}
        <div className="sm:hidden">
          <Popover
            label={`Account menu — ${first}, ${tagLabel}`}
            align="end"
            anchor={
              <button
                type="button"
                className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-amber-900/40 text-sm font-bold text-amber-200 ring-1 ring-amber-700/50"
                aria-label={`Account menu — ${first}, ${tagLabel}`}
              >
                {first.charAt(0).toUpperCase()}
              </button>
            }
          >
            <div className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-zinc-400">
              {nameBadge}
            </div>
            <div className="border-t border-zinc-800" />
            {themeToggle ? (
              <div className="flex items-center justify-between gap-2 px-3 py-2 text-zinc-300">
                <span className="text-sm">Theme</span>
                {themeToggle}
              </div>
            ) : null}
            {/* TODO: add Settings link here once a /settings route exists in src/App.jsx */}
            <div className="border-t border-zinc-800" />
            <button
              type="button"
              onClick={() => void onSignOut()}
              className="block w-full px-3 py-2.5 text-left text-sm text-rose-300 hover:bg-zinc-800/80"
            >
              Sign out
            </button>
          </Popover>
        </div>
      </div>
    </div>
  )
}
