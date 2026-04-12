import { signOut } from 'firebase/auth'
import {
  collection,
  getDocs,
  limit,
  onSnapshot,
  query,
  updateDoc,
  where,
  doc,
  getDoc,
} from 'firebase/firestore'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { auth, db } from '../firebase/config'
import { useAuth } from '../hooks/useAuth'

function formatMoney(n) {
  if (n == null || Number.isNaN(Number(n))) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
    Number(n),
  )
}

function formatTs(ts) {
  if (!ts || typeof ts.toDate !== 'function') return '—'
  try {
    return ts.toDate().toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' })
  } catch {
    return '—'
  }
}

function displayPhone(id) {
  const d = String(id || '')
  if (d.length === 11 && d.startsWith('1')) {
    const r = d.slice(1)
    return `+1 (${r.slice(0, 3)}) ${r.slice(3, 6)}-${r.slice(6)}`
  }
  return d || '—'
}

export function ContactsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState('name')
  const [sortDir, setSortDir] = useState('asc')
  const [selected, setSelected] = useState(null)
  const [ordersFor, setOrdersFor] = useState([])
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [ghostCount, setGhostCount] = useState(null)
  const [notesDraft, setNotesDraft] = useState('')
  const [notesSaving, setNotesSaving] = useState(false)

  useEffect(() => {
    const q = query(collection(db, 'contacts'), limit(2000))
    return onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
        list.sort((a, b) =>
          String(a.name || '').localeCompare(String(b.name || ''), undefined, {
            sensitivity: 'base',
          }),
        )
        setRows(list)
        setLoading(false)
      },
      (e) => {
        console.error(e)
        setLoading(false)
      },
    )
  }, [])

  const openPanel = useCallback(async (c) => {
    setSelected(c)
    setNotesDraft(String(c.notes || ''))
    setOrdersFor([])
    setGhostCount(null)
    setOrdersLoading(true)
    try {
      const [gSnap, oSnap] = await Promise.all([
        getDoc(doc(db, 'ghostContacts', c.id)),
        getDocs(
          query(
            collection(db, 'orders'),
            where('contactPhoneKey', '==', c.id),
            limit(120),
          ),
        ),
      ])
      if (gSnap.exists()) {
        setGhostCount(Number(gSnap.data().ghostCount) || 0)
      } else {
        setGhostCount(0)
      }
      const list = oSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
      list.sort((a, b) => {
        const am = a.createdAt?.toMillis?.() ?? 0
        const bm = b.createdAt?.toMillis?.() ?? 0
        return bm - am
      })
      setOrdersFor(list)
    } catch (e) {
      console.error(e)
    } finally {
      setOrdersLoading(false)
    }
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(
      (r) =>
        String(r.name || '')
          .toLowerCase()
          .includes(q) ||
        String(r.phoneNumber || r.id || '')
          .toLowerCase()
          .includes(q),
    )
  }, [rows, search])

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1
    const copy = [...filtered]
    copy.sort((a, b) => {
      if (sortKey === 'name') {
        return dir * String(a.name || '').localeCompare(String(b.name || ''))
      }
      if (sortKey === 'phone') {
        return dir * String(a.id).localeCompare(String(b.id))
      }
      if (sortKey === 'orders') {
        const av = Number(a.orderCount) || 0
        const bv = Number(b.orderCount) || 0
        return av === bv ? 0 : av < bv ? -dir : dir
      }
      if (sortKey === 'spend') {
        const av = Number(a.totalSpend) || 0
        const bv = Number(b.totalSpend) || 0
        return av === bv ? 0 : av < bv ? -dir : dir
      }
      if (sortKey === 'last') {
        const av = a.lastOrderAt?.toMillis?.() ?? 0
        const bv = b.lastOrderAt?.toMillis?.() ?? 0
        return av === bv ? 0 : av < bv ? -dir : dir
      }
      return 0
    })
    return copy
  }, [filtered, sortKey, sortDir])

  function toggleSort(key) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir(key === 'name' || key === 'phone' ? 'asc' : 'desc')
    }
  }

  async function saveNotes() {
    if (!selected) return
    setNotesSaving(true)
    try {
      await updateDoc(doc(db, 'contacts', selected.id), { notes: notesDraft })
    } catch (e) {
      window.alert(e?.message || String(e))
    } finally {
      setNotesSaving(false)
    }
  }

  async function handleSignOut() {
    await signOut(auth)
    navigate('/', { replace: true })
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="sticky top-0 z-20 border-b border-zinc-800/80 bg-zinc-950/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div>
            <Link to="/dashboard" className="text-sm text-zinc-500 hover:text-zinc-200">
              ← Dashboard
            </Link>
            <h1 className="mt-2 text-xl font-semibold text-white">Contacts</h1>
            <p className="mt-1 text-sm text-zinc-500">Customer memory from completed orders</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden max-w-[200px] truncate text-xs text-zinc-500 sm:inline">
              {user?.email}
            </span>
            <button
              type="button"
              onClick={() => void handleSignOut()}
              className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:border-zinc-500"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-4 px-6 py-8">
        <div className="relative z-10 w-full max-w-2xl space-y-2 rounded-xl border border-zinc-700/90 bg-zinc-900/70 p-4 ring-1 ring-zinc-800/80">
          <label htmlFor="contacts-search" className="text-sm font-medium text-zinc-300">
            Search contacts
          </label>
          <input
            id="contacts-search"
            type="search"
            placeholder="Search by name or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoComplete="off"
            className="w-full rounded-lg border border-zinc-600 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500"
          />
        </div>

        <div className="overflow-x-auto rounded-2xl border border-zinc-800">
          <table className="min-w-[720px] w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900/60 text-xs uppercase tracking-wide text-zinc-500">
                <th className="px-3 py-3">
                  <button type="button" className="hover:text-zinc-300" onClick={() => toggleSort('name')}>
                    Name {sortKey === 'name' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                  </button>
                </th>
                <th className="px-3 py-3">
                  <button type="button" className="hover:text-zinc-300" onClick={() => toggleSort('phone')}>
                    Phone {sortKey === 'phone' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                  </button>
                </th>
                <th className="px-3 py-3">
                  <button type="button" className="hover:text-zinc-300" onClick={() => toggleSort('orders')}>
                    Orders {sortKey === 'orders' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                  </button>
                </th>
                <th className="px-3 py-3">
                  <button type="button" className="hover:text-zinc-300" onClick={() => toggleSort('spend')}>
                    Spend {sortKey === 'spend' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                  </button>
                </th>
                <th className="px-3 py-3">
                  <button type="button" className="hover:text-zinc-300" onClick={() => toggleSort('last')}>
                    Last order {sortKey === 'last' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                  </button>
                </th>
                <th className="px-3 py-3">Notes</th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? [...Array(5)].map((_, i) => (
                    <tr key={i} className="border-b border-zinc-800/40">
                      <td className="px-3 py-3">
                        <div className="h-4 w-32 animate-pulse rounded bg-zinc-700/40" />
                      </td>
                      <td className="px-3 py-3">
                        <div className="h-4 w-28 animate-pulse rounded bg-zinc-700/40" />
                      </td>
                      <td className="px-3 py-3">
                        <div className="h-4 w-8 animate-pulse rounded bg-zinc-700/40" />
                      </td>
                      <td className="px-3 py-3">
                        <div className="h-4 w-16 animate-pulse rounded bg-zinc-700/40" />
                      </td>
                      <td className="px-3 py-3">
                        <div className="h-4 w-24 animate-pulse rounded bg-zinc-700/40" />
                      </td>
                      <td className="px-3 py-3">
                        <div className="h-4 w-36 animate-pulse rounded bg-zinc-700/40" />
                      </td>
                    </tr>
                  ))
                : sorted.length === 0
                  ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-10 text-center text-zinc-500">
                          {rows.length === 0
                            ? 'No contacts yet.'
                            : 'No contacts match your search. Try a different name or phone.'}
                        </td>
                      </tr>
                    )
                  : sorted.map((c) => (
                      <tr
                        key={c.id}
                        className="cursor-pointer border-b border-zinc-800/80 hover:bg-zinc-900/50"
                        onClick={() => void openPanel(c)}
                      >
                        <td className="px-3 py-2 font-medium text-zinc-200">{c.name || '—'}</td>
                        <td className="px-3 py-2 font-mono text-xs text-zinc-400">{displayPhone(c.id)}</td>
                        <td className="px-3 py-2 text-zinc-300">{c.orderCount ?? 0}</td>
                        <td className="px-3 py-2 text-zinc-300">{formatMoney(c.totalSpend)}</td>
                        <td className="px-3 py-2 text-xs text-zinc-500">{formatTs(c.lastOrderAt)}</td>
                        <td className="max-w-[200px] truncate px-3 py-2 text-xs text-zinc-500">
                          {c.notes || '—'}
                        </td>
                      </tr>
                    ))}
            </tbody>
          </table>
        </div>
      </main>

      {selected ? (
        <div
          className="fixed inset-0 z-40 flex justify-end bg-black/60 p-0 backdrop-blur-sm"
          role="dialog"
          aria-modal
          onClick={() => setSelected(null)}
        >
          <div
            className="h-full min-h-screen w-full max-w-lg overflow-y-auto border-l border-zinc-800 bg-zinc-950 p-6 shadow-2xl max-sm:max-w-none max-sm:border-l-0"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-white">{selected.name || '—'}</h2>
                <p className="mt-1 font-mono text-xs text-zinc-500">{displayPhone(selected.id)}</p>
                {ghostCount != null && ghostCount >= 2 ? (
                  <p className="mt-2 text-xs font-medium text-amber-300/90">
                    👻 Repeat ghost — flagged {ghostCount} times
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                className="text-sm text-zinc-500 hover:text-zinc-300"
                onClick={() => setSelected(null)}
              >
                Close
              </button>
            </div>

            <label className="mt-6 block text-xs font-medium text-zinc-500">
              Notes
              <textarea
                value={notesDraft}
                onChange={(e) => setNotesDraft(e.target.value)}
                rows={3}
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
                onClick={(e) => e.stopPropagation()}
              />
            </label>
            <button
              type="button"
              disabled={notesSaving}
              onClick={() => void saveNotes()}
              className="mt-2 rounded-lg bg-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-900 hover:bg-white disabled:opacity-50"
            >
              {notesSaving ? 'Saving…' : 'Save notes'}
            </button>

            <h3 className="mt-8 text-sm font-semibold text-zinc-200">Order history</h3>
            {ordersLoading ? (
              <p className="mt-2 text-xs text-zinc-500">Loading…</p>
            ) : ordersFor.length === 0 ? (
              <p className="mt-2 text-xs text-zinc-500">
                No linked orders yet (orders completed after Phase 5 show here).
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {ordersFor.map((o) => (
                  <li
                    key={o.id}
                    className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-xs text-zinc-400"
                  >
                    <span className="font-mono text-zinc-200">{o.mspn}</span> × {o.quantity} ·{' '}
                    {o.status} · {formatMoney(o.paymentAmount)}
                    <div className="mt-1 text-[10px] text-zinc-600">{formatTs(o.createdAt)}</div>
                    {o.debrief?.notes ? (
                      <p className="mt-2 border-t border-zinc-800/80 pt-2 text-[11px] text-zinc-500">
                        Debrief: {o.debrief.notes}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
