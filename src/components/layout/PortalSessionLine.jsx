/**
 * Email + Sign out: on &lt;640px, inline text link; from `sm`, bordered control.
 * @param {{ email?: string | null, onSignOut: () => void | Promise<void>, className?: string }} props
 */
export function PortalSessionLine({ email, onSignOut, className = '' }) {
  const addr = email || ''

  return (
    <div
      className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-left sm:items-center sm:gap-3 ${className}`}
    >
      <span className="max-w-[min(100%,260px)] truncate text-xs text-zinc-400 sm:max-w-[220px] sm:text-sm sm:text-zinc-400">
        {addr}
      </span>
      <span className="hidden text-zinc-700 sm:inline" aria-hidden>
        ·
      </span>
      <button
        type="button"
        onClick={() => void onSignOut()}
        className="min-h-[44px] shrink-0 rounded px-1 py-2 text-sm text-zinc-400 underline decoration-zinc-600 underline-offset-2 hover:text-zinc-200 sm:min-h-0 sm:rounded-lg sm:border sm:border-zinc-700 sm:px-3 sm:py-1.5 sm:text-zinc-300 sm:no-underline sm:hover:border-zinc-500"
      >
        Sign out
      </button>
    </div>
  )
}
