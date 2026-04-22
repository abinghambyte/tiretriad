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
  it('renders the section label and each gem row', () => {
    render(<HiddenGemsSurface gems={gems} />)
    expect(screen.getByText(/hidden gems/i)).toBeTruthy()
    expect(screen.getByText('AAA')).toBeTruthy()
    expect(screen.getByText('BBB')).toBeTruthy()
    expect(screen.getByText('All-season 205/55R16')).toBeTruthy()
  })

  it('shows "never" when lastPostedAt is null', () => {
    render(<HiddenGemsSurface gems={gems} />)
    expect(screen.getByText('never')).toBeTruthy()
  })

  it('renders the empty-state copy when gems is empty', () => {
    render(<HiddenGemsSurface gems={[]} />)
    expect(screen.getByText(/nothing hidden/i)).toBeTruthy()
  })

  it('renders "View all N" when more than 5 gems exist', () => {
    const many = Array.from({ length: 8 }, (_, i) => ({
      id: `t${i}`,
      sku: `SKU${i}`,
      description: `desc ${i}`,
      platformCount: 0,
      platforms: [],
      lastPostedAt: null,
    }))
    render(<HiddenGemsSurface gems={many} />)
    expect(screen.getByText(/view all 8/i)).toBeTruthy()
  })

  it('invokes onPost with the gem id when Post it is clicked', () => {
    const onPost = vi.fn()
    render(<HiddenGemsSurface gems={gems} onPost={onPost} />)
    const buttons = screen.getAllByRole('button', { name: /post it/i })
    fireEvent.click(buttons[0])
    expect(onPost).toHaveBeenCalledWith('t1')
  })

  it('invokes onPost with __all__ when View all is clicked', () => {
    const onPost = vi.fn()
    const many = Array.from({ length: 7 }, (_, i) => ({
      id: `t${i}`,
      sku: `SKU${i}`,
      description: `desc ${i}`,
      platformCount: 0,
      platforms: [],
      lastPostedAt: null,
    }))
    render(<HiddenGemsSurface gems={many} onPost={onPost} />)
    fireEvent.click(screen.getByText(/view all 7/i))
    expect(onPost).toHaveBeenCalledWith('__all__')
  })

  it('renders missing-platform chips for platforms not in the gem', () => {
    render(<HiddenGemsSurface gems={[gems[0]]} />)
    // gem has ebay, so Marketplace and Craigslist should appear as chips
    expect(screen.getByText('Marketplace')).toBeTruthy()
    expect(screen.getByText('Craigslist')).toBeTruthy()
  })
})
