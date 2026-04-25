/** @vitest-environment jsdom */
globalThis.IS_REACT_ACT_ENVIRONMENT = true

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { TireCardMobile } from './TireCardMobile.jsx'

const tire = {
  id: 't1', mspn: '09100', description: 'BFGOODRICH LT265/70R17 KO3',
  brand: 'BFGoodrich', buy: 412.50, retail: 599, marginPct: 23.5, fet: 0,
  listedCount: 2,
}

afterEach(() => cleanup())

describe('TireCardMobile', () => {
  it('renders description, MSPN, buy, retail, margin', () => {
    render(<TireCardMobile tire={tire} />)
    expect(screen.getByText(/BFGOODRICH/)).toBeTruthy()
    expect(screen.getByText('09100')).toBeTruthy()
    expect(screen.getByText('$412.50')).toBeTruthy()
    expect(screen.getByText('$599.00')).toBeTruthy()
    expect(screen.getByText('23.5%')).toBeTruthy()
  })

  it('calls onTestOffer when the test offer button is tapped', () => {
    const onTestOffer = vi.fn()
    render(<TireCardMobile tire={tire} onTestOffer={onTestOffer} />)
    fireEvent.click(screen.getByRole('button', { name: /test offer/i }))
    expect(onTestOffer).toHaveBeenCalledWith(tire)
  })

  it('reflects selected state via amber ring', () => {
    const { container } = render(<TireCardMobile tire={tire} selected />)
    expect(container.firstChild?.className).toMatch(/ring-amber-/)
  })
})
