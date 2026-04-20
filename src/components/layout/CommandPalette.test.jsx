/** @vitest-environment jsdom */

globalThis.IS_REACT_ACT_ENVIRONMENT = true

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { fireEvent, render, screen } from '@testing-library/react'

const getDocsMock = vi.hoisted(() => vi.fn(() => Promise.resolve({ docs: [] })))

const tireSelectionSnapshot = vi.hoisted(() =>
  Object.freeze({
    count: 0,
    canQuote: false,
    canLogSale: false,
    canGenerateListings: false,
    canBulkOverhead: false,
  }),
)

vi.mock('../../firebase/config.js', () => ({
  auth: {},
  db: {},
}))

vi.mock('firebase/auth', () => ({
  signOut: vi.fn(),
}))

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  getDocs: (...args) => getDocsMock(...args),
  limit: vi.fn(() => ({})),
  orderBy: vi.fn(() => ({})),
  query: vi.fn(() => ({})),
}))

vi.mock('../../hooks/useUserProfile.js', () => ({
  useUserProfile: () => ({
    profile: { role: 'admin' },
    permissionFor: () => 'manage',
  }),
}))

vi.mock('../../context/tireSelectionStore.js', () => ({
  getTireSelectionSnapshot: () => tireSelectionSnapshot,
  subscribeTireSelection: () => () => {},
}))

import { CommandPalette } from './CommandPalette.jsx'

describe('CommandPalette search debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    getDocsMock.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('fires exactly one search batch (four getDocs) after three keystrokes within 120ms', async () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <CommandPalette open theme="dark" onClose={() => {}} onToggleTheme={() => {}} />
      </MemoryRouter>,
    )

    const input = screen.getByRole('searchbox')
    expect(input).toBeTruthy()

    await act(async () => {
      fireEvent.input(input, { target: { value: 'a' } })
    })
    await act(async () => {
      fireEvent.input(input, { target: { value: 'ab' } })
    })
    await act(async () => {
      fireEvent.input(input, { target: { value: 'abc' } })
    })

    expect(input.value).toBe('abc')
    expect(getDocsMock).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(120)
    })
    await act(async () => {
      await vi.runAllTimersAsync()
    })

    expect(getDocsMock).toHaveBeenCalledTimes(4)
  })
})
