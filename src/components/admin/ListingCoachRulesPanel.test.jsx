/** @vitest-environment jsdom */
import { describe, expect, it, vi, afterEach } from 'vitest'
import { render, fireEvent, cleanup, act } from '@testing-library/react'
import { ListingCoachRulesPanel } from './ListingCoachRulesPanel.jsx'

let snapshotCb = null
vi.mock('firebase/firestore', () => ({
  doc: () => ({}),
  onSnapshot: (_ref, cb) => {
    snapshotCb = cb
    return () => {}
  },
}))

const { addFn, toggleFn, removeFn, toastMock } = vi.hoisted(() => ({
  addFn: vi.fn().mockResolvedValue({ data: { ok: true } }),
  toggleFn: vi.fn().mockResolvedValue({ data: { ok: true } }),
  removeFn: vi.fn().mockResolvedValue({ data: { ok: true, removed: 1 } }),
  toastMock: vi.fn(),
}))

vi.mock('firebase/functions', () => ({
  httpsCallable: (_fns, name) => {
    if (name === 'addListingCoachRule') return addFn
    if (name === 'toggleListingCoachRule') return toggleFn
    if (name === 'removeListingCoachRule') return removeFn
    return vi.fn()
  },
}))
vi.mock('../../firebase/config', () => ({ db: {}, functions: {} }))
vi.mock('../../context/ToastContext.jsx', () => ({
  useToast: () => ({ toast: toastMock }),
}))

afterEach(() => {
  cleanup()
  addFn.mockClear()
  toggleFn.mockClear()
  removeFn.mockClear()
  toastMock.mockClear()
  snapshotCb = null
})

function emit(rules) {
  act(() => {
    snapshotCb({ exists: () => rules.length > 0, data: () => ({ rules }) })
  })
}

describe('ListingCoachRulesPanel', () => {
  it('renders empty state when no rules exist', () => {
    const { container } = render(<ListingCoachRulesPanel />)
    emit([])
    expect(container.textContent).toContain('No rules yet.')
    expect(container.textContent).toContain('Rules (0)')
  })

  it('renders rules list', () => {
    const { container } = render(<ListingCoachRulesPanel />)
    emit([
      { id: 'r1', rule: 'never mention eFleet', audience: 'all', enabled: true },
      { id: 'r2', rule: 'use load range', audience: 'commercial', enabled: false, reason: 'specs' },
    ])
    expect(container.textContent).toContain('never mention eFleet')
    expect(container.textContent).toContain('use load range')
    expect(container.textContent).toContain('Rules (2)')
  })

  it('Add rule button invokes addFn callable with form values', async () => {
    const { container } = render(<ListingCoachRulesPanel />)
    emit([])
    const textarea = container.querySelector('#lcr-rule')
    fireEvent.change(textarea, { target: { value: 'avoid B2B language' } })
    const audience = container.querySelector('#lcr-audience')
    fireEvent.change(audience, { target: { value: 'consumer' } })
    const form = container.querySelector('form')
    fireEvent.submit(form)
    await Promise.resolve()
    expect(addFn).toHaveBeenCalledWith({
      rule: 'avoid B2B language',
      audience: 'consumer',
      reason: null,
    })
  })

  it('Disable button invokes toggleFn with negated enabled', async () => {
    const { container } = render(<ListingCoachRulesPanel />)
    emit([{ id: 'r1', rule: 'foo', audience: 'all', enabled: true }])
    const buttons = container.querySelectorAll('button')
    const disableBtn = Array.from(buttons).find((b) => b.textContent === 'Disable')
    expect(disableBtn).not.toBeUndefined()
    fireEvent.click(disableBtn)
    await Promise.resolve()
    expect(toggleFn).toHaveBeenCalledWith({ id: 'r1', enabled: false })
  })

  it('Remove button calls removeFn after window.confirm = true', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { container } = render(<ListingCoachRulesPanel />)
    emit([{ id: 'r1', rule: 'foo', audience: 'all', enabled: true }])
    const buttons = container.querySelectorAll('button')
    const removeBtn = Array.from(buttons).find((b) => b.textContent === 'Remove')
    fireEvent.click(removeBtn)
    await Promise.resolve()
    expect(removeFn).toHaveBeenCalledWith({ id: 'r1' })
    confirmSpy.mockRestore()
  })

  it('Remove button skips removeFn when window.confirm = false', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { container } = render(<ListingCoachRulesPanel />)
    emit([{ id: 'r1', rule: 'foo', audience: 'all', enabled: true }])
    const buttons = container.querySelectorAll('button')
    const removeBtn = Array.from(buttons).find((b) => b.textContent === 'Remove')
    fireEvent.click(removeBtn)
    expect(removeFn).not.toHaveBeenCalled()
    confirmSpy.mockRestore()
  })
})
