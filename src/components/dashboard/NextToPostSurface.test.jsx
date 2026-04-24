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

const BASE_BREAKDOWN = {
  daysSinceLastListed: { raw: 1, weighted: 0.4 },
  daysSincePriceChange: { raw: 1, weighted: 0.4 },
  velocity: { raw: 1, weighted: 1.5 },
  margin: { raw: 0.1, weighted: 14 },
  crossPost: { raw: 0, weighted: 0 },
}

function filler(id) {
  return {
    id,
    sku: `FILL-${id}`,
    description: `Filler tire ${id}`,
    missingPlatformCount: 0,
    listedEbay: true,
    listedMarketplace: true,
    listedCraigslist: true,
    kyleFrozen: false,
    rankScore: 1,
    signalBreakdown: BASE_BREAKDOWN,
  }
}

// 2 real tires + 5 fillers. PREVIEW_COUNT = 5, so fillers push remaining > 0
// and the "Show more" button renders; the preview still shows MICH first.
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
        daysSinceLastListed: { raw: 12, weighted: 4.8 },
        daysSincePriceChange: { raw: 44, weighted: 17.6 },
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
        daysSinceLastListed: { raw: 3, weighted: 1.2 },
        daysSincePriceChange: { raw: 10, weighted: 4 },
        velocity: { raw: 10, weighted: 15 },
        margin: { raw: 0.4, weighted: 56 },
        crossPost: { raw: 1, weighted: 0.8 },
      },
    },
    filler('f3'),
    filler('f4'),
    filler('f5'),
    filler('f6'),
    filler('f7'),
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

  it('renders the top-ranked tire in the card preview and hides overflow', () => {
    renderSurface()
    expect(screen.getByText('MICH-265-70-17')).toBeTruthy()
    // f7 is the 7th tire, beyond the 5-row preview - should only appear
    // once the Show more modal is opened.
    expect(screen.queryByText('FILL-f7')).toBeNull()
  })

  it('renders empty state when ranked is empty', () => {
    renderSurface({ ranked: [] })
    expect(screen.getByText(/nothing to post/i)).toBeTruthy()
  })

  it('mode toggle persists selection to localStorage', () => {
    renderSurface()
    fireEvent.click(screen.getByRole('tab', { name: /coverage/i }))
    expect(window.localStorage.getItem('skedaddle-advisor-mode-v1')).toBe('COVERAGE')
  })

  it('"Show more" opens the modal with full ranked list', () => {
    renderSurface()
    fireEvent.click(screen.getByRole('button', { name: /show more/i }))
    expect(screen.getByRole('dialog', { name: /next to post/i })).toBeTruthy()
    // f7 lives beyond the preview, so seeing it proves the modal has the
    // overflow rows and isn't just re-rendering the preview.
    expect(screen.getByText('FILL-f7')).toBeTruthy()
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
    await waitFor(() => expect(narrateMock).toHaveBeenCalledWith('t1', expect.any(String)))
    await waitFor(() => expect(screen.getByText('Aging fast.')).toBeTruthy())
  })
})
