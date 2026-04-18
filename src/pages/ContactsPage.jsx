import { signOut } from 'firebase/auth'
import {
  collection,
  deleteDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
  doc,
  getDoc,
} from 'firebase/firestore'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { auth, db } from '../firebase/config'
import { PortalSessionLine } from '../components/layout/PortalSessionLine.jsx'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../context/ToastContext.jsx'
import { useUserProfile } from '../hooks/useUserProfile'
import { permissionMeets } from '../constants/peoplePermissions'

import { formatCurrency, formatQty } from '../utils/format'
import { formatPhoneInputForDisplay, normalizePhoneToE164 } from '../utils/formatPhone.js'
import { phoneDocIdFromContact } from '../utils/phoneDocId'

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

/**
 * @param {{ embedded?: boolean }} props
 * Embedded mode: no page shell (used under People → Customers).
 */
export function ContactsPage({ embedded = false }) {
  const { user } = useAuth()
  const { toast } = useToast()
  const { permissionFor } = useUserProfile()
  const canManagePeople = permissionMeets(permissionFor('people'), 'manage')
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
  const [nameDraft, setNameDraft] = useState('')
  const [nameSaving, setNameSaving] = useState(false)
  const [addName, setAddName] = useState('')
  const [addPhone, setAddPhone] = useState('')
  const [addBusy, setAddBusy] = useState(false)
  const [addError, setAddError] = useState('')

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
    setNameDraft(String(c.name || '').trim())
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
      toast('Notes saved', 'success')
    } catch (e) {
      toast(e?.message || 'Could not save notes.', 'error')
    } finally {
      setNotesSaving(false)
    }
  }

  async function saveDisplayName() {
    if (!selected || !canManagePeople) return
    const name = String(nameDraft || '').trim()
    if (!name) {
      toast('Name is required.', 'error')
      return
    }
    setNameSaving(true)
    try {
      await updateDoc(doc(db, 'contacts', selected.id), { name })
      toast('Name updated', 'success')
    } catch (e) {
      toast(e?.message || 'Could not update name.', 'error')
    } finally {
      setNameSaving(false)
    }
  }

  async function addContactRow(e) {
    e.preventDefault()
    if (!canManagePeople) return
    const name = String(addName || '').trim()
    if (!name) {
      setAddError('Enter a display name.')
      return
    }
    const e164 = normalizePhoneToE164(addPhone)
    if (!e164) {
      setAddError('Enter a valid US or international phone number (e.g. 970-555-1234 or +1...).')
      return
    }
    const id = phoneDocIdFromContact(e164)
    if (!id) {
      setAddError('Could not parse phone number. Try including the area code.')
      return
    }
    setAddBusy(true)
    try {
      const existing = await getDoc(doc(db, 'contacts', id))
      if (existing.exists()) {
        setAddError('A contact with this phone number already exists.')
        return
      }
      await setDoc(doc(db, 'contacts', id), {
        name,
        phoneNumber: id,
        orderCount: 0,
        totalSpend: 0,
        notes: '',
        lastMspn: '',
        lastTireLabel: '',
      })
      toast('Contact added', 'success')
      setAddError('')
      setAddName('')
      setAddPhone('')
    } catch (err) {
      toast(err?.message || String(err), 'error')
    } finally {
      setAddBusy(false)
    }
  }

  async function removeSelectedContact() {
    if (!selected || !canManagePeople) return
    const oc = Number(selected.orderCount) || 0
    const msg =
      oc > 0
        ? `Remove this contact (${displayPhone(selected.id)})? They have ${oc} linked order(s) in history; orders are not deleted, but the contact row will disappear from Customers.`
        : `Remove this contact (${displayPhone(selected.id)})?`
    if (!window.confirm(msg)) return
    try {
      await deleteDoc(doc(db, 'contacts', selected.id))
      toast('Contact removed', 'success')
      setSelected(null)
    } catch (e) {
      toast(e?.message || 'Action failed.', 'error')
    }
  }

  async function handleSignOut() {
    await signOut(auth)
    navigate('/', { replace: true })
  }

  useEffect(() => {
    if (!selected) return undefined
    function onKey(e) {
      if (e.key === 'Escape') setSelected(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected])

  const content = (
    <>
    <main
      className={
        embedded
          ? 'mx-auto max-w-6xl space-y-4 px-4 py-6 sm:px-6'
          : 'mx-auto max-w-6xl space-y-4 px-6 py-8'
      }
    >
        <div className="relative z-10 flex w-full flex-col gap-4 rounded-xl border border-zinc-700/90 bg-zinc-900/70 p-4 ring-1 ring-zinc-800/80 lg:max-w-5xl lg:flex-row lg:items-end">
          <div className="min-w-0 flex-1 space-y-2">
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
          {canManagePeople ? (
            <form
              onSubmit={(e) => void addContactRow(e)}
              className="w-full shrink-0 space-y-2 rounded-lg border border-zinc-800/90 bg-zinc-950/50 p-3 lg:max-w-md"
            >
              <p className="text-xs font-medium text-zinc-400">Add contact</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <input
                  type="text"
                  placeholder="Display name"
                  value={addName}
                  onChange={(e) => {
                    setAddName(e.target.value)
                    setAddError('')
                  }}
                  autoComplete="name"
                  className="rounded-lg border border-zinc-600 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500"
                />
                <input
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="+1 (555) 123-4567"
                  value={addPhone}
                  onChange={(e) => {
                    setAddPhone(formatPhoneInputForDisplay(e.target.value))
                    setAddError('')
                  }}
                  className="rounded-lg border border-zinc-600 bg-zinc-950 px-3 py-2 font-mono text-sm text-zinc-100 placeholder:text-zinc-500"
                />
                {addError ? (
                  <p className="col-span-full text-xs text-red-400">{addError}</p>
                ) : null}
              </div>
              <button
                type="submit"
                disabled={addBusy}
                className="w-full rounded-lg bg-violet-600 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50 sm:w-auto"
              >
                {addBusy ? 'Saving…' : 'Add to list'}
              </button>
              <p className="text-[11px] leading-snug text-zinc-600">
                Phone is stored as the contact key (digits, US numbers as 1 + 10 digits). You can add someone
                before their first completed order.
              </p>
            </form>
          ) : null}
        </div>

        <div className="overflow-x-auto rounded-2xl border border-zinc-800">
          <table className="min-w-[840px] w-full border-collapse text-left text-sm">
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
                <th className="px-3 py-3">Last tire</th>
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
                        <div className="h-4 w-40 animate-pulse rounded bg-zinc-700/40" />
                      </td>
                      <td className="px-3 py-3">
                        <div className="h-4 w-36 animate-pulse rounded bg-zinc-700/40" />
                      </td>
                    </tr>
                  ))
                : sorted.length === 0
                  ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-10 text-center text-zinc-500">
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
                        <td className="px-3 py-2 font-medium text-zinc-200">
                          {c.isVip ? (
                            <span className="mr-1 text-amber-300" title="VIP customer">
                              ⭐
                            </span>
                          ) : null}
                          {c.name || '—'}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs text-zinc-400">{displayPhone(c.id)}</td>
                        <td className="px-3 py-2 text-zinc-300">{formatQty(c.orderCount ?? 0)}</td>
                        <td className="px-3 py-2 text-zinc-300">
                          {Number.isFinite(Number(c.totalSpend)) ? formatCurrency(c.totalSpend) : '—'}
                        </td>
                        <td className="px-3 py-2 text-xs text-zinc-500">{formatTs(c.lastOrderAt)}</td>
                        <td className="max-w-[220px] truncate px-3 py-2 text-xs text-zinc-400">
                          {String(c.lastTireLabel || '').trim() || c.lastMspn || '—'}
                        </td>
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
          className="fixed inset-0 z-40 flex justify-end bg-black/70 p-0 backdrop-blur-md sk-modal-backdrop-enter"
          role="dialog"
          aria-modal
          onClick={() => setSelected(null)}
        >
          <div
            className="sk-panel-slide-in h-full min-h-screen w-full max-w-lg overflow-y-auto border-l border-zinc-800/90 bg-zinc-950 p-6 shadow-2xl shadow-black/40 max-sm:max-w-none max-sm:border-l-0"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                {canManagePeople ? (
                  <label className="mt-0 block text-xs font-medium text-zinc-500">
                    <span className="inline-flex items-center gap-1">
                      Display name
                      {selected.isVip ? (
                        <span className="text-amber-300" title="VIP customer" aria-hidden>
                          ⭐
                        </span>
                      ) : null}
                    </span>
                    <input
                      type="text"
                      value={nameDraft}
                      onChange={(e) => setNameDraft(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-base font-semibold text-zinc-50"
                    />
                  </label>
                ) : (
                  <h2 className="text-lg font-semibold tracking-tight text-zinc-50">
                    {selected.isVip ? (
                      <span className="mr-1 text-amber-300" title="VIP customer">
                        ⭐
                      </span>
                    ) : null}
                    {selected.name || '—'}
                  </h2>
                )}
                <p className="sk-figures mt-1 text-xs text-zinc-400">{displayPhone(selected.id)}</p>
                {canManagePeople ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={nameSaving}
                      onClick={() => void saveDisplayName()}
                      className="rounded-lg bg-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-900 hover:bg-white disabled:opacity-50"
                    >
                      {nameSaving ? 'Saving…' : 'Save name'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void removeSelectedContact()}
                      className="rounded-lg border border-rose-900/60 bg-rose-950/30 px-3 py-1.5 text-xs font-semibold text-rose-200 hover:bg-rose-950/50"
                    >
                      Remove contact…
                    </button>
                  </div>
                ) : null}
                {ghostCount != null && ghostCount >= 2 ? (
                  <p className="mt-2 text-xs font-medium text-amber-300/90">
                    👻 Repeat ghost — flagged {ghostCount} times
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-transparent text-zinc-400 transition-colors duration-200 hover:border-zinc-700 hover:bg-zinc-800/80 hover:text-zinc-100"
                onClick={() => setSelected(null)}
                aria-label="Close panel"
              >
                <span className="text-xl leading-none" aria-hidden>
                  ×
                </span>
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
                    <span className="font-mono text-zinc-200">{o.mspn}</span> × {formatQty(o.quantity)} ·{' '}
                    {o.status} ·{' '}
                    {Number.isFinite(Number(o.paymentAmount)) ? formatCurrency(o.paymentAmount) : '—'}
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
    </>
  )

  if (embedded) {
    return <div className="text-zinc-100">{content}</div>
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="sticky top-0 z-20 border-b border-zinc-800/80 bg-zinc-950/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-4 sm:px-6 sm:py-4">
          <div className="min-w-0">
            <Link to="/dashboard" className="text-sm text-zinc-500 hover:text-zinc-200">
              ← Dashboard
            </Link>
            <h1 className="mt-2 text-xl font-semibold text-white">Contacts</h1>
            <p className="mt-1 text-sm text-zinc-500">Customer memory from completed orders</p>
            <div className="mt-2 sm:hidden">
              <PortalSessionLine email={user?.email} onSignOut={handleSignOut} />
            </div>
          </div>
          <div className="hidden sm:block">
            <PortalSessionLine email={user?.email} onSignOut={handleSignOut} />
          </div>
        </div>
      </header>
      {content}
    </div>
  )
}
