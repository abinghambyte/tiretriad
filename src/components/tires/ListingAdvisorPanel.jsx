// src/components/tires/ListingAdvisorPanel.jsx
import { useCallback, useEffect, useMemo, useState } from 'react'
import { formatPercent } from '../../utils/format.js'
import { useAdvisorNarrate } from '../../hooks/useAdvisorNarrate.js'
import { DEFAULT_ADVISOR_MODE } from '../../utils/listingAdvisor/modeWeights.js'

function rankLabel(position, mode) {
  const nice = mode.charAt(0) + mode.slice(1).toLowerCase()
  return position ? `Rank #${position} in ${nice} mode` : `Unranked (${nice} mode)`
}

function reasonForMissing(tire) {
  if (tire?.doNotList) return 'Not ranked (do-not-list)'
  return 'Not ranked (no signals yet)'
}

export function ListingAdvisorPanel({ tireId, ranked = [], mode = DEFAULT_ADVISOR_MODE }) {
  const narrate = useAdvisorNarrate()
  const [narration, setNarration] = useState(null)
  const [error, setError] = useState(null)
  const [retrying, setRetrying] = useState(false)

  const position = useMemo(() => {
    if (!Array.isArray(ranked)) return null
    const i = ranked.findIndex((t) => t.id === tireId)
    return i >= 0 ? i + 1 : null
  }, [ranked, tireId])

  const tire = useMemo(() => (ranked || []).find((t) => t.id === tireId) || null, [ranked, tireId])

  useEffect(() => {
    if (!tire) return
    let alive = true
    narrate(tireId, mode)
      .then((r) => {
        if (alive) setNarration(r)
      })
      .catch((e) => {
        if (alive) setError(String(e?.message || e))
      })
    return () => {
      alive = false
    }
  }, [narrate, tireId, mode, tire])

  // Patch-501: real retry button replacing the static "(retry)" text.
  const retryNarrative = useCallback(async () => {
    setRetrying(true)
    setError(null)
    try {
      const r = await narrate(tireId, mode)
      setNarration(r)
    } catch (e) {
      setError(String(e?.message || e))
    } finally {
      setRetrying(false)
    }
  }, [narrate, tireId, mode])

  if (!tire) {
    return (
      <section className="mb-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 text-sm text-zinc-400">
        {reasonForMissing(tire)}
      </section>
    )
  }

  const bd = tire.signalBreakdown || {}
  const velDays = bd.velocity?.raw ? `${Math.round(100 / bd.velocity.raw)}d avg` : 'unknown'
  // margin.raw is a 0-1 ratio; formatPercent in this repo expects a percent
  // value (does not multiply). Multiply by 100 before passing.
  const marginPct = formatPercent((bd.margin?.raw || 0) * 100, 0)

  return (
    <section className="mb-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 text-sm">
      <div className="flex items-center justify-between">
        <p className="font-medium text-zinc-100">
          {rankLabel(position, mode)} &middot; score {Math.round(tire.rankScore || 0)}
        </p>
        {tire.kyleFrozen ? <span aria-label="Kyle frozen">🔒</span> : null}
      </div>
      <p className="mt-1 text-[12px] text-zinc-400">
        Last posted {Number.isFinite(bd.daysSinceLastListed?.raw) && bd.daysSinceLastListed.raw > 0
          ? `${Math.round(bd.daysSinceLastListed.raw)}d ago`
          : 'never'} &middot; Repriced {Math.round(bd.daysSincePriceChange?.raw || 0)}d ago &middot; Velocity {velDays} &middot;{' '}
        Margin {marginPct} &middot; Missing {tire.missingPlatformCount} platform(s)
      </p>
      {error ? (
        <div className="mt-2 flex items-center justify-between gap-2 rounded-md border border-amber-700/40 bg-amber-950/20 px-2 py-1.5">
          <p className="text-sm text-amber-200">Narrative unavailable.</p>
          <button
            type="button"
            onClick={() => void retryNarrative()}
            disabled={retrying}
            className="rounded border border-zinc-700 bg-zinc-800/60 px-2 py-0.5 text-xs text-zinc-200 hover:border-zinc-500 hover:bg-zinc-800 disabled:opacity-50"
          >
            {retrying ? 'Retrying…' : 'Retry'}
          </button>
        </div>
      ) : null}
      {narration ? (
        <div className="mt-2 text-zinc-300">
          <p>{narration.narrative}</p>
          {narration.shadowFlag ? <p className="mt-1 text-amber-200">{narration.shadowFlag}</p> : null}
        </div>
      ) : null}
    </section>
  )
}
