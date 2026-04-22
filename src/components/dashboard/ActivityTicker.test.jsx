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
  it('renders each chip label', () => {
    render(<ActivityTicker chips={chips} />)
    // each chip is duplicated for the seamless scroll
    expect(screen.getAllByText('12 hidden gems').length).toBe(2)
    expect(screen.getAllByText('5 patches pending').length).toBe(2)
    expect(screen.getAllByText('3 late jobs').length).toBe(2)
    expect(screen.getAllByText('DJ on a 4-day streak').length).toBe(2)
  })

  it('renders nothing when chips is empty', () => {
    const { container } = render(<ActivityTicker chips={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('falls back to neutral class when kind is unknown', () => {
    render(<ActivityTicker chips={[{ id: 'x', kind: 'weird', label: 'Weird' }]} />)
    const el = screen.getAllByText('Weird')[0]
    expect(el.className).toMatch(/bg-zinc-700/)
  })
})
