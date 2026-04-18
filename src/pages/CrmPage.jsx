import {
  addDoc,
  collection,
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
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { db } from '../firebase/config'
import { useUserProfile } from '../hooks/useUserProfile'
import { useToast } from '../context/ToastContext.jsx'
import { useTires } from '../hooks/useTires'
import { cmdEnterSubmitKeyDown } from '../utils/cmdEnterSubmit.js'
import { ModuleSubheader } from '../components/layout/ModuleSubheader.jsx'
import { permissionMeets } from '../constants/peoplePermissions'
import { buildCrmTabs } from '../utils/crmModuleTabs.js'
import { computeCrmScore, scoreBadgeClass } from '../utils/crmScore'
import { formatCurrency } from '../utils/format'
import {
  CRM_LOST_STAGE,
  CRM_PIPELINE_SCHEMA_VERSION,
  CRM_STAGE_LABELS,
  crmStageLabel,
  estimatedDealValue,
  lastActivityEntry,
  normalizePipelineStage,
} from '../utils/crmPipeline'
import { CRM_ACCOUNT_SEGMENTS, crmSegmentLabel } from '../utils/crmAccountPicklists.js'
import { CrmAccountDetailPanel } from '../components/crm/CrmAccountDetailPanel.jsx'
import { CrmAccountsPipelineTable } from '../components/crm/CrmAccountsPipelineTable.jsx'

const KANBAN_STAGES = [1, 2, 3, 4, 5]

function formatTs(ts) {
  if (!ts || typeof ts.toDate !== 'function') return '—'
  try {
    return ts.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  } catch {
    return '—'
  }
}

function nextActionSummary(a) {
  const na = a.nextAction || {}
  const task = String(na.task || '').trim()
  const due =
    na.dueDate && typeof na.dueDate.toDate === 'function'
      ? na.dueDate.toDate().toLocaleDateString('en-US', {
          timeZone: 'America/Denver',
          month: 'short',
          day: 'numeric',
        })
      : null
  if (!task && !due) return '—'
  return [task || '—', due].filter(Boolean).join(' · ')
}

function lastActivityNotePreview(a) {
  const e = lastActivityEntry(a)
  const text = String(e?.note || '').trim()
  if (!text) return '—'
  return text.length > 90 ? `${text.slice(0, 87)}…` : text
}

export function CrmPage() {
  const { toast } = useToast()
  const { permissionFor, profile } = useUserProfile()
  const { tires } = useTires()
  const loc = useLocation()
  const [searchParams] = useSearchParams()
  const tab = searchParams.get('tab') === 'leads' ? 'leads' : 'board'
  const canEdit = permissionMeets(permissionFor('crm'), 'edit')
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
  /** Mobile: account IDs whose stage picker is expanded. */
  const [mobileMoveOpen, setMobileMoveOpen] = useState(() => new Set())

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

  const avgBuyPerTire = useMemo(() => {
    const prices = tires.map((t) => Number(t.price)).filter((n) => n > 0)
    if (!prices.length) return 0
    return prices.reduce((a, b) => a + b, 0) / prices.length
  }, [tires])

  const lostCount = useMemo(
    () => accounts.filter((a) => Number(a.pipelineStage) === CRM_LOST_STAGE).length,
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
    (stage) =>
      filteredAccounts.filter((a) => normalizePipelineStage(a.pipelineStage, a) === stage),
    [filteredAccounts],
  )

  const lostAccounts = useMemo(
    () => filteredAccounts.filter((a) => Number(a.pipelineStage) === CRM_LOST_STAGE),
    [filteredAccounts],
  )

  async function onDropStage(stage, e) {
    e.preventDefault()
    const id = e.dataTransfer.getData('text/accountId')
    if (!id || !canEdit) return
    try {
      await updateDoc(doc(db, 'crmAccounts', id), {
        pipelineStage: stage,
        pipelineSchemaVersion: CRM_PIPELINE_SCHEMA_VERSION,
        lastContactedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      toast(`Moved to ${CRM_STAGE_LABELS[stage] || 'stage ' + stage}`, 'success')
    } catch (err) {
      toast(err?.message || 'Move failed', 'error')
    }
  }

  async function moveAccountStage(id, stage) {
    if (!canEdit) return
    try {
      await updateDoc(doc(db, 'crmAccounts', id), {
        pipelineStage: stage,
        pipelineSchemaVersion: CRM_PIPELINE_SCHEMA_VERSION,
        lastContactedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      toast(`Moved to ${CRM_STAGE_LABELS[stage] || 'stage ' + stage}`, 'success')
    } catch (err) {
      toast(err?.message || 'Move failed', 'error')
    }
  }

  async function addAccount() {
    if (!canEdit) return
    const name = window.prompt('Company name?')
    if (!name?.trim()) return
    await addDoc(collection(db, 'crmAccounts'), {
      companyName: name.trim(),
      pipelineStage: 1,
      pipelineSchemaVersion: CRM_PIPELINE_SCHEMA_VERSION,
      fleetSize: 0,
      painScore: 1,
      decisionMaker: '',
      segment: '',
      location: '',
      lastContactedAt: serverTimestamp(),
      followUpAt: null,
      nextAction: { task: '', ownedBy: 'alex', dueDate: null },
      activityLog: [],
      vehicleProfile: {
        vehicleCount: 0,
        vehicleTypeCategory: '',
        vehicleTypes: '',
        tireSizeRange: '',
        vin: '',
        make: '',
        model: '',
        modelYear: 0,
        currentVendor: '',
        estimatedAnnualSpend: 0,
      },
      linkedPhone: '',
      linkedOrders: [],
      score: computeCrmScore({
        fleetSize: 0,
        painScore: 1,
        pipelineStage: 1,
        pipelineSchemaVersion: CRM_PIPELINE_SCHEMA_VERSION,
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
      companyName: lead.businessName || 'VIP client',
      pipelineStage: 1,
      pipelineSchemaVersion: CRM_PIPELINE_SCHEMA_VERSION,
      fleetSize: Number(lead.fleetSize) || 0,
      painScore: 1,
      decisionMaker: '',
      segment: lead.segment || '',
      location: '',
      lastContactedAt: serverTimestamp(),
      followUpAt: lead.followUpAt || null,
      nextAction: { task: '', ownedBy: 'alex', dueDate: null },
      activityLog: [],
      vehicleProfile: {
        vehicleCount: Number(lead.fleetSize) || 0,
        vehicleTypeCategory: '',
        vehicleTypes: '',
        tireSizeRange: '',
        vin: '',
        make: '',
        model: '',
        modelYear: 0,
        currentVendor: '',
        estimatedAnnualSpend: 0,
      },
      linkedPhone: '',
      linkedOrders: [],
      score: computeCrmScore({
        fleetSize: Number(lead.fleetSize) || 0,
        painScore: 1,
        pipelineStage: 1,
        pipelineSchemaVersion: CRM_PIPELINE_SCHEMA_VERSION,
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

  const crmTabs = buildCrmTabs({ profile, pathname: loc.pathname, searchParams })

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <ModuleSubheader
        title="Rubber CRM"
        subtitle="Lead pipeline, VIP clients, and DJ dispatch"
        tabs={crmTabs}
        maxWidthClass="max-w-[1600px]"
      />

      <main className="mx-auto max-w-[1600px] space-y-6 px-4 py-6 sm:px-6">
        {tab === 'board' ? (
          <>
            <div className="flex flex-wrap items-end gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
              {canEdit ? (
                <button
                  type="button"
                  onClick={() => void addAccount()}
                  className="rounded-lg bg-zinc-100 px-3 py-2 text-sm font-semibold text-zinc-950 hover:bg-white"
                >
                  Add VIP client
                </button>
              ) : null}
              <label className="flex min-w-[10rem] flex-col text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                Segment
                <select
                  value={segment}
                  onChange={(e) => setSegment(e.target.value)}
                  className="mt-0.5 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm font-normal normal-case text-zinc-100"
                >
                  <option value="">All segments</option>
                  {CRM_ACCOUNT_SEGMENTS.filter((s) => s.value).map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex min-w-[11rem] flex-1 flex-col text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                Location contains
                <input
                  placeholder="City, region, metro…"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="mt-0.5 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm font-normal normal-case text-zinc-100"
                />
              </label>
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
                  {KANBAN_STAGES.map((stage) => (
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
                  {KANBAN_STAGES.map((stage) => (
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
            ) : accounts.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-700/70 bg-zinc-900/25 px-6 py-16 text-center">
                <div
                  className="rounded-full border border-zinc-700/80 bg-zinc-950/80 p-4 text-zinc-500"
                  aria-hidden
                >
                  <svg className="h-10 w-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M2.25 21h19.5M3.75 3h16.5L18 18H6L3.75 3zM9 9h6M9 13.5h4.5"
                    />
                  </svg>
                </div>
                <p className="mt-5 max-w-md text-sm leading-relaxed text-zinc-400">
                  Track VIP clients from first contact to closed — northern Colorado tire operations.
                </p>
                {canEdit ? (
                  <button
                    type="button"
                    onClick={() => void addAccount()}
                    className="mt-6 rounded-lg bg-zinc-100 px-4 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-white"
                  >
                    Add your first VIP client
                  </button>
                ) : (
                  <p className="mt-4 text-xs text-zinc-600">Ask Overwatch to add the first VIP client.</p>
                )}
              </div>
            ) : (
              <>
                <div className="hidden gap-2 md:grid md:grid-cols-6 md:overflow-visible">
                  {KANBAN_STAGES.map((stage) => (
                    <div
                      key={stage}
                      className="min-w-0 rounded-xl border border-zinc-800 bg-zinc-900/30 p-2"
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => void onDropStage(stage, e)}
                    >
                      <p className="mb-2 px-1 text-xs font-semibold leading-snug text-zinc-300">
                        {CRM_STAGE_LABELS[stage]}
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
                            <p className="mt-1 text-[10px] font-medium text-violet-300/90">
                              {crmStageLabel(a.pipelineStage, a)}
                            </p>
                            <p className="mt-0.5 text-[10px] text-zinc-500">
                              Next: {nextActionSummary(a)}
                            </p>
                            <p className="mt-0.5 line-clamp-2 text-[10px] text-zinc-500">
                              Last note: {lastActivityNotePreview(a)}
                            </p>
                            <p className="mt-1 text-[10px] font-semibold text-amber-200/90">
                              {estimatedDealValue(a.vehicleProfile || {}, avgBuyPerTire) != null
                                ? formatCurrency(estimatedDealValue(a.vehicleProfile || {}, avgBuyPerTire))
                                : '—'}
                            </p>
                            <div className="mt-1 flex flex-wrap items-center gap-1">
                              <span
                                className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1 ${scoreBadgeClass(a.score)}`}
                              >
                                {a.score ?? computeCrmScore(a)}
                              </span>
                              <span className="text-zinc-500">pain {a.painScore ?? '—'}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                  <div
                    className="min-w-0 rounded-xl border border-zinc-800 bg-zinc-900/20 p-2"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => void onDropStage(CRM_LOST_STAGE, e)}
                  >
                    <p className="mb-2 px-1 text-xs font-semibold leading-snug text-zinc-500">
                      {CRM_STAGE_LABELS[CRM_LOST_STAGE]}
                    </p>
                    <div className="space-y-2">
                      {lostAccounts.map((a) => (
                        <button
                          key={a.id}
                          type="button"
                          draggable={canEdit}
                          onDragStart={(e) => e.dataTransfer.setData('text/accountId', a.id)}
                          onClick={() => setDetail(a)}
                          className="w-full rounded-lg border border-zinc-800/80 bg-zinc-950/60 p-2 text-left text-xs hover:border-zinc-600"
                        >
                          <span className="font-medium text-zinc-400">{a.companyName}</span>
                          <p className="mt-1 text-[10px] text-zinc-600">Next: {nextActionSummary(a)}</p>
                          <p className="mt-0.5 line-clamp-2 text-[10px] text-zinc-600">
                            Last note: {lastActivityNotePreview(a)}
                          </p>
                          <p className="mt-1 text-[10px] font-semibold text-amber-200/70">
                            {estimatedDealValue(a.vehicleProfile || {}, avgBuyPerTire) != null
                              ? formatCurrency(estimatedDealValue(a.vehicleProfile || {}, avgBuyPerTire))
                              : '—'}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="space-y-2 md:hidden">
                  {[...KANBAN_STAGES, CRM_LOST_STAGE].map((stage) => {
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
                            {CRM_STAGE_LABELS[stage] || `Stage ${stage}`}
                          </span>
                          <span className="text-zinc-500">{open ? '▾' : '▸'}</span>
                        </button>
                        {open ? (
                          <div
                            className="space-y-2 border-t border-zinc-800/80 p-2"
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => void onDropStage(stage, e)}
                          >
                            {(stage === CRM_LOST_STAGE ? lostAccounts : byStage(stage)).map((a) => (
                              <div
                                key={a.id}
                                draggable={canEdit}
                                onDragStart={(e) => {
                                  e.dataTransfer.setData('text/accountId', a.id)
                                }}
                                className="rounded-lg border border-zinc-700/80 bg-zinc-950/80 text-xs hover:border-violet-700/50"
                              >
                                <button
                                  type="button"
                                  onClick={() => setDetail(a)}
                                  className="w-full p-2 text-left"
                                >
                                  <span className="font-medium text-zinc-100">{a.companyName}</span>
                                  <p className="mt-1 text-[10px] text-zinc-500">Next: {nextActionSummary(a)}</p>
                                  <p className="mt-0.5 line-clamp-2 text-[10px] text-zinc-500">
                                    Last note: {lastActivityNotePreview(a)}
                                  </p>
                                  <p className="mt-0.5 text-[10px] font-semibold text-amber-200/90">
                                    {estimatedDealValue(a.vehicleProfile || {}, avgBuyPerTire) != null
                                      ? formatCurrency(estimatedDealValue(a.vehicleProfile || {}, avgBuyPerTire))
                                      : '—'}
                                  </p>
                                  <div className="mt-1 flex flex-wrap items-center gap-1">
                                    <span
                                      className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1 ${scoreBadgeClass(a.score)}`}
                                    >
                                      {a.score ?? computeCrmScore(a)}
                                    </span>
                                  </div>
                                </button>
                                {canEdit ? (
                                  <>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        setMobileMoveOpen((prev) => {
                                          const next = new Set(prev)
                                          if (next.has(a.id)) next.delete(a.id)
                                          else next.add(a.id)
                                          return next
                                        })
                                      }}
                                      className="mx-2 mb-2 mt-0.5 text-[10px] text-violet-400 hover:text-violet-200"
                                    >
                                      Move →
                                    </button>
                                    {mobileMoveOpen.has(a.id) ? (
                                      <div className="mx-2 mb-2 mt-2 flex flex-wrap gap-1 border-t border-zinc-800/60 pt-2">
                                        {[...KANBAN_STAGES, CRM_LOST_STAGE]
                                          .filter((s) => s !== normalizePipelineStage(a.pipelineStage, a))
                                          .map((s) => (
                                            <button
                                              key={s}
                                              type="button"
                                              onClick={() => {
                                                void moveAccountStage(a.id, s)
                                                setMobileMoveOpen((prev) => {
                                                  const next = new Set(prev)
                                                  next.delete(a.id)
                                                  return next
                                                })
                                              }}
                                              className="rounded bg-zinc-800 px-2 py-1 text-[10px] font-semibold text-zinc-300 hover:bg-zinc-700"
                                            >
                                              {CRM_STAGE_LABELS[s] || `Stage ${s}`}
                                            </button>
                                          ))}
                                      </div>
                                    ) : null}
                                  </>
                                ) : null}
                              </div>
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
          <section className="space-y-6">
            <h2 className="text-sm font-semibold text-zinc-300">Leads</h2>
            <div className="flex flex-wrap items-end gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
              <label className="flex min-w-[10rem] flex-col text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                Segment
                <select
                  value={segment}
                  onChange={(e) => setSegment(e.target.value)}
                  className="mt-0.5 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm font-normal normal-case text-zinc-100"
                >
                  <option value="">All segments</option>
                  {CRM_ACCOUNT_SEGMENTS.filter((s) => s.value).map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex min-w-[11rem] flex-1 flex-col text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                Location contains
                <input
                  placeholder="City, region, metro…"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="mt-0.5 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm font-normal normal-case text-zinc-100"
                />
              </label>
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
            </div>
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
                <select
                  value={leadForm.segment}
                  onChange={(e) => setLeadForm((f) => ({ ...f, segment: e.target.value }))}
                  className="rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100"
                >
                  {CRM_ACCOUNT_SEGMENTS.map((s) => (
                    <option key={s.value || 'unset'} value={s.value}>
                      {s.label === 'Unassigned' ? 'Segment (optional)' : s.label}
                    </option>
                  ))}
                </select>
                <input
                  placeholder="Vehicle count"
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
                  className="rounded-lg bg-zinc-100 px-3 py-2 text-sm font-semibold text-zinc-950 hover:bg-white"
                >
                  Add lead
                </button>
              </form>
            ) : null}
            <div className="overflow-x-auto rounded-xl border border-zinc-800">
              <table className="w-full max-sm:min-w-0 text-left text-sm sm:min-w-[640px]">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-900/60 text-xs uppercase text-zinc-500">
                    <th className="px-3 py-2">Business</th>
                    <th className="px-3 py-2 max-sm:hidden">Source</th>
                    <th className="px-3 py-2 max-sm:hidden">Segment</th>
                    <th className="px-3 py-2">Vehicles</th>
                    <th className="px-3 py-2">Urgency</th>
                    <th className="px-3 py-2">Follow-up</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {leads.map((r) => (
                    <tr key={r.id} className="border-b border-zinc-800/80">
                      <td className="px-3 py-2">{r.businessName}</td>
                      <td className="px-3 py-2 text-zinc-400 max-sm:hidden">{r.source || '—'}</td>
                      <td className="px-3 py-2 text-zinc-400 max-sm:hidden">{crmSegmentLabel(r.segment)}</td>
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
                            <span className="hidden sm:inline">Convert to VIP client</span>
                            <span className="sm:hidden">Convert</span>
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div>
              <h2 className="text-sm font-semibold text-zinc-300">VIP clients pipeline</h2>
              <p className="mt-1 text-xs text-zinc-500">
                Sortable VIP clients (filters above apply here and on the Board tab).
              </p>
              <div className="mt-3">
                <CrmAccountsPipelineTable
                  accounts={filteredAccounts}
                  avgBuyPerTire={avgBuyPerTire}
                  onOpen={(a) => setDetail(a)}
                />
              </div>
            </div>
          </section>
        )}
      </main>

      {detail ? (
        <CrmAccountDetailPanel
          key={detail.id}
          account={detail}
          vehicles={vehicles}
          canEdit={canEdit}
          avgBuyPerTire={avgBuyPerTire}
          onClose={() => setDetail(null)}
          onRefresh={(a) => setDetail(a)}
        />
      ) : null}
    </div>
  )
}
