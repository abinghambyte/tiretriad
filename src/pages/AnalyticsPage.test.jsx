/** @vitest-environment jsdom */

globalThis.IS_REACT_ACT_ENVIRONMENT = true

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const { useTiresMock, useUserProfileMock } = vi.hoisted(() => ({
  useTiresMock: vi.fn(),
  useUserProfileMock: vi.fn(),
}))

vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn(() => vi.fn()),
}))

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn().mockResolvedValue({ exists: () => false }),
  getDocs: vi.fn().mockResolvedValue({ docs: [] }),
  limit: vi.fn(),
  onSnapshot: vi.fn(() => () => undefined),
  orderBy: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
}))

vi.mock('../firebase/config', () => ({
  db: {},
  functions: {},
}))

vi.mock('../hooks/useTires.js', () => ({
  useTires: () => useTiresMock(),
}))

vi.mock('../hooks/useUserProfile.js', () => ({
  useUserProfile: () => useUserProfileMock(),
}))

// Avoid rendering WallPage's heavy guts in this unit; it is not the subject.
vi.mock('./WallPage', () => ({
  WallPage: () => <div data-testid="wall-embed" />,
}))

import { AnalyticsPage } from './AnalyticsPage.jsx'

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/analytics" element={<AnalyticsPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  useTiresMock.mockReset()
  useUserProfileMock.mockReset()
  useTiresMock.mockReturnValue({ tires: [], loading: false, error: null })
})

afterEach(() => {
  cleanup()
})

describe('AnalyticsPage oversight tabs', () => {
  it('does not show admin-only tabs for a non-admin', () => {
    useUserProfileMock.mockReturnValue({ profile: { role: 'viewer' }, loading: false })
    renderAt('/analytics')
    expect(screen.queryByText('Verification queue')).toBeNull()
    expect(screen.queryByText('Margin archive')).toBeNull()
  })

  // The verification-queue admin tab was a read-only mirror of /my-queue and
  // was removed (audit recommendation). Admins access the live queue via the
  // top-nav "My Queue" entry. The route still falls back to the default tab
  // when verification-queue is requested directly.
  it('falls back to the default wall tab when an admin deep-links to the removed verification-queue tab', () => {
    useUserProfileMock.mockReturnValue({ profile: { role: 'admin' }, loading: false })
    renderAt('/analytics?tab=verification-queue')
    expect(screen.queryByText('Live view of pending verification items. Resolve from /my-queue.')).toBeNull()
    expect(screen.getByTestId('wall-embed')).toBeTruthy()
  })

  it('renders margin-archive tab with search filter for admins', async () => {
    useUserProfileMock.mockReturnValue({ profile: { role: 'admin' }, loading: false })
    useTiresMock.mockReturnValue({
      tires: [
        {
          id: 't1',
          mspn: 'ARCH1',
          description: 'Archived tire one',
          marginConfirmed: true,
          price: 100,
          priceIntel: { retailPrice: 110 },
          researchQueue: { at: 100, resolvedAt: 200, resolvedBy: 'alex' },
        },
        {
          id: 't2',
          mspn: 'KEEP1',
          description: 'Not archived',
          price: 100,
          priceIntel: { retailPrice: 130 },
        },
      ],
      loading: false,
      error: null,
    })
    renderAt('/analytics?tab=margin-archive')
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search MSPN or description')).toBeTruthy()
    })
    expect(screen.getByText('ARCH1')).toBeTruthy()
    expect(screen.queryByText('KEEP1')).toBeNull()

    fireEvent.change(screen.getByPlaceholderText('Search MSPN or description'), {
      target: { value: 'zzzz' },
    })
    expect(screen.queryByText('ARCH1')).toBeNull()
    expect(screen.getByText('No archived tires.')).toBeTruthy()
  })

  it('falls back to the default wall tab when a non-admin deep-links to an admin tab', () => {
    useUserProfileMock.mockReturnValue({ profile: { role: 'viewer' }, loading: false })
    renderAt('/analytics?tab=verification-queue')
    expect(screen.queryByText('Live view of pending verification items. Resolve from /my-queue.')).toBeNull()
    expect(screen.getByTestId('wall-embed')).toBeTruthy()
  })
})
