import { signOut } from 'firebase/auth'
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  doc,
} from 'firebase/firestore'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { auth, db } from '../firebase/config'
import { useToast } from '../context/ToastContext.jsx'
import { useAuth } from '../hooks/useAuth'
import { useUserProfile } from '../hooks/useUserProfile'

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

export function CrmDispatchPage() {
  const { toast } = useToast()
  const { user } = useAuth()
  const { profile, loading: profileLoading } = useUserProfile()
  const navigate = useNavigate()
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)

  const allowed = profile?.role === 'mechanic' || profile?.role === 'admin'

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

  if (profileLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-400">
        <p className="text-sm">Loading…</p>
      </div>
    )
  }

  if (!allowed) {
    return (
      <div className="min-h-screen bg-zinc-950 p-8 text-zinc-100">
        <p className="text-sm text-zinc-400">DJ dispatch is for mechanics and admins.</p>
        <Link to="/crm" className="mt-4 inline-block text-violet-400 hover:underline">
          ← CRM
        </Link>
      </div>
    )
  }

  async function handleSignOut() {
    await signOut(auth)
    navigate('/', { replace: true })
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
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="sticky top-0 z-20 border-b border-zinc-800/80 bg-zinc-950/95 px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Link to="/crm" className="text-sm text-zinc-500 hover:text-zinc-200">
              ← CRM
            </Link>
            <h1 className="text-lg font-semibold text-white">DJ dispatch</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden max-w-[160px] truncate text-xs text-zinc-500 sm:inline">
              {user?.email}
            </span>
            <button
              type="button"
              onClick={() => void handleSignOut()}
              className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-300"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl space-y-4 px-4 py-6 sm:px-6">
        {loading ? <p className="text-sm text-zinc-500">Loading jobs…</p> : null}
        {!loading && loadError ? (
          <p className="rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-200">
            {loadError}
          </p>
        ) : null}
        {!loading && !loadError && visibleJobs.length === 0 ? (
          <p className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-8 text-center text-sm leading-relaxed text-zinc-400">
            No jobs assigned yet.
            <br />
            <span className="text-zinc-500">
              Jobs appear here when a trial is scheduled.
            </span>
          </p>
        ) : null}
        {!loading && visibleJobs.map((j) => (
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
                disabled={j.completionStatus === 'In Progress' || j.completionStatus === 'Done'}
                onClick={() => void setStatus(j, 'In Progress')}
                className="min-h-[48px] w-full rounded-xl bg-cyan-900/50 px-4 py-3 text-sm font-semibold text-cyan-100 ring-1 ring-cyan-800/50 disabled:opacity-40 sm:w-auto sm:min-w-[120px]"
              >
                Start job
              </button>
              <button
                type="button"
                disabled={j.completionStatus === 'Done'}
                onClick={() => void setStatus(j, 'Done')}
                className="min-h-[48px] w-full rounded-xl bg-emerald-900/50 px-4 py-3 text-sm font-semibold text-emerald-100 ring-1 ring-emerald-800/50 disabled:opacity-40 sm:w-auto sm:min-w-[120px]"
              >
                Complete job
              </button>
            </div>
          </div>
        ))}
      </main>
    </div>
  )
}
