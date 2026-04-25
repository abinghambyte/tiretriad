/** @vitest-environment jsdom */
globalThis.IS_REACT_ACT_ENVIRONMENT = true

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { HaggleSheet } from './HaggleSheet.jsx'

const tire = {
  description: 'BFGOODRICH KO3 LT265/70R17',
  mspn: '09100',
  buy: 412.5,
  retail: 599,
  cts: 0,
  fet: 0,
}

const secondTire = {
  description: 'MICHELIN DEFENDER LTX LT275/65R18',
  mspn: '22222',
  buy: 300,
  retail: 450,
  cts: 25,
  fet: 0,
}

afterEach(() => cleanup())

function renderSheet(overrides = {}) {
  const props = {
    tire,
    floorPct: 20,
    onClose: vi.fn(),
    onAccept: vi.fn(),
    ...overrides,
  }
  const utils = render(<HaggleSheet {...props} />)
  return { ...utils, props }
}

describe('HaggleSheet', () => {
  it('renders tire description, MSPN, and current sell price', () => {
    renderSheet()
    expect(screen.getByText(/BFGOODRICH KO3 LT265\/70R17/)).toBeTruthy()
    expect(screen.getByText(/09100/)).toBeTruthy()
    expect(screen.getByText(/\$599\.00/)).toBeTruthy()
  })

  it('updates the margin readout live as the test offer changes', () => {
    renderSheet()
    const input = screen.getByLabelText(/test offer/i)
    fireEvent.change(input, { target: { value: '500' } })
    // (500 - 412.50) / 500 * 100 = 17.5
    expect(screen.getByTestId('haggle-margin').textContent).toMatch(/17\.5/)

    fireEvent.change(input, { target: { value: '1000' } })
    // (1000 - 412.50) / 1000 * 100 = 58.75
    expect(screen.getByTestId('haggle-margin').textContent).toMatch(/58\.7|58\.8/)
  })

  it('uses the green color class when test margin is at or above the floor', () => {
    renderSheet()
    const input = screen.getByLabelText(/test offer/i)
    // (700 - 412.50) / 700 * 100 = 41.07% which is >= 20
    fireEvent.change(input, { target: { value: '700' } })
    const margin = screen.getByTestId('haggle-margin')
    expect(margin.className).toMatch(/text-emerald-300/)
  })

  it('uses the amber color class and shows floor warning when below floor', () => {
    renderSheet()
    const input = screen.getByLabelText(/test offer/i)
    // (500 - 412.50) / 500 * 100 = 17.5% which is below 20
    fireEvent.change(input, { target: { value: '500' } })
    const margin = screen.getByTestId('haggle-margin')
    expect(margin.className).toMatch(/text-amber-300/)
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toMatch(/Below 20% floor/)
  })

  it('shows the counter-offer suggestion at the floor margin', () => {
    renderSheet()
    const input = screen.getByLabelText(/test offer/i)
    fireEvent.change(input, { target: { value: '500' } })
    // 412.50 / (1 - 0.20) = 515.625 -> $515.63
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toMatch(/\$515\.63/)
  })

  it('calls onAccept with the test offer then onClose when Accept is clicked', () => {
    const { props } = renderSheet()
    const input = screen.getByLabelText(/test offer/i)
    fireEvent.change(input, { target: { value: '550' } })
    const acceptBtn = screen.getByRole('button', { name: /accept this offer/i })
    expect(acceptBtn.disabled).toBe(false)
    fireEvent.click(acceptBtn)
    expect(props.onAccept).toHaveBeenCalledWith(550)
    expect(props.onClose).toHaveBeenCalled()
  })

  it('calls onClose when Escape is pressed', () => {
    const { props } = renderSheet()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(props.onClose).toHaveBeenCalled()
  })

  it('disables the Accept button when the offer is zero or empty', () => {
    renderSheet()
    const acceptBtn = screen.getByRole('button', { name: /accept this offer/i })
    expect(acceptBtn.disabled).toBe(true)
  })

  it('renders a qty stepper for each tire in a bundle', () => {
    renderSheet({ tires: [tire, secondTire] })

    expect(screen.getByText(/BFGOODRICH KO3/)).toBeTruthy()
    expect(screen.getByText(/MICHELIN DEFENDER/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /increase quantity for 09100/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /increase quantity for 22222/i })).toBeTruthy()
  })

  it('updates bundle totals when a tire quantity changes', () => {
    renderSheet({ tires: [tire, secondTire] })

    expect(screen.getByTestId('bundle-quantity').textContent).toMatch(/2 tires/)
    expect(screen.getByTestId('bundle-revenue').textContent).toMatch(/\$1,049\.00/)
    fireEvent.click(screen.getByRole('button', { name: /increase quantity for 22222/i }))

    expect(screen.getByTestId('bundle-quantity').textContent).toMatch(/3 tires/)
    expect(screen.getByTestId('bundle-revenue').textContent).toMatch(/\$1,499\.00/)
    expect(screen.getByTestId('bundle-cost').textContent).toMatch(/\$1,062\.50/)
  })

  it('shows bundle totals for multi-tire quotes', () => {
    renderSheet({ tires: [tire, secondTire] })

    expect(screen.getByText(/^Bundle$/)).toBeTruthy()
    expect(screen.getByTestId('bundle-profit').textContent).toMatch(/\$311\.50/)
    expect(screen.getByTestId('bundle-margin').textContent).toMatch(/29\.7%/)
  })

  it('calls onAccept with the bundle test offer for multi-tire quotes', () => {
    const { props } = renderSheet({ tires: [tire, secondTire] })
    const input = screen.getByLabelText(/test offer/i)
    fireEvent.change(input, { target: { value: '1200' } })

    fireEvent.click(screen.getByRole('button', { name: /accept this offer/i }))

    expect(props.onAccept).toHaveBeenCalledWith(1200)
    expect(props.onClose).toHaveBeenCalled()
  })
})
