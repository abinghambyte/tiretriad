// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useListingCoach } from './useListingCoach.js'

describe('useListingCoach', () => {
  it('starts with empty messages and not pending', () => {
    const { result } = renderHook(() => useListingCoach({ callable: vi.fn() }))
    expect(result.current.messages).toEqual([])
    expect(result.current.pending).toBe(false)
  })

  it('appends user message + assistant reply on send', async () => {
    const fn = vi.fn().mockResolvedValue({ data: { reply: 'hello back' } })
    const { result } = renderHook(() => useListingCoach({ callable: fn }))
    await act(async () => { await result.current.send('hi') })
    expect(result.current.messages).toEqual([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello back' },
    ])
    expect(fn).toHaveBeenCalledWith({ messages: [{ role: 'user', content: 'hi' }], audience: null })
  })

  it('passes audience through when set', async () => {
    const fn = vi.fn().mockResolvedValue({ data: { reply: 'ok' } })
    const { result } = renderHook(() => useListingCoach({ callable: fn }))
    act(() => { result.current.setAudience('consumer') })
    await act(async () => { await result.current.send('draft') })
    expect(fn).toHaveBeenCalledWith({ messages: [{ role: 'user', content: 'draft' }], audience: 'consumer' })
  })

  it('surfaces error message when callable rejects', async () => {
    const fn = vi.fn().mockRejectedValue(Object.assign(new Error('boom'), { code: 'internal' }))
    const { result } = renderHook(() => useListingCoach({ callable: fn }))
    await act(async () => { await result.current.send('hi') })
    const last = result.current.messages.at(-1)
    expect(last.role).toBe('assistant')
    expect(last.error).toBe(true)
    expect(last.content).toContain('boom')
  })

  it('formats rate-limit error with retryAfter', async () => {
    const err = Object.assign(new Error('rate limit'), { code: 'resource-exhausted', details: { retryAfterMs: 120000 } })
    const fn = vi.fn().mockRejectedValue(err)
    const { result } = renderHook(() => useListingCoach({ callable: fn }))
    await act(async () => { await result.current.send('hi') })
    const last = result.current.messages.at(-1)
    expect(last.content).toMatch(/2 minutes/i)
  })

  it('formats permission-denied with admin message', async () => {
    const err = Object.assign(new Error('not allowed'), { code: 'permission-denied' })
    const fn = vi.fn().mockRejectedValue(err)
    const { result } = renderHook(() => useListingCoach({ callable: fn }))
    await act(async () => { await result.current.send('hi') })
    expect(result.current.messages.at(-1).content).toMatch(/admin/i)
  })

  it('clear empties messages', async () => {
    const fn = vi.fn().mockResolvedValue({ data: { reply: 'ok' } })
    const { result } = renderHook(() => useListingCoach({ callable: fn }))
    await act(async () => { await result.current.send('hi') })
    act(() => { result.current.clear() })
    expect(result.current.messages).toEqual([])
  })

  it('drops empty / whitespace-only sends', async () => {
    const fn = vi.fn()
    const { result } = renderHook(() => useListingCoach({ callable: fn }))
    await act(async () => { await result.current.send('   ') })
    expect(fn).not.toHaveBeenCalled()
    expect(result.current.messages).toEqual([])
  })

  it('drops concurrent sends while in-flight', async () => {
    let resolveFirst
    const fn = vi.fn()
      .mockImplementationOnce(() => new Promise((r) => { resolveFirst = () => r({ data: { reply: 'first' } }) }))
      .mockResolvedValue({ data: { reply: 'second' } })
    const { result } = renderHook(() => useListingCoach({ callable: fn }))
    let p1, p2
    await act(async () => {
      p1 = result.current.send('one')
      p2 = result.current.send('two')
      resolveFirst()
      await p1
      await p2
    })
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
