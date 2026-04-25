/** @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'

const onSnapshotMock = vi.fn()
const docMock = vi.fn(() => ({ __ref: 'meta/payoutConfig' }))

vi.mock('../firebase/config', () => ({
  db: { __mockDb: true },
}))

vi.mock('firebase/firestore', () => ({
  doc: (...args) => docMock(...args),
  onSnapshot: (...args) => onSnapshotMock(...args),
}))

import { usePayoutConfig } from './usePayoutConfig.js'

function renderHook(callback) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const result = { current: {} }

  function Probe() {
    result.current = callback()
    return null
  }

  return {
    get result() {
      return result.current
    },
    mount() {
      act(() => {
        root.render(createElement(Probe))
      })
    },
    async flushMicrotasks() {
      await act(async () => {
        await Promise.resolve()
      })
    },
    unmount() {
      act(() => {
        root.unmount()
      })
    },
  }
}

describe('usePayoutConfig', () => {
  beforeEach(() => {
    onSnapshotMock.mockReset()
    docMock.mockClear()
  })

  it('returns loading: true before the first snapshot arrives', () => {
    onSnapshotMock.mockImplementation(() => () => {})
    const hook = renderHook(() => usePayoutConfig())
    hook.mount()
    expect(hook.result.loading).toBe(true)
    expect(hook.result.config).toBe(null)
    expect(hook.result.error).toBe(null)
    hook.unmount()
  })

  it('exposes the doc data when the snapshot has data', async () => {
    onSnapshotMock.mockImplementation((_ref, onNext) => {
      queueMicrotask(() =>
        onNext({
          exists: () => true,
          data: () => ({ marginFloorPct: 25 }),
        }),
      )
      return () => {}
    })

    const hook = renderHook(() => usePayoutConfig())
    hook.mount()
    await hook.flushMicrotasks()
    expect(hook.result.loading).toBe(false)
    expect(hook.result.config).toEqual({ marginFloorPct: 25 })
    expect(hook.result.error).toBe(null)
    hook.unmount()
  })

  it('returns config: null when the doc does not exist', async () => {
    onSnapshotMock.mockImplementation((_ref, onNext) => {
      queueMicrotask(() =>
        onNext({
          exists: () => false,
          data: () => undefined,
        }),
      )
      return () => {}
    })

    const hook = renderHook(() => usePayoutConfig())
    hook.mount()
    await hook.flushMicrotasks()
    expect(hook.result.loading).toBe(false)
    expect(hook.result.config).toBe(null)
    expect(hook.result.error).toBe(null)
    hook.unmount()
  })

  it('surfaces snapshot listener errors', async () => {
    const err = new Error('permission denied')
    onSnapshotMock.mockImplementation((_ref, _onNext, onError) => {
      queueMicrotask(() => onError(err))
      return () => {}
    })

    const hook = renderHook(() => usePayoutConfig())
    hook.mount()
    await hook.flushMicrotasks()
    expect(hook.result.loading).toBe(false)
    expect(hook.result.error).toBe(err)
    hook.unmount()
  })

  it('unsubscribes on unmount', () => {
    const unsub = vi.fn()
    onSnapshotMock.mockImplementation(() => unsub)

    const hook = renderHook(() => usePayoutConfig())
    hook.mount()
    hook.unmount()
    expect(unsub).toHaveBeenCalledTimes(1)
  })
})
