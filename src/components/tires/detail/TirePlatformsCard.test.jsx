/** @vitest-environment jsdom */
import { describe, expect, it, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { TirePlatformsCard } from './TirePlatformsCard.jsx'

afterEach(cleanup)

describe('TirePlatformsCard', () => {
  it('renders all three platform names always', () => {
    const { container } = render(<TirePlatformsCard tire={{}} />)
    expect(container.textContent).toMatch(/Facebook/i)
    expect(container.textContent).toMatch(/OfferUp/i)
    expect(container.textContent).toMatch(/Craigslist/i)
  })

  it('shows "never posted" when no platformListings', () => {
    const { container } = render(<TirePlatformsCard tire={{}} />)
    const neverCount = container.textContent.match(/never posted/gi)?.length || 0
    expect(neverCount).toBeGreaterThanOrEqual(3)
  })

  it('shows relative time when lastPostedAt is set', () => {
    const tire = {
      platformListings: {
        facebook: { lastPostedAt: Date.now() - 5 * 86400000 },
      },
    }
    const { container } = render(<TirePlatformsCard tire={tire} />)
    expect(container.textContent).toMatch(/d ago|days ago/)
  })

  it('renders an active status pill when listingStatus returns active', () => {
    // Recent post
    const tire = {
      platformListings: {
        facebook: { lastPostedAt: Date.now() - 1000 * 60 * 60 },
      },
    }
    const { container } = render(<TirePlatformsCard tire={tire} />)
    const fbRow = [...container.querySelectorAll('[data-platform]')].find(
      (n) => n.getAttribute('data-platform') === 'facebook',
    )
    expect(fbRow).not.toBeNull()
    expect(fbRow.getAttribute('data-status')).toBe('active')
  })
})
