import { httpsCallable } from 'firebase/functions'
import { useCallback, useEffect, useState } from 'react'
import { functions } from '../firebase/config'
import { ModuleSubheader } from '../components/layout/ModuleSubheader.jsx'
import { formatPercent } from '../utils/format'

const NOTES_STORAGE_KEY = 'sk-dispatch-notes'
const dispatchFn = httpsCallable(functions, 'taskDispatcher')

/** Map taskDispatcher assignedWorker label to Growth Lab badge routing. */
function workerToRouting(worker) {
  const s = String(worker || '').toLowerCase()
  if (s.includes('infrastructure') || s.includes('opus')) return 'opus'
  if (s.includes('antigravity') || s.includes('site verifier')) return 'antigravity'
  if (s.includes('haiku')) return 'haiku'
  if (s.includes('gemini') || s.includes('market intel') || s.includes('listing advisor')) return 'gemini'
  return 'sonnet'
}

/** Normalize taskDispatcher JSON into the shape GrowthLabRoutingForm already renders. */
function adaptTaskDispatcherResult(raw) {
  const o = raw && typeof raw === 'object' ? raw : {}
  if (o.error && typeof o.error === 'string' && !o.assignedWorker) {
    return { ok: false, error: o.error }
  }
  const worker = String(o.assignedWorker || '')
  const credit = [o.costCheckResult, o.costCheckNote].filter(Boolean).join(' — ')
  return {
    ok: true,
    model: String(o.modelVersion || o.platform || ''),
    dispatch: {
      routing: workerToRouting(worker),
      confidence: 0.75,
      rationale: String(o.rationale || ''),
      creditWarning: String(credit || ''),
      contextToLoad: Array.isArray(o.contextToLoad) ? o.contextToLoad.map((x) => String(x || '').trim()).filter(Boolean) : [],
      sessionStarter: String(o.generatedPrompt || ''),
      taskType: worker || '—',
      estimatedComplexity: String(o.platform || '—'),
    },
  }
}

function routingBadgeClass(routing) {
  const r = String(routing || '').toLowerCase()
  if (r === 'opus') return 'bg-violet-950/90 text-violet-200 ring-1 ring-violet-800/50'
  if (r === 'sonnet') return 'bg-amber-950/90 text-amber-200 ring-1 ring-amber-800/50'
  if (r === 'haiku') return 'bg-zinc-800/90 text-zinc-300 ring-1 ring-zinc-600/50'
  if (r === 'gemini') return 'bg-sky-950/90 text-sky-200 ring-1 ring-sky-800/50'
  if (r === 'antigravity') return 'bg-rose-950/90 text-rose-200 ring-1 ring-rose-800/50'
  return 'bg-zinc-800 text-zinc-400 ring-1 ring-zinc-700'
}

function modelDisplayName(routing) {
  const r = String(routing || '').toLowerCase()
  if (r === 'opus') return 'Claude Opus'
  if (r === 'sonnet') return 'Claude Sonnet'
  if (r === 'haiku') return 'Claude Haiku'
  if (r === 'gemini') return 'Gemini (web)'
  if (r === 'antigravity') return 'Antigravity'
  return String(routing || '—')
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    window.prompt('Copy:', text)
  }
}

function GrowthLabRoutingForm() {
  const [notes, setNotes] = useState('')
  const [task, setTask] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(/** @type {null | { model: string, dispatch: Record<string, unknown> }} */ (null))

  useEffect(() => {
    try {
      const s = localStorage.getItem(NOTES_STORAGE_KEY)
      if (s) setNotes(s)
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(NOTES_STORAGE_KEY, notes)
    } catch {
      /* ignore */
    }
  }, [notes])

  const runDispatch = useCallback(async () => {
    const t = String(task || '').trim()
    if (!t) {
      setError('Describe the task first.')
      return
    }
    setBusy(true)
    setError('')
    setResult(null)
    try {
      const res = await dispatchFn({ task: t, sessionNotes: notes.slice(0, 12000) })
      const data = adaptTaskDispatcherResult(res.data)
      if (!data.ok) {
        setError(String(data.error || 'Dispatch failed'))
        return
      }
      setResult({
        model: String(data.model || ''),
        dispatch: data.dispatch && typeof data.dispatch === 'object' ? data.dispatch : {},
      })
    } catch (e) {
      setError(e?.message || String(e))
    } finally {
      setBusy(false)
    }
  }, [task, notes])

  const dispatch = result?.dispatch || {}
  const routing = String(dispatch.routing || '')
  const cRaw = Number(dispatch.confidence)
  const confidencePct =
    Number.isFinite(cRaw) && result ? (cRaw <= 1 ? cRaw * 100 : cRaw) : null

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-zinc-800/90 bg-zinc-950/80 p-5 shadow-inner shadow-black/20 sm:p-6">
        <h2 className="text-base font-semibold text-zinc-100">Task dispatcher</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Routes portal work to Opus, Sonnet, Haiku, Gemini (market), or Antigravity (browser-heavy). Uses Skedaddle
          context + a credit guardian (prefer Sonnet when it suffices).
        </p>
        <label className="mt-4 block text-xs font-medium uppercase tracking-wide text-zinc-500">
          Session notes <span className="normal-case text-zinc-600">(saved locally)</span>
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Context for the next visit — decisions, file paths, blockers…"
          className="mt-1 w-full resize-y rounded-xl border border-zinc-700 bg-zinc-900/80 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-amber-600/40 focus:ring-1 focus:ring-amber-500/30"
        />
        <label className="mt-4 block text-xs font-medium uppercase tracking-wide text-zinc-500">
          Task
        </label>
        <textarea
          value={task}
          onChange={(e) => setTask(e.target.value)}
          rows={4}
          placeholder="What are you trying to ship or decide?"
          className="mt-1 w-full resize-y rounded-xl border border-zinc-700 bg-zinc-900/80 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-amber-600/40 focus:ring-1 focus:ring-amber-500/30"
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => void runDispatch()}
          className="mt-4 w-full rounded-xl bg-amber-600 py-3 text-sm font-semibold text-zinc-950 hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-50 max-sm:max-w-full sm:w-auto sm:px-8"
        >
          {busy ? 'Routing…' : 'Route task'}
        </button>
        {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}
      </div>

      {result ? (
        <div className="rounded-2xl border border-zinc-800/90 bg-zinc-900/40 p-5 sm:p-6">
          <div className="flex flex-col gap-3 max-sm:items-start sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
            <span
              className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${routingBadgeClass(routing)}`}
            >
              {routing || '—'}
            </span>
            <span className="text-sm text-zinc-300">
              Model: <span className="font-medium text-zinc-100">{modelDisplayName(routing)}</span>
              {result.model ? (
                <span className="ml-2 font-mono text-xs text-zinc-500">({result.model})</span>
              ) : null}
            </span>
            {confidencePct != null ? (
              <span className="text-sm text-zinc-400">
                Confidence <span className="text-zinc-200">{formatPercent(confidencePct, 0)}</span>
              </span>
            ) : null}
            <span className="text-xs uppercase tracking-wide text-zinc-500">
              {String(dispatch.taskType || '—')} · {String(dispatch.estimatedComplexity || '—')}
            </span>
          </div>
          {dispatch.creditWarning ? (
            <p className="mt-3 rounded-lg border border-amber-900/40 bg-amber-950/25 px-3 py-2 text-sm text-amber-100/90">
              {String(dispatch.creditWarning)}
            </p>
          ) : null}
          <div className="mt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Rationale</p>
            <p className="mt-1 text-sm leading-relaxed text-zinc-300">{String(dispatch.rationale || '—')}</p>
          </div>
          <div className="mt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Context to load</p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-zinc-300">
              {Array.isArray(dispatch.contextToLoad) && dispatch.contextToLoad.length ? (
                dispatch.contextToLoad.map((x, i) => (
                  <li key={i} className="[overflow-wrap:anywhere]">
                    {String(x)}
                  </li>
                ))
              ) : (
                <li className="text-zinc-500">—</li>
              )}
            </ul>
          </div>
          <div className="mt-4">
            <div className="mb-2 flex flex-col gap-2 max-sm:items-stretch sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Session starter</p>
              <button
                type="button"
                onClick={() => void copyText(String(dispatch.sessionStarter || ''))}
                className="rounded-lg border border-zinc-600 px-3 py-1.5 text-xs font-medium text-amber-200/90 hover:bg-zinc-800 max-sm:w-full sm:w-auto"
              >
                Copy prompt
              </button>
            </div>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-xl border border-zinc-800 bg-zinc-950/90 p-4 text-xs leading-relaxed text-zinc-200">
              {String(dispatch.sessionStarter || '—')}
            </pre>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function GrowthLabPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-6 text-zinc-100 sm:px-6 sm:py-8">
      <ModuleSubheader
        title="Growth Lab"
        subtitle="Internal tools and experiments — Overwatch only."
        maxWidthClass="max-w-4xl"
      />
      <div className="mt-6">
        <GrowthLabRoutingForm />
      </div>
    </div>
  )
}
