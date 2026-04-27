// src/components/dashboard/NextToPostSurface.jsx
import { useCallback, useEffect, useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import { functions } from '../../firebase/config'
import { EmptyState } from '../shared/EmptyState.jsx'
import { MODAL_CENTER_BACKDROP, MODAL_CENTER_PANEL_WIDE } from '../ui/modalChrome.js'
import { ADVISOR_MODES, DEFAULT_ADVISOR_MODE } from '../../utils/listingAdvisor/modeWeights.js'
import { useAdvisorNarrate } from '../../hooks/useAdvisorNarrate.js'
import { formatPercent } from '../../utils/format.js'

function BackfillButton() {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const run = useCallback(async (dryRun) => {
    setBusy(true)
    setResult(null)
    try {
      const fn = httpsCallable(functions, 'backfillTireCreatedAt')
      const res = await fn({ dryRun })
      setResult(res.data)
    } catch (e) {
      setResult({ error: String(e?.message || e) })
    } finally {
      setBusy(false)
    }
  }, [])
  if (!import.meta.env?.DEV) return null
  return (
    <div className="mt-2 flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800/40 px-2 py-1 text-[11px]">
      <span className="text-zinc-400">dev: backfill createdAt</span>
      <button
        type="button"
        disabled={busy}
        onClick={() => run(true)}
        className="rounded bg-zinc-700/60 px-2 py-0.5 text-zinc-100 hover:bg-zinc-700 disabled:opacity-50"
      >
        Dry run
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => run(false)}
        className="rounded bg-amber-600/40 px-2 py-0.5 text-amber-100 hover:bg-amber-600/60 disabled:opacity-50"
      >
        Run for real
      </button>
      {result ? (
        <code className="ml-1 truncate text-zinc-300">{JSON.stringify(result)}</code>
      ) : null}
    </div>
  )
}

const MODE_STORAGE_KEY = 'skedaddle-advisor-mode-v1'
const PLATFORM_LABELS = { ebay: 'eBay', marketplace: 'Marketplace', craigslist: 'Craigslist' }

function missingPlatforms(tire) {
  const missing = []
  if (!tire.listedEbay) missing.push('ebay')
  if (!tire.listedMarketplace) missing.push('marketplace')
  if (!tire.listedCraigslist) missing.push('craigslist')
  return missing
}

function SignalStrip({ tire }) {
  const bd = tire.signalBreakdown || {}
  const velDays = bd.velocity?.raw ? `${Math.round(100 / bd.velocity.raw)}d` : 'n/a'
  const listedRaw = bd.daysSinceLastListed?.raw
  const listedLabel = Number.isFinite(listedRaw) && listedRaw > 0 ? `${Math.round(listedRaw)}d` : 'never'
  // text-zinc-400 on white is 2.85:1 (fails WCAG AA). text-zinc-600 in
  // light mode is 7.83:1 (passes AAA); dark mode restores zinc-400 where
  // it already passes (9.84:1 on zinc-950).
  return (
    <p className="text-[11px] text-zinc-600 dark:text-zinc-400">
      Last posted {listedLabel} &middot; Repriced {Math.round(bd.daysSincePriceChange?.raw || 0)}d &middot; Vel {velDays} &middot;{' '}
      Margin {formatPercent((bd.margin?.raw || 0) * 100, 0)} &middot; Missing {tire.missingPlatformCount}
    </p>
  )
}

function Row({ tire, onPost, compact = false }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <p className="truncate font-mono text-[13px] text-zinc-100">{tire.sku}</p>
        <p className="truncate text-[13px] text-zinc-300">{tire.description}</p>
        {!compact ? (
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {missingPlatforms(tire).map((p) => (
              <span key={p} className="rounded-full bg-zinc-800/80 px-2 py-0.5 text-[10px] text-zinc-300">
                {PLATFORM_LABELS[p]}
              </span>
            ))}
            {tire.kyleFrozen ? (
              <span title="Kyle frozen" aria-label="Kyle frozen" className="text-[10px]">
                🔒
              </span>
            ) : null}
          </div>
        ) : null}
        <div className="mt-1">
          <SignalStrip tire={tire} />
        </div>
      </div>
      {onPost ? (
        <button
          type="button"
          onClick={() => onPost(tire.id)}
          className="shrink-0 rounded-lg bg-emerald-500/20 px-3 py-1.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/30"
        >
          Post it
        </button>
      ) : null}
    </div>
  )
}

function ModeToggle({ mode, onChange }) {
  return (
    <div role="tablist" aria-label="Advisor mode" className="inline-flex rounded-full bg-zinc-800/60 p-0.5 text-[11px]">
      {ADVISOR_MODES.map((m) => {
        const active = mode === m
        return (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(m)}
            className={`rounded-full px-2 py-0.5 ${
              active ? 'bg-amber-500/30 text-amber-100' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {m.charAt(0) + m.slice(1).toLowerCase()}
          </button>
        )
      })}
    </div>
  )
}

function ExpandableRow({ tire, mode, narrate }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)

  const toggle = useCallback(async () => {
    if (open) {
      setOpen(false)
      return
    }
    setOpen(true)
    if (result) return
    setLoading(true)
    try {
      const r = await narrate(tire.id, mode)
      setResult(r)
    } catch (e) {
      setError(String(e?.message || e))
    } finally {
      setLoading(false)
    }
  }, [open, result, narrate, tire.id, mode])

  return (
    <div>
      <Row tire={tire} />
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="mt-1 text-[11px] text-amber-300/90 hover:underline"
      >
        {open ? 'Hide why' : 'Why?'}
      </button>
      {open ? (
        <div className="mt-2 rounded-lg bg-zinc-900/60 p-2 text-[12px] text-zinc-300">
          {loading ? 'Thinking...' : null}
          {error ? <span className="text-rose-300">Narrative unavailable (retry).</span> : null}
          {result ? (
            <>
              <p>{result.narrative}</p>
              {result.shadowFlag ? <p className="mt-1 text-amber-200">{result.shadowFlag}</p> : null}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function Modal({ ranked, mode, onPost, onClose, narrate }) {
  const [selected, setSelected] = useState(() => new Set())

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  function toggleId(id) {
    setSelected((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  function openSelected() {
    for (const id of selected) onPost?.(id)
    onClose()
  }

  return (
    <div className={MODAL_CENTER_BACKDROP} onClick={onClose}>
      <div
        className={MODAL_CENTER_PANEL_WIDE}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="advisor-modal-title"
      >
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <h2 id="advisor-modal-title" className="text-sm font-semibold text-zinc-100">
            Next to Post ({ranked.length})
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200"
          >
            ✕
          </button>
        </div>
        <ul className="max-h-[60vh] divide-y divide-zinc-800/80 overflow-y-auto px-4">
          {ranked.map((tire) => (
            <li key={tire.id} className="flex items-start gap-3 py-3">
              <input
                type="checkbox"
                checked={selected.has(tire.id)}
                onChange={() => toggleId(tire.id)}
                aria-label={`Select ${tire.sku}`}
                className="mt-0.5 size-4 shrink-0 rounded border-zinc-600 accent-amber-400"
              />
              <div className="min-w-0 flex-1">
                <ExpandableRow tire={tire} mode={mode} narrate={narrate} />
              </div>
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between border-t border-zinc-800 px-4 py-3">
          <span className="text-xs text-zinc-400">{selected.size} selected</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800/60"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={selected.size === 0}
              onClick={openSelected}
              className="rounded-lg bg-amber-500/20 px-3 py-1.5 text-sm font-semibold text-amber-200 hover:bg-amber-500/30 disabled:opacity-40"
            >
              Open {selected.size} {selected.size === 1 ? 'listing' : 'listings'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function NextToPostSurface({ ranked = [], loading = false, onPost, onModeChange }) {
  const [mode, setMode] = useState(() => {
    try {
      const v = window.localStorage.getItem(MODE_STORAGE_KEY)
      return ADVISOR_MODES.includes(v) ? v : DEFAULT_ADVISOR_MODE
    } catch {
      return DEFAULT_ADVISOR_MODE
    }
  })
  const [modalOpen, setModalOpen] = useState(false)
  const narrate = useAdvisorNarrate()

  const list = Array.isArray(ranked) ? ranked : []
  const PREVIEW_COUNT = 5
  const preview = list.slice(0, PREVIEW_COUNT)
  const remaining = Math.max(0, list.length - PREVIEW_COUNT)

  const changeMode = useCallback(
    (next) => {
      setMode(next)
      try {
        window.localStorage.setItem(MODE_STORAGE_KEY, next)
      } catch {
        // ignore storage failures
      }
      onModeChange?.(next)
    },
    [onModeChange],
  )

  return (
    <section className="pc-card rounded-xl bg-zinc-900/60 p-[14px]">
      <div className="flex items-center justify-between">
        <h2 className="pc-eyebrow">Next to Post</h2>
        <ModeToggle mode={mode} onChange={changeMode} />
      </div>
      <BackfillButton />
      {loading ? (
        <div className="mt-3 h-14 animate-pulse rounded-lg bg-zinc-800/60" />
      ) : list.length === 0 ? (
        <div className="mt-3">
          <EmptyState
            variant="compact"
            title="Nothing to post. Everything cross-posted and recently priced."
          />
        </div>
      ) : (
        <>
          <ul className="mt-3 divide-y divide-zinc-800/80">
            {preview.map((tire) => (
              <li key={tire.id} className="py-3 first:pt-0 last:pb-0">
                <Row tire={tire} onPost={onPost} compact />
              </li>
            ))}
          </ul>
          {remaining > 0 ? (
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="mt-3 text-xs font-medium text-amber-300/90 hover:underline"
            >
              Show more ({remaining} more)
            </button>
          ) : null}
        </>
      )}
      {modalOpen ? (
        <Modal
          ranked={list}
          mode={mode}
          onPost={onPost}
          onClose={() => setModalOpen(false)}
          narrate={narrate}
        />
      ) : null}
    </section>
  )
}
