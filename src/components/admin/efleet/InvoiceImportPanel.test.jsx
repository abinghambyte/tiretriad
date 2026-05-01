/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'

const importFn = vi.hoisted(() => vi.fn())
const toastFn = vi.hoisted(() => vi.fn())
const parseFn = vi.hoisted(() => vi.fn())

vi.mock('../../../firebase/config', () => ({
  functions: {},
}))

vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn((_f, name) => {
    if (name === 'importInvoice') return importFn
    return vi.fn()
  }),
}))

vi.mock('../../../context/ToastContext.jsx', () => ({
  useToast: () => ({ toast: toastFn }),
}))

vi.mock('../../../utils/parseEfleetInvoice.js', () => ({
  parseEfleetInvoice: parseFn,
}))

const { InvoiceImportPanel } = await import('./InvoiceImportPanel.jsx')

const sampleParsed = {
  docNumber: 'INV-1001',
  dr: 'DR-7',
  docDate: '2026-04-20',
  invoiceTotal: 1234.56,
  lines: [
    { mspn: '54802', qty: 4, netUnitPrice: 237.9, unitFet: 4.44, extended: 968.96 },
  ],
}

beforeEach(() => {
  importFn.mockReset()
  toastFn.mockReset()
  parseFn.mockReset()
  parseFn.mockReturnValue(sampleParsed)
  importFn.mockResolvedValue({
    data: { ok: true, attachedCount: 1, status: 'attached' },
  })
})

afterEach(cleanup)

function makeFile(text = '<html>...</html>') {
  // jsdom File supports .text() in Node 20+ via undici Blob. Wrap if missing.
  const f = new File([text], 'invoice.html', { type: 'text/html' })
  if (typeof f.text !== 'function') {
    f.text = async () => text
  }
  return f
}

describe('InvoiceImportPanel', () => {
  it('parses dropped file and renders preview rows', async () => {
    const { container } = render(<InvoiceImportPanel />)
    const input = container.querySelector('input[type="file"]')
    expect(input).not.toBeNull()
    Object.defineProperty(input, 'files', { value: [makeFile()], configurable: true })
    fireEvent.change(input)
    await waitFor(() => {
      expect(container.textContent).toContain('INV-1001')
    })
    expect(container.textContent).toContain('54802')
    expect(container.textContent).toContain('DR-7')
  })

  it('clicking Import calls the importInvoice callable and toasts success', async () => {
    const { container } = render(<InvoiceImportPanel />)
    const input = container.querySelector('input[type="file"]')
    Object.defineProperty(input, 'files', { value: [makeFile()], configurable: true })
    fireEvent.change(input)
    await waitFor(() => {
      expect(container.textContent).toContain('INV-1001')
    })
    const buttons = container.querySelectorAll('button')
    const importBtn = Array.from(buttons).find((b) => b.textContent.trim() === 'Import')
    expect(importBtn).not.toBeUndefined()
    fireEvent.click(importBtn)
    await waitFor(() => {
      expect(importFn).toHaveBeenCalledTimes(1)
    })
    expect(importFn).toHaveBeenCalledWith({ invoice: sampleParsed })
    await waitFor(() => {
      expect(toastFn).toHaveBeenCalled()
    })
    const [msg, variant] = toastFn.mock.calls[0]
    expect(msg).toContain('INV-1001')
    expect(variant).toBe('success')
  })

  it('renders a parse error when the parser throws', async () => {
    parseFn.mockImplementation(() => {
      throw new Error('malformed input')
    })
    const { container } = render(<InvoiceImportPanel />)
    const input = container.querySelector('input[type="file"]')
    Object.defineProperty(input, 'files', { value: [makeFile()], configurable: true })
    fireEvent.change(input)
    await waitFor(() => {
      expect(container.textContent).toContain('Parse error')
    })
    expect(container.textContent).toContain('malformed input')
  })
})
