// src/components/dashboard/NextToPostSurface.test.jsx
/** @vitest-environment jsdom */

globalThis.IS_REACT_ACT_ENVIRONMENT = true

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { NextToPostSurface } from './NextToPostSurface.jsx'

const narrateMock = vi.fn()

vi.mock('../../hooks/useAdvisorNarrate.js', () => ({
  useAdvisorNarrate: () => narrateMock,
}))

function ranked() {
  return [
    {
      id: 't1',
      sku: 'MICH-265-70-17',
      description: 'Michelin Agilis 265/70R17 E',
      missingPlatformCount: 2,
      listedEbay: false,
      listedMarketplace: true,
      listedCraigslist: false,
      kyleFrozen: false,
      rankScore: 174,
      signalBreakdown: {
        age: { raw: 44, weighted: 66 },
        velocity: { raw: 5.5, weighted: 8.25 },
        margin: { raw: 0.32, weighted: 44.8 },
        crossPost: { raw: 2, weighted: 1.6 },
      },
    },
    {
      id: 't2',
      sku: 'GY-235-75-15',
      description: 'Goodyear Wrangler 235/75R15 D',
      missingPlatformCount: 1,
      listedEbay: true,
      listedMarketplace: false,
      listedCraigslist: true,
      kyleFrozen: true,
      rankScore: 120,
      signalBreakdown: {
        age: { raw: 10, weighted: 15 },
        velocity: { raw: 10, weighted: 15 },
        margin: { raw: 0.4, weighted: 56 },
        crossPost: { raw: 1, weighted: 0.8 },
      },
    },
  ]
}

function renderSurface(props = {}) {
  return render(
    <MemoryRouter>
      <NextToPostSurface ranked={ranked()} loading={false} onPost={vi.fn()} {...props} />
    </MemoryRouter>,
  )
}

describe('NextToPostSurface', () => {
  beforeEach(() => {
    narrateMock.mockReset()
    window.localStorage.clear()
  })

  afterEach(() => {
    cleanup()
    window.localStorage.clear()
  })

  it('renders the top-ranked tire in the card preview', () => {
    renderSurface()
    expect(screen.getByText('MICH-265-70-17')).toBeTruthy()
    expect(screen.queryByText('GY-235-75-15')).toBeNull()
  })

  it('renders empty state when ranked is empty', () => {
    renderSurface({ ranked: [] })
    expect(screen.getByText(/nothing to post/i)).toBeTruthy()
  })

  it('mode toggle persists selection to localStorage', () => {
    renderSurface()
    fireEvent.click(screen.getByRole('tab', { name: /clearance/i }))
    expect(window.localStorage.getItem('skedaddle-advisor-mode-v1')).toBe('CLEARANCE')
  })

  it('"Show more" opens the modal with full ranked list', () => {
    renderSurface()
    fireEvent.click(screen.getByRole('button', { name: /show more/i }))
    expect(screen.getByRole('dialog', { name: /next to post/i })).toBeTruthy()
    expect(screen.getByText('GY-235-75-15')).toBeTruthy()
  })

  it('Escape closes the modal', () => {
    renderSurface()
    fireEvent.click(screen.getByRole('button', { name: /show more/i }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('expanding a row in the modal calls advisorNarrate and renders narrative', async () => {
    narrateMock.mockResolvedValue({ narrative: 'Aging fast.', shadowFlag: '' })
    renderSurface()
    fireEvent.click(screen.getByRole('button', { name: /show more/i }))
    fireEvent.click(screen.getAllByRole('button', { name: /why/i })[0])
    await waitFor(() =>
      expect(narrateMock).toHaveBeenCalledWith('t1', expect.any(String), expect.objectContaining({ id: 't1' })),
    )
    await waitFor(() => expect(screen.getByText('Aging fast.')).toBeTruthy())
  })
})
