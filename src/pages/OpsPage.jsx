import { signOut } from 'firebase/auth'
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
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { auth, db, functions, firebaseProjectId } from '../firebase/config'
import { PortalSessionLine } from '../components/layout/PortalSessionLine.jsx'
import { useAuth } from '../hooks/useAuth'
import { useUserProfile } from '../hooks/useUserProfile'
import { formatCurrency, formatPercent, formatQty } from '../utils/format'

const EXPENSE_CATEGORIES = [
  { value: 'fuel', label: 'Fuel' },
  { value: 'supplies', label: 'Supplies' },
  { value: 'tools', label: 'Tools' },
  { value: 'other', label: 'Other' },
]

const exportTaxPrepCsv = httpsCallable(functions, 'exportTaxPrepCsv')

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
  const { user } = useAuth()
  const { profile, loading: profileLoading } = useUserProfile()
  const navigate = useNavigate()

  const [expenses, setExpenses] = useState([])
  const [expLoading, setExpLoading] = useState(true)
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('fuel')
  const [note, setNote] = useState('')
  const [expDate, setExpDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [savingExp, setSavingExp] = useState(false)

  const [reorderEntries, setReorderEntries] = useState([])
  const [reorderDesc, setReorderDesc] = useState(() => new Map())

  const [taxStart, setTaxStart] = useState(() => {
    const d = new Date()
    d.setMonth(d.getMonth() - 1)
    return d.toISOString().slice(0, 10)
  })
  const [taxEnd, setTaxEnd] = useState(() => new Date().toISOString().slice(0, 10))
  const [taxBusy, setTaxBusy] = useState(false)

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
      window.alert('Enter a valid amount.')
      return
    }
    const loggedBy = String(user?.email || user?.uid || 'unknown')
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
      setAmount('')
      setNote('')
    } catch (err) {
      window.alert(err?.message || String(err))
    } finally {
      setSavingExp(false)
    }
  }

  const removeReorderEntry = useCallback(
    async (id) => {
      const next = reorderEntries.filter((x) => x.id !== id)
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
        window.alert(err?.message || String(err))
      }
    },
    [reorderEntries],
  )

  async function runTaxExport() {
    setTaxBusy(true)
    try {
      const res = await exportTaxPrepCsv({ startYmd: taxStart, endYmd: taxEnd })
      const data = res.data
      const csv = String(data?.csv || '')
      const fileName = String(data?.fileName || 'tax-prep-orders.csv')
      if (!csv) {
        window.alert('No CSV returned.')
        return
      }
      downloadCsvString(csv, fileName)
    } catch (err) {
      window.alert(err?.message || String(err))
    } finally {
      setTaxBusy(false)
    }
  }

  async function handleSignOut() {
    await signOut(auth)
    navigate('/', { replace: true })
  }

  if (!profileLoading && profile && String(profile.role || '') !== 'admin') {
    return <Navigate to="/dashboard?notice=access" replace />
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800/90 bg-zinc-950/75 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-5 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500 max-sm:hidden">
              Skedaddle OS · Admin
            </p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-white sm:text-2xl">Ops Command</h1>
            <p className="mt-2 max-w-xl text-sm text-zinc-400">
              Business expenses, tax-prep order export, inventory reorder queue, and inbound SMS relay to Slack.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
              <Link to="/dashboard" className="text-amber-300/90 hover:text-amber-200">
                ← Dashboard
              </Link>
            </div>
          </div>
          <div className="max-sm:w-full sm:text-right">
            <div className="max-sm:mb-3 sm:hidden">
              <PortalSessionLine email={user?.email} onSignOut={handleSignOut} />
            </div>
            <div className="hidden sm:block">
              <PortalSessionLine email={user?.email} onSignOut={handleSignOut} />
            </div>
          </div>
        </div>
      </header>

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
                className="w-full rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-500 disabled:opacity-50 sm:w-auto"
              >
                {savingExp ? 'Saving…' : 'Add expense'}
              </button>
            </div>
          </form>

          <div className="mt-6 overflow-x-auto rounded-xl border border-zinc-800">
            <table className="min-w-[720px] w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900/60 text-xs uppercase tracking-wide text-zinc-500">
                  <th className="px-3 py-2">Amount</th>
                  <th className="px-3 py-2">Category</th>
                  <th className="px-3 py-2">Note</th>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Logged by</th>
                  <th className="px-3 py-2">Recorded</th>
                </tr>
              </thead>
              <tbody>
                {expLoading ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-zinc-500">
                      Loading…
                    </td>
                  </tr>
                ) : expenses.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-zinc-500">
                      No expenses yet.
                    </td>
                  </tr>
                ) : (
                  expenses.map((r) => (
                    <tr key={r.id} className="border-b border-zinc-800/80">
                      <td className="px-3 py-2 font-medium text-zinc-200">{formatCurrency(r.amount)}</td>
                      <td className="px-3 py-2 text-zinc-400">{r.category}</td>
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
              className="rounded-lg bg-cyan-700 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-600 disabled:opacity-50"
            >
              {taxBusy ? 'Building CSV…' : 'Download CSV'}
            </button>
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-white">Reorder queue</h2>
          <p className="mt-1 text-sm text-zinc-500">From Slack `/reorder` — fulfilled or dismiss to clear.</p>
          <div className="mt-4 overflow-x-auto rounded-xl border border-zinc-800">
            <table className="min-w-[800px] w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900/60 text-xs uppercase tracking-wide text-zinc-500">
                  <th className="px-3 py-2">MSPN</th>
                  <th className="px-3 py-2">Description</th>
                  <th className="px-3 py-2">Qty</th>
                  <th className="px-3 py-2">Requested by</th>
                  <th className="px-3 py-2">Requested at</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {reorderEntries.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-zinc-500">
                      Queue is empty.
                    </td>
                  </tr>
                ) : (
                  reorderEntries.map((row) => (
                    <tr key={row.id} className="border-b border-zinc-800/80">
                      <td className="px-3 py-2 font-mono text-xs text-amber-200/90">{row.mspn}</td>
                      <td className="max-w-[240px] truncate px-3 py-2 text-zinc-400">
                        {reorderDesc.get(String(row.mspn || '')) || '—'}
                      </td>
                      <td className="px-3 py-2 text-zinc-300">{formatQty(row.qty)}</td>
                      <td className="px-3 py-2 text-zinc-400">{row.requestedBy || '—'}</td>
                      <td className="px-3 py-2 text-xs text-zinc-500">{formatTs(row.requestedAt)}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => void removeReorderEntry(row.id)}
                            className="rounded border border-emerald-800/80 px-2 py-1 text-xs text-emerald-200 hover:bg-emerald-950/50"
                          >
                            Fulfilled
                          </button>
                          <button
                            type="button"
                            onClick={() => void removeReorderEntry(row.id)}
                            className="rounded border border-zinc-600 px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800/80"
                          >
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
