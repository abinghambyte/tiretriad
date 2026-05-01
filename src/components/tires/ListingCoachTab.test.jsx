/** @vitest-environment jsdom */
import { describe, expect, it, vi, afterEach } from 'vitest'
import { render, fireEvent, cleanup, act } from '@testing-library/react'
import { ListingCoachTab } from './ListingCoachTab.jsx'

afterEach(cleanup)

function makeProps(overrides = {}) {
  return {
    messages: [],
    pending: false,
    onSend: vi.fn(),
    audience: null,
    onAudienceChange: vi.fn(),
    ...overrides,
  }
}

describe('ListingCoachTab', () => {
  it('renders empty state when no messages', () => {
    const { container } = render(<ListingCoachTab {...makeProps()} />)
    expect(container.textContent).toContain('Listing Coach')
    expect(container.textContent).toContain('draft a listing')
  })

  it('renders user + assistant messages', () => {
    const messages = [
      { role: 'user', content: 'draft a listing for KO2s' },
      { role: 'assistant', content: 'Here is a draft.\n```\n4 NEW BFG KO2 ...\n```' },
    ]
    const { container } = render(<ListingCoachTab {...makeProps({ messages })} />)
    expect(container.textContent).toContain('draft a listing for KO2s')
    expect(container.textContent).toContain('4 NEW BFG KO2')
  })

  it('shows Copy button on fenced code blocks', () => {
    const messages = [
      { role: 'assistant', content: 'pre\n```\nlisting copy here\n```\npost' },
    ]
    const { container } = render(<ListingCoachTab {...makeProps({ messages })} />)
    const copyBtn = container.querySelector('[data-testid="copy-listing"]')
    expect(copyBtn).not.toBeNull()
  })

  it('Copy button writes the fenced content to clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    const messages = [{ role: 'assistant', content: 'pre\n```\nlisting copy\n```\npost' }]
    const { container } = render(<ListingCoachTab {...makeProps({ messages })} />)
    const btn = container.querySelector('[data-testid="copy-listing"]')
    await act(async () => { fireEvent.click(btn) })
    expect(writeText).toHaveBeenCalledWith('listing copy')
  })

  it('send button forwards trimmed input to onSend', () => {
    const onSend = vi.fn()
    const { container } = render(<ListingCoachTab {...makeProps({ onSend })} />)
    const ta = container.querySelector('textarea')
    fireEvent.change(ta, { target: { value: '  draft for 4 KO2s  ' } })
    const btn = container.querySelector('[data-testid="coach-send"]')
    fireEvent.click(btn)
    expect(onSend).toHaveBeenCalledWith('draft for 4 KO2s')
  })

  it('disables send while pending', () => {
    const { container } = render(<ListingCoachTab {...makeProps({ pending: true })} />)
    const btn = container.querySelector('[data-testid="coach-send"]')
    expect(btn.disabled).toBe(true)
  })
})
