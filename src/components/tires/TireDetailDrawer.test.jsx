// src/components/tires/TireDetailDrawer.test.jsx
/** @vitest-environment jsdom */

globalThis.IS_REACT_ACT_ENVIRONMENT = true

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { TireDetailDrawer } from './TireDetailDrawer.jsx'

function tire() {
  const dayMs = 24 * 60 * 60 * 1000
  const now = Date.now()
  return {
    id: 'mspn-1',
    mspn: '12345',
    brand: 'Michelin',
    tread: 'Agilis',
    description: 'LT265/70R17 Agilis LRE',
    lr: 'E',
    price: 180,
    mountCost: 20,
    deliveryCost: 10,
    otherCost: 5,
    doNotList: false,
    adminNotes: '',
    priceIntel: {
      retailPrice: 287,
      activeBuyPrice: 175,
      sources: [{ at: { toMillis: () => now - 3 * dayMs }, label: 'Slack' }],
    },
    platformListings: {
      facebook: { status: 'active', lastPostedAt: { toMillis: () => now - 2 * dayMs } },
      offerup: { status: 'stale', lastPostedAt: { toMillis: () => now - 20 * dayMs } },
      craigslist: {},
    },
  }
}

function recentOrders() {
  const dayMs = 24 * 60 * 60 * 1000
  const now = Date.now()
  return [
    { id: 'o1', mspn: '12345', status: 'completed', quantity: 2,
      createdAt: { toMillis: () => now - 10 * dayMs }, completedAt: { toMillis: () => now - 3 * dayMs } },
  ]
}

describe('TireDetailDrawer', () => {
  beforeEach(() => {})
  afterEach(() => cleanup())

  it('renders nothing when tire is null', () => {
    const { container } = render(
      <TireDetailDrawer tire={null} orders={[]} onClose={() => {}} onSave={async () => {}} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders header, pricing, platforms, and orders sections', () => {
    render(<TireDetailDrawer tire={tire()} orders={recentOrders()} onClose={() => {}} onSave={async () => {}} />)
    // Header: mspn + description present
    expect(screen.getByText('12345')).toBeTruthy()
    expect(screen.getByText(/Agilis LRE/)).toBeTruthy()
    // Pricing: retail $287 shown
    expect(screen.getByText(/\$287/)).toBeTruthy()
    // Platforms: Facebook + OfferUp + Craigslist labels
    expect(screen.getByText(/Facebook/i)).toBeTruthy()
    expect(screen.getByText(/OfferUp/i)).toBeTruthy()
    expect(screen.getByText(/Craigslist/i)).toBeTruthy()
    // Orders: one row
    expect(screen.getByText(/1 recent order/i)).toBeTruthy()
  })

  it('Escape closes the drawer', () => {
    const onClose = vi.fn()
    render(<TireDetailDrawer tire={tire()} orders={[]} onClose={onClose} onSave={async () => {}} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('Save writes doNotList + adminNotes patch', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(<TireDetailDrawer tire={tire()} orders={[]} onClose={() => {}} onSave={onSave} />)

    fireEvent.click(screen.getByRole('checkbox', { name: /do not list/i }))
    fireEvent.change(screen.getByRole('textbox', { name: /notes/i }), {
      target: { value: 'Holds price well.' },
    })
    fireEvent.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({ doNotList: true, adminNotes: 'Holds price well.' }),
    )
  })

  it('Save button is disabled while no changes', () => {
    render(<TireDetailDrawer tire={tire()} orders={[]} onClose={() => {}} onSave={async () => {}} />)
    const btn = screen.getByRole('button', { name: /save/i })
    expect(btn.disabled).toBe(true)
  })
})
