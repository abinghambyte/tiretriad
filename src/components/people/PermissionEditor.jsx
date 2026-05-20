import { useEffect, useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import { auth, functions } from '../../firebase/config'
import {
  crewTagFromRole,
  MODULE_MATRIX,
  permissionMeets,
} from '../../constants/peoplePermissions'
import { PermissionMatrix } from './PermissionMatrix'
import { AvailabilityBlocker } from './AvailabilityBlocker.jsx'
import { EditorInviteColumn } from './InviteUrlToolkit.jsx'
import Spinner from '../ui/Spinner.jsx'
import { MODAL_CENTER_BACKDROP, MODAL_CENTER_PANEL_BASE } from '../ui/modalChrome.js'
import { flags } from '../../utils/featureFlags.js'

/**
 * Permission matrix column in the user editor grid.
 */
export function PermissionEditor({ value, onChange, disabled }) {
  return (
    <div className="md:col-span-2 lg:col-span-1">
      <PermissionMatrix value={value} onChange={onChange} disabled={disabled} />
    </div>
  )
}

const updatePortalUserFn = httpsCallable(functions, 'updatePortalUser')

/**
 * Inline editable form for the recipient's profile details (first /
 * last / email / phone). Lives above the existing role + permissions
 * editor so an admin can fix typos or redirect an invite to a
 * different address (e.g. switching kyle.kelly@purcelltire.com to
 * kyle.rtc@gmail.com when corporate email security blocks the link)
 * without deleting and recreating the user.
 *
 * Backend gates email changes on `inviteAccepted=false`; we mirror
 * that constraint in the UI by disabling the email field once the
 * user has finished registration.
 */
function ProfileDetailsEditor({ user }) {
  const [first, setFirst] = useState(String(user.firstName || ''))
  const [last, setLast] = useState(String(user.lastName || ''))
  const [email, setEmail] = useState(String(user.email || ''))
  const [phone, setPhone] = useState(String(user.phone || ''))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [savedAt, setSavedAt] = useState(0)

  const emailLocked = !!user.inviteAccepted
  const trimmedFirst = first.trim()
  const trimmedLast = last.trim()
  const trimmedEmail = email.trim().toLowerCase()
  const trimmedPhone = phone.trim()
  const originalEmail = String(user.email || '').trim().toLowerCase()
  const dirty =
    trimmedFirst !== String(user.firstName || '').trim() ||
    trimmedLast !== String(user.lastName || '').trim() ||
    trimmedPhone !== String(user.phone || '').trim() ||
    (!emailLocked && trimmedEmail !== originalEmail)

  async function save() {
    // Allow calling even when !dirty so the button doubles as a Sync
    // Auth profile pass — updatePortalUser tolerates an empty patch and
    // still runs the Auth displayName sync.
    if (saving) return
    setSaving(true)
    setError('')
    try {
      const payload = { targetUid: user.id }
      if (trimmedFirst !== String(user.firstName || '').trim()) payload.firstName = trimmedFirst
      if (trimmedLast !== String(user.lastName || '').trim()) payload.lastName = trimmedLast
      if (trimmedPhone !== String(user.phone || '').trim()) payload.phone = trimmedPhone
      if (!emailLocked && trimmedEmail !== originalEmail) payload.email = trimmedEmail
      await updatePortalUserFn(payload)
      setSavedAt(Date.now())
    } catch (e) {
      setError(String(e?.message || e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-400">Profile</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="block">
          <span className="block text-[11px] text-zinc-500">First name</span>
          <input
            type="text"
            value={first}
            onChange={(e) => setFirst(e.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-amber-500 focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="block text-[11px] text-zinc-500">Last name</span>
          <input
            type="text"
            value={last}
            onChange={(e) => setLast(e.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-amber-500 focus:outline-none"
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="block text-[11px] text-zinc-500">
            Email{' '}
            {emailLocked ? (
              <span className="ml-1 text-zinc-600">(locked — user has registered)</span>
            ) : null}
          </span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={emailLocked}
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-amber-500 focus:outline-none disabled:cursor-not-allowed disabled:bg-zinc-950 disabled:text-zinc-500"
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="block text-[11px] text-zinc-500">Phone (US, optional)</span>
          <input
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="(303) 555-0119"
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-amber-500 focus:outline-none"
          />
        </label>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          // Always callable so it doubles as a 'Sync Auth profile'
          // button for users whose Firebase Auth displayName drifted
          // from their Firestore name. updatePortalUser tolerates an
          // empty patch and still runs the Auth sync pass.
          className="inline-flex items-center gap-2 rounded-lg bg-amber-500/20 px-3 py-1.5 text-sm font-semibold text-amber-200 hover:bg-amber-500/30 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving && <Spinner className="h-3.5 w-3.5 text-amber-200" />}
          {saving ? 'Saving…' : dirty ? 'Save profile' : 'Sync profile'}
        </button>
        {error ? (
          <span className="text-xs text-red-400">{error}</span>
        ) : savedAt ? (
          <span className="text-xs text-emerald-300">Saved.</span>
        ) : !emailLocked && originalEmail ? (
          <span className="text-xs text-zinc-500">
            Changing email reissues the invite to the new address on next send.
          </span>
        ) : null}
      </div>
    </div>
  )
}

/**
 * Full-screen user editor: invite, role, permissions, availability, elevation, actions.
 */
export function UserEditorModal({
  selected,
  onClose,
  profile,
  users,
  panelInviteUrl,
  invokeBusy,
  revokeConfirmPending,
  deleteConfirmPending,
  lockConfirmPending,
  roleDefaultsPending,
  setRoleDefaultsPending,
  permDraft,
  setPermDraft,
  roleDraft,
  setRoleDraft,
  saving,
  onSavePermissions,
  onApplyRoleDefaults,
  onRevokeInvite,
  onReissueInvite,
  onResendInvite,
  onResendInviteBoth,
  onToggleGhost,
  onLockUser,
  onDeleteUser,
  showAvailability,
  setShowAvailability,
  showElevation,
  setShowElevation,
  eleModule,
  setEleModule,
  eleLevel,
  setEleLevel,
  eleDuration,
  setEleDuration,
  eleSaving,
  onSaveTimedElevation,
}) {
  const eleModuleRow = MODULE_MATRIX.find((m) => m.key === eleModule) || MODULE_MATRIX[0]

  useEffect(() => {
    if (!selected) return undefined
    function onKey(e) {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected, onClose])

  if (!selected) return null

  return (
    <div
      className={MODAL_CENTER_BACKDROP}
      role="dialog"
      aria-modal="true"
      aria-labelledby="user-editor-title"
      onClick={() => {
        if (!saving) onClose?.()
      }}
    >
      <div
        className={`${MODAL_CENTER_PANEL_BASE} max-w-5xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-1 overflow-y-auto p-6 pb-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h2 id="user-editor-title" className="text-lg font-semibold tracking-tight text-zinc-50">
                {selected.firstName} {selected.lastName}
              </h2>
              <p className="mt-1 text-xs text-zinc-400">{selected.email}</p>
            </div>
            <button
              type="button"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-transparent text-zinc-400 transition-colors duration-200 hover:border-zinc-700 hover:bg-zinc-800/80 hover:text-zinc-100"
              onClick={onClose}
              aria-label="Close"
            >
              <span className="text-xl leading-none" aria-hidden>
                ×
              </span>
            </button>
          </div>

          <div className="mt-4">
            <ProfileDetailsEditor user={selected} />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            <EditorInviteColumn
              selected={selected}
              panelInviteUrl={panelInviteUrl}
              invokeBusy={invokeBusy}
              revokeConfirmPending={revokeConfirmPending}
              onRevokeInvite={onRevokeInvite}
              onReissueInvite={onReissueInvite}
              onResendInvite={onResendInvite}
              onResendInviteBoth={onResendInviteBoth}
            />

            <div className="space-y-3">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">Role</p>
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <select
                    value={roleDraft}
                    onChange={(e) => {
                      setRoleDraft(e.target.value)
                      setRoleDefaultsPending(false)
                    }}
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
                  onClick={() => void onApplyRoleDefaults()}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-zinc-700 px-3 py-2 text-xs text-amber-300/90 transition-colors hover:bg-zinc-800 hover:text-amber-200 disabled:opacity-40"
                >
                  {saving && !roleDefaultsPending && <Spinner className="h-3 w-3 text-amber-300/90" />}
                  {saving && !roleDefaultsPending
                    ? 'Saving…'
                    : roleDefaultsPending
                      ? 'Confirm reset?'
                      : 'Apply defaults'}
                </button>
              </div>
            </div>

            <PermissionEditor value={permDraft} onChange={setPermDraft} disabled={saving} />
          </div>

          {/* Patch-304: gate AvailabilityBlocker behind multiUserMode.
              Crew availability matters once DJ/Kyle have real schedules;
              before then it's noise on a single-user install. */}
          {flags.multiUserMode &&
          profile &&
          selected &&
          (permissionMeets(profile.permissions?.people, 'manage') ||
            selected.id === auth.currentUser?.uid) ? (
            <div className="mt-4 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setShowAvailability((v) => !v)}
                className="flex w-full items-center justify-between py-3 text-xs font-medium uppercase tracking-wide text-zinc-400 transition-colors hover:text-zinc-300"
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

          <div className="mt-0 border-t border-zinc-800">
            <button
              type="button"
              onClick={() => setShowElevation((v) => !v)}
              className="flex w-full items-center justify-between py-3 text-xs font-medium uppercase tracking-wide text-zinc-400 transition-colors hover:text-zinc-300"
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
                <p className="text-xs text-zinc-400">
                  Raise one module for 24h, 48h, or 7 days. Reverts automatically (hourly job).
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs text-zinc-400">Module</label>
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
                    <label className="mb-1 block text-xs text-zinc-400">Elevated level</label>
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
                  <legend className="mb-2 text-xs text-zinc-400">Duration</legend>
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
                  onClick={() => void onSaveTimedElevation()}
                  className="w-full rounded-lg bg-amber-900/40 px-3 py-2 text-sm font-semibold text-amber-100 ring-1 ring-amber-800/50 hover:bg-amber-900/60 disabled:opacity-50"
                >
                  {eleSaving ? 'Saving…' : 'Apply temporary elevation'}
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-zinc-800 bg-zinc-950 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-700 px-4 py-2.5 text-sm text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={onSavePermissions}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-zinc-950 transition-colors hover:bg-amber-400 disabled:opacity-50"
          >
            {saving && <Spinner className="h-4 w-4 text-zinc-950/80" />}
            {saving ? 'Saving…' : 'Save permissions'}
          </button>
          {selected && selected.id !== auth.currentUser?.uid ? (
            <>
              {profile?.role === 'admin' ? (
                <button
                  type="button"
                  disabled={invokeBusy !== ''}
                  onClick={() => void onToggleGhost()}
                  className="rounded-lg border border-zinc-700 px-3 py-2.5 text-sm text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-40"
                  title={selected.ghostMode ? 'Ghost mode on. Click to disable.' : 'Enable ghost mode'}
                >
                  {selected.ghostMode ? 'Ghost: on' : 'Ghost'}
                </button>
              ) : null}
              <button
                type="button"
                disabled={invokeBusy !== ''}
                onClick={() => void onLockUser()}
                className={
                  selected.inviteStatus === 'locked'
                    ? 'inline-flex items-center gap-1.5 rounded-lg border border-amber-700/60 px-3 py-2.5 text-sm text-amber-300/80 transition-colors hover:bg-amber-950/30 hover:text-amber-200 disabled:opacity-40'
                    : 'inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-2.5 text-sm text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-40'
                }
              >
                {invokeBusy === 'lock' && <Spinner className="h-3.5 w-3.5 text-current" />}
                {invokeBusy === 'lock'
                  ? selected.inviteStatus === 'locked'
                    ? 'Unlocking…'
                    : 'Locking…'
                  : selected.inviteStatus === 'locked'
                    ? 'Unlock'
                    : lockConfirmPending
                      ? 'Confirm lock?'
                      : 'Lock'}
              </button>
              <button
                type="button"
                disabled={invokeBusy !== ''}
                onClick={() => void onDeleteUser()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-900/50 px-3 py-2.5 text-sm font-medium text-red-400/80 transition-colors hover:bg-red-950/40 hover:text-red-300 disabled:opacity-40"
              >
                {invokeBusy === 'delete' && <Spinner className="h-3.5 w-3.5 text-red-400/80" />}
                {invokeBusy === 'delete'
                  ? 'Deleting…'
                  : deleteConfirmPending
                    ? 'Confirm delete?'
                    : 'Delete'}
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}
