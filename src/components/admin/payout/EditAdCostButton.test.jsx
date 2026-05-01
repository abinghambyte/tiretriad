/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { EditAdCostButton } from './EditAdCostButton.jsx'

const setFn = vi.hoisted(() => vi.fn())

vi.mock('../../../firebase/config.js', () => ({
  functions: {},
}))

vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn((_f, name) => {
    if (name === 'setOrderAdCost') return setFn
    return vi.fn()
  }),
}))

vi.mock('../../../context/ToastContext.jsx', () => ({
  useToast: () => ({ toast: vi.fn() }),
}))

function recentOrder(overrides = {}) {
  return {
    id: 'order-1',
    completedMs: Date.now() - 86_400_000, // 1 day ago
    completedBy: 'u-closer',
    adCost: 0,
    ...overrides,
  }
}

beforeEach(() => {
  setFn.mockReset()
  setFn.mockResolvedValue({ data: { ok: true } })
})

afterEach(() => {
  cleanup()
})

describe('EditAdCostButton', () => {
  it('renders for an admin within the 7-day window', () => {
    const { container } = render(
      <EditAdCostButton
        order={recentOrder()}
        currentUserRole="admin"
        currentUserUid="u-admin"
      />,
    )
    const btn = container.querySelector('button')
    expect(btn).not.toBeNull()
    expect(btn.textContent).toMatch(/edit ad cost/i)
  })

  it('renders for the closer (non-admin) within the 7-day window', () => {
    const { container } = render(
      <EditAdCostButton
        order={recentOrder()}
        currentUserRole="member"
        currentUserUid="u-closer"
      />,
    )
    expect(container.querySelector('button')).not.toBeNull()
  })

  it('hides for an unrelated non-admin user', () => {
    const { container } = render(
      <EditAdCostButton
        order={recentOrder()}
        currentUserRole="member"
        currentUserUid="u-rando"
      />,
    )
    expect(container.querySelector('button')).toBeNull()
  })

  it('hides when older than 7 days, even for admin', () => {
    const { container } = render(
      <EditAdCostButton
        order={recentOrder({ completedMs: Date.now() - 8 * 86_400_000 })}
        currentUserRole="admin"
        currentUserUid="u-admin"
      />,
    )
    expect(container.querySelector('button')).toBeNull()
  })

  it('hides when completedMs is missing', () => {
    const { container } = render(
      <EditAdCostButton
        order={recentOrder({ completedMs: 0 })}
        currentUserRole="admin"
        currentUserUid="u-admin"
      />,
    )
    expect(container.querySelector('button')).toBeNull()
  })

  it('opens the modal and calls setOrderAdCost with the typed value', async () => {
    const { container } = render(
      <EditAdCostButton
        order={recentOrder()}
        currentUserRole="admin"
        currentUserUid="u-admin"
      />,
    )
    fireEvent.click(container.querySelector('button'))

    const input = container.querySelector('input[type="number"]')
    expect(input).not.toBeNull()
    fireEvent.change(input, { target: { value: '12.50' } })

    const buttons = container.querySelectorAll('button')
    const saveBtn = Array.from(buttons).find(
      (b) => /save/i.test(b.textContent || '') && !/saving/i.test(b.textContent || ''),
    )
    expect(saveBtn).not.toBeUndefined()
    fireEvent.click(saveBtn)

    await vi.waitFor(() => {
      expect(setFn).toHaveBeenCalled()
    })
    const arg = setFn.mock.calls[0][0]
    expect(arg.orderId).toBe('order-1')
    expect(arg.adCost).toBe(12.5)
  })

  it('pre-fills the input with the existing adCost', () => {
    const { container } = render(
      <EditAdCostButton
        order={recentOrder({ adCost: 25 })}
        currentUserRole="admin"
        currentUserUid="u-admin"
      />,
    )
    fireEvent.click(container.querySelector('button'))
    const input = container.querySelector('input[type="number"]')
    expect(input.value).toBe('25')
  })
})
