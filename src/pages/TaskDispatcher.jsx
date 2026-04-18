import { httpsCallable } from 'firebase/functions'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { functions } from '../firebase/config'
import { ModuleSubheader } from '../components/layout/ModuleSubheader.jsx'
import { useUserProfile } from '../hooks/useUserProfile'

const HANDOFF_STORAGE_KEY = 'dispatcher:handoff'

const MODEL_HINTS = [
  { value: '', label: 'Let dispatcher decide' },
  { value: 'Portal Architect', label: 'Portal Architect' },
  { value: 'Listing Advisor', label: 'Listing Advisor' },
  { value: 'Market Intel', label: 'Market Intel' },
  { value: 'Site Verifier', label: 'Site Verifier' },
  { value: 'Infrastructure Lead', label: 'Infrastructure Lead' },
  { value: 'Field Executor', label: 'Field Executor' },
]

const dispatchCallable = httpsCallable(functions, 'taskDispatcher')

function costCheckBadgeClass(result) {
  const r = String(result || '').toLowerCase().trim()
  if (r === 'passed') return 'bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-500/35'
  if (r === 'escalated') return 'bg-amber-500/15 text-amber-200 ring-1 ring-amber-500/35'
  if (r === 'not applicable' || r === 'not_applicable') return 'bg-zinc-700/50 text-zinc-400 ring-1 ring-zinc-600/40'
  return 'bg-zinc-800 text-zinc-400 ring-1 ring-zinc-600/50'
}

function RoutingSkeleton() {
  return (
    <div className="animate-pulse space-y-3 rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4">
      <div className="h-4 w-[66%] rounded bg-zinc-700/80" />
      <div className="h-3 w-full rounded bg-zinc-800/80" />
      <div className="h-3 w-5/6 rounded bg-zinc-800/80" />
      <div className="h-6 w-24 rounded-full bg-zinc-800/80" />
    </div>
  )
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    window.prompt('Copy:', text)
  }
}

function readHandoff() {
  try {
    const raw = localStorage.getItem(HANDOFF_STORAGE_KEY)
    if (!raw) return { decided: '', completed: '', outstanding: '', nextBrief: '' }
    const o = JSON.parse(raw)
    return {
      decided: typeof o?.decided === 'string' ? o.decided : '',
      completed: typeof o?.completed === 'string' ? o.completed : '',
      outstanding: typeof o?.outstanding === 'string' ? o.outstanding : '',
      nextBrief: typeof o?.nextBrief === 'string' ? o.nextBrief : '',
    }
  } catch {
    return { decided: '', completed: '', outstanding: '', nextBrief: '' }
  }
}

function writeHandoff(state) {
  try {
    localStorage.setItem(HANDOFF_STORAGE_KEY, JSON.stringify(state))
  } catch {
    /* ignore */
  }
}

export function TaskDispatcherPage() {
  const { profile, loading } = useUserProfile()
  // Match the backend gate exactly (taskDispatcher.js — role === 'admin').
  // ProtectedRoute requireAdmin already keeps non-admins out; this is defense-in-depth.
  const allowed = profile?.role === 'admin'

  const [task, setTask] = useState('')
  const [sessionNotes, setSessionNotes] = useState('')
  const [modelHint, setModelHint] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(/** @type {Record<string, unknown> | null} */ (null))

  const [decided, setDecided] = useState('')
  const [completed, setCompleted] = useState('')
  const [outstanding, setOutstanding] = useState('')
  const [nextBrief, setNextBrief] = useState('')
  const [copied, setCopied] = useState(false)
  const [clearPending, setClearPending] = useState(false)

  useEffect(() => {
    const h = readHandoff()
    setDecided(h.decided)
    setCompleted(h.completed)
    setOutstanding(h.outstanding)
    setNextBrief(h.nextBrief)
  }, [])

  useEffect(() => {
    writeHandoff({ decided, completed, outstanding, nextBrief })
  }, [decided, completed, outstanding, nextBrief])

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
      const payload = {
        task: t,
        sessionNotes: String(sessionNotes || '').trim(),
        ...(modelHint ? { modelHint } : {}),
      }
      const res = await dispatchCallable(payload)
      const data = res.data && typeof res.data === 'object' ? res.data : {}
      setResult(data)
      if (data.error) {
        setError(String(data.error))
      }
    } catch (e) {
      setError(e?.message || String(e))
    } finally {
      setBusy(false)
    }
  }, [task, sessionNotes, modelHint])

  const onCopyPrompt = useCallback(async () => {
    const text = String(result?.generatedPrompt || '')
    if (!text) return
    await copyText(text)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }, [result])

  const clearHandoff = useCallback(() => {
    if (!clearPending) {
      setClearPending(true)
      return
    }
    setClearPending(false)
    setDecided('')
    setCompleted('')
    setOutstanding('')
    setNextBrief('')
    try {
      localStorage.removeItem(HANDOFF_STORAGE_KEY)
    } catch {
      /* ignore */
    }
  }, [clearPending])

  const costLabel = useMemo(() => {
    const r = result?.costCheckResult
    return typeof r === 'string' ? r : '—'
  }, [result])

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10 text-zinc-400 sm:px-6">
        <p className="text-sm">Loading…</p>
      </div>
    )
  }

  if (!allowed) {
    return (
      <div className="mx-auto flex min-h-[40vh] max-w-6xl items-center justify-center px-4 text-zinc-400 sm:px-6">
        <p className="text-center text-sm">This tool is not available for your role.</p>
      </div>
    )
  }

  const ctxList = Array.isArray(result?.contextToLoad) ? result.contextToLoad : []

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 text-zinc-100 sm:px-6 sm:py-8">
      <ModuleSubheader
        title="AI Task Dispatcher"
        subtitle="Route work to the named workforce — reads MODEL-REGISTRY and TEAM-BLUEPRINT on each run."
        maxWidthClass="max-w-6xl"
      />

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-zinc-800/90 bg-zinc-950/80 p-5 shadow-inner shadow-black/20 sm:p-6">
          <h2 className="text-sm font-semibold text-zinc-200">Task</h2>
          <label className="mt-3 block text-xs font-medium uppercase tracking-wide text-zinc-500">
            Description
          </label>
          <textarea
            value={task}
            onChange={(e) => setTask(e.target.value)}
            rows={5}
            placeholder="Describe the task..."
            className="mt-1 w-full resize-y rounded-xl border border-zinc-700 bg-zinc-900/80 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-amber-600/40 focus:ring-1 focus:ring-amber-500/30"
          />
          <label className="mt-4 block text-xs font-medium uppercase tracking-wide text-zinc-500">
            Session notes
          </label>
          <textarea
            value={sessionNotes}
            onChange={(e) => setSessionNotes(e.target.value)}
            rows={3}
            placeholder="Paste previous session handoff here..."
            className="mt-1 w-full resize-y rounded-xl border border-zinc-700 bg-zinc-900/80 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-amber-600/40 focus:ring-1 focus:ring-amber-500/30"
          />
          <label className="mt-4 block text-xs font-medium uppercase tracking-wide text-zinc-500">
            Model hint (optional)
          </label>
          <select
            value={modelHint}
            onChange={(e) => setModelHint(e.target.value)}
            className="mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-900/80 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-amber-600/40 focus:ring-1 focus:ring-amber-500/30"
          >
            {MODEL_HINTS.map((o) => (
              <option key={o.label} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy}
            onClick={() => void runDispatch()}
            className="mt-4 w-full rounded-xl bg-amber-600 py-3 text-sm font-semibold text-zinc-950 hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:px-8"
          >
            {busy ? 'Routing…' : 'Route Task'}
          </button>
          {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}
        </div>

        <div className="rounded-2xl border border-zinc-800/90 bg-zinc-950/80 p-5 shadow-inner shadow-black/20 sm:p-6">
          <h2 className="text-sm font-semibold text-zinc-200">Routing result</h2>
          {busy ? (
            <div className="mt-4">
              <RoutingSkeleton />
            </div>
          ) : result?.error ? (
            <div className="mt-4 space-y-2 text-sm">
              <p className="text-red-300">{String(result.error)}</p>
              {result.raw ? (
                <pre className="max-h-40 overflow-auto rounded-lg border border-zinc-800 bg-zinc-950/90 p-3 font-mono text-xs text-zinc-400">
                  {String(result.raw).slice(0, 4000)}
                </pre>
              ) : null}
            </div>
          ) : result && typeof result.assignedWorker === 'string' ? (
            <div className="mt-4 space-y-3 text-sm">
              <p>
                <span className="text-zinc-500">Assigned worker</span>{' '}
                <span className="font-medium text-zinc-100">{String(result.assignedWorker || '—')}</span>
              </p>
              <p>
                <span className="text-zinc-500">Model</span>{' '}
                <span className="font-mono text-xs text-zinc-300">{String(result.modelVersion || '—')}</span>
              </p>
              <p>
                <span className="text-zinc-500">Platform</span>{' '}
                <span className="text-zinc-200">{String(result.platform || '—')}</span>
              </p>
              <p>
                <span className="text-zinc-500">Rationale</span>
                <br />
                <span className="text-zinc-300">{String(result.rationale || '—')}</span>
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-zinc-500">Cost check</span>
                <span
                  className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${costCheckBadgeClass(costLabel)}`}
                >
                  {costLabel}
                </span>
              </div>
              <p className="text-zinc-400">
                <span className="text-zinc-500">Note</span> — {String(result.costCheckNote || '—')}
              </p>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Context to load</p>
                <ul className="mt-2 list-inside list-disc space-y-1 text-zinc-300">
                  {ctxList.length ? (
                    ctxList.map((x, i) => (
                      <li key={i} className="[overflow-wrap:anywhere]">
                        {String(x)}
                      </li>
                    ))
                  ) : (
                    <li className="text-zinc-500">—</li>
                  )}
                </ul>
              </div>
            </div>
          ) : (
            <p className="mt-4 text-sm text-zinc-500">Submit a task to see routing output.</p>
          )}
        </div>

        <div className="rounded-2xl border border-zinc-800/90 bg-zinc-950/80 p-5 shadow-inner shadow-black/20 sm:p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-sm font-semibold text-zinc-200">Generated prompt</h2>
            <button
              type="button"
              disabled={!result?.generatedPrompt}
              onClick={() => void onCopyPrompt()}
              className="rounded-lg border border-zinc-600 px-3 py-1.5 text-xs font-medium text-amber-200/90 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {copied ? 'Copied ✓' : 'Copy'}
            </button>
          </div>
          <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-xl border border-zinc-800 bg-zinc-950/90 p-4 font-mono text-xs leading-relaxed text-zinc-200">
            {String(result?.generatedPrompt || '—')}
          </pre>
        </div>
      </div>

      <section className="mt-10 rounded-2xl border border-zinc-800/90 bg-zinc-950/80 p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-sm font-semibold text-zinc-200">Session handoff</h2>
          <button
            type="button"
            onClick={() => void clearHandoff()}
            className="rounded-lg border border-zinc-600 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800"
          >
            {clearPending ? 'Confirm clear?' : 'Clear Handoff'}
          </button>
        </div>
        <p className="mt-1 text-xs text-zinc-500">
          Persists locally ({HANDOFF_STORAGE_KEY}). See docs/SESSION-HANDOFF-SCHEMA.md.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500">
            DECIDED
            <textarea
              value={decided}
              onChange={(e) => {
                setClearPending(false)
                setDecided(e.target.value)
              }}
              rows={4}
              className="mt-1 w-full resize-y rounded-xl border border-zinc-700 bg-zinc-900/80 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-amber-600/40"
            />
          </label>
          <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500">
            COMPLETED
            <textarea
              value={completed}
              onChange={(e) => {
                setClearPending(false)
                setCompleted(e.target.value)
              }}
              rows={4}
              className="mt-1 w-full resize-y rounded-xl border border-zinc-700 bg-zinc-900/80 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-amber-600/40"
            />
          </label>
          <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500">
            OUTSTANDING
            <textarea
              value={outstanding}
              onChange={(e) => {
                setClearPending(false)
                setOutstanding(e.target.value)
              }}
              rows={4}
              className="mt-1 w-full resize-y rounded-xl border border-zinc-700 bg-zinc-900/80 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-amber-600/40"
            />
          </label>
          <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500">
            NEXT SESSION BRIEF
            <textarea
              value={nextBrief}
              onChange={(e) => {
                setClearPending(false)
                setNextBrief(e.target.value)
              }}
              rows={4}
              className="mt-1 w-full resize-y rounded-xl border border-zinc-700 bg-zinc-900/80 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-amber-600/40"
            />
          </label>
        </div>
      </section>
    </div>
  )
}
