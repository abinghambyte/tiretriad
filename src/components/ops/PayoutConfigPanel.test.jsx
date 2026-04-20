/** @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
})
