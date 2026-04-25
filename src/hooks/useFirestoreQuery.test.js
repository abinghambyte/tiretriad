/** @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'

const onSnapshotMock = vi.fn()

vi.mock('../firebase/config.js', () => ({
  db: { __mockDb: true },
}))

vi.mock('firebase/firestore', () => ({
  onSnapshot: (...args) => onSnapshotMock(...args),
}))

import { useFirestoreQuery } from './useFirestoreQuery.js'

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
      // Match usePayoutConfig.test.js: React 18's MessageChannel commits
      // require both microtask drains and a macrotask tick under load.
      await act(async () => {
        await Promise.resolve()
        await Promise.resolve()
        await new Promise((r) => setTimeout(r, 0))
      })
    },
    unmount() {
      act(() => {
        root.unmount()
      })
    },
  }
}

describe('useFirestoreQuery', () => {
  beforeEach(() => {
    onSnapshotMock.mockReset()
  })

  it('idles when buildQuery returns null', () => {
    const hook = renderHook(() => useFirestoreQuery(() => null, ['idle']))
    hook.mount()
    expect(hook.result).toEqual(
      expect.objectContaining({
        data: null,
        loading: false,
        error: null,
      }),
    )
    hook.unmount()
  })

  it('subscribes with onSnapshot for Query-like results and tears down', async () => {
    const unsub = vi.fn()
    onSnapshotMock.mockImplementation((query, onNext) => {
      expect(query).toEqual({ __q: 1 })
      queueMicrotask(() => onNext({ docs: ['a'] }))
      return unsub
    })

    const hook = renderHook(() =>
      useFirestoreQuery(() => ({ __q: 1 }), ['sub']),
    )
    hook.mount()
    await hook.flushMicrotasks()
    expect(hook.result.data).toEqual({ docs: ['a'] })
    expect(hook.result.loading).toBe(false)
    expect(hook.result.error).toBe(null)

    hook.unmount()
    expect(unsub).toHaveBeenCalledTimes(1)
  })

  it('handles one-shot Promise results from getDocs-style builders', async () => {
    const hook = renderHook(() =>
      useFirestoreQuery(() => Promise.resolve({ docs: ['p'] }), ['promise']),
    )
    hook.mount()
    await hook.flushMicrotasks()
    expect(hook.result.data).toEqual({ docs: ['p'] })
    expect(hook.result.loading).toBe(false)
    expect(hook.result.error).toBe(null)
    hook.unmount()
  })

  it('surfaces snapshot listener errors', async () => {
    const err = new Error('snap failed')
    onSnapshotMock.mockImplementation((_q, _onNext, onError) => {
      queueMicrotask(() => onError(err))
      return () => {}
    })

    const hook = renderHook(() =>
      useFirestoreQuery(() => ({ __q: 2 }), ['err']),
    )
    hook.mount()
    await hook.flushMicrotasks()
    expect(hook.result.error).toBe(err)
    expect(hook.result.loading).toBe(false)
    hook.unmount()
  })

  it('ignores late snapshot delivery after unmount without throwing', async () => {
    let lateNext
    const unsub = vi.fn()
    onSnapshotMock.mockImplementation((_q, onNext) => {
      lateNext = onNext
      return unsub
    })

    const hook = renderHook(() =>
      useFirestoreQuery(() => ({ __q: 3 }), ['late']),
    )
    hook.mount()
    hook.unmount()

    await expect(
      act(async () => {
        lateNext({ docs: ['late'] })
        await Promise.resolve()
      }),
    ).resolves.toBeUndefined()
  })
})
