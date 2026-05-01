/** @vitest-environment jsdom */
import { describe, expect, it, vi, afterEach } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import { SalesAdvisorDrawer } from './SalesAdvisorDrawer.jsx'

afterEach(cleanup)

const baseProps = {
  isOpen: true,
  messages: [],
  pending: false,
  onClose: () => {},
  onSend: () => {},
}

describe('SalesAdvisorDrawer', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<SalesAdvisorDrawer {...baseProps} isOpen={false} />)
    expect(container.querySelector('[role="dialog"]')).toBeNull()
  })

  it('renders header, message list, textarea, send button when open', () => {
    const { container } = render(<SalesAdvisorDrawer {...baseProps} />)
    expect(container.querySelector('[role="dialog"]')).not.toBeNull()
    expect(container.querySelector('textarea')).not.toBeNull()
    expect(container.querySelector('button[type="submit"]')).not.toBeNull()
  })

  it('shows empty-state suggestion buttons when messages is empty', () => {
    const { container } = render(<SalesAdvisorDrawer {...baseProps} />)
    const suggestionButtons = container.querySelectorAll('[data-suggestion]')
    expect(suggestionButtons.length).toBe(4)
  })

  it('clicking a suggestion populates the textarea', () => {
    const { container } = render(<SalesAdvisorDrawer {...baseProps} />)
    const first = container.querySelector('[data-suggestion]')
    fireEvent.click(first)
    const ta = container.querySelector('textarea')
    expect(ta.value.length).toBeGreaterThan(20)
  })

  it('submitting fires onSend with trimmed text', () => {
    const spy = vi.fn()
    const { container } = render(<SalesAdvisorDrawer {...baseProps} onSend={spy} />)
    const ta = container.querySelector('textarea')
    fireEvent.change(ta, { target: { value: '  hi there  ' } })
    fireEvent.submit(ta.closest('form'))
    expect(spy).toHaveBeenCalledWith('hi there')
  })

  it('submitting empty text does not fire onSend', () => {
    const spy = vi.fn()
    const { container } = render(<SalesAdvisorDrawer {...baseProps} onSend={spy} />)
    const ta = container.querySelector('textarea')
    fireEvent.submit(ta.closest('form'))
    expect(spy).not.toHaveBeenCalled()
  })

  it('disables send while pending', () => {
    const { container } = render(<SalesAdvisorDrawer {...baseProps} pending={true} />)
    const btn = container.querySelector('button[type="submit"]')
    expect(btn.disabled).toBe(true)
  })

  it('renders error message bubbles with red styling', () => {
    const messages = [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'Advisor failed: boom', error: true },
    ]
    const { container } = render(<SalesAdvisorDrawer {...baseProps} messages={messages} />)
    const errBubble = container.querySelector('[data-error="true"]')
    expect(errBubble).not.toBeNull()
    expect(errBubble.textContent).toContain('Advisor failed')
  })

  it('clicking close fires onClose', () => {
    const spy = vi.fn()
    const { container } = render(<SalesAdvisorDrawer {...baseProps} onClose={spy} />)
    fireEvent.click(container.querySelector('[aria-label="Close advisor"]'))
    expect(spy).toHaveBeenCalledTimes(1)
  })
})
