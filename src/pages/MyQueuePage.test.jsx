/** @vitest-environment jsdom */

globalThis.IS_REACT_ACT_ENVIRONMENT = true

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const { resolveImpl, useTiresMock, useUserProfileMock, toastMock } = vi.hoisted(() => ({
  resolveImpl: vi.fn(),
  useTiresMock: vi.fn(),
  useUserProfileMock: vi.fn(),
  toastMock: vi.fn(),
}))

vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn(() => resolveImpl),
}))

vi.mock('../firebase/config.js', () => ({
  functions: {},
}))

vi.mock('../hooks/useTires.js', () => ({
  useTires: () => useTiresMock(),
}))

vi.mock('../hooks/useUserProfile.js', () => ({
  useUserProfile: () => useUserProfileMock(),
}))

vi.mock('../context/ToastContext.jsx', () => ({
  useToast: () => ({ toast: toastMock }),
}))

import { MyQueuePage } from './MyQueuePage.jsx'
import { selectOpenQueueRows } from '../utils/queueSelectors.js'

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/my-queue']}>
      <Routes>
        <Route path="/my-queue" element={<MyQueuePage />} />
        <Route path="/dashboard" element={<div>dashboard-fallback</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  resolveImpl.mockReset()
  useTiresMock.mockReset()
  useUserProfileMock.mockReset()
  toastMock.mockReset()
})

afterEach(() => {
  cleanup()
})

describe('MyQueuePage', () => {
  it('redirects a viewer to dashboard', () => {
    useUserProfileMock.mockReturnValue({ profile: { role: 'viewer' }, loading: false })
    useTiresMock.mockReturnValue({ tires: [], loading: false, error: null })

    renderPage()
    expect(screen.getByText('dashboard-fallback')).toBeTruthy()
  })

  it('redirects a field user to dashboard', () => {
    useUserProfileMock.mockReturnValue({ profile: { role: 'field' }, loading: false })
    useTiresMock.mockReturnValue({ tires: [], loading: false, error: null })

    renderPage()
    expect(screen.getByText('dashboard-fallback')).toBeTruthy()
  })

  it('allows sourcer and renders rows from fixture, newest first', () => {
    useUserProfileMock.mockReturnValue({ profile: { role: 'sourcer' }, loading: false })
    useTiresMock.mockReturnValue({
      tires: [
        {
          id: 't-older',
          mspn: 'OLD01',
          price: 100,
          priceIntel: { retailPrice: 120 },
          researchQueue: { at: 1000, reason: 'below-margin-floor', resolvedAt: null },
        },
        {
          id: 't-newer',
          mspn: 'NEW01',
          price: 100,
          priceIntel: { retailPrice: 130 },
          researchQueue: { at: 2000, reason: 'unutilized-needs-research', resolvedAt: null },
        },
        {
          id: 't-resolved',
          mspn: 'DONE1',
          researchQueue: { at: 3000, reason: 'below-margin-floor', resolvedAt: 3100 },
        },
      ],
      loading: false,
      error: null,
    })

    renderPage()
    const links = screen.getAllByRole('link')
    const mspnTexts = links.map((l) => l.textContent)
    expect(mspnTexts).toContain('NEW01')
    expect(mspnTexts).toContain('OLD01')
    expect(mspnTexts).not.toContain('DONE1')
    expect(mspnTexts.indexOf('NEW01')).toBeLessThan(mspnTexts.indexOf('OLD01'))
    expect(screen.getByText(/2 tires need verification/)).toBeTruthy()
  })

  it('allows admin access', () => {
    useUserProfileMock.mockReturnValue({ profile: { role: 'admin' }, loading: false })
    useTiresMock.mockReturnValue({ tires: [], loading: false, error: null })
    renderPage()
    expect(screen.getByText(/Queue is empty/)).toBeTruthy()
  })

  it('renders empty state when zero open rows', () => {
    useUserProfileMock.mockReturnValue({ profile: { role: 'sourcer' }, loading: false })
    useTiresMock.mockReturnValue({ tires: [], loading: false, error: null })
    renderPage()
    expect(screen.getByText('Queue is empty')).toBeTruthy()
    expect(
      screen.getByText(
        /New tires show up here after the nightly sweep or when teammates route them for research./,
      ),
    ).toBeTruthy()
  })

  it('shows spinner while tires loading', () => {
    useUserProfileMock.mockReturnValue({ profile: { role: 'sourcer' }, loading: false })
    useTiresMock.mockReturnValue({ tires: [], loading: true, error: null })
    const { container } = renderPage()
    expect(container.querySelector('svg.animate-spin')).not.toBeNull()
  })
})

describe('selectOpenQueueRows', () => {
  it('keeps only rows with researchQueue and null resolvedAt, sorted newest first', () => {
    const rows = selectOpenQueueRows([
      { id: 'a', researchQueue: { at: 1, resolvedAt: null } },
      { id: 'b', researchQueue: { at: 3, resolvedAt: null } },
      { id: 'c', researchQueue: { at: 2, resolvedAt: 9 } },
      { id: 'd' },
    ])
    expect(rows.map((r) => r.id)).toEqual(['b', 'a'])
  })
})
