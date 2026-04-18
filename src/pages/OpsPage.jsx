import {
  addDoc,
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { auth, db, functions, firebaseProjectId } from '../firebase/config'
import { useToast } from '../context/ToastContext.jsx'
import { ModuleSubheader } from '../components/layout/ModuleSubheader.jsx'
import Spinner from '../components/ui/Spinner.jsx'
import { useUserProfile } from '../hooks/useUserProfile'
import { formatCurrency, formatPercent, formatQty } from '../utils/format'
import { EmptyState, EmptyStateIcons } from '../components/shared/EmptyState.jsx'
import { LoadingBlock } from '../components/shared/LoadingBlock.jsx'

const EXPENSE_CATEGORIES = [
  { value: 'fuel', label: 'Fuel' },
  { value: 'supplies', label: 'Supplies' },
  { value: 'tools', label: 'Tools' },
  { value: 'other', label: 'Other' },
]

const exportTaxPrepCsv = httpsCallable(functions, 'exportTaxPrepCsv')
// Tire price research runs synchronously for 2-5 minutes against 500 tires.
// Firebase's callable SDK defaults to a 70-second client timeout, so without
// this override the browser aborts while the function happily keeps running
// on the server; the UI shows "failed" even though the Slack completion
// summary still posts. Match the server-side `timeoutSeconds: 540`.
const runTirePriceResearchNow = httpsCallable(functions, 'runTirePriceResearchNow', {
  timeout: 540000,
})

const DENVER_TZ = 'America/Denver'

function denverYmdString(ms = Date.now()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: DENVER_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(ms))
  const y = parts.find((p) => p.type === 'year')?.value
  const m = parts.find((p) => p.type === 'month')?.value
  const d = parts.find((p) => p.type === 'day')?.value
  return `${y}-${m}-${d}`
}

function denverMonthStartYmd(ms = Date.now()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: DENVER_TZ,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date(ms))
  const y = parts.find((p) => p.type === 'year')?.value
  const mo = parts.find((p) => p.type === 'month')?.value
  return `${y}-${mo}-01`
}

function formatTs(ts) {
  if (!ts || typeof ts.toDate !== 'function') return '—'
  try {
    return ts.toDate().toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' })
  } catch {
    return '—'
  }
}

function downloadCsvString(csv, fileName) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function OpsPage() {
  const { profile, loading: profileLoading } = useUserProfile()
  const { toast } = useToast()

  const [expenses, setExpenses] = useState([])
  const [expLoading, setExpLoading] = useState(true)
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('fuel')
  const [note, setNote] = useState('')
  const [expDate, setExpDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [savingExp, setSavingExp] = useState(false)

  const [reorderEntries, setReorderEntries] = useState([])
  const [reorderDesc, setReorderDesc] = useState(() => new Map())
  const [fulfillingId, setFulfillingId] = useState(null)

  const [taxStart, setTaxStart] = useState(() => denverMonthStartYmd())
  const [taxEnd, setTaxEnd] = useState(() => denverYmdString())
  const [taxBusy, setTaxBusy] = useState(false)

  const [priceResearchBusy, setPriceResearchBusy] = useState(false)

  const region = import.meta.env.VITE_FUNCTIONS_REGION || 'us-central1'
  const inboundSmsUrl = `https://${region}-${firebaseProjectId}.cloudfunctions.net/inboundSms`

  useEffect(() => {
    const q = query(collection(db, 'expenses'), orderBy('createdAt', 'desc'), limit(500))
    return onSnapshot(
      q,
      (snap) => {
        setExpenses(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
        setExpLoading(false)
      },
      (e) => {
        console.error(e)
        setExpLoading(false)
      },
    )
  }, [])

  useEffect(() => {
    return onSnapshot(
      doc(db, 'meta', 'reorderQueue'),
      (snap) => {
        const data = snap.exists() ? snap.data() || {} : {}
        const entries = Array.isArray(data.entries) ? data.entries : []
        setReorderEntries(entries)
      },
      () => setReorderEntries([]),
    )
  }, [])

  useEffect(() => {
    let cancelled = false
    const ms = [...new Set(reorderEntries.map((e) => String(e.mspn || '').trim()).filter(Boolean))]
    if (ms.length === 0) return undefined
    ;(async () => {
      const fetched = new Map()
      for (const id of ms) {
        try {
          const t = await getDoc(doc(db, 'tires', id))
          const desc = t.exists()
            ? String(t.data()?.description || t.data()?.tread || id).trim() || id
            : id
          fetched.set(id, desc)
        } catch {
          fetched.set(id, id)
        }
      }
      if (!cancelled) {
        setReorderDesc((prev) => {
          const merged = new Map(prev)
          for (const [k, v] of fetched) merged.set(k, v)
          return merged
        })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [reorderEntries])

  const expenseTotal = useMemo(
    () => expenses.reduce((s, r) => s + (Number(r.amount) || 0), 0),
    [expenses],
  )

  const byCat = useMemo(() => {
    const m = { fuel: 0, supplies: 0, tools: 0, other: 0 }
    for (const r of expenses) {
      const k = String(r.category || 'other')
      if (m[k] == null) m.other += Number(r.amount) || 0
      else m[k] += Number(r.amount) || 0
    }
    return m
  }, [expenses])

  async function addExpense(e) {
    e.preventDefault()
    const n = Number(amount)
    if (!Number.isFinite(n) || n <= 0) {
      toast('Enter a valid amount.', 'error')
      return
    }
    const loggedBy = String(auth.currentUser?.email || auth.currentUser?.uid || 'unknown')
    setSavingExp(true)
    try {
      await addDoc(collection(db, 'expenses'), {
        amount: n,
        category,
        note: String(note || '').trim(),
        date: expDate,
        loggedBy,
        createdAt: serverTimestamp(),
      })
      toast('Expense logged', 'success')
      setAmount('')
      setNote('')
    } catch (err) {
      toast(err?.message || 'Could not save expense.', 'error')
    } finally {
      setSavingExp(false)
    }
  }

  const removeReorderEntry = useCallback(
    async (id) => {
      const next = reorderEntries.filter((x) => x.id !== id)
      setFulfillingId(id)
      try {
        await setDoc(
          doc(db, 'meta', 'reorderQueue'),
          {
            entries: next,
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        )
      } catch (err) {
        toast(err?.message || 'Could not update reorder queue.', 'error')
      } finally {
        setFulfillingId(null)
      }
    },
    [reorderEntries, toast],
  )

  async function runTaxExport() {
    setTaxBusy(true)
    try {
      const res = await exportTaxPrepCsv({ startYmd: taxStart, endYmd: taxEnd })
      const data = res.data
      const csv = String(data?.csv || '')
      const fileName = String(data?.fileName || 'tax-prep-orders.csv')
      if (!csv) {
        toast('No CSV data returned from server.', 'error')
        return
      }
      downloadCsvString(csv, fileName)
    } catch (err) {
      toast(err?.message || 'Export failed.', 'error')
    } finally {
      setTaxBusy(false)
    }
  }

  async function runPriceResearch() {
    setPriceResearchBusy(true)
    toast('Price research kicked off. Slack will post progress + the final summary.', 'info')
    try {
      await runTirePriceResearchNow({})
      toast('Price research run complete. Check #fleet-ops Slack for details.', 'success')
    } catch (err) {
      // The callable can still take longer than our 9-minute ceiling on truly
      // huge backlogs. The server keeps running even if the client bails, so
      // we distinguish genuine errors (bad key, permissions) from a
      // deadline-exceeded where Slack will deliver the result anyway.
      const code = err?.code || ''
      const msg = err?.message || 'Price research failed.'
      if (code === 'deadline-exceeded' || code === 'functions/deadline-exceeded') {
        toast('Still running on the server. The Slack summary will post when it finishes.', 'info')
      } else {
        toast(msg, 'error')
      }
    } finally {
      setPriceResearchBusy(false)
    }
  }

  if (!profileLoading && profile && String(profile.role || '') !== 'admin') {
    return <Navigate to="/dashboard?notice=access" replace />
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <ModuleSubheader
        title="Ops Command"
        subtitle="Business expenses, tax-prep export, reorder queue, and inbound SMS relay to Slack"
        tabs={[]}
        maxWidthClass="max-w-6xl"
      />

      <main className="mx-auto max-w-6xl space-y-10 px-6 py-10 sm:py-12">
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-white">Expense tracker</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Log non-tire business spend. Share of listed expenses:{' '}
            {EXPENSE_CATEGORIES.map((c, i) => (
              <span key={c.value}>
                {c.label}{' '}
                <span className="text-zinc-300">
                  {expenseTotal > 0
                    ? formatPercent((100 * (byCat[c.value] || 0)) / expenseTotal, 1)
                    : formatPercent(0, 1)}
                </span>
                {i < EXPENSE_CATEGORIES.length - 1 ? ' · ' : ''}
              </span>
            ))}
          </p>
          <p className="mt-2 text-sm text-zinc-400">
            Total of listed entries: {formatCurrency(expenseTotal)}
          </p>

          <form
            onSubmit={addExpense}
            className="mt-5 grid max-sm:gap-3 sm:grid-cols-[1fr_1fr_2fr_auto_auto] sm:items-end sm:gap-3"
          >
            <div>
              <label className="block text-xs font-medium text-zinc-500">Amount</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(ev) => setAmount(ev.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-600 bg-zinc-950 px-3 py-2 text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500">Category</label>
              <select
                value={category}
                onChange={(ev) => setCategory(ev.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-600 bg-zinc-950 px-3 py-2 text-sm"
              >
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-1">
              <label className="block text-xs font-medium text-zinc-500">Note</label>
              <input
                type="text"
                value={note}
                onChange={(ev) => setNote(ev.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-600 bg-zinc-950 px-3 py-2 text-sm"
                placeholder="What was this for?"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500">Date</label>
              <input
                type="date"
                value={expDate}
                onChange={(ev) => setExpDate(ev.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-600 bg-zinc-950 px-3 py-2 text-sm"
                required
              />
            </div>
            <div>
              <button
                type="submit"
                disabled={savingExp}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
              >
                {savingExp && <Spinner className="h-4 w-4 text-zinc-700" />}
                {savingExp ? 'Saving…' : 'Add expense'}
              </button>
            </div>
          </form>

          <div className="mt-6 overflow-x-auto rounded-xl border border-zinc-800">
            <table className="w-full max-sm:min-w-0 border-collapse text-left text-sm sm:min-w-[720px]">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900/60 text-xs uppercase tracking-wide text-zinc-500">
                  <th className="px-3 py-2">Amount</th>
                  <th className="px-3 py-2 max-sm:hidden">Category</th>
                  <th className="px-3 py-2">Note</th>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Logged by</th>
                  <th className="px-3 py-2">Recorded</th>
                </tr>
              </thead>
              <tbody>
                {expLoading ? (
                  <tr>
                    <td colSpan={6}>
                      <LoadingBlock label="Loading expenses…" variant="inline" />
                    </td>
                  </tr>
                ) : expenses.length === 0 ? (
                  <EmptyState
                    variant="row"
                    colSpan={6}
                    icon={EmptyStateIcons.dollar}
                    title="No expenses yet"
                    description="Log fuel, supplies, and other costs here for tax prep. Expense entries flow straight into the Denver-dated CSV export."
                  />
                ) : (
                  expenses.map((r) => (
                    <tr key={r.id} className="border-b border-zinc-800/80">
                      <td className="px-3 py-2 font-medium text-zinc-200">{formatCurrency(r.amount)}</td>
                      <td className="px-3 py-2 text-zinc-400 max-sm:hidden">{r.category}</td>
                      <td className="px-3 py-2 text-zinc-300">{r.note || '—'}</td>
                      <td className="px-3 py-2 text-zinc-400">{r.date || '—'}</td>
                      <td className="px-3 py-2 font-mono text-xs text-zinc-500">{r.loggedBy || '—'}</td>
                      <td className="px-3 py-2 text-xs text-zinc-500">{formatTs(r.createdAt)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-white">Tax prep export</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Denver calendar dates · completed orders only · CSV uses plain numbers (no currency symbols).
          </p>
          <div className="mt-4 flex max-sm:flex-col max-sm:gap-3 sm:flex-wrap sm:items-end sm:gap-4">
            <div>
              <label className="block text-xs font-medium text-zinc-500">Start (Denver)</label>
              <input
                type="date"
                value={taxStart}
                onChange={(ev) => setTaxStart(ev.target.value)}
                className="mt-1 rounded-lg border border-zinc-600 bg-zinc-950 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500">End (Denver)</label>
              <input
                type="date"
                value={taxEnd}
                onChange={(ev) => setTaxEnd(ev.target.value)}
                className="mt-1 rounded-lg border border-zinc-600 bg-zinc-950 px-3 py-2 text-sm"
              />
            </div>
            <button
              type="button"
              onClick={() => void runTaxExport()}
              disabled={taxBusy}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {taxBusy && <Spinner className="h-4 w-4 text-zinc-700" />}
              {taxBusy ? 'Building CSV…' : 'Download CSV'}
            </button>
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-white">Reorder queue</h2>
          <p className="mt-1 text-sm text-zinc-500">From Slack `/reorder` — fulfilled or dismiss to clear.</p>
          <div className="mt-4 overflow-x-auto rounded-xl border border-zinc-800">
            <table className="w-full max-sm:min-w-0 border-collapse text-left text-sm sm:min-w-[800px]">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900/60 text-xs uppercase tracking-wide text-zinc-500">
                  <th className="px-3 py-2">MSPN</th>
                  <th className="px-3 py-2">Description</th>
                  <th className="px-3 py-2">Qty</th>
                  <th className="px-3 py-2 max-sm:hidden">Requested by</th>
                  <th className="px-3 py-2 max-sm:hidden">Requested at</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {reorderEntries.length === 0 ? (
                  <EmptyState
                    variant="row"
                    colSpan={6}
                    icon={EmptyStateIcons.tag}
                    title="Queue is empty"
                    description="Kyle adds tires to reorder via Slack `/reorder`. Anything pending here shows up until marked fulfilled."
                  />
                ) : (
                  reorderEntries.map((row) => (
                    <tr key={row.id} className="border-b border-zinc-800/80">
                      <td className="px-3 py-2 font-mono text-xs text-amber-200/90">{row.mspn}</td>
                      <td className="max-w-[240px] truncate px-3 py-2 text-zinc-400">
                        {reorderDesc.get(String(row.mspn || '')) || '—'}
                      </td>
                      <td className="px-3 py-2 text-zinc-300">{formatQty(row.qty)}</td>
                      <td className="px-3 py-2 text-zinc-400 max-sm:hidden">{row.requestedBy || '—'}</td>
                      <td className="px-3 py-2 text-xs text-zinc-500 max-sm:hidden">{formatTs(row.requestedAt)}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => void removeReorderEntry(row.id)}
                            disabled={fulfillingId === row.id}
                            className="inline-flex items-center gap-1.5 rounded border border-emerald-800/80 px-2 py-1 text-xs text-emerald-200 hover:bg-emerald-950/50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {fulfillingId === row.id && <Spinner className="h-3 w-3 text-emerald-300" />}
                            Fulfilled
                          </button>
                          <button
                            type="button"
                            onClick={() => void removeReorderEntry(row.id)}
                            disabled={fulfillingId === row.id}
                            className="inline-flex items-center gap-1.5 rounded border border-zinc-600 px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800/80 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {fulfillingId === row.id && <Spinner className="h-3 w-3 text-zinc-400" />}
                            Dismiss
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-white">Price research</h2>
          <p className="mt-2 text-sm text-zinc-400">
            Runs the Gemini-backed wholesale-price check against up to 100 tires. Same job the nightly 2 AM cron
            runs; use this to test after setting <code className="text-zinc-300">GEMINI_API_KEY</code> or to pull a
            fresh batch on demand.
          </p>
          <p className="mt-2 text-xs text-zinc-600">
            Writes only to <code className="text-zinc-400">priceIntel.*</code>. Tires with{' '}
            <code className="text-zinc-400">priceIntel.kyleConfirmed = true</code> are skipped. Large deltas (more
            than 15%) are flagged in Slack for review rather than accepted automatically.
          </p>
          <button
            type="button"
            onClick={() => void runPriceResearch()}
            disabled={priceResearchBusy}
            className="mt-4 inline-flex items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {priceResearchBusy && <Spinner className="h-4 w-4 text-zinc-800" />}
            {priceResearchBusy ? 'Running price research…' : 'Run price research now'}
          </button>
        </section>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-white">Inbound SMS (Sinch)</h2>
          <p className="mt-2 text-sm text-zinc-400">
            Configure the Sinch <span className="text-zinc-300">incoming SMS</span> webhook URL to this endpoint after
            deploy. Replies post to #fleet-ops with a Slack <span className="text-zinc-300">Reply</span> button (uses
            existing Slack interactivity + Sinch outbound).
          </p>
          <p className="mt-3 break-all font-mono text-xs text-cyan-300/90">{inboundSmsUrl}</p>
          <p className="mt-2 text-xs text-zinc-600">
            Optional: set <code className="text-zinc-400">SINCH_INBOUND_SHARED_SECRET</code> in Functions env and send
            matching <code className="text-zinc-400">Authorization: Bearer …</code> header.
          </p>
        </section>
      </main>
    </div>
  )
}
