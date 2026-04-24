import { useEffect } from 'react'
import { auth } from '../../firebase/config'
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

          <div className="mt-4 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            <EditorInviteColumn
              selected={selected}
              panelInviteUrl={panelInviteUrl}
              invokeBusy={invokeBusy}
              revokeConfirmPending={revokeConfirmPending}
              onRevokeInvite={onRevokeInvite}
              onReissueInvite={onReissueInvite}
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

          {profile &&
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

        <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-zinc-800 bg-zinc-950 px-5 py-4">
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
