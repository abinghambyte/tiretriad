/** @vitest-environment jsdom */
import { describe, expect, it, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { TireRelatedSizes } from './TireRelatedSizes.jsx'

afterEach(cleanup)

const mkTire = (overrides) => ({
  id: '12345',
  mspn: '12345',
  brand: 'MICHELIN',
  description: 'P255/55R18 109V',
  tread: 'Pilot Sport AS 4',
  price: 200,
  ...overrides,
})

function withRouter(ui) {
  return <MemoryRouter>{ui}</MemoryRouter>
}

describe('TireRelatedSizes', () => {
  it('sorts by buy ascending', () => {
    const current = mkTire({ id: 'A', mspn: 'A' })
    const related = [
      mkTire({ id: 'B', mspn: 'B', price: 300 }),
      mkTire({ id: 'C', mspn: 'C', price: 100 }),
      mkTire({ id: 'D', mspn: 'D', price: 200 }),
    ]
    const { container } = render(withRouter(<TireRelatedSizes currentTire={current} relatedTires={related} />))
    const cards = container.querySelectorAll('[data-related-card]')
    expect(cards[0].getAttribute('data-mspn')).toBe('C')
    expect(cards[1].getAttribute('data-mspn')).toBe('D')
    expect(cards[2].getAttribute('data-mspn')).toBe('B')
  })

  it('each card links to its detail page', () => {
    const current = mkTire({ id: 'A', mspn: 'A' })
    const related = [mkTire({ id: 'B', mspn: 'B', price: 100 })]
    const { container } = render(withRouter(<TireRelatedSizes currentTire={current} relatedTires={related} />))
    const link = container.querySelector('a[data-related-card]')
    expect(link.getAttribute('href')).toBe('/tires/B')
  })

  it('renders the count in the heading', () => {
    const current = mkTire({ id: 'A', mspn: 'A' })
    const related = [mkTire({ id: 'B', mspn: 'B' }), mkTire({ id: 'C', mspn: 'C' })]
    const { container } = render(withRouter(<TireRelatedSizes currentTire={current} relatedTires={related} />))
    expect(container.textContent).toMatch(/2/)
    expect(container.textContent).toMatch(/Pilot Sport AS 4/)
  })
})
