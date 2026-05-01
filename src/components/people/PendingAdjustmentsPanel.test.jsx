/** @vitest-environment jsdom */
import { describe, expect, it, vi, afterEach } from 'vitest'
import { render, fireEvent, cleanup, act } from '@testing-library/react'
import { PendingAdjustmentsPanel } from './PendingAdjustmentsPanel.jsx'

let snapshotCb = null
vi.mock('firebase/firestore', () => ({
  doc: () => ({}),
  onSnapshot: (_ref, cb) => {
    snapshotCb = cb
    return () => {}
  },
}))
const { ackMock, toastMock } = vi.hoisted(() => ({
  ackMock: vi.fn().mockResolvedValue({ data: { ok: true } }),
  toastMock: vi.fn(),
}))
vi.mock('firebase/functions', () => ({
  httpsCallable: () => ackMock,
}))
vi.mock('../../firebase/config', () => ({ db: {}, functions: {} }))
vi.mock('../../context/ToastContext.jsx', () => ({
  useToast: () => ({ toast: toastMock }),
}))

afterEach(() => {
  cleanup()
  ackMock.mockClear()
  toastMock.mockClear()
  snapshotCb = null
})

function emit(member) {
  act(() => {
    snapshotCb({ exists: () => true, data: () => ({ members: { dj: member } }) })
  })
}

describe('PendingAdjustmentsPanel', () => {
  it('renders empty state when no pending adjustments', () => {
    const { container } = render(<PendingAdjustmentsPanel crewKey="dj" />)
    emit({ balance: 200, totalEarned: 500, totalPaid: 300, adjustments: [] })
    expect(container.textContent).toContain('All caught up')
  })

  it('renders pending adjustments and ack button fires the callable', async () => {
    const { container } = render(<PendingAdjustmentsPanel crewKey="dj" />)
    emit({
      balance: 180,
      totalEarned: 480,
      totalPaid: 300,
      adjustments: [
        {
          adjustmentId: 'A1',
          orderId: 'O1',
          delta: -20,
          oldBalance: 200,
          newBalance: 180,
          acknowledgedBy: null,
        },
      ],
    })
    expect(container.textContent).toContain('Pending adjustments (1)')
    const btn = container.querySelector('button')
    expect(btn).not.toBeNull()
    fireEvent.click(btn)
    await Promise.resolve()
    expect(ackMock).toHaveBeenCalledWith({ crewKey: 'dj', adjustmentId: 'A1' })
  })

  it('skips already-acknowledged entries', () => {
    const { container } = render(<PendingAdjustmentsPanel crewKey="dj" />)
    emit({
      balance: 200,
      totalEarned: 500,
      totalPaid: 300,
      adjustments: [
        {
          adjustmentId: 'A1',
          orderId: 'O1',
          delta: -20,
          oldBalance: 220,
          newBalance: 200,
          acknowledgedBy: 'someone',
          acknowledgedAt: new Date(),
        },
      ],
    })
    expect(container.textContent).toContain('Pending adjustments (0)')
  })
})
