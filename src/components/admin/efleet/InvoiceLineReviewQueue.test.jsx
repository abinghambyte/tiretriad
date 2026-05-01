/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'

const attachFn = vi.hoisted(() => vi.fn())
const toastFn = vi.hoisted(() => vi.fn())
const onSnapshotMock = vi.hoisted(() => vi.fn())
const getDocsMock = vi.hoisted(() => vi.fn())

vi.mock('../../../firebase/config', () => ({
  functions: {},
  db: {},
}))

vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn((_f, name) => {
    if (name === 'attachInvoiceLine') return attachFn
    return vi.fn()
  }),
}))

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, name) => ({ name })),
  query: vi.fn((c, ...rest) => ({ collection: c, rest })),
  where: vi.fn((field, op, value) => ({ field, op, value })),
  orderBy: vi.fn((field, dir) => ({ orderBy: field, dir })),
  limit: vi.fn((n) => ({ limit: n })),
  onSnapshot: (...args) => onSnapshotMock(...args),
  getDocs: (...args) => getDocsMock(...args),
}))

vi.mock('../../../context/ToastContext.jsx', () => ({
  useToast: () => ({ toast: toastFn }),
}))

const { InvoiceLineReviewQueue } = await import('./InvoiceLineReviewQueue.jsx')

const invoiceDoc = {
  id: 'inv-1',
  data: () => ({
    docNumber: 'INV-1001',
    dr: 'DR-7',
    docDate: '2026-04-20',
    status: 'pending',
    lines: [{ mspn: '54802', qty: 4, extended: 968.96 }],
  }),
}

const orderDoc = {
  id: 'order-abc',
  data: () => ({
    status: 'completed',
    mspn: '54802',
    quantity: 4,
    customer: 'Acme Fleet',
    completedMs: new Date('2026-04-21').getTime(),
  }),
}

beforeEach(() => {
  attachFn.mockReset()
  toastFn.mockReset()
  onSnapshotMock.mockReset()
  getDocsMock.mockReset()
  attachFn.mockResolvedValue({ data: { ok: true } })
  onSnapshotMock.mockImplementation((_q, cb) => {
    cb({ docs: [invoiceDoc] })
    return () => {}
  })
  getDocsMock.mockResolvedValue({ docs: [orderDoc] })
})

afterEach(cleanup)

describe('InvoiceLineReviewQueue', () => {
  it('renders a pending invoice line and a candidate button', async () => {
    const { container } = render(<InvoiceLineReviewQueue />)
    await waitFor(() => {
      expect(container.textContent).toContain('INV-1001')
    })
    await waitFor(() => {
      expect(container.textContent).toContain('order-abc')
    })
    expect(container.textContent).toContain('Acme Fleet')
    expect(container.textContent).toContain('54802')
  })

  it('clicking a candidate fires the attachInvoiceLine callable', async () => {
    const { container } = render(<InvoiceLineReviewQueue />)
    let btn
    await waitFor(() => {
      btn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent.includes('order-abc'),
      )
      expect(btn).not.toBeUndefined()
    })
    fireEvent.click(btn)
    await waitFor(() => {
      expect(attachFn).toHaveBeenCalledTimes(1)
    })
    expect(attachFn).toHaveBeenCalledWith({
      invoiceId: 'inv-1',
      lineIndex: 0,
      orderId: 'order-abc',
    })
    await waitFor(() => {
      expect(toastFn).toHaveBeenCalled()
    })
    expect(toastFn.mock.calls[0][1]).toBe('success')
  })

  it('shows the empty state when no invoices need review', async () => {
    onSnapshotMock.mockImplementation((_q, cb) => {
      cb({ docs: [] })
      return () => {}
    })
    const { container } = render(<InvoiceLineReviewQueue />)
    expect(container.textContent).toContain('No invoices awaiting review')
  })
})
