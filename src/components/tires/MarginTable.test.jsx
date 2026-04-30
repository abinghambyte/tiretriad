/** @vitest-environment jsdom */
globalThis.IS_REACT_ACT_ENVIRONMENT = true

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { TireDescriptionCellForTest as TireDescriptionCell } from './MarginTable.jsx'
import { ToastProvider } from '../providers/ToastProvider.jsx'

afterEach(() => cleanup())

function wrap(ui) {
  return <ToastProvider>{ui}</ToastProvider>
}

describe('TireDescriptionCell pills', () => {
  it('renders an XL pill when pillTags includes XL', () => {
    const { container } = render(
      wrap(<TireDescriptionCell description="P255/55R18 109V Pilot Sport" pillTags={['XL']} />)
    )
    const pill = container.querySelector('[data-pill="XL"]')
    expect(pill).not.toBeNull()
    expect(pill.textContent).toBe('XL')
    expect(pill.getAttribute('aria-label')).toBe('Extra Load tire')
  })

  it('renders an MS pill displaying M/S', () => {
    const { container } = render(
      wrap(<TireDescriptionCell description="265/70R17 115T Defender LTX M/S" pillTags={['MS']} />)
    )
    const pill = container.querySelector('[data-pill="MS"]')
    expect(pill).not.toBeNull()
    expect(pill.textContent).toBe('M/S')
    expect(pill.getAttribute('aria-label')).toBe('Mud and Snow rated')
  })

  it('renders both pills when both tags present', () => {
    const { container } = render(
      wrap(
        <TireDescriptionCell
          description="225/45R17 91W XL Pilot Sport"
          pillTags={['XL', 'MS']}
        />
      )
    )
    expect(container.querySelector('[data-pill="XL"]')).not.toBeNull()
    expect(container.querySelector('[data-pill="MS"]')).not.toBeNull()
  })

  it('renders no pills when pillTags is empty or missing', () => {
    const { container: c1 } = render(
      wrap(<TireDescriptionCell description="265/70R17 LTX" pillTags={[]} />)
    )
    expect(c1.querySelector('[data-pill]')).toBeNull()

    const { container: c2 } = render(
      wrap(<TireDescriptionCell description="265/70R17 LTX" />)
    )
    expect(c2.querySelector('[data-pill]')).toBeNull()
  })

  it('does NOT render literal " XL" inside the primary description string', () => {
    const { container } = render(
      wrap(<TireDescriptionCell description="P255/55R18 109V" pillTags={['XL']} />)
    )
    const primary = container.querySelector('div.font-mono')
    expect(primary).not.toBeNull()
    expect(primary.textContent).not.toMatch(/\bXL\b/)
    expect(container.querySelector('[data-pill="XL"]')).not.toBeNull()
  })

  it('falls back to a third line when secondary is empty and pills are present', () => {
    const { container } = render(
      wrap(<TireDescriptionCell description="GARBAGE-INPUT-NO-SIZE" pillTags={['XL']} />)
    )
    expect(container.querySelector('[data-pill="XL"]')).not.toBeNull()
  })

  it('XL primary string is dropped when pillTags=[XL] for an explicit-XL description', () => {
    const { container } = render(wrap(
      <TireDescriptionCell description="P255/55R18 109V XL" pillTags={['XL']} />
    ))
    const monoLine = container.querySelector('div.font-mono')
    expect(monoLine).not.toBeNull()
    expect(monoLine.textContent).not.toMatch(/\bXL\b/)
    expect(container.querySelector('[data-pill="XL"]')).not.toBeNull()
  })
})
