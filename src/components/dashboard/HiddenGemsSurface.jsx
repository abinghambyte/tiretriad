import { timeAgo } from '../../utils/timeAgo'

const ALL_PLATFORMS = ['ebay', 'marketplace', 'craigslist']
const PLATFORM_LABELS = {
  ebay: 'eBay',
  marketplace: 'Marketplace',
  craigslist: 'Craigslist',
}

function missingPlatforms(gemPlatforms) {
  const have = new Set(gemPlatforms || [])
  return ALL_PLATFORMS.filter((p) => !have.has(p))
}

/**
 * Hidden Gems surface. Up to 5 rows; when more gems exist, a
 * `View all N` affordance surfaces the rest. Row actions dispatch
 * through `onPost(id)`; the sentinel id `__all__` indicates the
 * caller should open the full list.
 */
export function HiddenGemsSurface({ gems = [], onPost }) {
  const list = Array.isArray(gems) ? gems : []
  const visible = list.slice(0, 5)

  return (
    <section className="pc-card rounded-xl bg-zinc-900/60 p-[14px]">
      <h2 className="text-[9px] font-bold uppercase tracking-[0.12em] text-zinc-500">
        Hidden Gems
      </h2>
      {list.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-500">
          Nothing hidden - everything cross-posted.
        </p>
      ) : (
        <>
          <ul className="mt-3 divide-y divide-zinc-800/80">
            {visible.map((gem) => (
              <li
                key={gem.id}
                className="flex items-start justify-between gap-3 py-3 first:pt-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-[13px] text-zinc-100">{gem.sku}</p>
                  <p className="truncate text-[13px] text-zinc-300">{gem.description}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    {missingPlatforms(gem.platforms).map((p) => (
                      <span
                        key={p}
                        className="rounded-full bg-zinc-800/80 px-2 py-0.5 text-[10px] text-zinc-300"
                      >
                        {PLATFORM_LABELS[p]}
                      </span>
                    ))}
                    <span className="ml-2 text-[10px] text-zinc-500">
                      {gem.lastPostedAt ? timeAgo(gem.lastPostedAt) : 'never'}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onPost?.(gem.id)}
                  className="rounded-lg bg-emerald-500/20 px-3 py-1.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/30"
                >
                  Post it
                </button>
              </li>
            ))}
          </ul>
          {list.length > 5 ? (
            <button
              type="button"
              onClick={() => onPost?.('__all__')}
              className="mt-3 text-xs font-medium text-amber-300/90 hover:underline"
            >
              View all {list.length}
            </button>
          ) : null}
        </>
      )}
    </section>
  )
}
