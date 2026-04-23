/** @vitest-environment jsdom */

globalThis.IS_REACT_ACT_ENVIRONMENT = true

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { ActivityTicker } from './ActivityTicker.jsx'

afterEach(() => {
  cleanup()
})

const chips = [
  { id: 'a', kind: 'inventory', label: '12 hidden gems' },
  { id: 'b', kind: 'kyle', label: '5 patches pending' },
  { id: 'c', kind: 'ops', label: '3 late jobs' },
  { id: 'd', kind: 'people', label: 'DJ on a 4-day streak' },
]

describe('ActivityTicker', () => {
  it('renders each chip label exactly once (single-copy marquee)', () => {
    render(<ActivityTicker chips={chips} />)
    expect(screen.getAllByText('12 hidden gems').length).toBe(1)
    expect(screen.getAllByText('5 patches pending').length).toBe(1)
    expect(screen.getAllByText('3 late jobs').length).toBe(1)
    expect(screen.getAllByText('DJ on a 4-day streak').length).toBe(1)
  })

  it('pads the track so chips start off-screen right', () => {
    const { container } = render(<ActivityTicker chips={chips} />)
    const track = container.querySelector('.activity-ticker__track')
    expect(track.className).toMatch(/pl-\[100%\]/)
  })

  it('renders nothing when chips is empty', () => {
    const { container } = render(<ActivityTicker chips={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('exposes an aria-live polite region so screen readers announce new chips', () => {
    const { container } = render(<ActivityTicker chips={chips} />)
    const region = container.querySelector('[aria-label="Activity ticker"]')
    expect(region.getAttribute('aria-live')).toBe('polite')
  })

  it('falls back to neutral class when kind is unknown', () => {
    render(<ActivityTicker chips={[{ id: 'x', kind: 'weird', label: 'Weird' }]} />)
    const el = screen.getAllByText('Weird')[0]
    expect(el.className).toMatch(/bg-zinc-700/)
  })
})
