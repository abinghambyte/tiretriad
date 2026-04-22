/** @vitest-environment jsdom */

globalThis.IS_REACT_ACT_ENVIRONMENT = true

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { HiddenGemsSurface } from './HiddenGemsSurface.jsx'

afterEach(() => {
  cleanup()
})

const now = Date.now()

const gems = [
  {
    id: 't1',
    sku: 'AAA',
    description: 'All-season 205/55R16',
    platformCount: 1,
    platforms: ['ebay'],
    lastPostedAt: now - 60_000,
  },
  {
    id: 't2',
    sku: 'BBB',
    description: 'Winter 225/45R17',
    platformCount: 0,
    platforms: [],
    lastPostedAt: null,
  },
]

describe('HiddenGemsSurface', () => {
  it('renders the section label and the first gem row', () => {
    render(<HiddenGemsSurface gems={gems} />)
    expect(screen.getByText(/hidden gems/i)).toBeTruthy()
    expect(screen.getByText('AAA')).toBeTruthy()
    expect(screen.getByText('All-season 205/55R16')).toBeTruthy()
  })

  it('shows "never" when lastPostedAt is null', () => {
    const singleNull = [{ id: 'x1', sku: 'X1', description: 'No date', platforms: [], lastPostedAt: null }]
    render(<HiddenGemsSurface gems={singleNull} />)
    expect(screen.getByText('never')).toBeTruthy()
  })

  it('renders the empty-state copy when gems is empty', () => {
    render(<HiddenGemsSurface gems={[]} />)
    expect(screen.getByText(/nothing hidden/i)).toBeTruthy()
  })

  it('renders "Show more" when more than 1 gem exists', () => {
    const many = Array.from({ length: 8 }, (_, i) => ({
      id: `t${i}`,
      sku: `SKU${i}`,
      description: `desc ${i}`,
      platformCount: 0,
      platforms: [],
      lastPostedAt: null,
    }))
    render(<HiddenGemsSurface gems={many} />)
    expect(screen.getByText(/show more/i)).toBeTruthy()
  })

  it('opens modal with all gems when Show more is clicked', () => {
    const many = Array.from({ length: 3 }, (_, i) => ({
      id: `t${i}`,
      sku: `SKU${i}`,
      description: `desc ${i}`,
      platformCount: 0,
      platforms: [],
      lastPostedAt: null,
    }))
    render(<HiddenGemsSurface gems={many} />)
    fireEvent.click(screen.getByText(/show more/i))
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByText('Hidden Gems (3)')).toBeTruthy()
  })

  it('invokes onPost with the gem id when Post it is clicked', () => {
    const onPost = vi.fn()
    render(<HiddenGemsSurface gems={gems} onPost={onPost} />)
    const buttons = screen.getAllByRole('button', { name: /post it/i })
    fireEvent.click(buttons[0])
    expect(onPost).toHaveBeenCalledWith('t1')
  })

  it('modal closes on Escape key', () => {
    const many = Array.from({ length: 3 }, (_, i) => ({
      id: `t${i}`,
      sku: `SKU${i}`,
      description: `desc ${i}`,
      platforms: [],
      lastPostedAt: null,
    }))
    render(<HiddenGemsSurface gems={many} />)
    fireEvent.click(screen.getByText(/show more/i))
    expect(screen.getByRole('dialog')).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('renders missing-platform chips for platforms not in the gem', () => {
    render(<HiddenGemsSurface gems={[gems[0]]} />)
    // gem has ebay, so Marketplace and Craigslist should appear as chips
    expect(screen.getByText('Marketplace')).toBeTruthy()
    expect(screen.getByText('Craigslist')).toBeTruthy()
  })
})
