/** @vitest-environment jsdom */
globalThis.IS_REACT_ACT_ENVIRONMENT = true

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { SelectAllToggle } from './SelectAllToggle.jsx'

afterEach(() => cleanup())

function Harness({ totalRows = 5, moreBeyondVisible = false }) {
  const [selected, setSelected] = useState(() => new Set())
  const allRows = Array.from({ length: totalRows }, (_, i) => ({ id: `r${i}` }))
  const pageCount = allRows.length
  const totalCount = allRows.length
  const visibleSelected =
    pageCount > 0 && allRows.every((r) => selected.has(r.id))
  const allMatchingSelected = visibleSelected && selected.size === totalCount

  return (
    <SelectAllToggle
      pageCount={pageCount}
      totalCount={totalCount}
      selectedCount={selected.size}
      visibleSelected={visibleSelected}
      allMatchingSelected={allMatchingSelected}
      moreBeyondVisible={moreBeyondVisible}
      onTogglePage={() => {
        if (visibleSelected) {
          setSelected(new Set())
        } else {
          setSelected(new Set(allRows.map((r) => r.id)))
        }
      }}
      onSelectAllMatching={() =>
        setSelected(new Set(allRows.map((r) => r.id)))
      }
    />
  )
}

describe('SelectAllToggle (two-stage Select All)', () => {
  it('shows "Select page (N)" by default', () => {
    render(<Harness totalRows={5} />)
    const btn = screen.getByRole('button', { name: /select page \(5\)/i })
    expect(btn).not.toBeNull()
    expect(btn.getAttribute('aria-pressed')).toBe('false')
  })

  it('flips label and aria-pressed after first click', () => {
    render(<Harness totalRows={5} />)
    const btn = screen.getByRole('button', { name: /select page \(5\)/i })
    expect(btn.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(btn)
    // After the click every row is selected so we land on the
    // "Deselect all" terminal label (page === total because there is no
    // pagination today).
    const next = screen.getByRole('button', { name: /deselect all \(5\)/i })
    expect(next.getAttribute('aria-pressed')).toBe('true')
  })

  it('reads "Deselect all (N)" when all rows are selected', () => {
    render(<Harness totalRows={5} />)
    fireEvent.click(screen.getByRole('button', { name: /select page \(5\)/i }))
    const btn = screen.getByRole('button', { name: /deselect all \(5\)/i })
    expect(btn).not.toBeNull()
  })

  it('shows "{N} selected" when page is selected but more matching rows exist', () => {
    // Simulate pagination by providing pageCount < totalCount via direct
    // props (the Harness keeps pageCount === totalCount today).
    render(
      <SelectAllToggle
        pageCount={5}
        totalCount={20}
        selectedCount={5}
        visibleSelected={true}
        allMatchingSelected={false}
        moreBeyondVisible={true}
        onTogglePage={() => {}}
        onSelectAllMatching={() => {}}
      />,
    )
    expect(
      screen.getByRole('button', { name: /5 selected/i }),
    ).not.toBeNull()
    expect(
      screen.getByRole('button', { name: /select all 20 matching/i }),
    ).not.toBeNull()
  })

  it('fires onTogglePage when the primary button is clicked', () => {
    const onTogglePage = vi.fn()
    render(
      <SelectAllToggle
        pageCount={5}
        totalCount={5}
        selectedCount={0}
        visibleSelected={false}
        allMatchingSelected={false}
        moreBeyondVisible={false}
        onTogglePage={onTogglePage}
        onSelectAllMatching={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /select page \(5\)/i }))
    expect(onTogglePage).toHaveBeenCalledTimes(1)
  })
})
