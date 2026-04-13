import { httpsCallable } from 'firebase/functions'
import {
  collection,
  getDocs,
  limit,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore'
import { signOut } from 'firebase/auth'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { auth, db, functions } from '../../firebase/config'
import { useUserProfile } from '../../hooks/useUserProfile'
import {
  crewTagFromRole,
  MODULE_MATRIX,
  ROLE_DEFAULTS,
} from '../../constants/peoplePermissions'
import { PermissionMatrix } from './PermissionMatrix'
import { cmdEnterInvokeKeyDown } from '../../utils/cmdEnterSubmit.js'
import {
  MODAL_CENTER_BACKDROP,
  MODAL_CENTER_BACKDROP_TOP,
  MODAL_CENTER_PANEL,
} from '../ui/modalChrome.js'
import { PortalSessionLine } from '../layout/PortalSessionLine.jsx'
import { useMediaQuery } from '../../hooks/useMediaQuery.js'

const createPortalUser = httpsCallable(functions, 'createPortalUser')
const updatePortalUser = httpsCallable(functions, 'updatePortalUser')
const scheduleElevationRevert = httpsCallable(functions, 'scheduleElevationRevert')
const previewInviteGreeting = httpsCallable(functions, 'previewInviteGreeting')

function formatTs(ts) {
  if (!ts || typeof ts.toDate !== 'function') return '—'
  try {
    return ts.toDate().toLocaleString('en-US', {
      dateStyle: 'short',
      timeStyle: 'short',
    })
  } catch {
    return '—'
  }
}

function timeAgo(ts) {
  if (!ts || typeof ts.toMillis !== 'function') return ''
  const s = Math.max(0, Math.floor((Date.now() - ts.toMillis()) / 1000))
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

function streakLabel(n) {
  const v = Number(n) || 0
  if (v <= 0) return '—'
  return `${v}-day streak`
}

function PeopleRowActionsMenu({
  u,
  profile,
  lockAwaitUid,
  onHistory,
  onEdit,
  onRenew,
  onLock,
  onToggleGhost,
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    function onDoc(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  return (
    <div className="relative flex justify-end sm:hidden" ref={rootRef}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-zinc-600/90 bg-zinc-900/50 text-lg leading-none text-zinc-300 hover:border-zinc-500 hover:bg-zinc-800/80"
        aria-label="Row actions"
      >
        ⋯
      </button>
      {open ? (
        <ul className="absolute right-0 top-full z-30 mt-1 w-48 rounded-lg border border-zinc-700 bg-zinc-900 py-1 text-left text-sm shadow-xl">
          <li>
            <button
              type="button"
              className="block w-full px-3 py-2.5 text-left text-zinc-200 hover:bg-zinc-800/80"
              onClick={() => {
                setOpen(false)
                void onHistory(u)
              }}
            >
              History
            </button>
          </li>
          <li>
            <button
              type="button"
              className="block w-full px-3 py-2.5 text-left text-violet-100 hover:bg-zinc-800/80"
              onClick={() => {
                setOpen(false)
                onEdit(u)
              }}
            >
              Edit
            </button>
          </li>
          <li>
            <button
              type="button"
              className="block w-full px-3 py-2.5 text-left text-zinc-200 hover:bg-zinc-800/80"
              onClick={() => {
                setOpen(false)
                onRenew(u)
              }}
            >
              Renew
            </button>
          </li>
          <li>
            <button
              type="button"
              className="block w-full px-3 py-2.5 text-left text-red-200 hover:bg-zinc-800/80"
              onClick={() => {
                setOpen(false)
                void onLock(u)
              }}
            >
              {lockAwaitUid === u.id ? 'Confirm lock' : 'Lock'}
            </button>
          </li>
          {profile?.role === 'admin' ? (
            <li>
              <button
                type="button"
                className="block w-full px-3 py-2.5 text-left text-zinc-300 hover:bg-zinc-800/80"
                onClick={() => {
                  setOpen(false)
                  onToggleGhost(u)
                }}
              >
                Ghost {u.ghostMode ? 'off' : 'on'}
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  )
}

const INVITE_SITE = 'https://www.skedaddleinc.com'

function inviteUrlFromToken(token) {
  const t = String(token || '').trim()
  if (!t) return ''
  return `${INVITE_SITE}/i/${t}`
}

/** Short label for soonest active timed elevation, or null. `tick` bumps re-render each minute. */
function elevationCountdownLabel(u, tick) {
  const now = Date.now() + tick * 0
  const arr = Array.isArray(u.timedElevations) ? u.timedElevations : []
  let minMs = Infinity
  for (const e of arr) {
    const ms = e?.expiresAt?.toMillis?.()
    if (typeof ms !== 'number' || ms <= now) continue
    if (ms < minMs) minMs = ms
  }
  if (!Number.isFinite(minMs)) return null
  const sec = Math.floor((minMs - now) / 1000)
  if (sec <= 0) return null
  if (sec < 3600) return `${Math.max(1, Math.ceil(sec / 60))}m`
  if (sec < 86400) return `${Math.ceil(sec / 3600)}h`
  return `${Math.ceil(sec / 86400)}d`
}

export function PeopleDashboard() {
  const { profile } = useUserProfile()
  const navigate = useNavigate()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [permDraft, setPermDraft] = useState({})
  const [roleDraft, setRoleDraft] = useState('viewer')
  const [saving, setSaving] = useState(false)
  const [accessLog, setAccessLog] = useState([])
  const [logOpen, setLogOpen] = useState(false)
  const [logLoading, setLogLoading] = useState(false)
  const [historyForUser, setHistoryForUser] = useState(null)

  const [fn, setFn] = useState('')
  const [ln, setLn] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [role, setRole] = useState('viewer')
  const [delivery, setDelivery] = useState('email')
  const [accessDate, setAccessDate] = useState('')
  const [createBusy, setCreateBusy] = useState(false)
  const [lastInviteUrl, setLastInviteUrl] = useState('')
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewGreeting, setPreviewGreeting] = useState('')
  const [previewError, setPreviewError] = useState('')
  const [tick, setTick] = useState(0)
  const [eleModule, setEleModule] = useState('tires')
  const [eleLevel, setEleLevel] = useState('edit')
  const [eleDuration, setEleDuration] = useState('24h')
  const [eleSaving, setEleSaving] = useState(false)
  const [lockAwaitUid, setLockAwaitUid] = useState(null)
  const [panelInviteUrl, setPanelInviteUrl] = useState('')
  const isMobilePeople = useMediaQuery('(max-width: 639px)')
  const [createDrawerOpen, setCreateDrawerOpen] = useState(false)

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const q = query(collection(db, 'users'))
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
        rows.sort((a, b) => {
          const am = a.createdAt?.toMillis?.() ?? 0
          const bm = b.createdAt?.toMillis?.() ?? 0
          return bm - am
        })
        setUsers(rows)
        setLoading(false)
      },
      (e) => {
        console.error(e)
        setLoading(false)
      },
    )
    return () => unsub()
  }, [])

  const openEditor = useCallback((u) => {
    setSelected(u)
    setLockAwaitUid(null)
    const r = u.role || 'viewer'
    setRoleDraft(r)
    const base = { ...ROLE_DEFAULTS[r], ...(u.permissions || {}) }
    setPermDraft(base)
    setEleModule('tires')
    setEleLevel('edit')
    setEleDuration('24h')
  }, [])

  const closeEditor = useCallback(() => {
    setSelected(null)
    setPermDraft({})
    setPanelInviteUrl('')
    setLockAwaitUid(null)
  }, [])

  useEffect(() => {
    if (!selected?.id) {
      setPanelInviteUrl('')
      return undefined
    }
    const q = query(
      collection(db, 'inviteTokens'),
      where('uid', '==', selected.id),
      where('status', '==', 'active'),
      limit(5),
    )
    return onSnapshot(
      q,
      (snap) => {
        const tok = snap.docs[0]?.id || selected.inviteToken
        setPanelInviteUrl(inviteUrlFromToken(tok))
      },
      () => setPanelInviteUrl(inviteUrlFromToken(selected.inviteToken)),
    )
  }, [selected])

  async function savePermissions() {
    if (!selected) return
    setSaving(true)
    try {
      await updatePortalUser({
        targetUid: selected.id,
        permissions: permDraft,
        role: roleDraft,
      })
      closeEditor()
    } catch (e) {
      console.error(e)
      window.alert(e?.message || String(e))
    } finally {
      setSaving(false)
    }
  }

  async function applyRoleDefaults() {
    if (!selected) return
    if (
      !window.confirm(
        'Changing role resets permissions to defaults for that role. Continue?',
      )
    ) {
      return
    }
    setSaving(true)
    try {
      await updatePortalUser({
        targetUid: selected.id,
        role: roleDraft,
        applyRoleDefaults: true,
      })
      setPermDraft({ ...ROLE_DEFAULTS[roleDraft] })
    } catch (e) {
      console.error(e)
      window.alert(e?.message || String(e))
    } finally {
      setSaving(false)
    }
  }

  async function renewInvite(u) {
    try {
      await updatePortalUser({ targetUid: u.id, renewInvite: true })
    } catch (e) {
      window.alert(e?.message || String(e))
    }
  }

  async function lockUser(u) {
    if (lockAwaitUid !== u.id) {
      setLockAwaitUid(u.id)
      return
    }
    setLockAwaitUid(null)
    try {
      await updatePortalUser({ targetUid: u.id, inviteStatus: 'locked' })
    } catch (e) {
      window.alert(e?.message || String(e))
    }
  }

  async function toggleGhost(u) {
    const next = !u.ghostMode
    try {
      await updatePortalUser({ targetUid: u.id, ghostMode: next })
    } catch (e) {
      window.alert(e?.message || String(e))
    }
  }

  async function openHistory(u) {
    setHistoryForUser(u)
    setLogOpen(true)
    setLogLoading(true)
    setAccessLog([])
    try {
      const q = query(
        collection(db, 'accessLog'),
        where('uid', '==', u.id),
        limit(50),
      )
      const snap = await getDocs(q)
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      rows.sort((a, b) => {
        const am = a.changedAt?.toMillis?.() ?? 0
        const bm = b.changedAt?.toMillis?.() ?? 0
        return bm - am
      })
      setAccessLog(rows)
    } catch (e) {
      console.error(e)
      window.alert(e?.message || String(e))
    } finally {
      setLogLoading(false)
    }
  }

  async function submitCreateUser() {
    setCreateBusy(true)
    setLastInviteUrl('')
    try {
      let accessExpiryMs = null
      if (accessDate) {
        const t = new Date(`${accessDate}T23:59:59`).getTime()
        if (Number.isFinite(t)) accessExpiryMs = t
      }
      const res = await createPortalUser({
        firstName: fn,
        lastName: ln,
        email,
        phone,
        role,
        inviteDelivery: delivery,
        accessExpiryMs,
      })
      const data = res.data
      setLastInviteUrl(inviteUrlFromToken(data.token || data.inviteUrl?.split('/i/').pop()))
      setFn('')
      setLn('')
      setEmail('')
      setPhone('')
      setAccessDate('')
      setPreviewOpen(false)
      setCreateDrawerOpen(false)
    } catch (err) {
      console.error(err)
      window.alert(err?.message || String(err))
    } finally {
      setCreateBusy(false)
    }
  }

  async function openInvitePreview() {
    if (!fn.trim() || !ln.trim() || !email.trim()) {
      window.alert('Enter first name, last name, and email before preview.')
      return
    }
    setPreviewOpen(true)
    setPreviewLoading(true)
    setPreviewGreeting('')
    setPreviewError('')
    try {
      const { data } = await previewInviteGreeting({
        firstName: fn.trim(),
        role,
      })
      setPreviewGreeting(String(data?.greeting || ''))
    } catch (err) {
      setPreviewError(err?.message || String(err))
    } finally {
      setPreviewLoading(false)
    }
  }

  async function saveTimedElevation() {
    if (!selected) return
    if (!eleModule || !eleLevel || !eleDuration) {
      window.alert('Choose module, elevated level, and duration.')
      return
    }
    setEleSaving(true)
    try {
      await scheduleElevationRevert({
        targetUid: selected.id,
        module: eleModule,
        elevatedLevel: eleLevel,
        duration: eleDuration,
      })
      window.alert('Temporary elevation saved. It will revert automatically when it expires.')
    } catch (e) {
      window.alert(e?.message || String(e))
    } finally {
      setEleSaving(false)
    }
  }

  const eleModuleRow = MODULE_MATRIX.find((m) => m.key === eleModule) || MODULE_MATRIX[0]

  async function handleSignOut() {
    await signOut(auth)
    navigate('/', { replace: true })
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="sticky top-0 z-20 border-b border-zinc-800/80 bg-zinc-950/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-4 sm:px-6 sm:py-4">
          <div className="min-w-0">
            <Link
              to="/dashboard"
              className="text-sm text-zinc-500 transition hover:text-zinc-200"
            >
              ← Dashboard
            </Link>
            <h1 className="mt-2 text-xl font-semibold text-white">People</h1>
            <p className="mt-1 text-sm text-zinc-500">
              Crew access, invites, and permission matrix
            </p>
            <div className="mt-2 sm:hidden">
              <PortalSessionLine email={auth.currentUser?.email} onSignOut={handleSignOut} />
            </div>
          </div>
          <div className="hidden sm:block">
            <PortalSessionLine email={auth.currentUser?.email} onSignOut={handleSignOut} />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-10 px-4 py-6 sm:px-6 sm:py-8">
        {isMobilePeople && !createDrawerOpen ? (
          <button
            type="button"
            onClick={() => setCreateDrawerOpen(true)}
            className="flex w-full min-h-[48px] items-center justify-center rounded-xl border border-violet-600/70 bg-violet-900/35 text-sm font-semibold text-violet-50 hover:bg-violet-900/55 sm:hidden"
          >
            Add crew member +
          </button>
        ) : null}
        <section
          className={[
            'rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6',
            isMobilePeople
              ? createDrawerOpen
                ? 'fixed inset-0 z-50 overflow-y-auto pb-24'
                : 'hidden'
              : '',
          ].join(' ')}
        >
          <div className="mb-4 flex items-start justify-between gap-2 sm:mb-0 sm:hidden">
            <h2 className="text-lg font-semibold text-zinc-100">Create user + invite</h2>
            <button
              type="button"
              onClick={() => setCreateDrawerOpen(false)}
              className="min-h-[44px] shrink-0 text-sm text-zinc-400 underline decoration-zinc-600 underline-offset-2 hover:text-zinc-200"
            >
              Close
            </button>
          </div>
          <h2 className="hidden text-lg font-semibold text-zinc-100 sm:block">Create user + invite</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Creates an Auth account (disabled until invite registration), Firestore profile,
            and invite token. Use Preview invite before sending.
          </p>
          <form
            onSubmit={(e) => e.preventDefault()}
            onKeyDown={cmdEnterInvokeKeyDown(() => void submitCreateUser())}
            className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          >
            <Field label="First name" value={fn} onChange={setFn} required />
            <Field label="Last name" value={ln} onChange={setLn} required />
            <Field label="Email" type="email" value={email} onChange={setEmail} required />
            <Field label="Phone" value={phone} onChange={setPhone} />
            <div>
              <label className="mb-1 block text-xs text-zinc-500">Role</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
              >
                <option value="admin">admin → {crewTagFromRole('admin')}</option>
                <option value="supplier">supplier → {crewTagFromRole('supplier')}</option>
                <option value="mechanic">mechanic → {crewTagFromRole('mechanic')}</option>
                <option value="viewer">viewer → {crewTagFromRole('viewer')}</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-zinc-500">Delivery</label>
              <select
                value={delivery}
                onChange={(e) => setDelivery(e.target.value)}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
              >
                <option value="sms">SMS</option>
                <option value="nfc">NFC</option>
                <option value="email">Email</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-zinc-500">
                Access expiry (optional)
              </label>
              <input
                type="date"
                value={accessDate}
                onChange={(e) => setAccessDate(e.target.value)}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
              />
            </div>
            <div className="flex flex-wrap items-end gap-3 sm:col-span-2 lg:col-span-3">
              <button
                type="button"
                disabled={createBusy}
                onClick={() => void openInvitePreview()}
                className="min-h-[44px] rounded-xl border border-violet-500/60 bg-violet-950/40 px-5 py-2.5 text-sm font-semibold text-violet-100 hover:bg-violet-900/50 disabled:opacity-50 sm:min-h-0"
              >
                Preview invite
              </button>
            </div>
          </form>
          {lastInviteUrl ? (
            <div className="mt-4 rounded-lg border border-emerald-900/50 bg-emerald-950/20 p-4 text-sm">
              <p className="font-medium text-emerald-200">Invite URL (copy for SMS / NFC / email)</p>
              <p className="mt-2 break-all font-mono text-xs text-emerald-100/90">{lastInviteUrl}</p>
            </div>
          ) : null}
        </section>

        <section className="overflow-x-auto rounded-2xl border border-zinc-800">
          <table className="w-full min-w-0 border-collapse text-left text-sm sm:min-w-[960px]">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900/60 text-xs uppercase tracking-wide text-zinc-500">
                <th className="px-3 py-3">Name</th>
                <th className="hidden px-3 py-3 sm:table-cell">Crew tag</th>
                <th className="hidden px-3 py-3 sm:table-cell">Invite</th>
                <th className="hidden px-3 py-3 sm:table-cell">Access expiry</th>
                <th className="hidden px-3 py-3 sm:table-cell">Streak</th>
                <th className="hidden px-3 py-3 sm:table-cell">Last seen</th>
                <th className="px-3 py-3 text-right sm:hidden"> </th>
                <th className="sticky right-0 z-[3] hidden border-l border-zinc-800/90 bg-zinc-900/95 px-3 py-3 text-right shadow-[-6px_0_10px_-4px_rgba(0,0,0,0.45)] sm:table-cell">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-zinc-500">
                    Loading crew…
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-zinc-500">
                    No user profiles yet.
                  </td>
                </tr>
              ) : (
                users.map((u) => {
                  const evLabel = elevationCountdownLabel(u, tick)
                  return (
                  <tr key={u.id} className="group border-b border-zinc-800/80 hover:bg-zinc-900/40">
                    <td className="max-w-none px-3 py-2 font-medium leading-snug text-zinc-100 sm:max-w-[220px]">
                      <span className="max-sm:whitespace-normal">
                        {u.firstName} {u.lastName}
                      </span>
                      {evLabel ? (
                        <span className="ml-2 inline-flex items-center rounded-full bg-amber-950/50 px-2 py-0.5 align-middle text-[10px] font-semibold uppercase tracking-wide text-amber-200 ring-1 ring-amber-700/40 max-sm:mt-1 max-sm:ml-0 max-sm:inline-flex">
                          ⏱ {evLabel}
                        </span>
                      ) : null}
                    </td>
                    <td className="hidden px-3 py-2 text-violet-300 sm:table-cell">
                      {u.crewTag || crewTagFromRole(u.role)}
                    </td>
                    <td className="hidden px-3 py-2 text-zinc-400 sm:table-cell">{u.inviteStatus || '—'}</td>
                    <td className="hidden px-3 py-2 text-zinc-400 sm:table-cell">
                      {formatTs(u.accessExpiry)}
                    </td>
                    <td className="hidden px-3 py-2 text-zinc-300 sm:table-cell">{streakLabel(u.loginStreak)}</td>
                    <td className="hidden max-w-[240px] px-3 py-2 text-xs text-zinc-500 sm:table-cell">
                      {u.ghostMode ? (
                        <span className="text-zinc-600">Ghost mode</span>
                      ) : (
                        <>
                          {u.lastLoginDevice || '—'} · {u.lastLoginLocation || '—'} ·{' '}
                          {timeAgo(u.lastLoginAt) || 'never'}
                        </>
                      )}
                    </td>
                    <td className="px-2 py-2 text-right sm:hidden">
                      <PeopleRowActionsMenu
                        u={u}
                        profile={profile}
                        lockAwaitUid={lockAwaitUid}
                        onHistory={openHistory}
                        onEdit={openEditor}
                        onRenew={renewInvite}
                        onLock={lockUser}
                        onToggleGhost={toggleGhost}
                      />
                    </td>
                    <td className="sticky right-0 z-[2] hidden whitespace-nowrap border-l border-zinc-800/90 bg-zinc-950 px-3 py-2 text-right shadow-[-6px_0_10px_-4px_rgba(0,0,0,0.45)] group-hover:bg-zinc-900/40 sm:table-cell">
                      <div className="inline-flex shrink-0 flex-nowrap items-center justify-end gap-1">
                        <button
                          type="button"
                          className="inline-flex h-11 min-h-[44px] w-11 min-w-[44px] shrink-0 items-center justify-center rounded-md border border-zinc-600/90 bg-zinc-900/50 text-zinc-300 hover:border-zinc-500 hover:bg-zinc-800/80 hover:text-zinc-100 sm:h-9 sm:min-h-9 sm:w-9 sm:min-w-9"
                          title="Access history"
                          aria-label="Access history"
                          onClick={(e) => {
                            e.stopPropagation()
                            void openHistory(u)
                          }}
                        >
                          <svg
                            className="h-4 w-4 shrink-0"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            aria-hidden
                          >
                            <circle cx="12" cy="12" r="9" />
                            <path strokeLinecap="round" d="M12 7v5l3 2" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          className="min-h-[44px] rounded-lg border border-violet-600/70 bg-violet-900/40 px-2.5 py-2 text-xs font-semibold text-violet-50 hover:bg-violet-900/60 sm:min-h-0 sm:py-1"
                          onClick={() => openEditor(u)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="min-h-[44px] rounded-lg border border-zinc-600 px-2 py-2 text-xs text-zinc-300 hover:bg-zinc-800/80 sm:min-h-0 sm:py-1"
                          onClick={() => renewInvite(u)}
                        >
                          Renew
                        </button>
                        <button
                          type="button"
                          className={
                            lockAwaitUid === u.id
                              ? 'min-h-[44px] rounded-lg border border-red-600 bg-red-950/50 px-2 py-2 text-xs font-semibold text-red-100 sm:min-h-0 sm:py-1'
                              : 'min-h-[44px] rounded-lg border border-red-900/55 px-2 py-2 text-xs text-red-200 hover:bg-red-950/25 sm:min-h-0 sm:py-1'
                          }
                          onClick={() => void lockUser(u)}
                        >
                          {lockAwaitUid === u.id ? 'Confirm lock' : 'Lock'}
                        </button>
                        {profile?.role === 'admin' ? (
                          <button
                            type="button"
                            className="min-h-[44px] rounded-lg border border-zinc-700/90 bg-zinc-900/40 px-2 py-2 text-xs text-zinc-400 hover:border-zinc-600 hover:text-zinc-200 sm:min-h-0 sm:py-1"
                            onClick={() => toggleGhost(u)}
                          >
                            Ghost {u.ghostMode ? 'off' : 'on'}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </section>
      </main>

      {selected ? (
        <div
          className="fixed inset-0 z-40 flex justify-end bg-black/60 backdrop-blur-sm"
          role="dialog"
          aria-modal
          onClick={closeEditor}
        >
          <div
            className="h-full w-full max-w-md overflow-y-auto border-l border-zinc-800 bg-zinc-950 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-white">
              {selected.firstName} {selected.lastName}
            </h2>
            <p className="text-xs text-zinc-500">{selected.email}</p>
            {panelInviteUrl ? (
              <div className="mt-3 rounded-lg border border-emerald-900/40 bg-emerald-950/15 p-3">
                <p className="text-[10px] font-medium uppercase tracking-wide text-emerald-400/90">
                  Active invite link
                </p>
                <p className="mt-1 break-all font-mono text-[11px] text-emerald-100/90">{panelInviteUrl}</p>
                <button
                  type="button"
                  className="mt-2 rounded border border-emerald-800/60 px-2 py-1 text-[11px] text-emerald-100 hover:bg-emerald-950/40"
                  onClick={() => void navigator.clipboard.writeText(panelInviteUrl)}
                >
                  Copy link
                </button>
              </div>
            ) : (
              <p className="mt-3 text-[11px] text-zinc-600">No active invite token for this user.</p>
            )}

            <div className="mt-6 space-y-3">
              <label className="block text-xs text-zinc-500">Role</label>
              <select
                value={roleDraft}
                onChange={(e) => setRoleDraft(e.target.value)}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
              >
                <option value="admin">admin</option>
                <option value="supplier">supplier</option>
                <option value="mechanic">mechanic</option>
                <option value="viewer">viewer</option>
              </select>
              <button
                type="button"
                onClick={applyRoleDefaults}
                disabled={saving}
                className="text-xs text-amber-300/90 underline-offset-2 hover:underline"
              >
                Apply role defaults…
              </button>
            </div>

            <div className="mt-8">
              <PermissionMatrix value={permDraft} onChange={setPermDraft} disabled={saving} />
            </div>

            <div className="mt-8 border-t border-zinc-800 pt-6">
              <h3 className="text-sm font-semibold text-zinc-200">Temporary elevation</h3>
              <p className="mt-1 text-xs text-zinc-500">
                Raise one module for 24h, 48h, or 7 days. Reverts automatically (hourly job).
              </p>
              <div className="mt-4 space-y-3">
                <div>
                  <label className="mb-1 block text-xs text-zinc-500">Module</label>
                  <select
                    value={eleModule}
                    onChange={(e) => {
                      const key = e.target.value
                      setEleModule(key)
                      const row = MODULE_MATRIX.find((m) => m.key === key) || MODULE_MATRIX[0]
                      setEleLevel((cur) =>
                        row.levels.includes(cur) ? cur : row.levels[row.levels.length - 1],
                      )
                    }}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
                  >
                    {MODULE_MATRIX.map((m) => (
                      <option key={m.key} value={m.key}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-zinc-500">Elevated level</label>
                  <select
                    value={eleLevel}
                    onChange={(e) => setEleLevel(e.target.value)}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
                  >
                    {eleModuleRow.levels.map((lvl) => (
                      <option key={lvl} value={lvl}>
                        {lvl}
                      </option>
                    ))}
                  </select>
                </div>
                <fieldset className="space-y-2">
                  <legend className="mb-1 text-xs text-zinc-500">Duration</legend>
                  {[
                    { id: '24h', label: '24 hours' },
                    { id: '48h', label: '48 hours' },
                    { id: '7d', label: '7 days' },
                  ].map((d) => (
                    <label key={d.id} className="flex items-center gap-2 text-sm text-zinc-300">
                      <input
                        type="radio"
                        name="ele-dur"
                        checked={eleDuration === d.id}
                        onChange={() => setEleDuration(d.id)}
                      />
                      {d.label}
                    </label>
                  ))}
                </fieldset>
                <button
                  type="button"
                  disabled={eleSaving}
                  onClick={() => void saveTimedElevation()}
                  className="w-full rounded-lg bg-amber-900/40 px-3 py-2 text-sm font-semibold text-amber-100 ring-1 ring-amber-800/50 hover:bg-amber-900/60 disabled:opacity-50"
                >
                  {eleSaving ? 'Saving…' : 'Apply temporary elevation'}
                </button>
              </div>
            </div>

            <div className="mt-8 flex gap-2">
              <button
                type="button"
                onClick={closeEditor}
                className="rounded-lg border border-zinc-600 px-4 py-2 text-sm text-zinc-300"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={savePermissions}
                className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save permissions'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {previewOpen ? (
        <div
          className={MODAL_CENTER_BACKDROP}
          role="dialog"
          aria-modal
          aria-labelledby="preview-invite-title"
        >
          <div className={`${MODAL_CENTER_PANEL} border-zinc-800 bg-zinc-950 p-6`}>
            <h2 id="preview-invite-title" className="text-lg font-semibold text-white">
              Invite preview
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-zinc-400">
              <span className="font-medium text-zinc-300">Entrance:</span> Dark screen → bolt
              animation → Skedaddle reveal. Then a short generative greeting, then registration.
            </p>
            <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Sample greeting
              </p>
              {previewLoading ? (
                <p className="mt-2 text-sm text-zinc-500">Loading greeting…</p>
              ) : previewError ? (
                <p className="mt-2 text-sm text-red-300">{previewError}</p>
              ) : (
                <p className="mt-2 text-sm italic text-zinc-200">&ldquo;{previewGreeting}&rdquo;</p>
              )}
            </div>
            <div className="mt-4">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Registration steps
              </p>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-zinc-400">
                <li>Email (must match invite)</li>
                <li>6-digit code (sent to email)</li>
                <li>First and last name</li>
                <li>Phone</li>
                <li>Password — then sign in and first-login handshake</li>
              </ol>
            </div>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-zinc-600 px-4 py-2 text-sm text-zinc-300"
                onClick={() => setPreviewOpen(false)}
                disabled={createBusy}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={createBusy || previewLoading}
                onClick={() => void submitCreateUser()}
                className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
              >
                {createBusy ? 'Sending…' : 'Send invite'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {logOpen ? (
        <div
          className={MODAL_CENTER_BACKDROP_TOP}
          onClick={() => {
            setLogOpen(false)
            setHistoryForUser(null)
          }}
        >
          <div
            className={`${MODAL_CENTER_PANEL} border-zinc-800 bg-zinc-950 p-6 sm:max-h-[80vh]`}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-white">Access history</h3>
            {historyForUser ? (
              <p className="mt-1 text-sm text-zinc-500">
                {historyForUser.firstName} {historyForUser.lastName}{' '}
                <span className="font-mono text-xs text-zinc-600">({historyForUser.email})</span>
              </p>
            ) : null}
            <p className="mt-2 text-xs text-zinc-500">
              Who changed what — timestamps, field name, and before/after snapshots.
            </p>
            {logLoading ? (
              <p className="mt-4 text-sm text-zinc-500">Loading…</p>
            ) : accessLog.length === 0 ? (
              <p className="mt-4 text-sm text-zinc-500">No log entries yet.</p>
            ) : (
              <ul className="mt-4 space-y-3 text-xs text-zinc-400">
                {accessLog.map((row) => (
                  <li key={row.id} className="rounded-lg border border-zinc-800/80 p-3">
                    <p className="font-mono text-zinc-300">{formatTs(row.changedAt)}</p>
                    <p className="mt-1 text-zinc-400">
                      <span className="text-zinc-500">By </span>
                      <span className="font-mono text-[11px] text-zinc-300">
                        {row.changedBy || '—'}
                      </span>
                    </p>
                    <p className="mt-1 text-zinc-500">Field: {row.field}</p>
                    <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-all text-[10px] text-zinc-600">
                      {JSON.stringify({ before: row.before, after: row.after }, null, 2)}
                    </pre>
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              className="mt-6 rounded-lg border border-zinc-600 px-4 py-2 text-sm text-zinc-300"
              onClick={() => {
                setLogOpen(false)
                setHistoryForUser(null)
              }}
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', required }) {
  return (
    <div>
      <label className="mb-1 block text-xs text-zinc-500">
        {label}
        {required ? ' *' : ''}
      </label>
      <input
        type={type}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
      />
    </div>
  )
}