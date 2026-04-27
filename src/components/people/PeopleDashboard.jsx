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
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { auth, db, functions } from '../../firebase/config'
import { useUserProfile } from '../../hooks/useUserProfile'
import { useCrewPreview } from '../../hooks/useCrewPreview'
import { ROLE_DEFAULTS } from '../../constants/peoplePermissions'
import { CrewDirectoryWidget } from '../dashboard/CrewDirectoryWidget'
import { NfcWriterModal } from './NfcWriterModal.jsx'
import { normalizePhoneToE164 } from '../../utils/formatPhone.js'
import { PortalSessionLine } from '../layout/PortalSessionLine.jsx'
import { useMediaQuery } from '../../hooks/useMediaQuery.js'
import { useToast } from '../../context/ToastContext.jsx'
import { EmptyState, EmptyStateIcons } from '../shared/EmptyState.jsx'
import { LoadingBlock } from '../shared/LoadingBlock.jsx'
import {
  CreateUserInviteSection,
  InvitePreviewModal,
  inviteUrlFromToken,
  isTannerPortalBlocked,
} from './InviteUrlToolkit.jsx'
import { UserEditorModal } from './PermissionEditor.jsx'
import { UserRow } from './UserRow.jsx'
import { UserHistoryModal } from './UserHistoryModal.jsx'
import { isArchived } from '../../utils/isArchived.js'

const createPortalUser = httpsCallable(functions, 'createPortalUser')
const updatePortalUser = httpsCallable(functions, 'updatePortalUser')
const scheduleElevationRevert = httpsCallable(functions, 'scheduleElevationRevert')
const previewInviteGreeting = httpsCallable(functions, 'previewInviteGreeting')
const revokeInviteFn = httpsCallable(functions, 'revokeInvite')
const reissueInviteFn = httpsCallable(functions, 'reissueInvite')
const deletePortalUserFn = httpsCallable(functions, 'deletePortalUser')
export function PeopleDashboard({ omitPageChrome = false }) {
  const { toast } = useToast()
  const { profile } = useUserProfile()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const highlightUid = searchParams.get('highlight') || ''
  const [highlightedUid, setHighlightedUid] = useState('')
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
  const [nfcModalOpen, setNfcModalOpen] = useState(false)
  const [nfcModalUrl, setNfcModalUrl] = useState('')
  const [nfcModalName, setNfcModalName] = useState('')
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
  const [invokeBusy, setInvokeBusy] = useState('')
  const [lockConfirmPending, setLockConfirmPending] = useState(false)
  const [revokeConfirmPending, setRevokeConfirmPending] = useState(false)
  const [deleteConfirmPending, setDeleteConfirmPending] = useState(false)
  const [roleDefaultsPending, setRoleDefaultsPending] = useState(false)
  const [panelInviteUrl, setPanelInviteUrl] = useState('')
  const isMobilePeople = useMediaQuery('(max-width: 639px)')
  const [createDrawerOpen, setCreateDrawerOpen] = useState(false)
  const { crewPreview, crewSignals } = useCrewPreview()

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const q = query(collection(db, 'users'))
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          // Hide soft-deleted docs (archivedAt set). See utils/isArchived.js.
          .filter((u) => !isArchived(u))
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

  // Deep-link: when `/people?highlight=<uid>` lands and the target user
  // is in the loaded list, scroll their row into view and pulse it for
  // a moment. The query param is cleared afterward so a reload does not
  // re-trigger the scroll.
  useEffect(() => {
    if (!highlightUid) return
    if (loading) return
    if (!users.some((u) => u.id === highlightUid)) return
    setHighlightedUid(highlightUid)
    const node =
      typeof document !== 'undefined'
        ? document.querySelector(`[data-uid="${CSS.escape(highlightUid)}"]`)
        : null
    if (node && typeof node.scrollIntoView === 'function') {
      node.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
    const next = new URLSearchParams(searchParams)
    next.delete('highlight')
    setSearchParams(next, { replace: true })
    const timer = setTimeout(() => setHighlightedUid(''), 2000)
    return () => clearTimeout(timer)
  }, [highlightUid, loading, users, searchParams, setSearchParams])

  const openEditor = useCallback((u) => {
    setSelected(u)
    setLockConfirmPending(false)
    setRevokeConfirmPending(false)
    setDeleteConfirmPending(false)
    setRoleDefaultsPending(false)
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
    setLockConfirmPending(false)
    setRevokeConfirmPending(false)
    setDeleteConfirmPending(false)
    setRoleDefaultsPending(false)
    setPermDraft({})
    setPanelInviteUrl('')
  }, [])

  useEffect(() => {
    const hasOverlay =
      logOpen ||
      previewOpen ||
      selected ||
      (createDrawerOpen && isMobilePeople)
    if (!hasOverlay) return undefined
    function onKey(e) {
      if (e.key !== 'Escape') return
      if (logOpen) {
        setLogOpen(false)
        setHistoryForUser(null)
        return
      }
      if (previewOpen) {
        setPreviewOpen(false)
        setPreviewShowCreatedUrl(false)
        return
      }
      if (selected) {
        closeEditor()
        return
      }
      if (createDrawerOpen && isMobilePeople) {
        setCreateDrawerOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    logOpen,
    previewOpen,
    selected,
    createDrawerOpen,
    isMobilePeople,
    closeEditor,
  ])

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
      toast(e?.message || 'Action failed.', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function applyRoleDefaults() {
    if (!selected) return
    if (!roleDefaultsPending) {
      setRoleDefaultsPending(true)
      return
    }
    setRoleDefaultsPending(false)
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
      toast(e?.message || 'Action failed.', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function lockUser() {
    if (!selected) return
    const isLocked = selected.inviteStatus === 'locked'
    if (!isLocked) {
      if (!lockConfirmPending) {
        setLockConfirmPending(true)
        return
      }
      setLockConfirmPending(false)
    }
    setInvokeBusy('lock')
    try {
      await updatePortalUser({
        targetUid: selected.id,
        inviteStatus: isLocked ? 'renewed' : 'locked',
      })
      toast(isLocked ? 'User unlocked.' : 'User locked.', 'success')
    } catch (e) {
      toast(e?.message || 'Action failed.', 'error')
    } finally {
      setInvokeBusy('')
    }
  }

  async function toggleGhost() {
    if (!selected) return
    const next = !selected.ghostMode
    try {
      await updatePortalUser({ targetUid: selected.id, ghostMode: next })
    } catch (e) {
      toast(e?.message || 'Action failed.', 'error')
    }
  }

  async function openHistory(u) {
    setHistoryForUser(u)
    setLogOpen(true)
    setLogLoading(true)
    setAccessLog([])
    try {
      // Reads adminAuditLog (the unified action log). Filtering by targetId
      // captures all actions that touched this user. Action keys are namespaced
      // (`user.*`, `user.invite.*`, `user.elevation.*`, `user.access.*`).
      const q = query(
        collection(db, 'adminAuditLog'),
        where('targetId', '==', u.id),
        limit(50),
      )
      const snap = await getDocs(q)
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      rows.sort((a, b) => {
        const am = a.at?.toMillis?.() ?? 0
        const bm = b.at?.toMillis?.() ?? 0
        return bm - am
      })
      setAccessLog(rows)
    } catch (e) {
      console.error(e)
      toast(e?.message || 'Action failed.', 'error')
    } finally {
      setLogLoading(false)
    }
  }

  async function submitCreateUser() {
    if (isTannerPortalBlocked(fn, ln, email)) {
      toast('This partner is not provisioned in the People system.', 'error')
      return
    }
    setCreateBusy(true)
    setLastInviteUrl('')
    const snapshot = {
      firstName: fn.trim(),
      email: email.trim(),
      phone: normalizePhoneToE164(phone),
      deliveryMethod: delivery,
    }
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
        phone: snapshot.phone,
        role,
        inviteDelivery: snapshot.deliveryMethod,
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
      handleDeliveryResult({
        delivery: data.delivery,
        inviteUrl: createdUrl,
        firstName: snapshot.firstName,
        email: snapshot.email,
        phone: snapshot.phone,
      })
    } catch (err) {
      console.error(err)
      toast(err?.message || 'Action failed.', 'error')
    } finally {
      setCreateBusy(false)
    }
  }

  function handleDeliveryResult({ delivery: deliveryResult, inviteUrl, firstName, email: emailAddr, phone: phoneNum }) {
    const attempted = deliveryResult?.attempted || ''
    const sent = Boolean(deliveryResult?.sent)
    const reason = deliveryResult?.reason || ''

    if (attempted === 'nfc') {
      setNfcModalUrl(inviteUrl)
      setNfcModalName(firstName)
      setNfcModalOpen(true)
      toast('Invite ready for NFC programming.', 'info')
      return
    }
    if (attempted === 'sms' && sent) {
      toast(`SMS invite sent to ${phoneNum || 'the recipient'}.`, 'success')
      return
    }
    if (attempted === 'email' && sent) {
      toast(`Email invite sent to ${emailAddr || 'the recipient'}.`, 'success')
      return
    }
    if (!sent && reason === 'missing-env') {
      const channel = attempted === 'sms' ? 'SMS' : 'Email'
      toast(
        `Invite created. ${channel} provider not configured. Use the backup URL below.`,
        'info',
      )
      return
    }
    if (!sent && reason === 'provider-error') {
      const channel = attempted === 'sms' ? 'SMS' : 'Email'
      toast(
        `Invite created. ${channel} failed to send. Use the backup URL below.`,
        'error',
      )
      return
    }
    toast('Invite created. Use the backup URL below.', 'info')
  }

  async function openInvitePreview() {
    if (!fn.trim() || !ln.trim() || !email.trim()) {
      toast('Enter first name, last name, and email before preview.', 'error')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      toast('Enter a valid email address before preview.', 'error')
      return
    }
    if (isTannerPortalBlocked(fn, ln, email)) {
      toast('This partner is not provisioned in the People system.', 'error')
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
      toast('Choose module, elevated level, and duration.', 'error')
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
      toast('Temporary elevation saved. Will revert when it expires.', 'success')
    } catch (e) {
      toast(e?.message || 'Action failed.', 'error')
    } finally {
      setEleSaving(false)
    }
  }

  async function revokeInvite() {
    if (!selected) return
    if (!revokeConfirmPending) {
      setRevokeConfirmPending(true)
      return
    }
    setRevokeConfirmPending(false)
    setInvokeBusy('revoke')
    try {
      await revokeInviteFn({ targetUid: selected.id })
      setPanelInviteUrl('')
    } catch (e) {
      toast(e?.message || 'Action failed.', 'error')
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
      toast(e?.message || 'Action failed.', 'error')
    } finally {
      setInvokeBusy('')
    }
  }

  async function deleteUser() {
    if (!selected) return
    if (!deleteConfirmPending) {
      setDeleteConfirmPending(true)
      return
    }
    setDeleteConfirmPending(false)
    setInvokeBusy('delete')
    try {
      await deletePortalUserFn({ targetUid: selected.id })
      closeEditor()
    } catch (e) {
      toast(e?.message || 'Action failed.', 'error')
    } finally {
      setInvokeBusy('')
    }
  }

  async function handleSignOut() {
    await signOut(auth)
    navigate('/', { replace: true })
  }

  const inner = (
    <>
      <main className="mx-auto max-w-6xl space-y-10 px-4 py-6 sm:px-6 sm:py-8">
        <div className="hidden sm:block">
          <CrewDirectoryWidget
            crew={crewPreview}
            crewSignals={crewSignals?.map || {}}
            loading={Boolean(crewSignals?.loading) || crewPreview.loading}
          />
        </div>
        {isMobilePeople && !createDrawerOpen ? (
          <button
            type="button"
            onClick={() => setCreateDrawerOpen(true)}
            className="flex w-full min-h-[48px] items-center justify-center rounded-xl bg-amber-500 text-sm font-semibold text-zinc-950 hover:bg-amber-400 sm:hidden"
          >
            Add crew member +
          </button>
        ) : null}
        <CreateUserInviteSection
          isMobilePeople={isMobilePeople}
          createDrawerOpen={createDrawerOpen}
          setCreateDrawerOpen={setCreateDrawerOpen}
          fn={fn}
          setFn={setFn}
          ln={ln}
          setLn={setLn}
          email={email}
          setEmail={setEmail}
          phone={phone}
          setPhone={setPhone}
          role={role}
          setRole={setRole}
          delivery={delivery}
          setDelivery={setDelivery}
          accessDate={accessDate}
          setAccessDate={setAccessDate}
          createBusy={createBusy}
          lastInviteUrl={lastInviteUrl}
          onSubmitCreateUser={submitCreateUser}
          onOpenInvitePreview={openInvitePreview}
          toast={toast}
        />

        {/* tabIndex={0} so keyboard users can scroll the horizontally-overflowing
            table (axe rule scrollable-region-focusable). aria-label promotes the
            <section> to a named landmark, satisfying both axe and jsx-a11y when
            the rule is configured to accept labeled sections (see eslint.config.js). */}
        <section
          aria-label="Crew members table"
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
          tabIndex={0}
          className="overflow-x-auto rounded-2xl border border-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50"
        >
          <table className="w-full min-w-0 border-collapse text-left text-sm sm:min-w-[960px]">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900/60 text-xs font-semibold uppercase tracking-wide text-zinc-300">
                <th className="px-3 py-3">Name</th>
                <th className="hidden px-3 py-3 sm:table-cell">Crew tag</th>
                <th className="hidden px-3 py-3 sm:table-cell">Invite</th>
                <th className="hidden px-3 py-3 sm:table-cell">Access expiry</th>
                <th className="hidden px-3 py-3 sm:table-cell">Streak</th>
                <th className="hidden px-3 py-3 sm:table-cell">Last seen</th>
                <th className="px-3 py-3 text-right sm:hidden"> </th>
                <th className="sticky right-0 z-[3] hidden border-l border-zinc-800/90 bg-zinc-900 px-3 py-3 text-right pc-sticky-col-shadow sm:table-cell">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8}>
                    <LoadingBlock label="Loading crew…" variant="inline" />
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <EmptyState
                  variant="row"
                  colSpan={8}
                  icon={EmptyStateIcons.users}
                  title="No user profiles yet"
                  description="Invite crew via the panel above. Each accepted invite creates a portal user with the role-default permissions."
                />
              ) : (
                users.map((u) => (
                  <UserRow
                    key={u.id}
                    u={u}
                    tick={tick}
                    onHistory={openHistory}
                    onEdit={openEditor}
                    highlighted={u.id === highlightedUid}
                  />
                ))
              )}
            </tbody>
          </table>
        </section>
      </main>

      {selected ? (
        <UserEditorModal
          selected={selected}
          onClose={closeEditor}
          profile={profile}
          users={users}
          panelInviteUrl={panelInviteUrl}
          invokeBusy={invokeBusy}
          revokeConfirmPending={revokeConfirmPending}
          deleteConfirmPending={deleteConfirmPending}
          lockConfirmPending={lockConfirmPending}
          roleDefaultsPending={roleDefaultsPending}
          setRoleDefaultsPending={setRoleDefaultsPending}
          permDraft={permDraft}
          setPermDraft={setPermDraft}
          roleDraft={roleDraft}
          setRoleDraft={setRoleDraft}
          saving={saving}
          onSavePermissions={savePermissions}
          onApplyRoleDefaults={applyRoleDefaults}
          onRevokeInvite={revokeInvite}
          onReissueInvite={reissueInvite}
          onToggleGhost={toggleGhost}
          onLockUser={lockUser}
          onDeleteUser={deleteUser}
          showAvailability={showAvailability}
          setShowAvailability={setShowAvailability}
          showElevation={showElevation}
          setShowElevation={setShowElevation}
          eleModule={eleModule}
          setEleModule={setEleModule}
          eleLevel={eleLevel}
          setEleLevel={setEleLevel}
          eleDuration={eleDuration}
          setEleDuration={setEleDuration}
          eleSaving={eleSaving}
          onSaveTimedElevation={saveTimedElevation}
        />
      ) : null}

      <InvitePreviewModal
        previewOpen={previewOpen}
        onClose={() => {
          setPreviewOpen(false)
          setPreviewShowCreatedUrl(false)
        }}
        previewShowCreatedUrl={previewShowCreatedUrl}
        lastInviteUrl={lastInviteUrl}
        delivery={delivery}
        previewLoading={previewLoading}
        previewError={previewError}
        previewGreeting={previewGreeting}
        createBusy={createBusy}
        onSubmitCreateUser={submitCreateUser}
      />

      <UserHistoryModal
        open={logOpen}
        onClose={() => {
          setLogOpen(false)
          setHistoryForUser(null)
        }}
        historyForUser={historyForUser}
        logLoading={logLoading}
        accessLog={accessLog}
      />

      <NfcWriterModal
        open={nfcModalOpen}
        onClose={() => setNfcModalOpen(false)}
        inviteUrl={nfcModalUrl}
        firstName={nfcModalName}
      />
    </>
  )

  if (omitPageChrome) {
    return <div className="text-zinc-100">{inner}</div>
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="sticky top-0 z-20 border-b border-zinc-800/80 bg-zinc-950 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-4 sm:px-6 sm:py-4">
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
