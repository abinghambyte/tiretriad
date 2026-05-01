import { useEffect, useMemo, useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import { doc, onSnapshot } from 'firebase/firestore'
import { db, functions } from '../../firebase/config'
import { useToast } from '../../context/ToastContext.jsx'

const addFn = httpsCallable(functions, 'addListingCoachRule')
const toggleFn = httpsCallable(functions, 'toggleListingCoachRule')
const removeFn = httpsCallable(functions, 'removeListingCoachRule')

const AUDIENCES = ['all', 'consumer', 'commercial']

export function ListingCoachRulesPanel() {
  const [rules, setRules] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [adding, setAdding] = useState(false)
  const [draftRule, setDraftRule] = useState('')
  const [draftAudience, setDraftAudience] = useState('all')
  const [draftReason, setDraftReason] = useState('')
  const { toast } = useToast()

  useEffect(() => {
    const ref = doc(db, 'meta', 'listingCoachStyleGuide')
    return onSnapshot(ref, (snap) => {
      const data = snap.exists() ? snap.data() : {}
      setRules(Array.isArray(data?.rules) ? data.rules : [])
      setLoaded(true)
    })
  }, [])

  const sorted = useMemo(() => {
    return rules.slice().sort((a, b) => String(a.audience).localeCompare(String(b.audience)))
  }, [rules])

  async function handleAdd(e) {
    e.preventDefault()
    const rule = String(draftRule || '').trim()
    if (!rule) {
      toast('Rule text required.', 'error')
      return
    }
    setAdding(true)
    try {
      await addFn({ rule, audience: draftAudience, reason: draftReason.trim() || null })
      setDraftRule('')
      setDraftReason('')
      setDraftAudience('all')
      toast('Rule added.', 'success')
    } catch (err) {
      toast(String(err?.message || err), 'error')
    } finally {
      setAdding(false)
    }
  }

  async function handleToggle(rule) {
    setBusyId(rule.id)
    try {
      await toggleFn({ id: rule.id, enabled: !rule.enabled })
      toast(rule.enabled ? 'Rule disabled.' : 'Rule enabled.', 'success')
    } catch (err) {
      toast(String(err?.message || err), 'error')
    } finally {
      setBusyId(null)
    }
  }

  async function handleRemove(rule) {
    if (!window.confirm(`Remove rule: "${rule.rule}"?`)) return
    setBusyId(rule.id)
    try {
      await removeFn({ id: rule.id })
      toast('Rule removed.', 'success')
    } catch (err) {
      toast(String(err?.message || err), 'error')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 sm:p-6">
      <header>
        <h2 className="text-sm font-semibold text-zinc-100">Listing Coach style rules</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Persistent corrections fed into the coach&apos;s system prompt. Disabled rules stay in
          history but stop influencing drafts.
        </p>
      </header>

      <form onSubmit={handleAdd} className="mt-5 space-y-3 border-t border-zinc-800 pt-4">
        <div>
          <label
            htmlFor="lcr-rule"
            className="block text-xs font-semibold uppercase tracking-wide text-zinc-400"
          >
            Rule text
          </label>
          <textarea
            id="lcr-rule"
            value={draftRule}
            onChange={(e) => setDraftRule(e.target.value)}
            rows={2}
            placeholder='e.g. never mention "eFleet" in listing copy'
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-amber-600/50 focus:outline-none"
          />
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label
              htmlFor="lcr-audience"
              className="block text-xs font-semibold uppercase tracking-wide text-zinc-400"
            >
              Audience
            </label>
            <select
              id="lcr-audience"
              value={draftAudience}
              onChange={(e) => setDraftAudience(e.target.value)}
              className="mt-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-amber-600/50 focus:outline-none"
            >
              {AUDIENCES.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <label
              htmlFor="lcr-reason"
              className="block text-xs font-semibold uppercase tracking-wide text-zinc-400"
            >
              Reason (optional)
            </label>
            <input
              id="lcr-reason"
              type="text"
              value={draftReason}
              onChange={(e) => setDraftReason(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-amber-600/50 focus:outline-none"
              placeholder="why this matters"
            />
          </div>
          <button
            type="submit"
            disabled={adding}
            className="inline-flex min-h-[40px] items-center rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {adding ? 'Adding...' : 'Add rule'}
          </button>
        </div>
      </form>

      <div className="mt-6 border-t border-zinc-800 pt-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Rules ({sorted.length})
        </h3>
        {!loaded ? (
          <p className="mt-3 text-sm text-zinc-500">Loading...</p>
        ) : sorted.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">No rules yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {sorted.map((r) => (
              <li
                key={r.id}
                className={`flex items-start justify-between gap-3 rounded-xl border px-3 py-2 text-sm ${
                  r.enabled === false
                    ? 'border-zinc-800 bg-zinc-900/20 opacity-60'
                    : 'border-zinc-800 bg-zinc-900/40'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-zinc-100">{r.rule}</p>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    audience: <span className="font-mono">{r.audience}</span>
                    {r.reason ? ` · ${r.reason}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    disabled={busyId === r.id}
                    onClick={() => void handleToggle(r)}
                    className="rounded-lg border border-zinc-700 px-3 py-1 text-xs text-zinc-200 hover:bg-zinc-800/60 disabled:opacity-40"
                  >
                    {r.enabled === false ? 'Enable' : 'Disable'}
                  </button>
                  <button
                    type="button"
                    disabled={busyId === r.id}
                    onClick={() => void handleRemove(r)}
                    className="rounded-lg border border-rose-900/50 px-3 py-1 text-xs text-rose-300 hover:bg-rose-950/40 disabled:opacity-40"
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
