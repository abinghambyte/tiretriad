/** @vitest-environment jsdom */
import { describe, expect, it, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { TireDetailHeader } from './TireDetailHeader.jsx'
import { ToastProvider } from '../../providers/ToastProvider.jsx'

afterEach(cleanup)

const baseTire = {
  id: '12345',
  mspn: '12345',
  brand: 'MICHELIN',
  description: 'P255/55R18 109V Pilot Sport AS 4',
  tread: 'Pilot Sport AS 4',
  category: 'passenger',
  lr: '',
  derivedUseTags: ['XL'],
}

function withRouter(ui) {
  return (
    <ToastProvider>
      <MemoryRouter>{ui}</MemoryRouter>
    </ToastProvider>
  )
}

describe('TireDetailHeader', () => {
  it('renders the brand and MSPN', () => {
    const { container } = render(withRouter(<TireDetailHeader tire={baseTire} backHref="/tires" />))
    expect(container.textContent).toContain('MICHELIN')
    expect(container.textContent).toContain('12345')
  })

  it('renders the tread family', () => {
    const { container } = render(withRouter(<TireDetailHeader tire={baseTire} backHref="/tires" />))
    expect(container.textContent).toContain('Pilot Sport AS 4')
  })

  it('renders sidewall pills from derivedUseTags filtered to XL/MS', () => {
    const tire = { ...baseTire, derivedUseTags: ['XL', 'MS', 'AT'] }
    const { container } = render(withRouter(<TireDetailHeader tire={tire} backHref="/tires" />))
    expect(container.querySelector('[data-pill="XL"]')).not.toBeNull()
    expect(container.querySelector('[data-pill="MS"]')).not.toBeNull()
    // AT is not a sidewall pill, should not render as a pill
    expect(container.querySelector('[data-pill="AT"]')).toBeNull()
  })

  it('renders the back link with the provided href', () => {
    const { container } = render(withRouter(<TireDetailHeader tire={baseTire} backHref="/tires?cat=passenger&highlight=12345" />))
    const link = container.querySelector('a')
    expect(link).not.toBeNull()
    expect(link.getAttribute('href')).toBe('/tires?cat=passenger&highlight=12345')
  })

  it('shows -- when LR is empty', () => {
    const { container } = render(withRouter(<TireDetailHeader tire={baseTire} backHref="/tires" />))
    expect(container.textContent).toMatch(/LR.*--/)
  })

  it('shows the LR letter when present', () => {
    const tire = { ...baseTire, lr: 'E' }
    const { container } = render(withRouter(<TireDetailHeader tire={tire} backHref="/tires" />))
    expect(container.textContent).toMatch(/LR.*E/)
  })
})
