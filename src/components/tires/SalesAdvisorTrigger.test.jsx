/** @vitest-environment jsdom */
import { describe, expect, it, vi, afterEach } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import { SalesAdvisorTrigger } from './SalesAdvisorTrigger.jsx'

afterEach(cleanup)

describe('SalesAdvisorTrigger', () => {
  it('renders a button with accessible label', () => {
    const { container } = render(<SalesAdvisorTrigger onClick={() => {}} />)
    const btn = container.querySelector('button')
    expect(btn).not.toBeNull()
    expect(btn.getAttribute('aria-label')).toMatch(/sales advisor/i)
  })

  it('clicking fires onClick', () => {
    const spy = vi.fn()
    const { container } = render(<SalesAdvisorTrigger onClick={spy} />)
    fireEvent.click(container.querySelector('button'))
    expect(spy).toHaveBeenCalledTimes(1)
  })
})
