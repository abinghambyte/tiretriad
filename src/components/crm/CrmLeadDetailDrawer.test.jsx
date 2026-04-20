/** @vitest-environment jsdom */

globalThis.IS_REACT_ACT_ENVIRONMENT = true

import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { CrmLeadDetailDrawer } from './CrmLeadDetailDrawer.jsx'

describe('CrmLeadDetailDrawer', () => {
  const mockLead = {
    id: 'lead-1',
    businessName: 'Acme Trucking',
    source: 'sinch_chat',
    createdAt: { toDate: () => new Date(Date.now() - 60_000) },
    contactName: 'Jordan Lee',
    phone: '3035550100',
    email: 'jordan@example.com',
    inquiry: 'Need all-position tires for 5 tractors ASAP.',
    pageUrl: 'https://example.com/pricing?utm=chat',
    referrer: 'https://google.com/',
    sinchConversationId: 'conv-abc-123',
    convertedToAccountId: null,
  }

  it('renders lead blocks with expected text', () => {
    const onClose = vi.fn()
    const onConvert = vi.fn()

    render(
      <CrmLeadDetailDrawer lead={mockLead} onClose={onClose} canEdit onConvertToVip={onConvert} />,
    )

    expect(screen.getByRole('heading', { level: 2, name: 'Acme Trucking' })).toBeTruthy()
    expect(screen.getByText('Sinch chat')).toBeTruthy()
    expect(screen.getByText('Jordan Lee')).toBeTruthy()
    expect(screen.getByText('3035550100')).toBeTruthy()
    expect(screen.getByText('jordan@example.com')).toBeTruthy()
    expect(
      screen.getByText('Need all-position tires for 5 tractors ASAP.', { exact: false }),
    ).toBeTruthy()
    expect(screen.getByTitle('https://example.com/pricing?utm=chat')).toBeTruthy()
    expect(screen.getByTitle('https://google.com/')).toBeTruthy()
    expect(screen.getByText('conv-abc-123')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Convert to VIP client' }))
    expect(onConvert).toHaveBeenCalledWith(mockLead)
  })
})
