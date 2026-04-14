import { Link } from 'react-router-dom'

/**
 * Shared module page header: back link → title → optional subtitle → tab row.
 * @param {object} props
 * @param {string} props.title
 * @param {string} [props.subtitle]
 * @param {Array<{ key: string, label: string, to: string, active?: boolean }>} [props.tabs]
 * @param {string} [props.maxWidthClass]
 */
export function ModuleSubheader({ title, subtitle, tabs = [], maxWidthClass = 'max-w-7xl' }) {
  return (
    <header className="sticky top-0 z-20 border-b border-zinc-800/80 bg-zinc-950/95 backdrop-blur-md">
      <div className={`mx-auto px-4 py-4 sm:px-6 ${maxWidthClass}`}>
        <Link
          to="/dashboard"
          className="text-xs font-medium text-zinc-500 transition hover:text-zinc-200 max-sm:text-[11px]"
        >
          ← Dashboard
        </Link>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-white max-sm:text-xl">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-zinc-500 max-sm:text-xs">{subtitle}</p> : null}
        {tabs.length > 0 ? (
          <nav
            className="mt-4 flex flex-wrap gap-1 border-t border-zinc-800/80 pt-3"
            aria-label={`${title} sections`}
          >
            {tabs.map((t) => {
              const active = Boolean(t.active)
              return (
                <Link
                  key={t.key}
                  to={t.to}
                  className={[
                    '-mb-px flex min-h-[44px] items-center border-b-2 px-4 py-2.5 text-sm font-semibold transition sm:min-h-0',
                    active
                      ? 'border-amber-500 text-amber-100'
                      : 'border-transparent text-zinc-500 hover:text-zinc-300',
                  ].join(' ')}
                >
                  {t.label}
                </Link>
              )
            })}
          </nav>
        ) : null}
      </div>
    </header>
  )
}
