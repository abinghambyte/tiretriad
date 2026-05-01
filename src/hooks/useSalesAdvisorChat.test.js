// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn(),
}))
vi.mock('../firebase/config', () => ({ functions: {} }))

import { httpsCallable } from 'firebase/functions'
import { useSalesAdvisorChat } from './useSalesAdvisorChat.js'

beforeEach(() => {
  httpsCallable.mockReset()
})

describe('useSalesAdvisorChat', () => {
  it('initial state: closed, empty messages, not pending', () => {
    httpsCallable.mockReturnValue(() => Promise.resolve({ data: { reply: 'ok', model: 'm' } }))
    const { result } = renderHook(() => useSalesAdvisorChat({ buildContext: () => ({}) }))
    expect(result.current.isOpen).toBe(false)
    expect(result.current.messages).toEqual([])
    expect(result.current.pending).toBe(false)
  })

  it('open / close / toggle flip isOpen', () => {
    httpsCallable.mockReturnValue(() => Promise.resolve({ data: {} }))
    const { result } = renderHook(() => useSalesAdvisorChat({ buildContext: () => ({}) }))
    act(() => result.current.open())
    expect(result.current.isOpen).toBe(true)
    act(() => result.current.close())
    expect(result.current.isOpen).toBe(false)
    act(() => result.current.toggle())
    expect(result.current.isOpen).toBe(true)
  })

  it('send appends user + assistant, calls callable, clears pending', async () => {
    const fn = vi.fn(async () => ({ data: { reply: 'great pitch idea', model: 'claude-haiku-4-5' } }))
    httpsCallable.mockReturnValue(fn)
    const { result } = renderHook(() => useSalesAdvisorChat({ buildContext: () => ({ test: 1 }) }))
    await act(async () => { await result.current.send('how do I sell more?') })
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn.mock.calls[0][0]).toMatchObject({
      surface: 'tires',
      messages: [{ role: 'user', content: 'how do I sell more?' }],
      context: { test: 1 },
    })
    expect(result.current.messages).toEqual([
      { role: 'user', content: 'how do I sell more?' },
      { role: 'assistant', content: 'great pitch idea' },
    ])
    expect(result.current.pending).toBe(false)
  })

  it('send with empty / whitespace text is a no-op', async () => {
    httpsCallable.mockReturnValue(vi.fn())
    const { result } = renderHook(() => useSalesAdvisorChat({ buildContext: () => ({}) }))
    await act(async () => { await result.current.send('') })
    await act(async () => { await result.current.send('   ') })
    expect(result.current.messages).toEqual([])
  })

  it('callable rejection appends a system-error bubble; pending cleared', async () => {
    const fn = vi.fn(async () => { throw new Error('boom') })
    httpsCallable.mockReturnValue(fn)
    const { result } = renderHook(() => useSalesAdvisorChat({ buildContext: () => ({}) }))
    await act(async () => { await result.current.send('hi') })
    expect(result.current.messages).toEqual([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: expect.stringMatching(/Advisor failed/), error: true },
    ])
    expect(result.current.pending).toBe(false)
  })

  it('clear empties messages without changing isOpen', async () => {
    httpsCallable.mockReturnValue(async () => ({ data: { reply: 'ok' } }))
    const { result } = renderHook(() => useSalesAdvisorChat({ buildContext: () => ({}) }))
    act(() => result.current.open())
    await act(async () => { await result.current.send('hi') })
    expect(result.current.messages.length).toBe(2)
    act(() => result.current.clear())
    expect(result.current.messages).toEqual([])
    expect(result.current.isOpen).toBe(true)
  })
})
