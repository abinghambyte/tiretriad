import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  safeGetJSON,
  safeGetString,
  safeSetJSON,
  safeSetString,
} from './localStorage.js'

describe('localStorage utils', () => {
  const store = new Map()
  let warnSpy

  beforeEach(() => {
    store.clear()
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    globalThis.window = {
      localStorage: {
        getItem: (key) => (store.has(key) ? store.get(key) : null),
        setItem: (key, value) => {
          store.set(key, String(value))
        },
        removeItem: (key) => {
          store.delete(key)
        },
        clear: () => {
          store.clear()
        },
      },
    }
  })

  afterEach(() => {
    warnSpy.mockRestore()
    delete globalThis.window
  })

  it('safeGetJSON / safeSetJSON round-trip', () => {
    safeSetJSON('k', { a: 1 })
    expect(safeGetJSON('k', null)).toEqual({ a: 1 })
  })

  it('safeGetJSON returns fallback when key missing', () => {
    expect(safeGetJSON('missing', { x: 1 })).toEqual({ x: 1 })
  })

  it('safeGetJSON returns fallback on invalid JSON with a console.warn', () => {
    store.set('bad', '{')
    expect(safeGetJSON('bad', [])).toEqual([])
    expect(warnSpy).toHaveBeenCalledTimes(1)
  })

  it('safeSetJSON swallows quota errors with console.warn', () => {
    globalThis.window.localStorage.setItem = () => {
      const err = new Error('quota')
      err.name = 'QuotaExceededError'
      throw err
    }
    safeSetJSON('k', { v: 1 })
    expect(warnSpy).toHaveBeenCalledTimes(1)
  })

  it('safeGetString / safeSetString round-trip and default fallback', () => {
    safeSetString('s', 'hello')
    expect(safeGetString('s')).toBe('hello')
    expect(safeGetString('nope')).toBe('')
    expect(safeGetString('nope', 'z')).toBe('z')
  })

  it('safeGetString warns and falls back on getItem throw', () => {
    globalThis.window.localStorage.getItem = () => {
      throw new Error('blocked')
    }
    expect(safeGetString('k', 'fb')).toBe('fb')
    expect(warnSpy).toHaveBeenCalledTimes(1)
  })

  it('returns fallbacks and skips writes when window is undefined (SSR)', () => {
    delete globalThis.window
    expect(safeGetJSON('k', 3)).toBe(3)
    expect(safeGetString('k', 'd')).toBe('d')
    safeSetJSON('k', { a: 1 })
    safeSetString('k', 'x')
    expect(store.size).toBe(0)
  })
})
