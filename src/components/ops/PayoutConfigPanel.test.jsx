/** @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { PayoutConfigPanel } from './PayoutConfigPanel.jsx'

const getCfg = vi.hoisted(() => vi.fn())
const updateCfg = vi.hoisted(() => vi.fn())

vi.mock('../../firebase/config.js', () => ({
  auth: { currentUser: { uid: 'u1' } },
  db: {},
  functions: {},
}))

vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn((_f, name) => {
    if (name === 'getPayoutConfig') return getCfg
    if (name === 'updatePayoutConfig') return updateCfg
    return vi.fn()
  }),
}))

vi.mock('../../context/ToastContext.jsx', () => ({
  useToast: () => ({ toast: vi.fn() }),
}))

const defaultCfg = {
  splits: { alex: 0.35, dj: 0.35, kyle: 0.3 },
  taxes: {
    countyTaxPct: 0.0109,
    localTaxPct: 0.0312,
    stateTaxPct: 0.0302,
    tireFeePerTire: 2,
  },
}

function rowValueByLabel(labelText) {
  const row = screen.getByText(labelText).closest('tr')
  if (!row) throw new Error(`row for label ${labelText} not found`)
  const cell = row.querySelector('td')
  if (!cell) throw new Error(`value cell for ${labelText} not found`)
  return cell.textContent || ''
}

beforeEach(() => {
  cleanup()
  getCfg.mockReset()
  updateCfg.mockReset()
  getCfg.mockResolvedValue({ data: { config: defaultCfg } })
  updateCfg.mockResolvedValue({ data: { ok: true } })
})

describe('PayoutConfigPanel', () => {
  it('renders with mocked current config', async () => {
    render(<PayoutConfigPanel />)
    expect(await screen.findByRole('heading', { name: /payouts & taxes/i })).toBeTruthy()
    await waitFor(() => expect(getCfg).toHaveBeenCalled())
    const splitInputs = await screen.findAllByDisplayValue('35.0')
    expect(splitInputs.length).toBeGreaterThanOrEqual(2)
  })

  it('disables submit when splits do not sum to 100%', async () => {
    render(<PayoutConfigPanel />)
    await waitFor(() => expect(getCfg).toHaveBeenCalled())
    const alex = (await screen.findAllByDisplayValue('35.0'))[0]
    fireEvent.change(alex, { target: { value: '10' } })
    const submit = screen.getByRole('button', { name: /save payout config/i })
    expect(submit.disabled).toBe(true)
  })

  it('calls the update callable on submit', async () => {
    render(<PayoutConfigPanel />)
    await waitFor(() => expect(getCfg).toHaveBeenCalled())
    const submit = screen.getByRole('button', { name: /save payout config/i })
    expect(submit.disabled).toBe(false)
    fireEvent.click(submit)
    await waitFor(() => expect(updateCfg).toHaveBeenCalled())
    const payload = updateCfg.mock.calls[0][0]
    expect(payload.splits).toMatchObject({ alex: 0.35, dj: 0.35, kyle: 0.3 })
    expect(payload.taxes.countyTaxPct).toBeCloseTo(0.0109, 6)
  })

  it('renders the preview ledger with default Buy/Qty and no retail', async () => {
    render(<PayoutConfigPanel />)
    await waitFor(() => expect(getCfg).toHaveBeenCalled())

    // Buy subtotal = 100 * 4 = 400
    expect(rowValueByLabel('Buy subtotal')).toContain('$400.00')
    // Tire fee = 2 * 4 = 8
    expect(rowValueByLabel('Tire fee')).toContain('$8.00')
    // Without retail, retail-side rows render '-'
    expect(rowValueByLabel('Retail subtotal')).toBe('-')
    expect(rowValueByLabel('Pool (retail - cost)')).toBe('-')
    expect(rowValueByLabel('Alex share')).toBe('-')
    expect(rowValueByLabel('DJ share')).toBe('-')
    expect(rowValueByLabel('Kyle share')).toBe('-')
  })

  it('recomputes the ledger when Buy/Qty inputs change', async () => {
    render(<PayoutConfigPanel />)
    await waitFor(() => expect(getCfg).toHaveBeenCalled())

    const qty = screen.getByDisplayValue('4')
    fireEvent.change(qty, { target: { value: '2' } })

    // Buy subtotal = 100 * 2 = 200
    expect(rowValueByLabel('Buy subtotal')).toContain('$200.00')
    // Tire fee = 2 * 2 = 4
    expect(rowValueByLabel('Tire fee')).toContain('$4.00')

    const buy = screen.getByDisplayValue('100.00')
    fireEvent.change(buy, { target: { value: '50' } })
    // Buy subtotal = 50 * 2 = 100
    expect(rowValueByLabel('Buy subtotal')).toContain('$100.00')
  })

  it('renders split dollar shares when retail is set', async () => {
    render(<PayoutConfigPanel />)
    await waitFor(() => expect(getCfg).toHaveBeenCalled())

    // Set retail to make pool math round cleanly. With default taxes and
    // 100 * 4 buy, cost total is 429.32 (400 + 4.36 + 12.48 + 12.08 + 8.00 = 436.92).
    // Set retail to a value that makes pool = 100 for easy percentage math.
    // First read the cost total, then set retail per tire such that
    // retail * 4 = cost total + 100.
    const costText = rowValueByLabel('Cost total').replace(/[^0-9.]/g, '')
    const cost = Number(costText)
    expect(Number.isFinite(cost)).toBe(true)
    const retailPerTire = (cost + 100) / 4

    const retail = screen.getByPlaceholderText('optional')
    fireEvent.change(retail, { target: { value: String(retailPerTire) } })

    // Pool should be 100.00
    expect(rowValueByLabel('Pool (retail - cost)')).toContain('$100.00')
    // Splits 35 / 35 / 30 -> $35.00 / $35.00 / $30.00
    expect(rowValueByLabel('Alex share')).toContain('$35.00')
    expect(rowValueByLabel('DJ share')).toContain('$35.00')
    expect(rowValueByLabel('Kyle share')).toContain('$30.00')
  })

  it('shows the save helper note above the save button', async () => {
    render(<PayoutConfigPanel />)
    await waitFor(() => expect(getCfg).toHaveBeenCalled())
    expect(
      screen.getByText(/Preview uses the values in the form; saving writes them to meta\/payoutConfig\./i),
    ).toBeTruthy()
  })

  it('surfaces the update error message verbatim in the server error pane', async () => {
    updateCfg.mockRejectedValueOnce(new Error('splits must sum to 1'))
    const { container } = render(<PayoutConfigPanel />)
    await waitFor(() => expect(getCfg).toHaveBeenCalled())
    const submit = screen.getByRole('button', { name: /save payout config/i })
    fireEvent.click(submit)
    await waitFor(() => expect(updateCfg).toHaveBeenCalled())
    await waitFor(() => {
      expect(within(container).getByText(/splits must sum to 1/)).toBeTruthy()
    })
  })
})
