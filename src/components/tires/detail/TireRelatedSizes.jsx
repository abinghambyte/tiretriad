import { Link } from 'react-router-dom'
import { tireCatalogBuyNumber } from '../../../utils/tireCatalogBuy.js'
import { tireLandedBuyNumber } from '../../../utils/tireLandedBuy.js'
import { computeListingMargin } from '../../../utils/marginCalc.js'
import { formatCurrency } from '../../../utils/format.js'
import { usePayoutConfig } from '../../../hooks/usePayoutConfig.js'

function fmtCurrency(n) {
  return Number.isFinite(n) && n > 0 ? formatCurrency(n) : '--'
}

function fmtPct(n) {
  return Number.isFinite(n) ? `${n.toFixed(0)}%` : '--'
}

export function TireRelatedSizes({ currentTire, relatedTires }) {
  const { config: payoutCfg } = usePayoutConfig()
  const taxes = payoutCfg && typeof payoutCfg === 'object' ? payoutCfg.taxes : null
  const sorted = [...relatedTires].sort((a, b) => {
    const ab = tireCatalogBuyNumber(a) || 0
    const bb = tireCatalogBuyNumber(b) || 0
    if (ab !== bb) return ab - bb
    return String(a.mspn).localeCompare(String(b.mspn))
  })
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold text-zinc-100">
        Other sizes in {currentTire.tread}{' '}
        <span className="text-zinc-500">({sorted.length})</span>
      </h2>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {sorted.map((t) => {
          const buy = tireCatalogBuyNumber(t)
          const margin = computeListingMargin(t, { landedBuy: tireLandedBuyNumber(t, taxes) })
          return (
            <li key={t.id}>
              <Link
                data-related-card
                data-mspn={t.mspn}
                to={`/tires/${encodeURIComponent(t.mspn)}`}
                className="block rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 transition-colors hover:border-amber-600/40 hover:bg-zinc-900"
              >
                <p className="font-mono text-xs text-zinc-300">{t.description}</p>
                <p className="mt-1 text-[10px] uppercase tracking-wide text-zinc-500">MSPN {t.mspn}</p>
                <div className="mt-2 flex items-baseline justify-between text-xs">
                  <span className="font-mono text-zinc-200">{fmtCurrency(buy)}</span>
                  <span className="font-mono text-emerald-300">{fmtPct(margin)}</span>
                </div>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
