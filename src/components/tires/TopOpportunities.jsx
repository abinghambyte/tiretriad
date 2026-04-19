import { useEffect, useMemo, useState } from 'react'
import { computeOpportunityScore } from '../../utils/opportunityScore'
import { parseDescription } from '../../utils/parseTireDescription.js'
import { formatCurrency } from '../../utils/format'

const COLLAPSED_KEY = 'skedaddle-top-opp-collapsed'

function readCollapsed() {
  try {
    const raw = localStorage.getItem(COLLAPSED_KEY)
    return raw === '1' || raw === 'true'
  } catch {
    return false
  }
}

function writeCollapsed(v) {
  try {
    localStorage.setItem(COLLAPSED_KEY, v ? '1' : '0')
  } catch (e) {
    console.error(e)
  }
}

/** Map tier to the badge dot color used across the catalog surfaces. */
function confidenceDotClass(conf) {
  if (conf === 'high') return 'bg-emerald-400'
  if (conf === 'medium') return 'bg-amber-400'
  if (conf === 'estimated') return 'bg-zinc-500'
  return 'bg-zinc-600'
}

function confidenceLabel(conf) {
  if (conf === 'high') return 'High-confidence researched retail'
  if (conf === 'medium') return 'Medium-confidence retail'
  if (conf === 'estimated') return 'Catalog-median estimate (approximate)'
  return 'No retail'
}

/**
 * Short, operator-friendly size string derived from the tire description.
 * Falls back to the first two tokens when the parser can't recognise the
 * format so we always have *something* to show next to the brand.
 */
function shortSize(description) {
  const d = String(description ?? '').trim()
  if (!d) return ''
  try {
    const p = parseDescription(d)
    if (p.parseKind === 'flotation' && p.width != null && p.rimDiameter != null && p.flotationMid) {
      const suffix = p.trailingLt ? 'LT' : ''
      return `${p.width}X${p.flotationMid}R${p.rimDiameter}${suffix}`
    }
    if (
      p.parseKind === 'metric' &&
      p.width != null &&
      p.aspectRatio != null &&
      p.construction &&
      p.rimDiameter != null
    ) {
      const lt = p.ltPrefixedMetric ? 'LT ' : ''
      return `${lt}${p.width}/${p.aspectRatio}${String(p.construction).toUpperCase()}${p.rimDiameter}`
    }
  } catch {
    /* fall through */
  }
  return d.split(/\s+/).slice(0, 2).join(' ')
}

function treadDisplay(tire) {
  const t = String(tire?.tread ?? '').trim()
  if (t) return t
  try {
    const p = parseDescription(tire?.description ?? '')
    if (p && p.treadName) return String(p.treadName).trim()
  } catch {
    /* ignore */
  }
  return ''
}

/**
 * Top-of-page strip that ranks the catalog's best opportunities by expected
 * profit per tire after a haggle discount, weighted by confidence in the
 * retail source.
 *
 * @param {{ tires: Array<Record<string, unknown>>, haggleDiscount: number, onJumpToTire?: (id: string) => void }} props
 */
export function TopOpportunities({ tires, haggleDiscount, onJumpToTire }) {
  const [collapsed, setCollapsed] = useState(() => readCollapsed())

  useEffect(() => {
    writeCollapsed(collapsed)
  }, [collapsed])

  const scored = useMemo(() => {
    const out = []
    for (const tire of tires || []) {
      const op = tire?.opportunity != null && typeof tire.opportunity === 'object'
        ? tire.opportunity
        : computeOpportunityScore(tire, { haggleDiscount })
      const score = op?.opportunity
      if (score == null || !Number.isFinite(score) || score <= 0) continue
      out.push({ tire, op })
    }
    out.sort((a, b) => b.op.opportunity - a.op.opportunity)
    return out
  }, [tires, haggleDiscount])

  const top = scored.slice(0, 10)
  const haggleDisplay = `${Math.round((Number(haggleDiscount) || 0) * 100)}%`

  // Empty state: fewer than three real opportunities is not worth showing a
  // ranked list for. The message calls out what's missing.
  if (top.length < 3) {
    return (
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/35 p-3 sm:p-4">
        <header className="mb-1">
          <h2 className="text-sm font-semibold text-zinc-100">Best opportunities</h2>
        </header>
        <p className="text-xs text-zinc-500">
          Not enough researched retail data to rank opportunities yet.
        </p>
      </section>
    )
  }

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/35 p-3 sm:p-4">
      <header className="mb-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-zinc-100">
            Best opportunities
          </h2>
          {!collapsed ? (
            <p className="mt-0.5 text-[11px] text-zinc-500">
              Top {top.length} tires {'\u00b7'} all amounts per tire {'\u00b7'} profit after {haggleDisplay} haggle, weighted by market-price confidence
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          aria-expanded={!collapsed}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-zinc-700 px-2.5 py-1 text-xs font-medium text-zinc-300 hover:border-zinc-500 hover:text-zinc-100"
        >
          {collapsed ? 'Show' : 'Hide'}
        </button>
      </header>
      {!collapsed ? (
        <ol className="grid grid-cols-1 gap-1 md:grid-cols-2">
          {top.map(({ tire, op }, i) => {
            const size = shortSize(tire.description)
            const tread = treadDisplay(tire)
            const netPositive = (op.netPerTire ?? 0) >= 0
            return (
              <li key={tire.id || `${tire.mspn}-${i}`}>
                <button
                  type="button"
                  onClick={() => onJumpToTire?.(tire.id)}
                  title={confidenceLabel(op.confidence)}
                  className="flex w-full items-center gap-2 rounded-lg border border-transparent px-2 py-1.5 text-left text-xs text-zinc-200 hover:border-zinc-700 hover:bg-zinc-900/60 focus:border-zinc-600 focus:outline-none"
                >
                  <span className="w-5 shrink-0 text-right font-mono text-[11px] text-zinc-500 tabular-nums">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">
                      <span className="font-semibold text-zinc-100">{tire.brand || ''}</span>
                      <span className="ml-1.5 font-mono text-[12px] text-zinc-300">{size || tire.description || ''}</span>
                      {tread ? (
                        <span className="ml-2 text-[11px] text-zinc-500">{tread}</span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block truncate font-mono text-[11px] text-zinc-400 tabular-nums">
                      Buy {formatCurrency(op.buy)} to list{' '}
                      <span className="text-zinc-200">{formatCurrency(op.retail)}</span>
                      {' '}({' '}
                      <span className={netPositive ? 'text-emerald-300' : 'text-rose-300'}>
                        {netPositive ? '+' : ''}
                        {formatCurrency(op.netPerTire)} profit
                      </span>
                      {' '})
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-0.5">
                    <span
                      className={`inline-block h-1.5 w-1.5 rounded-full ${confidenceDotClass(op.confidence)}`}
                      aria-label={confidenceLabel(op.confidence)}
                    />
                    <span className="text-[10px] uppercase tracking-wide text-zinc-500">
                      {op.confidence === 'estimated' ? 'est' : op.confidence === 'high' ? 'high' : op.confidence === 'medium' ? 'med' : ''}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      ) : null}
    </section>
  )
}
