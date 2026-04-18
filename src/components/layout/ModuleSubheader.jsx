import { Link } from 'react-router-dom'

/**
 * Shared module page header: title → optional subtitle → tab row (back lives in PortalTopBar).
 * @param {object} props
 * @param {string} props.title
 * @param {string} [props.subtitle]
 * @param {Array<{ key: string, label: string, to: string, active?: boolean }>} [props.tabs]
 * @param {string} [props.maxWidthClass]
 */
export function ModuleSubheader({ title, subtitle, tabs = [], maxWidthClass = 'max-w-6xl' }) {
  return (
    <header className="sticky top-0 z-20 border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur-md">
      <div className={`mx-auto px-4 py-4 sm:px-6 ${maxWidthClass}`}>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-50 sm:text-3xl max-sm:text-xl">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-1.5 text-sm font-normal leading-relaxed text-zinc-400 max-sm:text-[13px]">{subtitle}</p>
        ) : null}
        {tabs.length > 0 ? (
          <nav
            className="mt-4 flex flex-wrap gap-0.5 border-t border-zinc-800/80 pt-3"
            aria-label={`${title} sections`}
          >
            {tabs.map((t) => {
              const active = Boolean(t.active)
              return (
                <Link
                  key={t.key}
                  to={t.to}
                  className={[
                    '-mb-px flex min-h-[44px] items-center rounded-t-lg border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors duration-200 sm:min-h-0',
                    active
                      ? 'border-amber-500 bg-amber-500/10 text-amber-100'
                      : 'border-transparent text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-200',
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
