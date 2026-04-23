// src/components/tires/ListingAdvisorPanel.jsx
import { useCallback, useMemo, useState } from 'react'
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

/**
 * Advisor panel for a single tire inside ListingGenerator. Shows rank,
 * score, and a signal strip immediately. The narrative (an LLM callable)
 * is lazy: it fires only when the user clicks "Why?". This prevents N
 * callable invocations when the bulk-listing modal opens with N tires.
 */
export function ListingAdvisorPanel({ tireId, ranked = [], mode = DEFAULT_ADVISOR_MODE }) {
  const narrate = useAdvisorNarrate()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  const position = useMemo(() => {
    if (!Array.isArray(ranked)) return null
    const i = ranked.findIndex((t) => t.id === tireId)
    return i >= 0 ? i + 1 : null
  }, [ranked, tireId])

  const tire = useMemo(
    () => (ranked || []).find((t) => t.id === tireId) || null,
    [ranked, tireId],
  )

  const toggle = useCallback(async () => {
    if (open) {
      setOpen(false)
      return
    }
    setOpen(true)
    // Cached result: don't refetch when the user reopens the panel.
    if (result) return
    setLoading(true)
    setError(null)
    try {
      const r = await narrate(tireId, mode, tire)
      setResult(r)
    } catch (e) {
      setError(String(e?.message || e))
    } finally {
      setLoading(false)
    }
  }, [open, result, narrate, tireId, mode])

  if (!tire) {
    return (
      <section className="mb-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 text-sm text-zinc-400">
        {reasonForMissing(tire)}
      </section>
    )
  }

  const bd = tire.signalBreakdown || {}
  const velDays = bd.velocity?.raw ? `${Math.round(100 / bd.velocity.raw)}d avg` : 'unknown'
  // margin.raw is a 0-1 ratio; formatPercent in this repo appends % without
  // multiplying. Multiply by 100 before passing.
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
        Age {Math.round(bd.age?.raw || 0)}d &middot; Velocity {velDays} &middot;{' '}
        Margin {marginPct} &middot; Missing {tire.missingPlatformCount} platform(s)
      </p>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="mt-2 text-[11px] text-amber-300/90 hover:underline"
      >
        {open ? 'Hide why' : 'Why?'}
      </button>
      {open ? (
        <div className="mt-2 rounded-md bg-zinc-900/60 p-2 text-[12px] text-zinc-300">
          {loading ? 'Thinking...' : null}
          {error ? <span className="text-rose-300">Narrative unavailable (retry).</span> : null}
          {result ? (
            <>
              <p>{result.narrative}</p>
              {result.shadowFlag ? (
                <p className="mt-1 text-amber-200">{result.shadowFlag}</p>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
