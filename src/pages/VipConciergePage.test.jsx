/** @vitest-environment jsdom */

globalThis.IS_REACT_ACT_ENVIRONMENT = true

import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const { verifyImpl } = vi.hoisted(() => ({
  verifyImpl: vi.fn(),
}))

vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn(() => verifyImpl),
}))

vi.mock('../firebase/config', () => ({
  functions: {},
}))

import { VipConciergePage } from './VipConciergePage.jsx'

function renderVip(initialPath = '/vip/tok-abc') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/vip/:token" element={<VipConciergePage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('VipConciergePage', () => {
  beforeEach(() => {
    verifyImpl.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it('shows verifying then welcome card on success', async () => {
    verifyImpl.mockResolvedValue({
      data: {
        ok: true,
        account: { id: 'acc-1', displayName: 'Acme Fleet', tier: 'platinum' },
      },
    })

    renderVip()

    expect(screen.getByText('Verifying VIP access…')).toBeTruthy()

    await waitFor(() => {
      expect(screen.getByText('Welcome to VIP concierge')).toBeTruthy()
    })
    expect(screen.getByText('Acme Fleet')).toBeTruthy()
    expect(verifyImpl).toHaveBeenCalledWith({ token: 'tok-abc' })
  })

  it('shows invalid card when verify fails', async () => {
    verifyImpl.mockRejectedValue(new Error('expired'))

    renderVip()

    await waitFor(() => {
      expect(screen.getByText(/This VIP link is no longer valid/)).toBeTruthy()
    })
    expect(
      screen.getByText('Contact support if you received this link and it should still work.', {
        exact: false,
      }),
    ).toBeTruthy()
  })

  it('starts chat after button click on success', async () => {
    verifyImpl.mockResolvedValue({
      data: {
        ok: true,
        account: { id: 'acc-1', displayName: 'Co', tier: 'standard' },
      },
    })

    renderVip()

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'Start chat' }).length).toBeGreaterThan(0)
    })
    fireEvent.click(screen.getAllByRole('button', { name: 'Start chat' })[0])
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Start chat' })).toBeNull()
    })
  })
})
