// src/components/tires/ListingAdvisorPanel.test.jsx
/** @vitest-environment jsdom */

globalThis.IS_REACT_ACT_ENVIRONMENT = true

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ListingAdvisorPanel } from './ListingAdvisorPanel.jsx'

const narrateMock = vi.fn()

vi.mock('../../hooks/useAdvisorNarrate.js', () => ({
  useAdvisorNarrate: () => narrateMock,
}))

function rankedFixture() {
  return [
    {
      id: 't1',
      rankScore: 174,
      missingPlatformCount: 2,
      kyleFrozen: false,
      signalBreakdown: {
        age: { raw: 44, weighted: 66 },
        velocity: { raw: 5.5, weighted: 8.25 },
        margin: { raw: 0.32, weighted: 44.8 },
        crossPost: { raw: 2, weighted: 1.6 },
      },
    },
  ]
}

describe('ListingAdvisorPanel', () => {
  beforeEach(() => {
    narrateMock.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders rank + signal strip without calling narrate on mount', () => {
    render(<ListingAdvisorPanel tireId="t1" ranked={rankedFixture()} mode="VELOCITY" />)
    expect(screen.getByText(/Rank #1 in Velocity mode/)).toBeTruthy()
    expect(screen.getByText(/Missing 2 platform\(s\)/)).toBeTruthy()
    expect(narrateMock).not.toHaveBeenCalled()
  })

  it('fires narrate only when the user clicks Why?', async () => {
    narrateMock.mockResolvedValue({ narrative: 'Because reasons.', shadowFlag: null })
    render(<ListingAdvisorPanel tireId="t1" ranked={rankedFixture()} mode="VELOCITY" />)

    expect(narrateMock).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /why/i }))
    await waitFor(() => expect(narrateMock).toHaveBeenCalledTimes(1))
    expect(narrateMock).toHaveBeenCalledWith('t1', 'VELOCITY')
    expect(await screen.findByText('Because reasons.')).toBeTruthy()
  })

  it('does not refetch when the panel is reopened', async () => {
    narrateMock.mockResolvedValue({ narrative: 'Cached.', shadowFlag: null })
    render(<ListingAdvisorPanel tireId="t1" ranked={rankedFixture()} mode="VELOCITY" />)

    const btn = screen.getByRole('button', { name: /why/i })
    fireEvent.click(btn) // open
    await waitFor(() => expect(narrateMock).toHaveBeenCalledTimes(1))
    fireEvent.click(btn) // close
    fireEvent.click(btn) // reopen
    // Still only the first call; the cached result renders again.
    expect(narrateMock).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Cached.')).toBeTruthy()
  })

  it('renders a missing-tire message without calling narrate', () => {
    render(<ListingAdvisorPanel tireId="unknown" ranked={rankedFixture()} mode="VELOCITY" />)
    expect(screen.getByText(/Not ranked/)).toBeTruthy()
    expect(narrateMock).not.toHaveBeenCalled()
  })
})
