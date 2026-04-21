import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the firebase/functions + firebase config imports so we can import the
// module without hitting any real SDK initialisation. The test uses the
// `callable` override to drive behavior.
vi.mock('firebase/functions', () => ({
  httpsCallable: () => async () => ({}),
}))
vi.mock('../firebase/config', () => ({ functions: {} }))

const { startPresenceHeartbeat } = await import('./presenceHeartbeat.js')

function makeFakeDoc(initialState = 'visible') {
  const listeners = new Map()
  return {
    visibilityState: initialState,
    addEventListener(name, fn) {
      const arr = listeners.get(name) || []
      arr.push(fn)
      listeners.set(name, arr)
    },
    removeEventListener(name, fn) {
      const arr = listeners.get(name) || []
      listeners.set(name, arr.filter((x) => x !== fn))
    },
    _fire(name) {
      const arr = listeners.get(name) || []
      for (const fn of arr) fn()
    },
    _listenerCount(name) {
      return (listeners.get(name) || []).length
    },
    _setVisible(state) {
      this.visibilityState = state
    },
  }
}

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('startPresenceHeartbeat', () => {
  it('fires immediately on start', async () => {
    const doc = makeFakeDoc('visible')
    const calls = []
    const callable = vi.fn(async (data) => {
      calls.push(data)
      return { data: {} }
    })
    const stop = startPresenceHeartbeat({ intervalMs: 60_000, callable, doc })
    // flush microtasks from the initial fire
    await vi.advanceTimersByTimeAsync(0)
    expect(callable).toHaveBeenCalledTimes(1)
    stop()
  })

  it('fires every intervalMs while visible', async () => {
    const doc = makeFakeDoc('visible')
    const callable = vi.fn(async () => ({ data: {} }))
    const stop = startPresenceHeartbeat({ intervalMs: 1000, callable, doc })
    await vi.advanceTimersByTimeAsync(0) // initial fire
    expect(callable).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1000)
    expect(callable).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1000)
    expect(callable).toHaveBeenCalledTimes(3)
    stop()
  })

  it('pauses while hidden and resumes with an immediate fire on visible', async () => {
    const doc = makeFakeDoc('visible')
    const callable = vi.fn(async () => ({ data: {} }))
    const stop = startPresenceHeartbeat({ intervalMs: 1000, callable, doc })
    await vi.advanceTimersByTimeAsync(0) // initial fire
    expect(callable).toHaveBeenCalledTimes(1)

    doc._setVisible('hidden')
    doc._fire('visibilitychange')

    // Time passes while hidden: no additional calls.
    await vi.advanceTimersByTimeAsync(5000)
    expect(callable).toHaveBeenCalledTimes(1)

    // Become visible: immediate fire, then tick again at intervalMs.
    doc._setVisible('visible')
    doc._fire('visibilitychange')
    await vi.advanceTimersByTimeAsync(0)
    expect(callable).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1000)
    expect(callable).toHaveBeenCalledTimes(3)
    stop()
  })

  it('is single-flight (never overlaps calls)', async () => {
    const doc = makeFakeDoc('visible')
    let resolveFirst
    const firstPromise = new Promise((r) => {
      resolveFirst = r
    })
    let callCount = 0
    const callable = vi.fn(async () => {
      callCount += 1
      if (callCount === 1) {
        await firstPromise
      }
      return { data: {} }
    })
    const stop = startPresenceHeartbeat({ intervalMs: 100, callable, doc })

    // First call started; it is still pending.
    await vi.advanceTimersByTimeAsync(0)
    expect(callable).toHaveBeenCalledTimes(1)

    // Advance multiple intervals while the first call is still pending.
    await vi.advanceTimersByTimeAsync(500)
    expect(callable).toHaveBeenCalledTimes(1) // still single-flight

    // Resolve the first call; subsequent ticks are free to fire.
    resolveFirst()
    await vi.advanceTimersByTimeAsync(100)
    expect(callable.mock.calls.length).toBeGreaterThanOrEqual(2)
    stop()
  })

  it('swallows resource-exhausted without logging', async () => {
    const doc = makeFakeDoc('visible')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const err = new Error('rate limited')
    err.code = 'functions/resource-exhausted'
    const callable = vi.fn(async () => {
      throw err
    })
    const stop = startPresenceHeartbeat({ intervalMs: 1000, callable, doc })
    await vi.advanceTimersByTimeAsync(0)
    expect(callable).toHaveBeenCalledTimes(1)
    expect(warn).not.toHaveBeenCalled()
    stop()
  })

  it('warns on unexpected errors and keeps running', async () => {
    const doc = makeFakeDoc('visible')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    let shouldThrow = true
    const callable = vi.fn(async () => {
      if (shouldThrow) {
        shouldThrow = false
        throw new Error('boom')
      }
      return { data: {} }
    })
    const stop = startPresenceHeartbeat({ intervalMs: 1000, callable, doc })
    await vi.advanceTimersByTimeAsync(0)
    expect(warn).toHaveBeenCalled()
    const firstArg = warn.mock.calls[0][0]
    expect(String(firstArg)).toContain('[presence]')
    // Loop continues after the error.
    await vi.advanceTimersByTimeAsync(1000)
    expect(callable).toHaveBeenCalledTimes(2)
    stop()
  })

  it('stops cleanly (clears interval + removes listener)', async () => {
    const doc = makeFakeDoc('visible')
    const callable = vi.fn(async () => ({ data: {} }))
    const stop = startPresenceHeartbeat({ intervalMs: 1000, callable, doc })
    await vi.advanceTimersByTimeAsync(0)
    expect(doc._listenerCount('visibilitychange')).toBe(1)
    stop()
    expect(doc._listenerCount('visibilitychange')).toBe(0)
    await vi.advanceTimersByTimeAsync(5000)
    // The initial fire is the only call; no ticks after stop.
    expect(callable).toHaveBeenCalledTimes(1)
  })
})
