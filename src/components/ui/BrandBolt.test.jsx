/** @vitest-environment jsdom */
globalThis.IS_REACT_ACT_ENVIRONMENT = true

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { BrandBolt } from './BrandBolt.jsx'

afterEach(() => cleanup())

describe('BrandBolt', () => {
  it('renders an svg with the brand-bolt test id', () => {
    const { getByTestId } = render(<BrandBolt />)
    const el = getByTestId('brand-bolt')
    expect(el.tagName.toLowerCase()).toBe('svg')
  })

  it('uses the size prop for width and height', () => {
    const { getByTestId } = render(<BrandBolt size={32} />)
    const el = getByTestId('brand-bolt')
    expect(el.getAttribute('width')).toBe('32')
    expect(el.getAttribute('height')).toBe('32')
  })

  it('reports the tone via data attribute', () => {
    const { getByTestId } = render(<BrandBolt tone="glow" />)
    expect(getByTestId('brand-bolt').dataset.tone).toBe('glow')
  })

  it('defaults tone to solid', () => {
    const { getByTestId } = render(<BrandBolt />)
    expect(getByTestId('brand-bolt').dataset.tone).toBe('solid')
  })

  it('is aria-hidden by default', () => {
    const { getByTestId } = render(<BrandBolt />)
    expect(getByTestId('brand-bolt').getAttribute('aria-hidden')).toBe('true')
  })

  it('drops aria-hidden when given an aria-label', () => {
    const { getByTestId } = render(<BrandBolt aria-label="Tire Triad" />)
    const el = getByTestId('brand-bolt')
    expect(el.getAttribute('aria-hidden')).toBeNull()
    expect(el.getAttribute('aria-label')).toBe('Tire Triad')
  })

  it('forwards className', () => {
    const { getByTestId } = render(<BrandBolt className="ml-2" />)
    expect(getByTestId('brand-bolt').classList.contains('ml-2')).toBe(true)
  })
})
