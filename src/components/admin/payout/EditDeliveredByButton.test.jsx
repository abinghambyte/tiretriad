/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { EditDeliveredByButton } from './EditDeliveredByButton.jsx'

const editFn = vi.hoisted(() => vi.fn())

vi.mock('../../../firebase/config.js', () => ({
  functions: {},
}))

vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn((_f, name) => {
    if (name === 'editOrderDeliveredBy') return editFn
    return vi.fn()
  }),
}))

vi.mock('../../../context/ToastContext.jsx', () => ({
  useToast: () => ({ toast: vi.fn() }),
}))

function recentOrder(overrides = {}) {
  return {
    id: 'order-1',
    fulfillment: 'Delivery',
    completedAtMs: Date.now() - 86_400_000, // 1 day ago
    deliveredBy: null,
    ...overrides,
  }
}

beforeEach(() => {
  editFn.mockReset()
  editFn.mockResolvedValue({ data: { ok: true } })
})

afterEach(() => {
  cleanup()
})

describe('EditDeliveredByButton', () => {
  it('renders the button for an admin within 7 days on a delivery order', () => {
    const { container } = render(
      <EditDeliveredByButton order={recentOrder()} currentUserRole="admin" />,
    )
    const btn = container.querySelector('button')
    expect(btn).not.toBeNull()
    expect(btn.textContent).toMatch(/edit deliverer/i)
  })

  it('hides for non-admin', () => {
    const { container } = render(
      <EditDeliveredByButton order={recentOrder()} currentUserRole="member" />,
    )
    expect(container.querySelector('button')).toBeNull()
  })

  it('hides when fulfillment is pickup', () => {
    const { container } = render(
      <EditDeliveredByButton
        order={recentOrder({ fulfillment: 'Pickup' })}
        currentUserRole="admin"
      />,
    )
    expect(container.querySelector('button')).toBeNull()
  })

  it('hides when older than 7 days', () => {
    const { container } = render(
      <EditDeliveredByButton
        order={recentOrder({ completedAtMs: Date.now() - 8 * 86_400_000 })}
        currentUserRole="admin"
      />,
    )
    expect(container.querySelector('button')).toBeNull()
  })

  it('opens the modal and calls editOrderDeliveredBy with the picked value', async () => {
    const { container } = render(
      <EditDeliveredByButton order={recentOrder()} currentUserRole="admin" />,
    )
    fireEvent.click(container.querySelector('button'))

    const radios = container.querySelectorAll('input[name="edit-delivered-by"]')
    expect(radios.length).toBe(4)
    // Order: alex, dj, kyle, null
    fireEvent.click(radios[1])

    const buttons = container.querySelectorAll('button')
    const saveBtn = Array.from(buttons).find(
      (b) => /save/i.test(b.textContent || '') && !/saving/i.test(b.textContent || ''),
    )
    expect(saveBtn).not.toBeUndefined()
    fireEvent.click(saveBtn)

    await vi.waitFor(() => {
      expect(editFn).toHaveBeenCalled()
    })
    const arg = editFn.mock.calls[0][0]
    expect(arg.orderId).toBe('order-1')
    expect(arg.deliveredBy).toBe('dj')
  })
})
