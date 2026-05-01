import { listingStatus } from '../../../utils/listingStatus.js'
import { timeAgo } from '../../../utils/timeAgo.js'

const PLATFORMS = [
  { key: 'facebook', label: 'Facebook Marketplace' },
  { key: 'offerup', label: 'OfferUp' },
  { key: 'craigslist', label: 'Craigslist' },
]

function statusToneClass(status) {
  if (status === 'active') return 'bg-emerald-950/40 text-emerald-300'
  if (status === 'stale') return 'bg-amber-950/40 text-amber-300'
  return 'bg-zinc-900 text-zinc-500'
}

export function TirePlatformsCard({ tire }) {
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 sm:p-6">
      <h2 className="mb-3 text-sm font-semibold text-zinc-100">Platform listings</h2>
      <ul className="space-y-2">
        {PLATFORMS.map((p) => {
          const ts = tire?.platformListings?.[p.key]?.lastPostedAt
          const status = listingStatus(tire, p.key)
          const ago = ts ? timeAgo(ts) : null
          return (
            <li
              key={p.key}
              data-platform={p.key}
              data-status={status}
              className="flex items-center justify-between gap-3 text-sm"
            >
              <span className="text-zinc-200">{p.label}</span>
              <span className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${statusToneClass(status)}`}>
                {ts ? `${status} · ${ago || 'recently'}` : 'never posted'}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
