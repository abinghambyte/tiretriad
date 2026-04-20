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
import { useLocation, useSearchParams } from 'react-router-dom'
import { db } from '../firebase/config'
import { useAuth } from '../hooks/useAuth'
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
import { CrmLeadDetailDrawer } from '../components/crm/CrmLeadDetailDrawer.jsx'
import { CrmAccountsPipelineTable } from '../components/crm/CrmAccountsPipelineTable.jsx'
import { LeadSourceBadge } from '../components/crm/leadSourceBadge.jsx'
import { BTN_PRIMARY, BTN_SECONDARY } from '../components/ui/buttonStyles.js'
import { InputPromptModal } from '../components/shared/InputPromptModal.jsx'
import { EmptyState, EmptyStateIcons } from '../components/shared/EmptyState.jsx'
import { LoadingBlock } from '../components/shared/LoadingBlock.jsx'

const KANBAN_STAGES = [1, 2, 3, 4, 5]

function formatTs(ts) {
  if (!ts || typeof ts.toDate !== 'function') return '—'
  try {
    return ts.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  } catch {
    return '—'
  }
}

function leadInquiryCell(inquiry) {
  const full = String(inquiry ?? '').trim()
  if (!full) return { display: '\u2014', title: undefined }
  if (full.length <= 80) return { display: full, title: full }
  return { display: `${full.slice(0, 80)}\u2026`, title: full }
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

/** Classify the Next action due date for color-coding. Returns 'overdue' | 'today' | 'future' | 'none'. */
function nextActionDueStatus(a) {
  const due = a?.nextAction?.dueDate
  if (!due || typeof due.toDate !== 'function') return 'none'
  let dueMs
  try {
    dueMs = due.toDate().getTime()
  } catch {
    return 'none'
  }
  const now = new Date()
  const startOfTodayMs = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime()
  const startOfTomorrowMs = startOfTodayMs + 24 * 60 * 60 * 1000
  if (dueMs < startOfTodayMs) return 'overdue'
  if (dueMs < startOfTomorrowMs) return 'today'
  return 'future'
}

function nextActionClass(status) {
  if (status === 'overdue') return 'text-rose-300'
  if (status === 'today') return 'text-amber-300'
  return 'text-zinc-500'
}

/** Days since the account's most recent activity timestamp, or null if no timestamp is available. */
function daysSinceLastActivity(a) {
  const candidates = [a?.updatedAt, a?.lastContactedAt]
  let latestMs = 0
  for (const ts of candidates) {
    const ms = typeof ts?.toMillis === 'function' ? ts.toMillis() : 0
    if (ms > latestMs) latestMs = ms
  }
  if (!latestMs) return null
  const diffDays = Math.floor((Date.now() - latestMs) / (24 * 60 * 60 * 1000))
  return diffDays >= 0 ? diffDays : 0
}

const STALE_DEAL_DAYS = 14

function lastActivityNotePreview(a) {
  const e = lastActivityEntry(a)
  const text = String(e?.note || '').trim()
  if (!text) return '—'
  return text.length > 90 ? `${text.slice(0, 87)}…` : text
}

const JOB_COMPLETION_LABELS = {
  Pending: 'Pending',
  'In Progress': 'In progress',
  Done: 'Done',
}

function jobCompletionLabel(v) {
  const s = String(v || '').trim()
  if (JOB_COMPLETION_LABELS[s]) return JOB_COMPLETION_LABELS[s]
  if (!s) return 'Pending'
  return 'Unknown'
}

function fmtJobTime(v) {
  if (v == null || v === '') return 'TBD'
  if (typeof v.toDate === 'function') {
    try {
      return v.toDate().toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' })
    } catch {
      return 'TBD'
    }
  }
  return String(v)
}

/** Folded-in DJ Dispatch tab — previously `/crm/dispatch`. */
function DispatchTab() {
  const { toast } = useToast()
  const { user } = useAuth()
  const { profile } = useUserProfile()
  const allowed = profile?.role === 'mechanic' || profile?.role === 'admin'
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)

  useEffect(() => {
    if (!allowed) return undefined
    const q = query(collection(db, 'crmJobs'), orderBy('createdAt', 'desc'), limit(80))
    return onSnapshot(
      q,
      (snap) => {
        setJobs(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
        setLoading(false)
        setLoadError(null)
      },
      (err) => {
        console.error('crmJobs snapshot', err)
        setLoadError(err?.message || 'Could not load jobs.')
        setJobs([])
        setLoading(false)
      },
    )
  }, [allowed])

  const visibleJobs = useMemo(() => {
    const uid = user?.uid
    if (profile?.role === 'admin') return jobs
    return jobs.filter((j) => !j.assignedToUid || j.assignedToUid === uid)
  }, [jobs, profile?.role, user?.uid])

  if (!allowed) {
    return (
      <p className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3 text-sm text-zinc-400">
        Field dispatch is for Field crew and Overwatch.
      </p>
    )
  }

  async function setStatus(job, status) {
    const patch = {
      completionStatus: status,
      updatedAt: serverTimestamp(),
    }
    if (status === 'Done') {
      patch.completedAt = serverTimestamp()
    }
    await updateDoc(doc(db, 'crmJobs', job.id), patch)
    if (status === 'Done') {
      toast('Job complete', 'success')
    }
  }

  return (
    <section className="space-y-4">
      {loading ? <LoadingBlock label="Loading jobs…" /> : null}
      {!loading && loadError ? (
        <p className="rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-200">
          {loadError}
        </p>
      ) : null}
      {!loading && !loadError && jobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-700/70 bg-zinc-900/25 px-6 py-16 text-center">
          <svg
            className="mb-3 h-10 w-10 text-zinc-700"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 7h13l3 4v6h-3a2 2 0 1 1-4 0H9a2 2 0 1 1-4 0H3V7z" />
            <circle cx="7" cy="17" r="1.25" />
            <circle cx="16" cy="17" r="1.25" />
          </svg>
          <p className="text-sm text-zinc-400">No jobs dispatched yet.</p>
          <p className="mt-1 text-xs text-zinc-600">Jobs appear here when dispatched from a VIP client account.</p>
        </div>
      ) : null}
      {!loading && !loadError && jobs.length > 0 && visibleJobs.length === 0 ? (
        <p className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-8 text-center text-sm leading-relaxed text-zinc-400">
          No jobs assigned to you yet.
          <br />
          <span className="text-zinc-500">Check with dispatch when new field jobs are scheduled.</span>
        </p>
      ) : null}
      {!loading &&
        visibleJobs.map((j) => (
          <div
            key={j.id}
            className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 shadow-sm"
          >
            <p className="text-sm font-semibold text-zinc-100">{j.jobType || 'Job'}</p>
            <p className="mt-1 text-xs text-zinc-400">{j.location || '—'}</p>
            <p className="mt-1 text-xs text-zinc-500">
              Vehicles: {j.vehicleCount ?? '—'} · Tires: {j.tireSizes || '—'}
            </p>
            <p className="mt-1 text-xs text-zinc-600">When: {fmtJobTime(j.scheduledAt)}</p>
            <p className="mt-2 text-[11px] font-medium text-cyan-400/90">
              {jobCompletionLabel(j.completionStatus)}
            </p>
            <div className="mt-4 flex w-full flex-col gap-3 sm:flex-row sm:flex-wrap sm:gap-2">
              <button
                type="button"
                disabled={j.completionStatus === 'Done'}
                onClick={() => void setStatus(j, 'Done')}
                className={`${BTN_PRIMARY} w-full justify-center sm:w-auto sm:min-w-[120px]`}
              >
                Complete job
              </button>
              <button
                type="button"
                disabled={j.completionStatus === 'In Progress' || j.completionStatus === 'Done'}
                onClick={() => void setStatus(j, 'In Progress')}
                className={`${BTN_SECONDARY} w-full justify-center sm:w-auto sm:min-w-[120px]`}
              >
                Start job
              </button>
            </div>
          </div>
        ))}
    </section>
  )
}

export function CrmPage() {
  const { toast } = useToast()
  const { permissionFor, profile } = useUserProfile()
  const { tires } = useTires()
  const loc = useLocation()
  const [searchParams] = useSearchParams()
  const rawTab = searchParams.get('tab')
  const tab = rawTab === 'leads' || rawTab === 'dispatch' ? rawTab : 'board'
  const canEdit = permissionMeets(permissionFor('crm'), 'edit')
  const [accounts, setAccounts] = useState([])
  const [leads, setLeads] = useState([])
  const [loading, setLoading] = useState(true)
  const [segment, setSegment] = useState('')
  const [location, setLocation] = useState('')
  const [minScore, setMinScore] = useState('')
  const [search, setSearch] = useState('')
  const [detail, setDetail] = useState(null)
  const [leadDetail, setLeadDetail] = useState(null)
  const [vehicles, setVehicles] = useState([])
  const [addAccountOpen, setAddAccountOpen] = useState(false)
  /** Pipeline stage used when the next Add-VIP submit fires. */
  const [addAccountStage, setAddAccountStage] = useState(1)
  /** Stage currently being dragged over. Drives column highlight during drag. */
  const [dragOverStage, setDragOverStage] = useState(null)
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

  const stageTotal = useCallback(
    (stage) => {
      const rows = stage === CRM_LOST_STAGE ? lostAccounts : byStage(stage)
      const sum = rows.reduce((acc, a) => {
        const v = estimatedDealValue(a.vehicleProfile || {}, avgBuyPerTire)
        return acc + (Number.isFinite(v) ? v : 0)
      }, 0)
      return { count: rows.length, dollars: sum }
    },
    [avgBuyPerTire, byStage, lostAccounts],
  )

  const pipelineSummary = useMemo(() => {
    const activeAccounts = filteredAccounts.filter(
      (a) => Number(a.pipelineStage) !== CRM_LOST_STAGE,
    )
    const closedCount = filteredAccounts.filter(
      (a) => normalizePipelineStage(a.pipelineStage, a) === 5,
    ).length
    const dollars = activeAccounts.reduce((acc, a) => {
      const v = estimatedDealValue(a.vehicleProfile || {}, avgBuyPerTire)
      return acc + (Number.isFinite(v) ? v : 0)
    }, 0)
    const totalForRate = activeAccounts.length + lostAccounts.length
    const conversionRate = totalForRate > 0 ? (100 * closedCount) / totalForRate : null
    return {
      totalAccounts: activeAccounts.length,
      totalDollars: dollars,
      conversionRate,
    }
  }, [avgBuyPerTire, filteredAccounts, lostAccounts])

  async function onDropStage(stage, e) {
    e.preventDefault()
    setDragOverStage(null)
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

  async function createAccountWithName(name) {
    if (!canEdit) return
    const clean = String(name || '').trim()
    if (!clean) return
    const stage =
      Number.isFinite(addAccountStage) && addAccountStage >= 1 && addAccountStage <= 5
        ? addAccountStage
        : 1
    await addDoc(collection(db, 'crmAccounts'), {
      companyName: clean,
      pipelineStage: stage,
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
    setLeadDetail((cur) => (cur?.id === lead.id ? null : cur))
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
        subtitle="Lead pipeline, VIP clients, and field dispatch"
        tabs={crmTabs}
        maxWidthClass="max-w-[1600px]"
      />

      <main className="mx-auto max-w-[1600px] space-y-6 px-4 py-6 sm:px-6">
        {tab === 'dispatch' ? <DispatchTab /> : null}
        {tab === 'board' ? (
          <>
            <div className="flex flex-wrap items-end gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
              {canEdit ? (
                <button
                  type="button"
                  onClick={() => {
                    setAddAccountStage(1)
                    setAddAccountOpen(true)
                  }}
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
                <div className="hidden gap-2 md:flex md:overflow-x-auto md:pb-2">
                  {KANBAN_STAGES.map((stage) => (
                    <div
                      key={stage}
                      className="flex-shrink-0 basis-0 flex-1 rounded-xl border border-zinc-800 bg-zinc-900/30 p-2 md:min-w-[11rem]"
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
                  Track VIP clients from first contact to closed. Northern Colorado tire operations.
                </p>
                {canEdit ? (
                  <button
                    type="button"
                    onClick={() => setAddAccountOpen(true)}
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
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3 text-xs text-zinc-400">
                  <span>
                    <span className="text-zinc-500">Total leads </span>
                    <span className="font-semibold text-zinc-200 tabular-nums">
                      {pipelineSummary.totalAccounts}
                    </span>
                  </span>
                  {pipelineSummary.totalDollars > 0 ? (
                    <span>
                      <span className="text-zinc-500">Pipeline value </span>
                      <span className="font-semibold text-amber-200 tabular-nums">
                        {formatCurrency(pipelineSummary.totalDollars)}
                      </span>
                      <span className="ml-1 text-zinc-600">est.</span>
                    </span>
                  ) : null}
                  {pipelineSummary.conversionRate != null ? (
                    <span>
                      <span className="text-zinc-500">Conversion rate </span>
                      <span className="font-semibold text-zinc-200 tabular-nums">
                        {pipelineSummary.conversionRate.toFixed(1)}%
                      </span>
                    </span>
                  ) : null}
                </div>
                <div className="hidden gap-2 md:flex md:overflow-x-auto md:pb-2">
                  {KANBAN_STAGES.map((stage) => {
                    const s = stageTotal(stage)
                    return (
                    <div
                      key={stage}
                      className={`flex min-w-0 flex-shrink-0 basis-0 flex-1 flex-col rounded-xl border bg-zinc-900/30 p-2 transition-colors duration-150 md:min-w-[11rem] ${dragOverStage === stage ? 'border-amber-500/70 bg-amber-950/25 ring-1 ring-amber-500/40' : 'border-zinc-800'}`}
                      onDragOver={(e) => { e.preventDefault(); if (dragOverStage !== stage) setDragOverStage(stage) }}
                      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOverStage((s) => (s === stage ? null : s)) }}
                      onDrop={(e) => void onDropStage(stage, e)}
                    >
                      <div className="mb-2 px-1">
                        <p className="text-xs font-semibold leading-snug text-zinc-300">
                          {CRM_STAGE_LABELS[stage]}
                        </p>
                        <p className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-zinc-800/60 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500 ring-1 ring-zinc-700/60">
                          <span className="tabular-nums text-zinc-300">{s.count}</span>
                          {s.dollars > 0 ? (
                            <>
                              <span className="text-zinc-600">·</span>
                              <span className="tabular-nums">{formatCurrency(s.dollars)}</span>
                              <span className="text-zinc-600">est.</span>
                            </>
                          ) : null}
                        </p>
                      </div>
                      <div className="space-y-2">
                        {byStage(stage).map((a) => {
                          const dueStatus = nextActionDueStatus(a)
                          const staleDays = daysSinceLastActivity(a)
                          const isStale = staleDays != null && staleDays >= STALE_DEAL_DAYS
                          return (
                          <div
                            key={a.id}
                            role="button"
                            tabIndex={0}
                            draggable={canEdit}
                            onDragStart={(e) => {
                              e.dataTransfer.setData('text/accountId', a.id)
                            }}
                            onClick={() => setDetail(a)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault()
                                setDetail(a)
                                return
                              }
                              if (!canEdit) return
                              const current = normalizePipelineStage(a.pipelineStage, a)
                              if (e.key === 'ArrowRight' && current < 5) {
                                e.preventDefault()
                                void moveAccountStage(a.id, current + 1)
                              } else if (e.key === 'ArrowLeft' && current > 1) {
                                e.preventDefault()
                                void moveAccountStage(a.id, current - 1)
                              }
                            }}
                            className="relative w-full cursor-pointer rounded-lg border border-zinc-700/80 bg-zinc-950/80 p-2 text-left text-xs hover:border-violet-700/50 focus:outline-none focus:ring-1 focus:ring-violet-500/60"
                          >
                            {isStale ? (
                              <span
                                className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-amber-400 ring-2 ring-zinc-950/80"
                                title={`No activity for ${staleDays} days`}
                                aria-label={`No activity for ${staleDays} days`}
                              />
                            ) : null}
                            <span className="font-medium text-zinc-100">{a.companyName}</span>
                            <p className="mt-1 text-[10px] font-medium text-violet-300/90">
                              {crmStageLabel(a.pipelineStage, a)}
                            </p>
                            <p className={`mt-0.5 text-[10px] ${nextActionClass(dueStatus)}`}>
                              Next: {nextActionSummary(a)}
                            </p>
                            <p className="mt-0.5 line-clamp-2 text-[10px] text-zinc-500">
                              Last note: {lastActivityNotePreview(a)}
                            </p>
                            {estimatedDealValue(a.vehicleProfile || {}, avgBuyPerTire) != null ? (
                              <p className="mt-1 text-[10px] font-semibold text-amber-200/90">
                                {formatCurrency(estimatedDealValue(a.vehicleProfile || {}, avgBuyPerTire))}
                              </p>
                            ) : null}
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                              <span
                                className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1 ${scoreBadgeClass(a.score)}`}
                                title="CRM score"
                              >
                                Score {a.score ?? computeCrmScore(a)}
                              </span>
                              <span className="text-[10px] text-zinc-500" title="Pain score">
                                · Pain {a.painScore ?? '—'}
                              </span>
                            </div>
                          </div>
                          )
                        })}
                      </div>
                      {canEdit ? (
                        <button
                          type="button"
                          onClick={() => {
                            setAddAccountStage(stage)
                            setAddAccountOpen(true)
                          }}
                          className="mt-2 rounded-md border border-dashed border-zinc-700/70 px-2 py-1 text-[10px] font-medium text-zinc-500 hover:border-violet-700/60 hover:text-violet-300"
                          title={`Add a VIP client in ${CRM_STAGE_LABELS[stage]}`}
                        >
                          + Add to {CRM_STAGE_LABELS[stage]}
                        </button>
                      ) : null}
                    </div>
                    )
                  })}
                  {(() => {
                    const s = stageTotal(CRM_LOST_STAGE)
                    return (
                  <div
                    className={`min-w-0 rounded-xl border bg-zinc-900/20 p-2 transition-colors duration-150 ${dragOverStage === CRM_LOST_STAGE ? 'border-rose-500/60 bg-rose-950/20 ring-1 ring-rose-500/40' : 'border-zinc-800'}`}
                    onDragOver={(e) => { e.preventDefault(); if (dragOverStage !== CRM_LOST_STAGE) setDragOverStage(CRM_LOST_STAGE) }}
                    onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOverStage((s) => (s === CRM_LOST_STAGE ? null : s)) }}
                    onDrop={(e) => void onDropStage(CRM_LOST_STAGE, e)}
                  >
                    <div className="mb-2 px-1">
                      <p className="text-xs font-semibold leading-snug text-zinc-500">
                        {CRM_STAGE_LABELS[CRM_LOST_STAGE]}
                      </p>
                      <p className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-zinc-800/40 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600 ring-1 ring-zinc-800/60">
                        <span className="tabular-nums text-zinc-400">{s.count}</span>
                        {s.dollars > 0 ? (
                          <>
                            <span>·</span>
                            <span className="tabular-nums">{formatCurrency(s.dollars)}</span>
                            <span>est.</span>
                          </>
                        ) : null}
                      </p>
                    </div>
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
                          {estimatedDealValue(a.vehicleProfile || {}, avgBuyPerTire) != null ? (
                            <p className="mt-1 text-[10px] font-semibold text-amber-200/70">
                              {formatCurrency(estimatedDealValue(a.vehicleProfile || {}, avgBuyPerTire))}
                            </p>
                          ) : null}
                        </button>
                      ))}
                    </div>
                  </div>
                    )
                  })()}
                </div>
                <div className="space-y-2 md:hidden">
                  {[...KANBAN_STAGES, CRM_LOST_STAGE].map((stage) => {
                    const open = crmMobileStage === stage
                    const s = stageTotal(stage)
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
                            <span className="font-normal text-zinc-500"> · {s.count}</span>
                            {s.dollars > 0 ? (
                              <span className="font-normal text-zinc-500">
                                {' '}· {formatCurrency(s.dollars)}
                                <span className="text-zinc-600"> est.</span>
                              </span>
                            ) : null}
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
                                  {estimatedDealValue(a.vehicleProfile || {}, avgBuyPerTire) != null ? (
                                    <p className="mt-0.5 text-[10px] font-semibold text-amber-200/90">
                                      {formatCurrency(estimatedDealValue(a.vehicleProfile || {}, avgBuyPerTire))}
                                    </p>
                                  ) : null}
                                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                    <span
                                      className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1 ${scoreBadgeClass(a.score)}`}
                                      title="CRM score"
                                    >
                                      Score {a.score ?? computeCrmScore(a)}
                                    </span>
                                    <span
                                      className="text-[10px] text-zinc-500"
                                      title="Pain score"
                                    >
                                      · Pain {a.painScore ?? '—'}
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
                                      Move
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
        ) : null}
        {tab === 'leads' ? (
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
                <label className="flex flex-col text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                  Urgency
                  <select
                    value={leadForm.urgency}
                    onChange={(e) => setLeadForm((f) => ({ ...f, urgency: e.target.value }))}
                    className="mt-0.5 rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm font-normal normal-case text-zinc-100"
                  >
                    <option value="cold">Cold</option>
                    <option value="warm">Warm</option>
                    <option value="hot">Hot</option>
                  </select>
                </label>
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
                    <th className="px-3 py-2 max-sm:hidden">Inquiry</th>
                    <th className="px-3 py-2">Vehicles</th>
                    <th className="px-3 py-2">Urgency</th>
                    <th className="px-3 py-2">Follow-up</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {leads.length === 0 ? (
                    <EmptyState
                      variant="row"
                      colSpan={8}
                      icon={EmptyStateIcons.clipboard}
                      title="No leads yet"
                      description="Raw leads from phone, SMS, and site inquiries show up here. Promote the strong ones to VIP clients to start tracking activity."
                    />
                  ) : null}
                  {leads.map((r) => {
                    const inquiryCell = leadInquiryCell(r.inquiry)
                    return (
                    <tr
                      key={r.id}
                      className="cursor-pointer border-b border-zinc-800/80 hover:bg-zinc-900/40"
                      onClick={() => setLeadDetail(r)}
                    >
                      <td className="px-3 py-2">{r.businessName}</td>
                      <td className="px-3 py-2 max-sm:hidden">
                        <LeadSourceBadge source={r.source} />
                      </td>
                      <td className="px-3 py-2 text-zinc-400 max-sm:hidden">{crmSegmentLabel(r.segment)}</td>
                      <td className="max-w-[12rem] truncate px-3 py-2 text-zinc-300 max-sm:hidden" title={inquiryCell.title}>
                        {inquiryCell.display}
                      </td>
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
                            onClick={(e) => {
                              e.stopPropagation()
                              void convertLead(r)
                            }}
                          >
                            <span className="hidden sm:inline">Convert to VIP client</span>
                            <span className="sm:hidden">Convert</span>
                          </button>
                        ) : null}
                      </td>
                    </tr>
                    )
                  })}
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
        ) : null}
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

      {leadDetail ? (
        <CrmLeadDetailDrawer
          key={leadDetail.id}
          lead={leadDetail}
          canEdit={canEdit}
          onClose={() => setLeadDetail(null)}
          onConvertToVip={(l) => void convertLead(l)}
        />
      ) : null}

      <InputPromptModal
        isOpen={addAccountOpen}
        title="Add VIP client"
        label="Company name"
        placeholder="Acme Freight"
        submitLabel="Add client"
        maxLength={100}
        onSubmit={(name) => void createAccountWithName(name)}
        onClose={() => setAddAccountOpen(false)}
      />
    </div>
  )
}
