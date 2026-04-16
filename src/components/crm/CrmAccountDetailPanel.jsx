import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import { useCallback, useEffect, useMemo, useState, startTransition } from 'react'
import { auth, db } from '../../firebase/config'
import { formatCurrency, formatQty } from '../../utils/format'
import { phoneDocIdFromContact } from '../../utils/phoneDocId'
import {
  CRM_PIPELINE_SCHEMA_VERSION,
  CRM_STAGE_LABELS,
  CRM_LOST_STAGE,
  activityLogEntries,
  estimatedDealValue,
  isValidCrmOwner,
  sortActivityDescending,
} from '../../utils/crmPipeline'
import {
  CRM_ACCOUNT_SEGMENTS,
  CRM_VEHICLE_TYPE_CATEGORIES,
  crmSegmentIsPreset,
  normalizeCrmVin,
} from '../../utils/crmAccountPicklists.js'
import { computeCrmScore, scoreBadgeClass } from '../../utils/crmScore'

// Tanner is a silent partner — no portal access, never assignable.
const OWNERS = [
  { value: 'alex', label: 'Alex' },
  { value: 'dj', label: 'DJ' },
  { value: 'kyle', label: 'Kyle' },
]

function tsToDateInput(ts) {
  if (!ts || typeof ts.toDate !== 'function') return ''
  try {
    return ts.toDate().toISOString().slice(0, 10)
  } catch {
    return ''
  }
}

function fmtActivityAt(ts) {
  if (!ts || typeof ts.toDate !== 'function') return '—'
  try {
    return ts.toDate().toLocaleString('en-US', {
      timeZone: 'America/Denver',
      dateStyle: 'short',
      timeStyle: 'short',
    })
  } catch {
    return '—'
  }
}

/**
 * @param {object} props
 * @param {Record<string, unknown>} props.account
 * @param {Array<Record<string, unknown>>} props.vehicles
 * @param {boolean} props.canEdit
 * @param {() => void} props.onClose
 * @param {(a: Record<string, unknown>) => void} props.onRefresh
 * @param {number} props.avgBuyPerTire
 */
export function CrmAccountDetailPanel({ account, vehicles, canEdit, onClose, onRefresh, avgBuyPerTire }) {
  const [draft, setDraft] = useState({ ...account })
  /** Preset segment dropdown vs free-text custom label (not a Firestore field). */
  const [segmentMode, setSegmentMode] = useState(() => (crmSegmentIsPreset(account.segment) ? 'preset' : 'custom'))
  const [vehLabel, setVehLabel] = useState('')
  const [activityNote, setActivityNote] = useState('')
  const [linkedOrdersRows, setLinkedOrdersRows] = useState([])

  const vp = useMemo(
    () => (draft.vehicleProfile && typeof draft.vehicleProfile === 'object' ? draft.vehicleProfile : {}),
    [draft.vehicleProfile],
  )
  const nax = useMemo(
    () => (draft.nextAction && typeof draft.nextAction === 'object' ? draft.nextAction : {}),
    [draft.nextAction],
  )

  const est = useMemo(() => estimatedDealValue(vp, avgBuyPerTire), [vp, avgBuyPerTire])

  useEffect(() => {
    queueMicrotask(() => {
      setDraft({ ...account })
      setSegmentMode(crmSegmentIsPreset(account.segment) ? 'preset' : 'custom')
    })
  }, [account])

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const phoneKey = useMemo(() => {
    const lp = String(draft.linkedPhone || '').trim()
    return phoneDocIdFromContact(lp) || lp.replace(/\D/g, '') || null
  }, [draft.linkedPhone])

  useEffect(() => {
    if (!phoneKey) {
      startTransition(() => {
        setLinkedOrdersRows([])
      })
      return undefined
    }
    const q = query(
      collection(db, 'orders'),
      where('status', '==', 'completed'),
      where('contactPhoneKey', '==', phoneKey),
      limit(40),
    )
    return onSnapshot(
      q,
      (snap) => {
        setLinkedOrdersRows(
          snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => {
            const ma = a.completedAt?.toMillis?.() ?? 0
            const mb = b.completedAt?.toMillis?.() ?? 0
            return mb - ma
          }),
        )
      },
      () => {
        startTransition(() => setLinkedOrdersRows([]))
      },
    )
  }, [phoneKey])

  const saveField = useCallback(
    async (patch) => {
      if (!canEdit) return
      await updateDoc(doc(db, 'crmAccounts', account.id), {
        ...patch,
        pipelineSchemaVersion: CRM_PIPELINE_SCHEMA_VERSION,
        updatedAt: serverTimestamp(),
      })
      onRefresh({ ...account, ...patch })
    },
    [account, canEdit, onRefresh],
  )

  async function saveNextAction() {
    const task = String(nax.task || '').trim()
    const ownedBy = String(nax.ownedBy || '').toLowerCase()
    const dueStr = tsToDateInput(nax.dueDate) ? `${tsToDateInput(nax.dueDate)}T12:00:00` : ''
    const nextAction = {
      task,
      ownedBy: isValidCrmOwner(ownedBy) ? ownedBy : 'alex',
      dueDate: dueStr ? Timestamp.fromDate(new Date(dueStr)) : null,
    }
    await saveField({ nextAction })
  }

  async function saveVehicleProfile() {
    const y = Number(vp.modelYear)
    const vehicleProfile = {
      vehicleCount: Math.max(0, Number(vp.vehicleCount) || 0),
      vehicleTypeCategory: String(vp.vehicleTypeCategory || '').trim(),
      vehicleTypes: String(vp.vehicleTypes || '').trim(),
      tireSizeRange: String(vp.tireSizeRange || '').trim(),
      vin: normalizeCrmVin(vp.vin),
      make: String(vp.make || '').trim(),
      model: String(vp.model || '').trim(),
      modelYear: Number.isFinite(y) && y >= 1900 && y <= 2035 ? Math.floor(y) : 0,
      currentVendor: String(vp.currentVendor || '').trim(),
      estimatedAnnualSpend: Math.max(0, Number(vp.estimatedAnnualSpend) || 0),
    }
    await saveField({ vehicleProfile })
  }

  async function postActivity() {
    if (!canEdit || !activityNote.trim()) return
    const prev = Array.isArray(account.activityLog) ? [...account.activityLog] : []
    const entry = {
      note: activityNote.trim(),
      addedBy: auth.currentUser?.email || auth.currentUser?.uid || 'portal',
      addedAt: Timestamp.now(),
    }
    await saveField({ activityLog: [...prev, entry] })
    setActivityNote('')
  }

  const sortedActivity = useMemo(
    () => sortActivityDescending(activityLogEntries({ ...account, ...draft })),
    [account, draft],
  )

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-black/70 p-0 backdrop-blur-md sk-modal-backdrop-enter sm:p-0"
      role="dialog"
      aria-modal
      onClick={onClose}
    >
      <div
        className="sk-panel-slide-in h-full min-h-screen w-full max-w-lg overflow-y-auto border-l border-zinc-800/90 bg-zinc-950 p-6 shadow-2xl shadow-black/40 max-sm:max-w-none max-sm:border-l-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="min-w-0 flex-1 text-lg font-semibold tracking-tight text-zinc-50 sm:text-xl">
            {draft.companyName}
          </h2>
          <button
            type="button"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-transparent text-zinc-400 transition-colors duration-200 hover:border-zinc-700 hover:bg-zinc-800/80 hover:text-zinc-100"
            onClick={onClose}
            aria-label="Close panel"
          >
            <span className="text-xl leading-none" aria-hidden>
              ×
            </span>
          </button>
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          Score{' '}
          <span className={`rounded-full px-2 py-0.5 font-semibold ring-1 ${scoreBadgeClass(computeCrmScore(draft))}`}>
            {computeCrmScore(draft)}
          </span>
        </p>

        <label className="mt-4 block text-xs text-zinc-500">
          Pipeline stage
          <select
            disabled={!canEdit}
            value={Number(draft.pipelineStage) === CRM_LOST_STAGE ? CRM_LOST_STAGE : Number(draft.pipelineStage) || 1}
            onChange={(e) => {
              const v = Number(e.target.value)
              setDraft((d) => ({ ...d, pipelineStage: v }))
            }}
            onBlur={() => void saveField({ pipelineStage: Number(draft.pipelineStage) || 1 })}
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-2 text-sm text-zinc-100 disabled:opacity-50"
          >
            {[1, 2, 3, 4, 5].map((s) => (
              <option key={s} value={s}>
                {CRM_STAGE_LABELS[s]}
              </option>
            ))}
            <option value={CRM_LOST_STAGE}>{CRM_STAGE_LABELS[CRM_LOST_STAGE]}</option>
          </select>
        </label>

        <div className="mt-6 space-y-3 text-sm">
          <label className="block text-xs text-zinc-500">
            Company
            <input
              type="text"
              disabled={!canEdit}
              value={draft.companyName ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, companyName: e.target.value }))}
              onBlur={() => void saveField({ companyName: draft.companyName })}
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-zinc-100 disabled:opacity-50"
            />
          </label>
          <label className="block text-xs text-zinc-500">
            Decision maker
            <input
              type="text"
              disabled={!canEdit}
              value={draft.decisionMaker ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, decisionMaker: e.target.value }))}
              onBlur={() => void saveField({ decisionMaker: draft.decisionMaker })}
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-zinc-100 disabled:opacity-50"
            />
          </label>
          <div className="block text-xs text-zinc-500">
            <span className="block">Segment</span>
            <p className="mb-1 mt-0.5 text-[11px] font-normal leading-snug text-zinc-600">
              What kind of fleet or operation is this account? Use a preset lane, or switch to a custom label.
            </p>
            {segmentMode === 'preset' ? (
              <>
                <select
                  disabled={!canEdit}
                  value={String(draft.segment ?? '')}
                  onChange={(e) => setDraft((d) => ({ ...d, segment: e.target.value }))}
                  onBlur={() => void saveField({ segment: String(draft.segment || '').trim() })}
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-2 text-sm text-zinc-100 disabled:opacity-50"
                >
                  {CRM_ACCOUNT_SEGMENTS.map((s) => (
                    <option key={s.value || 'unset'} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
                {canEdit ? (
                  <button
                    type="button"
                    className="mt-2 text-[11px] font-medium text-violet-300 hover:text-violet-200 hover:underline"
                    onClick={() => setSegmentMode('custom')}
                  >
                    Use custom segment label instead
                  </button>
                ) : null}
              </>
            ) : (
              <>
                <input
                  type="text"
                  disabled={!canEdit}
                  value={String(draft.segment ?? '')}
                  onChange={(e) => setDraft((d) => ({ ...d, segment: e.target.value }))}
                  onBlur={() => void saveField({ segment: String(draft.segment || '').trim() })}
                  placeholder="e.g. Skedaddle Inc · regional distributor"
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-zinc-100 disabled:opacity-50"
                />
                {canEdit ? (
                  <button
                    type="button"
                    className="mt-2 text-[11px] font-medium text-violet-300 hover:text-violet-200 hover:underline"
                    onClick={() => {
                      setSegmentMode('preset')
                      setDraft((d) => ({ ...d, segment: '' }))
                      void saveField({ segment: '' })
                    }}
                  >
                    Use preset segment instead
                  </button>
                ) : null}
              </>
            )}
          </div>
          <label className="block text-xs text-zinc-500">
            Primary location
            <p className="mb-1 mt-0.5 text-[11px] font-normal leading-snug text-zinc-600">
              City, metro, or region you use for routing and context (free text).
            </p>
            <input
              type="text"
              disabled={!canEdit}
              value={draft.location ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, location: e.target.value }))}
              onBlur={() => void saveField({ location: String(draft.location || '').trim() })}
              placeholder="e.g. Fort Collins, CO · North Front Range"
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-zinc-100 disabled:opacity-50"
            />
          </label>
          <label className="block text-xs text-zinc-500">
            Vehicle count (fleet size)
            <input
              type="number"
              min={0}
              disabled={!canEdit}
              value={draft.fleetSize ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, fleetSize: Number(e.target.value) }))}
              onBlur={() => void saveField({ fleetSize: Number(draft.fleetSize) || 0 })}
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-zinc-100 disabled:opacity-50"
            />
          </label>
          <label className="block text-xs text-zinc-500">
            Linked phone (digits; matches orders & contacts)
            <input
              type="tel"
              disabled={!canEdit}
              value={draft.linkedPhone ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, linkedPhone: e.target.value }))}
              onBlur={() => void saveField({ linkedPhone: String(draft.linkedPhone || '').trim() })}
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-zinc-100 disabled:opacity-50"
            />
          </label>
          <label className="block text-xs text-zinc-500">
            Pain score
            <input
              type="range"
              min={1}
              max={10}
              disabled={!canEdit}
              value={draft.painScore ?? 1}
              onChange={(e) => setDraft((d) => ({ ...d, painScore: Number(e.target.value) }))}
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

        <h3 className="mt-8 text-sm font-semibold text-zinc-200">Next action</h3>
        <div className="mt-2 space-y-2 rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
          <input
            placeholder="Task"
            disabled={!canEdit}
            value={nax.task ?? ''}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                nextAction: { ...(d.nextAction || {}), task: e.target.value },
              }))
            }
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm"
          />
          <select
            disabled={!canEdit}
            value={isValidCrmOwner(nax.ownedBy) ? String(nax.ownedBy).toLowerCase() : 'alex'}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                nextAction: { ...(d.nextAction || {}), ownedBy: e.target.value },
              }))
            }
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm"
          >
            {OWNERS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <input
            type="date"
            disabled={!canEdit}
            value={tsToDateInput(nax.dueDate)}
            onChange={(e) => {
              const v = e.target.value
              setDraft((d) => ({
                ...d,
                nextAction: {
                  ...(d.nextAction || {}),
                  dueDate: v ? Timestamp.fromDate(new Date(`${v}T12:00:00`)) : null,
                },
              }))
            }}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm"
          />
          {canEdit ? (
            <button
              type="button"
              onClick={() => void saveNextAction()}
              className="w-full rounded-lg bg-violet-600 py-2 text-sm font-semibold text-white hover:bg-violet-500"
            >
              Save next action
            </button>
          ) : null}
        </div>

        <h3 className="mt-8 text-sm font-semibold text-zinc-200">Activity log</h3>
        <div className="mt-2 max-h-56 space-y-2 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-900/30 p-2 text-xs">
          {sortedActivity.map((e) => (
            <div key={`${e.kind}-${e.i}`} className="border-b border-zinc-800/80 pb-2">
              <p className="text-zinc-200">{e.note}</p>
              <p className="mt-0.5 text-[10px] text-zinc-500">
                {e.by} · {fmtActivityAt(e.at)}
              </p>
            </div>
          ))}
        </div>
        {canEdit ? (
          <div className="mt-2 flex flex-col gap-2">
            <textarea
              value={activityNote}
              onChange={(e) => setActivityNote(e.target.value)}
              rows={2}
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm"
              placeholder="Add note…"
            />
            <button
              type="button"
              onClick={() => void postActivity()}
              className="rounded-lg bg-violet-800 px-2 py-2 text-sm font-semibold text-white"
            >
              Post
            </button>
          </div>
        ) : null}

        <h3 className="mt-8 text-sm font-semibold text-zinc-200">Vehicle profile</h3>
        <p className="mt-1 text-[11px] leading-relaxed text-zinc-600">
          Representative fleet vehicle for sizing and notes. Deal value below still uses vehicle count × tire math.
        </p>
        <div className="mt-2 space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
          <label className="block text-xs text-zinc-500">
            Vehicle count
            <input
              type="number"
              min={0}
              disabled={!canEdit}
              value={vp.vehicleCount ?? ''}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  vehicleProfile: {
                    ...(d.vehicleProfile || {}),
                    vehicleCount: Number(e.target.value),
                  },
                }))
              }
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="block text-xs text-zinc-500">
            Vehicle type category
            <select
              disabled={!canEdit}
              value={String(vp.vehicleTypeCategory || '')}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  vehicleProfile: {
                    ...(d.vehicleProfile || {}),
                    vehicleTypeCategory: e.target.value,
                  },
                }))
              }
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-2 text-sm text-zinc-100"
            >
              {CRM_VEHICLE_TYPE_CATEGORIES.map((s) => (
                <option key={s.value || 'unset'} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block text-xs text-zinc-500">
              VIN (up to 17)
              <input
                type="text"
                disabled={!canEdit}
                value={String(vp.vin ?? '')}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    vehicleProfile: {
                      ...(d.vehicleProfile || {}),
                      vin: normalizeCrmVin(e.target.value),
                    },
                  }))
                }
                maxLength={17}
                autoComplete="off"
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 font-mono text-sm uppercase"
              />
            </label>
            <label className="block text-xs text-zinc-500">
              Year
              <input
                type="number"
                min={1900}
                max={2035}
                disabled={!canEdit}
                value={Number(vp.modelYear) > 0 ? vp.modelYear : ''}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    vehicleProfile: {
                      ...(d.vehicleProfile || {}),
                      modelYear: Number(e.target.value) || 0,
                    },
                  }))
                }
                placeholder="e.g. 2019"
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm"
              />
            </label>
            <label className="block text-xs text-zinc-500 sm:col-span-1">
              Make
              <input
                type="text"
                disabled={!canEdit}
                value={String(vp.make ?? '')}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    vehicleProfile: {
                      ...(d.vehicleProfile || {}),
                      make: e.target.value,
                    },
                  }))
                }
                placeholder="e.g. Ford"
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm"
              />
            </label>
            <label className="block text-xs text-zinc-500 sm:col-span-1">
              Model
              <input
                type="text"
                disabled={!canEdit}
                value={String(vp.model ?? '')}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    vehicleProfile: {
                      ...(d.vehicleProfile || {}),
                      model: e.target.value,
                    },
                  }))
                }
                placeholder="e.g. F-250"
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm"
              />
            </label>
          </div>
          <label className="block text-xs text-zinc-500">
            Tire size range
            <input
              type="text"
              disabled={!canEdit}
              value={String(vp.tireSizeRange ?? '')}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  vehicleProfile: {
                    ...(d.vehicleProfile || {}),
                    tireSizeRange: e.target.value,
                  },
                }))
              }
              placeholder="e.g. LT265/70R17 · 235/65R16"
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="block text-xs text-zinc-500">
            Additional vehicle notes
            <input
              type="text"
              disabled={!canEdit}
              value={String(vp.vehicleTypes ?? '')}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  vehicleProfile: {
                    ...(d.vehicleProfile || {}),
                    vehicleTypes: e.target.value,
                  },
                }))
              }
              placeholder="Mix of vans and pickups, second yard, etc."
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="block text-xs text-zinc-500">
            Current vendor
            <input
              type="text"
              disabled={!canEdit}
              value={String(vp.currentVendor ?? '')}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  vehicleProfile: {
                    ...(d.vehicleProfile || {}),
                    currentVendor: e.target.value,
                  },
                }))
              }
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="block text-xs text-zinc-500">
            Est. annual spend
            <input
              type="number"
              min={0}
              step={100}
              disabled={!canEdit}
              value={vp.estimatedAnnualSpend ?? ''}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  vehicleProfile: {
                    ...(d.vehicleProfile || {}),
                    estimatedAnnualSpend: Number(e.target.value),
                  },
                }))
              }
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm"
            />
          </label>
          <p className="text-xs text-zinc-400">
            Est. deal value (computed):{' '}
            <span className="font-semibold text-amber-200/95">
              {est != null ? formatCurrency(est) : '—'}
            </span>
          </p>
          {canEdit ? (
            <button
              type="button"
              onClick={() => void saveVehicleProfile()}
              className="w-full rounded-lg bg-violet-600 py-2 text-sm font-semibold text-white hover:bg-violet-500"
            >
              Save vehicle profile
            </button>
          ) : null}
        </div>

        <h3 className="mt-8 text-sm font-semibold text-zinc-200">Linked orders (completed)</h3>
        <ul className="mt-2 max-h-48 space-y-2 overflow-y-auto text-xs text-zinc-400">
          {linkedOrdersRows.length === 0 ? (
            <li>None linked (match phone on completed orders).</li>
          ) : (
            linkedOrdersRows.map((o) => (
              <li key={o.id} className="rounded border border-zinc-800/80 bg-zinc-950/50 p-2">
                <span className="font-mono text-zinc-300">{o.id}</span>
                <span className="mx-1 text-zinc-600">·</span>
                {fmtActivityAt(o.completedAt)}
                <span className="mx-1 text-zinc-600">·</span>
                {o.mspn || '—'} × {formatQty(o.quantity)}
                <span className="mx-1 text-zinc-600">·</span>
                {formatCurrency(Number(o.paymentAmount) || 0)}
              </li>
            ))
          )}
        </ul>

        <h3 className="mt-8 text-sm font-semibold text-zinc-200">Vehicles (legacy list)</h3>
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
            onClick={async () => {
              if (!canEdit || !vehLabel.trim()) return
              await addDoc(collection(db, 'crmVehicles'), {
                accountId: account.id,
                label: vehLabel.trim(),
                tireSize: '',
                notes: '',
                createdAt: serverTimestamp(),
              })
              setVehLabel('')
            }}
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
                <button
                  type="button"
                  className="text-red-400 hover:underline"
                  onClick={() => {
                    if (!window.confirm('Remove vehicle?')) return
                    void deleteDoc(doc(db, 'crmVehicles', v.id))
                  }}
                >
                  Remove
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
