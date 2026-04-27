/** @vitest-environment jsdom */

/**
 * PeopleDashboard opens this modal for per-user permissions. We mount `UserEditorModal`
 * directly so `vi.mock('firebase/firestore')` is not needed (it would collide with other
 * tests that mock the same module).
 */
import { act, createElement, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MODULE_MATRIX, ROLE_DEFAULTS } from '../../constants/peoplePermissions.js'
import { UserEditorModal } from './PermissionEditor.jsx'

vi.mock('../../firebase/config.js', () => ({
  auth: { currentUser: { uid: 'admin-self', email: 'admin@test.com' } },
  db: {},
  functions: {},
}))

vi.mock('../../context/ToastContext.jsx', () => ({
  useToast: () => ({ toast: vi.fn() }),
}))

// Patch-304: AvailabilityBlocker is now gated behind flags.multiUserMode.
// Mock the flag to true so the existing assertions about Availability
// rendering still hold. A separate test below covers the gated-off case.
vi.mock('../../utils/featureFlags.js', () => ({
  flags: { multiUserMode: true, listingAdvisor: false },
}))

const noop = () => {}

function EditorHarness({ profile, selected }) {
  const [permDraft, setPermDraft] = useState(() => ({
    ...ROLE_DEFAULTS.viewer,
    ...(selected?.permissions || {}),
  }))
  const [roleDraft, setRoleDraft] = useState(String(selected?.role || 'viewer'))
  const [showAvailability, setShowAvailability] = useState(false)
  const [showElevation, setShowElevation] = useState(false)
  const [eleModule, setEleModule] = useState('tires')
  const [eleLevel, setEleLevel] = useState('edit')
  const [eleDuration, setEleDuration] = useState('24h')
  const [roleDefaultsPending, setRoleDefaultsPending] = useState(false)

  return createElement(UserEditorModal, {
    selected,
    onClose: noop,
    profile,
    users: [],
    panelInviteUrl: '',
    invokeBusy: '',
    revokeConfirmPending: false,
    deleteConfirmPending: false,
    lockConfirmPending: false,
    roleDefaultsPending,
    setRoleDefaultsPending,
    permDraft,
    setPermDraft,
    roleDraft,
    setRoleDraft,
    saving: false,
    onSavePermissions: noop,
    onApplyRoleDefaults: noop,
    onRevokeInvite: noop,
    onReissueInvite: noop,
    onToggleGhost: noop,
    onLockUser: noop,
    onDeleteUser: noop,
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
    eleSaving: false,
    onSaveTimedElevation: noop,
  })
}

function renderHarness(profile, selected) {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const root = createRoot(el)
  act(() => {
    root.render(createElement(EditorHarness, { profile, selected }))
  })
  return { el, root }
}

describe('PeopleDashboard permission matrix (UserEditorModal)', () => {
  const selectedUser = {
    id: 'user-target',
    firstName: 'Sam',
    lastName: 'Target',
    email: 'sam@example.com',
    role: 'viewer',
    inviteStatus: 'active',
  }

  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: vi.fn().mockImplementation(() => ({
        matches: false,
        media: '',
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    })
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('admin profile shows the permission matrix for every module and the Availability block', () => {
    const profile = {
      role: 'admin',
      permissions: {
        people: 'manage',
        tires: 'manage',
        orders: 'manage',
        crm: 'manage',
        analytics: 'manage',
        revenue: 'manage',
        wall: 'manage',
      },
    }
    const { el, root } = renderHarness(profile, selectedUser)
    const dialog = el.querySelector('[role="dialog"]')
    expect(dialog).toBeTruthy()
    expect(dialog.textContent).toMatch(/Permission matrix/i)
    for (const row of MODULE_MATRIX) {
      expect(dialog.textContent).toContain(row.label)
    }
    expect(dialog.textContent).toContain('Availability')
    root.unmount()
  })

  it('mechanic profile without people manage does not show the Availability editor block', () => {
    const profile = {
      role: 'mechanic',
      permissions: {
        tires: 'none',
        orders: 'act',
        people: 'none',
        crm: 'view',
        analytics: 'view',
        revenue: 'none',
        wall: 'view',
      },
    }
    const { el, root } = renderHarness(profile, selectedUser)
    const dialog = el.querySelector('[role="dialog"]')
    expect(dialog).toBeTruthy()
    expect(dialog.textContent).toMatch(/Permission matrix/i)
    expect(dialog.textContent).not.toContain('Availability')
    root.unmount()
  })

  it('Save permissions invokes persist with the expected payload after toggling a matrix radio', async () => {
    const profile = {
      role: 'admin',
      permissions: { people: 'manage', tires: 'manage', orders: 'manage', crm: 'manage' },
    }
    const el = document.createElement('div')
    document.body.appendChild(el)
    const root = createRoot(el)

    const persistSpy = vi.fn()

    function SaveHarness() {
      const [permDraft, setPermDraft] = useState({ ...ROLE_DEFAULTS.viewer })
      const [roleDraft, setRoleDraft] = useState('viewer')
      return createElement(UserEditorModal, {
        selected: selectedUser,
        onClose: noop,
        profile,
        users: [],
        panelInviteUrl: '',
        invokeBusy: '',
        revokeConfirmPending: false,
        deleteConfirmPending: false,
        lockConfirmPending: false,
        roleDefaultsPending: false,
        setRoleDefaultsPending: noop,
        permDraft,
        setPermDraft,
        roleDraft,
        setRoleDraft,
        saving: false,
        onSavePermissions: () => {
          persistSpy({ targetUid: selectedUser.id, permissions: { ...permDraft }, role: roleDraft })
        },
        onApplyRoleDefaults: noop,
        onRevokeInvite: noop,
        onReissueInvite: noop,
        onToggleGhost: noop,
        onLockUser: noop,
        onDeleteUser: noop,
        showAvailability: false,
        setShowAvailability: noop,
        showElevation: false,
        setShowElevation: noop,
        eleModule: 'tires',
        setEleModule: noop,
        eleLevel: 'edit',
        setEleLevel: noop,
        eleDuration: '24h',
        setEleDuration: noop,
        eleSaving: false,
        onSaveTimedElevation: noop,
      })
    }

    act(() => {
      root.render(createElement(SaveHarness))
    })

    const dialog = el.querySelector('[role="dialog"]')
    const editRadio = [...dialog.querySelectorAll('input[name="perm-tires"]')].find((inp) =>
      inp.closest('label')?.textContent?.toLowerCase().includes('edit'),
    )
    expect(editRadio).toBeTruthy()
    await act(async () => {
      editRadio.click()
      await Promise.resolve()
    })

    const saveBtn = [...dialog.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Save permissions'),
    )
    await act(async () => {
      saveBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await Promise.resolve()
    })

    expect(persistSpy).toHaveBeenCalledTimes(1)
    expect(persistSpy.mock.calls[0][0]).toEqual({
      targetUid: 'user-target',
      permissions: expect.objectContaining({ tires: 'edit' }),
      role: 'viewer',
    })
    root.unmount()
  })
})
