/** @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({})),
  getDoc: vi.fn(),
}))
vi.mock('../firebase/config', () => ({ db: {} }))
vi.mock('../hooks/useTires', () => ({ useTires: () => ({ tires: [], loading: false }) }))

import { getDoc } from 'firebase/firestore'
import { TireDetailPage } from './TireDetailPage.jsx'
import { ToastProvider } from '../components/providers/ToastProvider.jsx'

afterEach(cleanup)

beforeEach(() => {
  getDoc.mockReset()
})

function withRouter(mspn) {
  return (
    <ToastProvider>
      <MemoryRouter initialEntries={[`/tires/${mspn}`]}>
        <Routes>
          <Route path="/tires/:mspn" element={<TireDetailPage />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>
  )
}

describe('TireDetailPage', () => {
  it('renders all sections on happy path', async () => {
    getDoc
      .mockResolvedValueOnce({
        exists: () => true,
        id: '12345',
        data: () => ({
          mspn: '12345',
          brand: 'MICHELIN',
          description: 'P255/55R18 109V Pilot Sport AS 4',
          tread: 'Pilot Sport AS 4',
          category: 'passenger',
          price: 100,
          fet: 0,
          priceIntel: { retailPrice: 200, sources: [{ source: 'gemini_retail_search' }] },
          platformListings: {},
        }),
      })
      .mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ records: { '12345': { fet: 0, price: 100, brand: 'MICHELIN', description: '...', lr: '', tread: '...' } }, sourceReportDate: '2026-04-29' }),
      })
    const { container } = render(withRouter('12345'))
    await waitFor(() => expect(container.textContent).toContain('Pricing'))
    expect(container.textContent).toContain('MICHELIN')
    expect(container.textContent).toContain('12345')
    expect(container.textContent).toContain('Platform listings')
    expect(container.textContent).toContain('Michelin eFleet')
  })

  it('renders not-found when tire doc missing', async () => {
    getDoc
      .mockResolvedValueOnce({ exists: () => false })
      .mockResolvedValueOnce({ exists: () => false })
    const { container } = render(withRouter('99999'))
    await waitFor(() => expect(container.textContent).toContain('not found'))
    expect(container.textContent).toContain('99999')
  })

  it('renders without eFleet provenance when categoryMap missing', async () => {
    getDoc
      .mockResolvedValueOnce({
        exists: () => true,
        id: '12345',
        data: () => ({
          mspn: '12345',
          brand: 'MICHELIN',
          description: 'P255/55R18 109V',
          price: 100,
          priceIntel: {},
          platformListings: {},
        }),
      })
      .mockResolvedValueOnce({ exists: () => false })
    const { container } = render(withRouter('12345'))
    await waitFor(() => expect(container.textContent).toContain('Not from a known eFleet import'))
  })
})
