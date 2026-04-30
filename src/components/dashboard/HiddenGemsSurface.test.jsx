/** @vitest-environment jsdom */

globalThis.IS_REACT_ACT_ENVIRONMENT = true

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const toastMock = vi.fn()
vi.mock('../../context/ToastContext.jsx', () => ({
  useToast: () => ({ toast: toastMock }),
}))

import { HiddenGemsSurface } from './HiddenGemsSurface.jsx'

beforeEach(() => {
  toastMock.mockClear()
})

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

  it('renders up to 3 inline gem rows when list has 5 items', () => {
    const many = Array.from({ length: 5 }, (_, i) => ({
      id: `g${i}`,
      sku: `GEM${i}`,
      description: `Gem ${i}`,
      platforms: [],
      lastPostedAt: null,
    }))
    render(<HiddenGemsSurface gems={many} />)
    expect(screen.getAllByText(/^Gem \d$/).length).toBe(3)
  })

  it('renders "Show more" when more than 3 gems exist', () => {
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
    const many = Array.from({ length: 5 }, (_, i) => ({
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
    expect(screen.getByText('Hidden Gems (5)')).toBeTruthy()
  })

  it('invokes onPost with the gem id when Post it is clicked', () => {
    const onPost = vi.fn()
    render(<HiddenGemsSurface gems={gems} onPost={onPost} />)
    const buttons = screen.getAllByRole('button', { name: /post it/i })
    fireEvent.click(buttons[0])
    expect(onPost).toHaveBeenCalledWith('t1')
  })

  it('modal closes on Escape key', () => {
    const many = Array.from({ length: 5 }, (_, i) => ({
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

  it('reports partial failure when some posts reject', async () => {
    const onPost = vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(undefined)
    const many = Array.from({ length: 4 }, (_, i) => ({
      id: `g${i}`,
      sku: `SKU${i}`,
      description: `desc ${i}`,
      platforms: [],
      lastPostedAt: null,
    }))
    render(<HiddenGemsSurface gems={many} onPost={onPost} />)
    fireEvent.click(screen.getByRole('button', { name: /show more/i }))
    fireEvent.click(screen.getByRole('checkbox', { name: /select sku0/i }))
    fireEvent.click(screen.getByRole('checkbox', { name: /select sku1/i }))
    fireEvent.click(screen.getByRole('checkbox', { name: /select sku2/i }))
    fireEvent.click(screen.getByRole('button', { name: /post selected \(3\)/i }))

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith(
        expect.stringMatching(/2 posted, 1 failed/i),
        'error',
      )
    })
  })

  it('reports success when all posts resolve', async () => {
    const onPost = vi.fn().mockResolvedValue(undefined)
    const many = Array.from({ length: 4 }, (_, i) => ({
      id: `g${i}`,
      sku: `SKU${i}`,
      description: `desc ${i}`,
      platforms: [],
      lastPostedAt: null,
    }))
    render(<HiddenGemsSurface gems={many} onPost={onPost} />)
    fireEvent.click(screen.getByRole('button', { name: /show more/i }))
    fireEvent.click(screen.getByRole('checkbox', { name: /select sku0/i }))
    fireEvent.click(screen.getByRole('checkbox', { name: /select sku1/i }))
    fireEvent.click(screen.getByRole('checkbox', { name: /select sku2/i }))
    fireEvent.click(screen.getByRole('button', { name: /post selected \(3\)/i }))

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith(
        expect.stringMatching(/3 posted/i),
        'success',
      )
    })
  })

  it('traps Tab focus inside the modal and restores on close', async () => {
    const many = Array.from({ length: 5 }, (_, i) => ({
      id: `g${i}`,
      sku: `SKU${i}`,
      description: `desc ${i}`,
      platforms: [],
      lastPostedAt: null,
    }))
    render(<HiddenGemsSurface gems={many} onPost={vi.fn()} />)
    const trigger = screen.getByRole('button', { name: /show more/i })
    trigger.focus()
    fireEvent.click(trigger)

    const dialog = await screen.findByRole('dialog', { name: /hidden gems/i })
    const focusables = dialog.querySelectorAll(
      'button:not([disabled]), input:not([disabled])'
    )
    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    last.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(document.activeElement).toBe(first)

    first.focus()
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(last)

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => {
      expect(document.activeElement).toBe(trigger)
    })
  })
})
