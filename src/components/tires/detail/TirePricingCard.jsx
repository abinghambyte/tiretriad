import { tireCatalogBuyNumber } from '../../../utils/tireCatalogBuy.js'
import { tireCatalogRetailNumber, tireRetailIsResearched, tireRetailIsEstimated } from '../../../utils/tireCatalogRetail.js'
import { computeListingMargin } from '../../../utils/marginCalc.js'
import { formatCurrency } from '../../../utils/format.js'

// Used for Buy and Retail: '--' when missing or zero (a zero buy/retail
// is effectively "not set" for catalog purposes).
function fmtNum(n) {
  return Number.isFinite(n) && n > 0 ? formatCurrency(n) : '--'
}

// Used for FET: $0.00 is a meaningful answer ("this tire has no FET")
// distinct from '--' ("FET unknown / not stored"). Matches the catalog
// row's formatCurrencyOrDash treatment.
function fmtFet(n) {
  return Number.isFinite(n) ? formatCurrency(n) : '--'
}

function fmtPct(n) {
  return Number.isFinite(n) ? `${n.toFixed(1)}%` : '--'
}

function row(label, value, valueClass = 'font-mono text-zinc-200') {
  return (
    <div className="flex items-baseline justify-between border-b border-zinc-800/60 py-1.5 last:border-b-0">
      <dt className="text-xs uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className={`text-sm ${valueClass}`}>{value}</dd>
    </div>
  )
}

export function TirePricingCard({ tire, efleetRecord, efleetDate }) {
  const buy = tireCatalogBuyNumber(tire)
  const retail = tireCatalogRetailNumber(tire)
  const researched = tireRetailIsResearched(tire)
  const estimated = tireRetailIsEstimated(tire)
  const margin = computeListingMargin(tire)
  const fet = Number(tire?.fet) || 0

  const retailClass = estimated
    ? 'font-mono italic text-amber-300/70'
    : researched
      ? 'font-mono font-semibold text-cyan-200/90'
      : 'font-mono text-zinc-200'

  const portalPrice = Number(tire?.price) || 0
  const efleetPrice = Number(efleetRecord?.price) || 0
  const drift = efleetRecord && Math.abs(portalPrice - efleetPrice) > 0.01

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 sm:p-6">
      <h2 className="mb-3 text-sm font-semibold text-zinc-100">Pricing</h2>
      <dl>
        {row('Buy', fmtNum(buy))}
        {row('Retail', fmtNum(retail), retailClass)}
        {row('FET', fmtFet(fet))}
        {row('Margin', fmtPct(margin))}
      </dl>
      <div className="mt-4 border-t border-zinc-800 pt-3 text-xs">
        {efleetRecord ? (
          <>
            <p className="text-zinc-400">
              Source: <span className="text-zinc-200">Michelin eFleet</span>
              {efleetDate ? <span className="text-zinc-500"> ({efleetDate})</span> : null}
            </p>
            {drift ? (
              <p className="mt-1 inline-block rounded bg-amber-950/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-300">
                Portal price disagrees with eFleet (${portalPrice.toFixed(2)} vs ${efleetPrice.toFixed(2)})
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-zinc-500">Not from a known eFleet import.</p>
        )}
      </div>
    </section>
  )
}
