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
  permissionMeets,
} from '../../constants/peoplePermissions'
import { PermissionMatrix } from './PermissionMatrix'
import { AvailabilityBlocker } from './AvailabilityBlocker.jsx'
import { cmdEnterInvokeKeyDown } from '../../utils/cmdEnterSubmit.js'
import { formatPhoneInputForDisplay, normalizePhoneToE164 } from '../../utils/formatPhone.js'
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
const revokeInviteFn = httpsCallable(functions, 'revokeInvite')
const reissueInviteFn = httpsCallable(functions, 'reissueInvite')
const deletePortalUserFn = httpsCallable(functions, 'deletePortalUser')

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

function isTannerPortalBlocked(firstName, lastName, emailAddr) {
  const f = String(firstName || '').trim().toLowerCase()
  const l = String(lastName || '').trim().toLowerCase()
  const local = String(emailAddr || '')
    .trim()
    .toLowerCase()
    .split('@')[0]
  return f === 'tanner' || l === 'tanner' || local === 'tanner'
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

function PeopleRowActionsMenu({ u, onHistory, onEdit }) {
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
              onClick={() => { setOpen(false); void onHistory(u) }}
            >
              History
            </button>
          </li>
          <li>
            <button
              type="button"
              className="block w-full px-3 py-2.5 text-left text-violet-100 hover:bg-zinc-800/80"
              onClick={() => { setOpen(false); onEdit(u) }}
            >
              Edit
            </button>
          </li>
        </ul>
      ) : null}
    </div>
  )
}

const INVITE_SITE = 'https://www.skedaddleinc.com'

const NFC_TOOLS_WRITE_INTENT =
  'intent://write#Intent;scheme=nfctools;package=com.wakdev.wdnfc;end'

function shouldShowAndroidInviteHardwareActions() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false
  if (typeof window.NDEFReader !== 'undefined') return true
  return /Android/i.test(navigator.userAgent || '')
}

/**
 * Copy + Web NFC + NFC Tools fallback (mobile-first layout via max-sm / sm).
 * @param {{ url: string }} props
 */
function InviteUrlToolkit({ url }) {
  const safeUrl = String(url || '').trim()
  const [nfcHint, setNfcHint] = useState('')
  const [nfcBusy, setNfcBusy] = useState(false)
  const [nfcSuccess, setNfcSuccess] = useState('')
  const [nfcErr, setNfcErr] = useState('')
  const showHardware = shouldShowAndroidInviteHardwareActions()

  async function copyUrl() {
    try {
      if (typeof navigator.vibrate === 'function') navigator.vibrate(50)
    } catch {
      /* ignore */
    }
    try {
      await navigator.clipboard.writeText(safeUrl)
    } catch {
      window.prompt('Copy URL:', safeUrl)
    }
  }

  async function writeNfcCard() {
    if (!safeUrl) return
    setNfcErr('')
    setNfcSuccess('')
    setNfcHint('Hold card to back of phone…')
    setNfcBusy(true)
    await new Promise((r) => setTimeout(r, 450))
    try {
      const Reader = window.NDEFReader
      if (typeof Reader !== 'function') {
        throw new Error('Web NFC is not available in this browser. Use Open NFC Tools below.')
      }
      const ndef = new Reader()
      await ndef.write({ records: [{ recordType: 'url', data: safeUrl }] })
      setNfcSuccess('Card programmed ✅ tap another to write again')
      setNfcHint('')
    } catch (e) {
      setNfcErr(e?.message || String(e))
      setNfcHint('')
    } finally {
      setNfcBusy(false)
    }
  }

  function openNfcTools() {
    try {
      window.location.href = NFC_TOOLS_WRITE_INTENT
    } catch {
      /* ignore */
    }
  }

  if (!safeUrl) return null

  return (
    <div className="space-y-3">
      <pre className="max-h-40 overflow-y-auto scroll-smooth whitespace-pre-wrap break-all rounded-xl border border-emerald-900/40 bg-black/30 p-3 font-mono text-[13px] leading-snug text-emerald-50/95 max-sm:max-h-none max-sm:min-h-[4.5rem] max-sm:p-4 max-sm:text-sm sm:max-h-48 sm:text-xs">
        {safeUrl}
      </pre>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-stretch">
        <button
          type="button"
          onClick={() => void copyUrl()}
          className="min-h-[44px] rounded-xl border border-emerald-600/60 bg-emerald-900/35 px-4 text-sm font-semibold text-emerald-50 hover:bg-emerald-900/55 max-sm:w-full sm:min-h-0 sm:px-4 sm:py-2"
        >
          Copy URL
        </button>
        {showHardware ? (
          <>
            <button
              type="button"
              disabled={nfcBusy}
              onClick={() => void writeNfcCard()}
              className="min-h-[44px] rounded-xl border border-amber-500/55 bg-amber-950/40 px-4 text-sm font-semibold text-amber-100 ring-1 ring-amber-800/40 hover:bg-amber-950/60 disabled:cursor-not-allowed disabled:opacity-50 max-sm:w-full sm:min-h-0 sm:px-4 sm:py-2"
            >
              {nfcBusy ? 'Writing…' : 'Write to NFC card'}
            </button>
            <button
              type="button"
              onClick={openNfcTools}
              className="min-h-[44px] rounded-xl border border-zinc-600 bg-zinc-900/60 px-4 text-sm font-medium text-zinc-200 hover:bg-zinc-800 max-sm:w-full sm:min-h-0 sm:px-4 sm:py-2"
            >
              Open NFC Tools
            </button>
          </>
        ) : null}
      </div>
      {!showHardware && safeUrl ? (
        <div className="flex flex-col items-center gap-2 pt-1 sm:pt-2">
          <img
            src={`https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(safeUrl)}&size=180x180&margin=2&color=e4e4e7&bgcolor=09090b`}
            alt="Scan to open invite on phone"
            width={180}
            height={180}
            className="rounded-xl"
          />
          <p className="text-center text-xs text-zinc-500">
            Scan to open on phone — or write to NFC card
          </p>
        </div>
      ) : null}
      {nfcHint ? <p className="text-sm text-amber-100/90">{nfcHint}</p> : null}
      {nfcSuccess ? <p className="text-sm text-emerald-200">{nfcSuccess}</p> : null}
      {nfcErr ? <p className="text-sm text-amber-200">{nfcErr}</p> : null}
    </div>
  )
}

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

/**
 * @param {{ omitPageChrome?: boolean }} props
 * When true, skips outer shell + header (used under People page with shared chrome).
 */
export function PeopleDashboard({ omitPageChrome = false }) {
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
  const [previewShowCreatedUrl, setPreviewShowCreatedUrl] = useState(false)
  const [tick, setTick] = useState(0)
  const [eleModule, setEleModule] = useState('tires')
  const [eleLevel, setEleLevel] = useState('edit')
  const [eleDuration, setEleDuration] = useState('24h')
  const [eleSaving, setEleSaving] = useState(false)
  const [showElevation, setShowElevation] = useState(false)
  const [showAvailability, setShowAvailability] = useState(false)
  const [invokeBusy, setInvokeBusy] = useState('')   // 'revoke' | 'reissue' | 'delete' | ''
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

  async function lockUser() {
    if (!selected) return
    const isLocked = selected.inviteStatus === 'locked'
    const name = `${selected.firstName || ''} ${selected.lastName || ''}`.trim() || selected.email
    if (!isLocked && !window.confirm(`Lock ${name}? They won't be able to sign in.`)) return
    try {
      await updatePortalUser({
        targetUid: selected.id,
        inviteStatus: isLocked ? 'renewed' : 'locked',
      })
    } catch (e) {
      window.alert(e?.message || String(e))
    }
  }

  async function toggleGhost() {
    if (!selected) return
    const next = !selected.ghostMode
    try {
      await updatePortalUser({ targetUid: selected.id, ghostMode: next })
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
    if (isTannerPortalBlocked(fn, ln, email)) {
      window.alert('This partner is not provisioned in the People system.')
      return
    }
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
        phone: normalizePhoneToE164(phone),
        role,
        inviteDelivery: delivery,
        accessExpiryMs,
      })
      const data = res.data
      const createdUrl = inviteUrlFromToken(data.token || data.inviteUrl?.split('/i/').pop())
      setLastInviteUrl(createdUrl)
      setFn('')
      setLn('')
      setEmail('')
      setPhone('')
      setAccessDate('')
      if (previewOpen && isMobilePeople) {
        setPreviewShowCreatedUrl(true)
      } else {
        setPreviewOpen(false)
        setPreviewShowCreatedUrl(false)
      }
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
    if (isTannerPortalBlocked(fn, ln, email)) {
      window.alert('This partner is not provisioned in the People system.')
      return
    }
    setPreviewOpen(true)
    setPreviewShowCreatedUrl(false)
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

  async function revokeInvite() {
    if (!selected) return
    if (!window.confirm(`Revoke the invite for ${selected.firstName} ${selected.lastName}? They will not be able to use the current link.`)) return
    setInvokeBusy('revoke')
    try {
      await revokeInviteFn({ targetUid: selected.id })
      setPanelInviteUrl('')
    } catch (e) {
      window.alert(e?.message || String(e))
    } finally {
      setInvokeBusy('')
    }
  }

  async function reissueInvite() {
    if (!selected) return
    setInvokeBusy('reissue')
    try {
      const { data } = await reissueInviteFn({ targetUid: selected.id, inviteDelivery: 'email' })
      setPanelInviteUrl(data.inviteUrl || '')
    } catch (e) {
      window.alert(e?.message || String(e))
    } finally {
      setInvokeBusy('')
    }
  }

  async function deleteUser() {
    if (!selected) return
    const name = `${selected.firstName || ''} ${selected.lastName || ''}`.trim() || selected.email
    if (
      !window.confirm(
        `Permanently delete ${name}? This removes their account, invite tokens, and Firestore record. This cannot be undone.`,
      )
    )
      return
    setInvokeBusy('delete')
    try {
      await deletePortalUserFn({ targetUid: selected.id })
      closeEditor()
    } catch (e) {
      window.alert(e?.message || String(e))
    } finally {
      setInvokeBusy('')
    }
  }

  const eleModuleRow = MODULE_MATRIX.find((m) => m.key === eleModule) || MODULE_MATRIX[0]

  async function handleSignOut() {
    await signOut(auth)
    navigate('/', { replace: true })
  }

  const inner = (
    <>
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
                ? 'fixed inset-0 z-50 overflow-y-auto overscroll-y-contain scroll-smooth pb-24'
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
            className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
          >
            <Field label="First name" value={fn} onChange={setFn} required />
            <Field label="Last name" value={ln} onChange={setLn} required />
            <Field label="Email" type="email" value={email} onChange={setEmail} required />
            <Field
              label="Phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="+1 (555) 123-4567"
              value={phone}
              onChange={(v) => {
                const all = String(v || '').replace(/\D/g, '')
                // NANP area codes never start with 1 — the leading 1 is always country code
                const national = all.startsWith('1') ? all.slice(1) : all
                setPhone(formatPhoneInputForDisplay(national.slice(0, 10)))
              }}
            />
            <div>
              <label className="mb-1 block text-xs text-zinc-500 max-sm:mb-2 max-sm:text-[13px]">Role</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm max-sm:min-h-[44px] max-sm:py-3"
              >
                <option value="admin">{crewTagFromRole('admin')}</option>
                <option value="supplier">{crewTagFromRole('supplier')}</option>
                <option value="mechanic">{crewTagFromRole('mechanic')}</option>
                <option value="viewer">{crewTagFromRole('viewer')}</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-zinc-500 max-sm:mb-2 max-sm:text-[13px]">Delivery</label>
              <select
                value={delivery}
                onChange={(e) => setDelivery(e.target.value)}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm max-sm:min-h-[44px] max-sm:py-3"
              >
                <option value="sms">SMS</option>
                <option value="nfc">NFC</option>
                <option value="email">Email</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-zinc-500 max-sm:mb-2 max-sm:text-[13px]">
                Access expiry (optional)
              </label>
              <input
                type="date"
                value={accessDate}
                onChange={(e) => setAccessDate(e.target.value)}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm max-sm:min-h-[44px] max-sm:py-3"
              />
            </div>
            <div className="flex flex-col gap-3 sm:col-span-2 sm:flex-row sm:flex-wrap sm:items-end lg:col-span-3">
              <button
                type="button"
                disabled={createBusy}
                onClick={() => void openInvitePreview()}
                className="min-h-[44px] rounded-xl border border-violet-500/60 bg-violet-950/40 px-5 py-2.5 text-sm font-semibold text-violet-100 hover:bg-violet-900/50 disabled:opacity-50 max-sm:w-full sm:min-h-0 sm:w-auto"
              >
                Preview invite
              </button>
            </div>
          </form>
          {lastInviteUrl ? (
            <div className="mt-4 rounded-lg border border-emerald-900/50 bg-emerald-950/20 p-4 text-sm max-sm:p-5">
              <p className="font-medium text-emerald-200">Invite URL (copy for SMS / NFC / email)</p>
              <div className="mt-3">
                <InviteUrlToolkit url={lastInviteUrl} />
              </div>
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
                        onHistory={openHistory}
                        onEdit={openEditor}
                      />
                    </td>
                    <td className="sticky right-0 z-[2] hidden whitespace-nowrap border-l border-zinc-800/90 bg-zinc-950 px-3 py-2 text-right shadow-[-6px_0_10px_-4px_rgba(0,0,0,0.45)] group-hover:bg-zinc-900/40 sm:table-cell">
                      <div className="inline-flex shrink-0 flex-nowrap items-center justify-end gap-1">
                        <button
                          type="button"
                          className="inline-flex h-11 min-h-[44px] w-11 min-w-[44px] shrink-0 items-center justify-center rounded-md border border-zinc-600/90 bg-zinc-900/50 text-zinc-300 hover:border-zinc-500 hover:bg-zinc-800/80 hover:text-zinc-100 sm:h-9 sm:min-h-9 sm:w-9 sm:min-w-9"
                          title="Access history"
                          aria-label="Access history"
                          onClick={(e) => { e.stopPropagation(); void openHistory(u) }}
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
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-md sk-modal-backdrop-enter p-4"
          role="dialog"
          aria-modal
          onClick={closeEditor}
        >
          <div
            className="flex w-full max-w-5xl flex-col rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl shadow-black/60 max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* ── Scrollable body ─────────────────────────── */}
            <div className="flex-1 overflow-y-auto p-6 pb-2">

              {/* Header — full width */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-semibold tracking-tight text-zinc-50">
                    {selected.firstName} {selected.lastName}
                  </h2>
                  <p className="mt-1 text-xs text-zinc-400">{selected.email}</p>
                </div>
                <button
                  type="button"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-transparent text-zinc-400 transition-colors duration-200 hover:border-zinc-700 hover:bg-zinc-800/80 hover:text-zinc-100"
                  onClick={closeEditor}
                  aria-label="Close panel"
                >
                  <span className="text-xl leading-none" aria-hidden>×</span>
                </button>
              </div>

              {/* ── Three-column body on lg+, two on md ─── */}
              <div className="mt-4 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">

                {/* Col 1: invite link */}
                <div className="space-y-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Invite</p>
                  {panelInviteUrl ? (
                    <div className="rounded-lg border border-emerald-900/40 bg-emerald-950/15 p-3">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <p className="text-[10px] font-medium uppercase tracking-wide text-emerald-400/90">
                          Active link
                        </p>
                        <button
                          type="button"
                          disabled={invokeBusy !== ''}
                          onClick={() => void revokeInvite()}
                          className="rounded px-2 py-0.5 text-[10px] font-medium text-red-400/80 ring-1 ring-red-900/40 transition-colors hover:bg-red-950/40 hover:text-red-300 disabled:opacity-40"
                        >
                          {invokeBusy === 'revoke' ? 'Revoking…' : 'Revoke'}
                        </button>
                      </div>
                      <InviteUrlToolkit url={panelInviteUrl} />
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-2 rounded-lg border border-zinc-800 bg-zinc-900/30 px-3 py-2.5">
                      <p className="text-xs text-zinc-500">No active invite.</p>
                      {selected && !selected.inviteAccepted ? (
                        <button
                          type="button"
                          disabled={invokeBusy !== ''}
                          onClick={() => void reissueInvite()}
                          className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-40"
                        >
                          {invokeBusy === 'reissue' ? 'Sending…' : 'New invite'}
                        </button>
                      ) : null}
                    </div>
                  )}
                </div>

                {/* Col 2: role */}
                <div className="space-y-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Role</p>
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <select
                        value={roleDraft}
                        onChange={(e) => setRoleDraft(e.target.value)}
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
                      >
                        <option value="admin">{crewTagFromRole('admin')}</option>
                        <option value="supplier">{crewTagFromRole('supplier')}</option>
                        <option value="mechanic">{crewTagFromRole('mechanic')}</option>
                        <option value="viewer">{crewTagFromRole('viewer')}</option>
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={applyRoleDefaults}
                      disabled={saving}
                      className="whitespace-nowrap rounded-lg border border-zinc-700 px-3 py-2 text-xs text-amber-300/90 transition-colors hover:bg-zinc-800 hover:text-amber-200 disabled:opacity-40"
                    >
                      Apply defaults
                    </button>
                  </div>
                </div>

                {/* Col 3: permission matrix (spans full width on md, own col on lg) */}
                <div className="md:col-span-2 lg:col-span-1">
                  <PermissionMatrix value={permDraft} onChange={setPermDraft} disabled={saving} />
                </div>

              </div>

              {/* Availability — collapsible */}
              {profile &&
              selected &&
              (permissionMeets(profile.permissions?.people, 'manage') ||
                selected.id === auth.currentUser?.uid) ? (
                <div className="mt-4 border-t border-zinc-800">
                  <button
                    type="button"
                    onClick={() => setShowAvailability((v) => !v)}
                    className="flex w-full items-center justify-between py-3 text-xs font-medium uppercase tracking-wide text-zinc-500 transition-colors hover:text-zinc-300"
                  >
                    <span>Availability</span>
                    <span
                      className="text-base leading-none transition-transform duration-200"
                      style={{ transform: showAvailability ? 'rotate(180deg)' : 'rotate(0deg)' }}
                    >
                      ▾
                    </span>
                  </button>
                  {showAvailability ? (
                    <div className="pb-4">
                      <AvailabilityBlocker
                        key={selected.id}
                        profile={profile}
                        initialSubjectUid={selected.id}
                        crewUsers={users}
                      />
                    </div>
                  ) : null}
                </div>
              ) : null}

              {/* Temporary elevation — collapsible */}
              <div className="mt-0 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowElevation((v) => !v)}
                  className="flex w-full items-center justify-between py-3 text-xs font-medium uppercase tracking-wide text-zinc-500 transition-colors hover:text-zinc-300"
                >
                  <span>Temporary elevation</span>
                  <span
                    className="text-base leading-none transition-transform duration-200"
                    style={{ transform: showElevation ? 'rotate(180deg)' : 'rotate(0deg)' }}
                  >
                    ▾
                  </span>
                </button>

                {showElevation ? (
                  <div className="space-y-3 pb-4">
                    <p className="text-xs text-zinc-500">
                      Raise one module for 24h, 48h, or 7 days. Reverts automatically (hourly job).
                    </p>
                    <div className="grid grid-cols-2 gap-3">
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
                    </div>
                    <fieldset>
                      <legend className="mb-2 text-xs text-zinc-500">Duration</legend>
                      <div className="flex gap-4">
                        {[
                          { id: '24h', label: '24h' },
                          { id: '48h', label: '48h' },
                          { id: '7d', label: '7 days' },
                        ].map((d) => (
                          <label key={d.id} className="flex items-center gap-1.5 text-sm text-zinc-300">
                            <input
                              type="radio"
                              name="ele-dur"
                              checked={eleDuration === d.id}
                              onChange={() => setEleDuration(d.id)}
                            />
                            {d.label}
                          </label>
                        ))}
                      </div>
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
                ) : null}
              </div>

            </div>

            {/* ── Sticky footer ───────────────────────────── */}
            <div className="shrink-0 border-t border-zinc-800 bg-zinc-950 px-5 py-4 flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={closeEditor}
                className="rounded-lg border border-zinc-700 px-4 py-2.5 text-sm text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={savePermissions}
                className="flex-1 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-500 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save permissions'}
              </button>
              {selected && selected.id !== auth.currentUser?.uid ? (
                <>
                  {profile?.role === 'admin' ? (
                    <button
                      type="button"
                      disabled={invokeBusy !== ''}
                      onClick={() => void toggleGhost()}
                      className="rounded-lg border border-zinc-700 px-3 py-2.5 text-sm text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-40"
                      title={selected.ghostMode ? 'Ghost mode on — click to disable' : 'Enable ghost mode'}
                    >
                      {selected.ghostMode ? 'Ghost: on' : 'Ghost'}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={invokeBusy !== ''}
                    onClick={() => void lockUser()}
                    className={
                      selected.inviteStatus === 'locked'
                        ? 'rounded-lg border border-amber-700/60 px-3 py-2.5 text-sm text-amber-300/80 transition-colors hover:bg-amber-950/30 hover:text-amber-200 disabled:opacity-40'
                        : 'rounded-lg border border-zinc-700 px-3 py-2.5 text-sm text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-40'
                    }
                  >
                    {selected.inviteStatus === 'locked' ? 'Unlock' : 'Lock'}
                  </button>
                  <button
                    type="button"
                    disabled={invokeBusy !== ''}
                    onClick={() => void deleteUser()}
                    className="rounded-lg border border-red-900/50 px-3 py-2.5 text-sm font-medium text-red-400/80 transition-colors hover:bg-red-950/40 hover:text-red-300 disabled:opacity-40"
                  >
                    {invokeBusy === 'delete' ? 'Deleting…' : 'Delete'}
                  </button>
                </>
              ) : null}
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
          <div className={`${MODAL_CENTER_PANEL} border-zinc-800 bg-zinc-950 p-6 max-sm:p-4`}>
            {previewShowCreatedUrl && lastInviteUrl ? (
              <>
                <h2 id="preview-invite-title" className="text-lg font-semibold text-white">
                  Invite link ready
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-zinc-400 max-sm:text-[15px]">
                  Copy this URL or write it to an NFC card — stay in the browser on your Pixel.
                </p>
                <div className="mt-4">
                  <InviteUrlToolkit url={lastInviteUrl} />
                </div>
                <div className="mt-6 flex flex-col gap-2 max-sm:gap-3 sm:flex-row sm:flex-wrap sm:justify-end">
                  <button
                    type="button"
                    className="min-h-[44px] rounded-lg border border-zinc-600 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 max-sm:w-full sm:min-h-0 sm:w-auto"
                    onClick={() => {
                      setPreviewOpen(false)
                      setPreviewShowCreatedUrl(false)
                    }}
                  >
                    Done
                  </button>
                </div>
              </>
            ) : (
              <>
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
                    <li>Join Slack workspace</li>
                  </ol>
                </div>
                <div className="mt-6 flex flex-col gap-2 max-sm:gap-3 sm:flex-row sm:flex-wrap sm:justify-end">
                  <button
                    type="button"
                    className="min-h-[44px] rounded-lg border border-zinc-600 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 max-sm:order-2 max-sm:w-full sm:min-h-0 sm:w-auto"
                    onClick={() => {
                      setPreviewOpen(false)
                      setPreviewShowCreatedUrl(false)
                    }}
                    disabled={createBusy}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={createBusy || previewLoading}
                    onClick={() => void submitCreateUser()}
                    className="min-h-[44px] rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50 max-sm:order-1 max-sm:w-full sm:min-h-0 sm:w-auto"
                  >
                    {createBusy ? 'Sending…' : 'Send invite'}
                  </button>
                </div>
              </>
            )}
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
    </>
  )

  if (omitPageChrome) {
    return <div className="text-zinc-100">{inner}</div>
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="sticky top-0 z-20 border-b border-zinc-800/80 bg-zinc-950/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-4 sm:px-6 sm:py-4">
          <div className="min-w-0">
            <Link
              to="/dashboard"
              className="group inline-flex items-center gap-1 text-sm font-medium text-zinc-400 transition-colors duration-200 hover:text-zinc-100"
            >
              <span className="transition-transform duration-200 group-hover:-translate-x-0.5" aria-hidden>
                ←
              </span>
              <span>Dashboard</span>
            </Link>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-zinc-50 max-sm:text-xl">People</h1>
            <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">
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
      {inner}
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', required, inputMode, autoComplete, placeholder }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-zinc-400 max-sm:mb-2 max-sm:text-[13px]">
        {label}
        {required ? ' *' : ''}
      </label>
      <input
        type={type}
        required={required}
        value={value}
        inputMode={inputMode}
        autoComplete={autoComplete}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none transition-shadow duration-200 placeholder:text-zinc-600 focus:border-amber-600/45 focus:ring-2 focus:ring-amber-500/25 max-sm:min-h-[44px] max-sm:py-3"
      />
    </div>
  )
}