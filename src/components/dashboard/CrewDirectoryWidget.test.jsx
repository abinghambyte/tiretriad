/** @vitest-environment jsdom */

globalThis.IS_REACT_ACT_ENVIRONMENT = true

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { CrewDirectoryWidget } from './CrewDirectoryWidget.jsx'

afterEach(() => {
  cleanup()
})

const now = Date.now()

const crew = {
  users: [
    { id: 'dj', data: { firstName: 'DJ', lastName: 'Mechanic', role: 'mechanic' } },
    { id: 'kyle', data: { firstName: 'Kyle', lastName: 'Sourcer', role: 'supplier' } },
  ],
  hasMore: true,
}

const crewSignals = {
  dj: { lastSeenAt: now - 10_000, wipCount: 3, todayCompletions: 5, streakDays: 4 },
  kyle: { lastSeenAt: now - 3 * 60 * 60 * 1000, wipCount: 0, todayCompletions: 0, streakDays: 0 },
}

describe('CrewDirectoryWidget', () => {
  it('renders name, WIP badge, today count and streak for each user', () => {
    render(<CrewDirectoryWidget crew={crew} crewSignals={crewSignals} loading={false} />)
    expect(screen.getByText('DJ Mechanic')).toBeTruthy()
    expect(screen.getByText('Kyle Sourcer')).toBeTruthy()
    expect(screen.getByText('3')).toBeTruthy()
    expect(screen.getByText('5 today')).toBeTruthy()
    expect(screen.getByText('4 day streak')).toBeTruthy()
  })

  it('marks recent lastSeenAt as online', () => {
    const { container } = render(
      <CrewDirectoryWidget crew={crew} crewSignals={crewSignals} loading={false} />,
    )
    const dots = container.querySelectorAll('[aria-label="online"]')
    expect(dots.length).toBe(1)
  })

  it('renders skeleton rows when loading', () => {
    const { container } = render(
      <CrewDirectoryWidget crew={{ users: [], hasMore: false }} crewSignals={{}} loading />,
    )
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
  })

  it('renders empty-state copy when users is empty and not loading', () => {
    render(
      <CrewDirectoryWidget
        crew={{ users: [], hasMore: false }}
        crewSignals={{}}
        loading={false}
      />,
    )
    expect(screen.getByText(/no crew rows loaded/i)).toBeTruthy()
  })
})
