// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

vi.mock('../firebase/config', () => ({ db: {} }))

const onSnapshotMock = vi.fn()
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({})),
  onSnapshot: (...args) => onSnapshotMock(...args),
}))

import { useCategoryMap } from './useCategoryMap.js'

beforeEach(() => {
  onSnapshotMock.mockReset()
})

describe('useCategoryMap', () => {
  it('starts with null map and loading=true', () => {
    onSnapshotMock.mockImplementation(() => () => {}) // never fires
    const { result } = renderHook(() => useCategoryMap())
    expect(result.current.categoryMap).toBeNull()
    expect(result.current.loading).toBe(true)
  })

  it('emits the snapshot data when Firestore fires', async () => {
    let cb
    onSnapshotMock.mockImplementation((_ref, next) => {
      cb = next
      return () => {}
    })
    const { result } = renderHook(() => useCategoryMap())
    cb({
      exists: () => true,
      data: () => ({ mspns: { '54802': 'lightTruck' }, importedAt: 123 }),
    })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.categoryMap).toEqual({
      mspns: { '54802': 'lightTruck' },
      importedAt: 123,
    })
  })

  it('handles missing doc gracefully', async () => {
    let cb
    onSnapshotMock.mockImplementation((_ref, next) => {
      cb = next
      return () => {}
    })
    const { result } = renderHook(() => useCategoryMap())
    cb({ exists: () => false })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.categoryMap).toBeNull()
  })
})
