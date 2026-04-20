import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getTireSelectionSnapshot,
  setTireSelection,
  subscribeTireSelection,
} from './tireSelectionStore.js'

afterEach(() => {
  // Reset to the empty snapshot between tests — the module is a singleton.
  setTireSelection(null)
})

describe('tireSelectionStore', () => {
  it('starts empty and returns a stable reference for no-selection state', () => {
    const a = getTireSelectionSnapshot()
    const b = getTireSelectionSnapshot()
    expect(a).toBe(b)
    expect(a.count).toBe(0)
  })

  it('setTireSelection(null) clears back to the stable empty snapshot', () => {
    const empty = getTireSelectionSnapshot()
    setTireSelection({ count: 2, canLogSale: true })
    expect(getTireSelectionSnapshot().count).toBe(2)
    setTireSelection(null)
    expect(getTireSelectionSnapshot()).toBe(empty)
  })

  it('notifies subscribers on change and the unsubscribe function removes them', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeTireSelection(listener)
    setTireSelection({ count: 1, canQuote: true })
    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
    setTireSelection({ count: 2 })
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('a throwing listener does not break notifications for other listeners', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const bad = vi.fn(() => {
      throw new Error('boom')
    })
    const good = vi.fn()
    subscribeTireSelection(bad)
    subscribeTireSelection(good)
    setTireSelection({ count: 3 })
    expect(bad).toHaveBeenCalled()
    expect(good).toHaveBeenCalled()
    errSpy.mockRestore()
  })
})
