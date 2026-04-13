import { signOut } from 'firebase/auth'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { auth, db } from '../firebase/config'
import { useAuth } from '../hooks/useAuth'
import { useUserProfile } from '../hooks/useUserProfile'
import { useToast } from '../context/ToastContext.jsx'
import { cmdEnterSubmitKeyDown } from '../utils/cmdEnterSubmit.js'
import { PortalSessionLine } from '../components/layout/PortalSessionLine.jsx'
import { permissionMeets } from '../constants/peoplePermissions'
import { computeCrmScore, scoreBadgeClass } from '../utils/crmScore'

const STAGES = [1, 2, 3, 4, 5, 6]

const STAGE_TITLES = {
  1: 'Identified Fleet',
  2: 'Contact Made',
  3: 'Pain Confirmed',
  4: 'Pilot Offered',
  5: 'Trial Scheduled',
  6: 'Active Fleet Client',
}

function formatTs(ts) {
  if (!ts || typeof ts.toDate !== 'function') return '—'
  try {
    return ts.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  } catch {
    return '—'
  }
}

export function CrmPage() {
  const { user } = useAuth()
  const { toast } = useToast()
  const { permissionFor, profile } = useUserProfile()
  const navigate = useNavigate()
  const canEdit = permissionMeets(permissionFor('crm'), 'edit')
  const [tab, setTab] = useState('board')
  const [accounts, setAccounts] = useState([])
  const [leads, setLeads] = useState([])
  const [loading, setLoading] = useState(true)
  const [segment, setSegment] = useState('')
  const [location, setLocation] = useState('')
  const [minScore, setMinScore] = useState('')
  const [search, setSearch] = useState('')
  const [detail, setDetail] = useState(null)
  const [vehicles, setVehicles] = useState([])
  const [leadForm, setLeadForm] = useState({
    businessName: '',
    source: '',
    segment: '',
    fleetSize: '',
    urgency: 'warm',
  })
  /** Mobile (under md): which pipeline stage accordion is open; desktop uses grid. */
  const [crmMobileStage, setCrmMobileStage] = useState(null)

  useEffect(() => {
    const q = query(collection(db, 'crmAccounts'), orderBy('lastContactedAt', 'desc'), limit(500))
    return onSnapshot(
      q,
      (snap) => {
        setAccounts(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
        setLoading(false)
      },
      () => setLoading(false),
    )
  }, [])

  useEffect(() => {
    const q = query(collection(db, 'crmLeads'), orderBy('createdAt', 'desc'), limit(200))
    return onSnapshot(q, (snap) => {
      setLeads(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    })
  }, [])

  useEffect(() => {
    function onClose() {
      setDetail(null)
    }
    window.addEventListener('skedaddle-close-overlays', onClose)
    return () => window.removeEventListener('skedaddle-close-overlays', onClose)
  }, [])

  useEffect(() => {
    if (!detail?.id) {
      queueMicrotask(() => setVehicles([]))
      return undefined
    }
    const q = query(collection(db, 'crmVehicles'), where('accountId', '==', detail.id), limit(100))
    return onSnapshot(q, (snap) => {
      setVehicles(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    })
  }, [detail?.id])

  const lostCount = useMemo(
    () => accounts.filter((a) => Number(a.pipelineStage) === 7).length,
    [accounts],
  )

  const filteredAccounts = useMemo(() => {
    const ms = Number(minScore)
    const hasMin = Number.isFinite(ms) && ms > 0
    const q = search.trim().toLowerCase()
    return accounts.filter((a) => {
      if (segment && String(a.segment || '') !== segment) return false
      if (location && !String(a.location || '').toLowerCase().includes(location.toLowerCase()))
        return false
      if (hasMin && (Number(a.score) || 0) < ms) return false
      if (q && !String(a.companyName || '').toLowerCase().includes(q)) return false
      return true
    })
  }, [accounts, segment, location, minScore, search])

  const byStage = useCallback(
    (stage) => filteredAccounts.filter((a) => Number(a.pipelineStage || 1) === stage),
    [filteredAccounts],
  )

  async function handleSignOut() {
    await signOut(auth)
    navigate('/', { replace: true })
  }

  async function onDropStage(stage, e) {
    e.preventDefault()
    const id = e.dataTransfer.getData('text/accountId')
    if (!id || !canEdit) return
    try {
      await updateDoc(doc(db, 'crmAccounts', id), {
        pipelineStage: stage,
        lastContactedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      toast(`Account moved to stage ${stage}`, 'success')
    } catch (err) {
      window.alert(err?.message || String(err))
    }
  }

  async function addAccount() {
    if (!canEdit) return
    const name = window.prompt('Company name?')
    if (!name?.trim()) return
    await addDoc(collection(db, 'crmAccounts'), {
      companyName: name.trim(),
      pipelineStage: 1,
      fleetSize: 0,
      painScore: 1,
      decisionMaker: '',
      segment: '',
      location: '',
      lastContactedAt: serverTimestamp(),
      followUpAt: null,
      score: computeCrmScore({
        fleetSize: 0,
        painScore: 1,
        pipelineStage: 1,
        lastContactedAt: null,
      }),
      tags: [],
      notes: [],
      followUpOverdueNotified: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  }

  async function convertLead(lead) {
    if (!canEdit) return
    const ref = await addDoc(collection(db, 'crmAccounts'), {
      companyName: lead.businessName || 'Account',
      pipelineStage: 1,
      fleetSize: Number(lead.fleetSize) || 0,
      painScore: 1,
      decisionMaker: '',
      segment: lead.segment || '',
      location: '',
      lastContactedAt: serverTimestamp(),
      followUpAt: lead.followUpAt || null,
      score: computeCrmScore({
        fleetSize: Number(lead.fleetSize) || 0,
        painScore: 1,
        pipelineStage: 1,
        lastContactedAt: null,
      }),
      tags: [],
      notes: [],
      followUpOverdueNotified: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    await updateDoc(doc(db, 'crmLeads', lead.id), {
      convertedToAccountId: ref.id,
      updatedAt: serverTimestamp(),
    })
  }

  async function addLead(e) {
    e.preventDefault()
    if (!canEdit) return
    await addDoc(collection(db, 'crmLeads'), {
      businessName: leadForm.businessName.trim(),
      source: leadForm.source.trim(),
      segment: leadForm.segment.trim(),
      fleetSize: Number(leadForm.fleetSize) || 0,
      urgency: leadForm.urgency,
      followUpAt: null,
      convertedToAccountId: null,
      createdAt: serverTimestamp(),
    })
    setLeadForm({
      businessName: '',
      source: '',
      segment: '',
      fleetSize: '',
      urgency: 'warm',
    })
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="sticky top-0 z-30 border-b border-zinc-800/80 bg-zinc-950/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-3 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-4 sm:px-6 sm:py-4">
          <div className="flex min-w-0 flex-wrap items-center gap-x-6 gap-y-2">
            <Link to="/dashboard" className="text-sm text-zinc-500 hover:text-zinc-200">
              ← Dashboard
            </Link>
            <span className="hidden h-4 w-px bg-zinc-700 sm:block" aria-hidden />
            <h1 className="text-lg font-semibold text-white">Rubber CRM</h1>
            {profile?.role === 'mechanic' || profile?.role === 'admin' ? (
              <Link
                to="/crm/dispatch"
                className="text-sm text-cyan-400/90 hover:text-cyan-300 hover:underline"
              >
                DJ dispatch
              </Link>
            ) : null}
            <div className="w-full basis-full sm:hidden">
              <PortalSessionLine email={user?.email} onSignOut={handleSignOut} />
            </div>
          </div>
          <div className="hidden sm:block">
            <PortalSessionLine email={user?.email} onSignOut={handleSignOut} />
          </div>
        </div>
        <div className="mx-auto flex max-w-[1600px] gap-2 border-t border-zinc-800/80 px-4 sm:px-6">
          {['board', 'leads'].map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={[
                '-mb-px flex min-h-[44px] min-w-[44px] items-center border-b-2 px-4 py-3 text-sm font-medium capitalize sm:min-h-0 sm:min-w-0',
                tab === t
                  ? 'border-violet-500 text-violet-100'
                  : 'border-transparent text-zinc-500 hover:text-zinc-300',
              ].join(' ')}
            >
              {t}
            </button>
          ))}
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] space-y-6 px-4 py-6 sm:px-6">
        {tab === 'board' ? (
          <>
            <div className="flex flex-wrap items-end gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
              {canEdit ? (
                <button
                  type="button"
                  onClick={() => void addAccount()}
                  className="rounded-lg bg-violet-600 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-500"
                >
                  Add account
                </button>
              ) : null}
              <input
                placeholder="Segment"
                value={segment}
                onChange={(e) => setSegment(e.target.value)}
                className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm"
              />
              <input
                placeholder="Location contains"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm"
              />
              <input
                type="number"
                placeholder="Min score"
                value={minScore}
                onChange={(e) => setMinScore(e.target.value)}
                className="w-24 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm"
              />
              <input
                placeholder="Search company"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="min-w-[140px] flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm"
              />
              <span className="text-xs text-zinc-500">
                <span className="font-semibold text-zinc-400">Lost</span>
                <span className="text-zinc-600"> · </span>
                {lostCount}
              </span>
            </div>

            {loading ? (
              <>
                <div className="hidden gap-2 md:grid md:grid-cols-6">
                  {STAGES.map((stage) => (
                    <div
                      key={stage}
                      className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-2"
                    >
                      <div className="mb-2 h-3 w-24 animate-pulse rounded bg-zinc-700/40" />
                      <div className="space-y-2">
                        {[0, 1, 2].map((i) => (
                          <div
                            key={i}
                            className="h-[4.5rem] animate-pulse rounded-lg border border-zinc-800/60 bg-zinc-800/30"
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="space-y-2 md:hidden">
                  {STAGES.map((stage) => (
                    <div
                      key={stage}
                      className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-3"
                    >
                      <div className="mb-2 h-3 w-40 animate-pulse rounded bg-zinc-700/40" />
                      <div className="space-y-2">
                        {[0, 1].map((i) => (
                          <div
                            key={i}
                            className="h-16 animate-pulse rounded-lg border border-zinc-800/60 bg-zinc-800/30"
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="hidden gap-2 md:grid md:grid-cols-6 md:overflow-visible">
                  {STAGES.map((stage) => (
                    <div
                      key={stage}
                      className="min-w-0 rounded-xl border border-zinc-800 bg-zinc-900/30 p-2"
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => void onDropStage(stage, e)}
                    >
                      <p className="mb-2 px-1 text-xs font-semibold leading-snug text-zinc-300">
                        {STAGE_TITLES[stage] || `Stage ${stage}`}
                      </p>
                      <div className="space-y-2">
                        {byStage(stage).map((a) => (
                          <button
                            key={a.id}
                            type="button"
                            draggable={canEdit}
                            onDragStart={(e) => {
                              e.dataTransfer.setData('text/accountId', a.id)
                            }}
                            onClick={() => setDetail(a)}
                            className="w-full rounded-lg border border-zinc-700/80 bg-zinc-950/80 p-2 text-left text-xs hover:border-violet-700/50"
                          >
                            <span className="font-medium text-zinc-100">{a.companyName}</span>
                            <div className="mt-1 flex flex-wrap items-center gap-1">
                              <span
                                className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1 ${scoreBadgeClass(a.score)}`}
                              >
                                {a.score ?? computeCrmScore(a)}
                              </span>
                              <span className="text-zinc-500">pain {a.painScore ?? '—'}</span>
                            </div>
                            <p className="mt-1 text-[10px] text-zinc-500">
                              {a.decisionMaker || '—'} · {formatTs(a.lastContactedAt)}
                            </p>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="space-y-2 md:hidden">
                  {STAGES.map((stage) => {
                    const open = crmMobileStage === stage
                    return (
                      <div
                        key={stage}
                        className="rounded-xl border border-zinc-800 bg-zinc-900/30"
                      >
                        <button
                          type="button"
                          className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
                          aria-expanded={open}
                          onClick={() => setCrmMobileStage(open ? null : stage)}
                        >
                          <span className="text-xs font-semibold leading-snug text-zinc-300">
                            {STAGE_TITLES[stage] || `Stage ${stage}`}
                          </span>
                          <span className="text-zinc-500">{open ? '▾' : '▸'}</span>
                        </button>
                        {open ? (
                          <div
                            className="space-y-2 border-t border-zinc-800/80 p-2"
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => void onDropStage(stage, e)}
                          >
                            {byStage(stage).map((a) => (
                              <button
                                key={a.id}
                                type="button"
                                draggable={canEdit}
                                onDragStart={(e) => {
                                  e.dataTransfer.setData('text/accountId', a.id)
                                }}
                                onClick={() => setDetail(a)}
                                className="w-full rounded-lg border border-zinc-700/80 bg-zinc-950/80 p-2 text-left text-xs hover:border-violet-700/50"
                              >
                                <span className="font-medium text-zinc-100">{a.companyName}</span>
                                <div className="mt-1 flex flex-wrap items-center gap-1">
                                  <span
                                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1 ${scoreBadgeClass(a.score)}`}
                                  >
                                    {a.score ?? computeCrmScore(a)}
                                  </span>
                                  <span className="text-zinc-500">pain {a.painScore ?? '—'}</span>
                                </div>
                                <p className="mt-1 text-[10px] text-zinc-500">
                                  {a.decisionMaker || '—'} · {formatTs(a.lastContactedAt)}
                                </p>
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </>
        ) : (
          <section className="space-y-4">
            <h2 className="text-sm font-semibold text-zinc-300">Leads</h2>
            {canEdit ? (
              <form
                onSubmit={(e) => void addLead(e)}
                onKeyDown={cmdEnterSubmitKeyDown}
                className="grid gap-2 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 sm:grid-cols-2 lg:grid-cols-3"
              >
                <input
                  required
                  placeholder="Business name"
                  value={leadForm.businessName}
                  onChange={(e) => setLeadForm((f) => ({ ...f, businessName: e.target.value }))}
                  className="rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm"
                />
                <input
                  placeholder="Source"
                  value={leadForm.source}
                  onChange={(e) => setLeadForm((f) => ({ ...f, source: e.target.value }))}
                  className="rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm"
                />
                <input
                  placeholder="Segment"
                  value={leadForm.segment}
                  onChange={(e) => setLeadForm((f) => ({ ...f, segment: e.target.value }))}
                  className="rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm"
                />
                <input
                  placeholder="Fleet size"
                  value={leadForm.fleetSize}
                  onChange={(e) => setLeadForm((f) => ({ ...f, fleetSize: e.target.value }))}
                  className="rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm"
                />
                <select
                  value={leadForm.urgency}
                  onChange={(e) => setLeadForm((f) => ({ ...f, urgency: e.target.value }))}
                  className="rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm"
                >
                  <option value="hot">Hot</option>
                  <option value="warm">Warm</option>
                  <option value="cold">Cold</option>
                </select>
                <button
                  type="submit"
                  className="rounded-lg bg-violet-600 px-3 py-2 text-sm font-semibold text-white"
                >
                  Add lead
                </button>
              </form>
            ) : null}
            <div className="overflow-x-auto rounded-xl border border-zinc-800">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-900/60 text-xs uppercase text-zinc-500">
                    <th className="px-3 py-2">Business</th>
                    <th className="px-3 py-2">Source</th>
                    <th className="px-3 py-2">Segment</th>
                    <th className="px-3 py-2">Fleet</th>
                    <th className="px-3 py-2">Urgency</th>
                    <th className="px-3 py-2">Follow-up</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {leads.map((r) => (
                    <tr key={r.id} className="border-b border-zinc-800/80">
                      <td className="px-3 py-2">{r.businessName}</td>
                      <td className="px-3 py-2 text-zinc-400">{r.source || '—'}</td>
                      <td className="px-3 py-2 text-zinc-400">{r.segment || '—'}</td>
                      <td className="px-3 py-2">{r.fleetSize ?? '—'}</td>
                      <td className="px-3 py-2">
                        <span
                          className={
                            r.urgency === 'hot'
                              ? 'text-red-300'
                              : r.urgency === 'warm'
                                ? 'text-amber-300'
                                : 'text-zinc-500'
                          }
                        >
                          {r.urgency || '—'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-zinc-500">{formatTs(r.followUpAt)}</td>
                      <td className="px-3 py-2 text-right">
                        {r.convertedToAccountId ? (
                          <span className="text-xs text-zinc-600">Converted</span>
                        ) : canEdit ? (
                          <button
                            type="button"
                            className="text-xs text-violet-300 hover:underline"
                            onClick={() => void convertLead(r)}
                          >
                            Convert to account
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>

      {detail ? (
        <CrmAccountPanel
          key={detail.id}
          account={detail}
          vehicles={vehicles}
          canEdit={canEdit}
          onClose={() => setDetail(null)}
          onRefresh={(a) => setDetail(a)}
        />
      ) : null}
    </div>
  )
}

function CrmAccountPanel({ account, vehicles, canEdit, onClose, onRefresh }) {
  const [draft, setDraft] = useState({ ...account })
  const [vehLabel, setVehLabel] = useState('')
  const [noteText, setNoteText] = useState('')

  useEffect(() => {
    queueMicrotask(() => setDraft({ ...account }))
  }, [account])

  async function saveField(patch) {
    if (!canEdit) return
    await updateDoc(doc(db, 'crmAccounts', account.id), {
      ...patch,
      updatedAt: serverTimestamp(),
    })
    onRefresh({ ...account, ...patch })
  }

  async function addVehicle() {
    if (!canEdit || !vehLabel.trim()) return
    await addDoc(collection(db, 'crmVehicles'), {
      accountId: account.id,
      label: vehLabel.trim(),
      tireSize: '',
      notes: '',
      createdAt: serverTimestamp(),
    })
    setVehLabel('')
  }

  async function removeVehicle(id) {
    if (!canEdit || !window.confirm('Remove vehicle?')) return
    await deleteDoc(doc(db, 'crmVehicles', id))
  }

  async function appendNote() {
    if (!canEdit || !noteText.trim()) return
    const arr = Array.isArray(account.notes) ? [...account.notes] : []
    arr.push({
      text: noteText.trim(),
      at: Timestamp.now(),
      by: auth.currentUser?.uid || '',
    })
    await saveField({ notes: arr })
    setNoteText('')
  }

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-black/60 p-0 backdrop-blur-sm sm:p-0"
      role="dialog"
      aria-modal
      onClick={onClose}
    >
      <div
        className="h-full min-h-screen w-full max-w-lg overflow-y-auto border-l border-zinc-800 bg-zinc-950 p-6 shadow-2xl max-sm:max-w-none max-sm:border-l-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-lg font-semibold text-white">{account.companyName}</h2>
          <button type="button" className="text-sm text-zinc-500 hover:text-zinc-300" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          Score{' '}
          <span className={`rounded-full px-2 py-0.5 font-semibold ring-1 ${scoreBadgeClass(draft.score)}`}>
            {computeCrmScore(draft)}
          </span>
        </p>

        <div className="mt-6 space-y-3 text-sm">
          {[
            ['companyName', 'Company'],
            ['decisionMaker', 'Decision maker'],
            ['segment', 'Segment'],
            ['location', 'Location'],
            ['fleetSize', 'Fleet size', 'number'],
          ].map(([key, label, type]) => (
            <label key={key} className="block text-xs text-zinc-500">
              {label}
              <input
                type={type === 'number' ? 'number' : 'text'}
                disabled={!canEdit}
                value={draft[key] ?? ''}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    [key]: type === 'number' ? Number(e.target.value) : e.target.value,
                  }))
                }
                onBlur={() => void saveField({ [key]: draft[key] })}
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-zinc-100 disabled:opacity-50"
              />
            </label>
          ))}
          <label className="block text-xs text-zinc-500">
            Pipeline stage (1–7)
            <input
              type="number"
              min={1}
              max={7}
              disabled={!canEdit}
              value={draft.pipelineStage ?? 1}
              onChange={(e) =>
                setDraft((d) => ({ ...d, pipelineStage: Number(e.target.value) || 1 }))
              }
              onBlur={() => void saveField({ pipelineStage: Number(draft.pipelineStage) || 1 })}
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 disabled:opacity-50"
            />
          </label>
          <label className="block text-xs text-zinc-500">
            Pain score (release to save)
            <input
              type="range"
              min={1}
              max={10}
              disabled={!canEdit}
              value={draft.painScore ?? 1}
              onChange={(e) =>
                setDraft((d) => ({ ...d, painScore: Number(e.target.value) }))
              }
              onMouseUp={() => void saveField({ painScore: Number(draft.painScore) || 1 })}
              onTouchEnd={() => void saveField({ painScore: Number(draft.painScore) || 1 })}
              className="mt-2 w-full"
            />
            <span className="text-zinc-400">{draft.painScore ?? 1}</span>
          </label>
          <label className="block text-xs text-zinc-500">
            Follow-up date
            <input
              type="date"
              disabled={!canEdit}
              value={
                draft.followUpAt?.toDate
                  ? draft.followUpAt.toDate().toISOString().slice(0, 10)
                  : ''
              }
              onChange={async (e) => {
                const v = e.target.value
                if (!v) {
                  await saveField({ followUpAt: null })
                  return
                }
                await saveField({ followUpAt: Timestamp.fromDate(new Date(`${v}T12:00:00`)) })
              }}
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 disabled:opacity-50"
            />
          </label>
        </div>

        <h3 className="mt-8 text-sm font-semibold text-zinc-200">Vehicles</h3>
        <div className="mt-2 flex gap-2">
          <input
            placeholder="Label"
            value={vehLabel}
            onChange={(e) => setVehLabel(e.target.value)}
            className="flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm"
          />
          <button
            type="button"
            disabled={!canEdit}
            onClick={() => void addVehicle()}
            className="rounded-lg bg-zinc-700 px-2 py-1.5 text-sm text-white disabled:opacity-50"
          >
            Add
          </button>
        </div>
        <ul className="mt-2 space-y-1 text-xs text-zinc-400">
          {vehicles.map((v) => (
            <li key={v.id} className="flex justify-between gap-2">
              <span>{v.label}</span>
              {canEdit ? (
                <button type="button" className="text-red-400 hover:underline" onClick={() => void removeVehicle(v.id)}>
                  Remove
                </button>
              ) : null}
            </li>
          ))}
        </ul>

        <h3 className="mt-8 text-sm font-semibold text-zinc-200">Notes</h3>
        <ul className="mt-2 max-h-40 space-y-2 overflow-y-auto text-xs text-zinc-500">
          {(Array.isArray(account.notes) ? account.notes : []).map((n, i) => (
            <li key={i} className="border-l border-zinc-700 pl-2">
              {n.text}
              <div className="text-[10px] text-zinc-600">{n.at}</div>
            </li>
          ))}
        </ul>
        {canEdit ? (
          <div className="mt-2 flex flex-col gap-2">
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              rows={2}
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm"
              placeholder="Add note…"
            />
            <button
              type="button"
              onClick={() => void appendNote()}
              className="rounded-lg bg-violet-800 px-2 py-1.5 text-sm text-white"
            >
              Append note
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
