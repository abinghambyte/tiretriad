import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const uploadBytesMock = vi.hoisted(() => vi.fn())
const getDownloadURLMock = vi.hoisted(() => vi.fn())
const deleteObjectMock = vi.hoisted(() => vi.fn())
const storageRefMock = vi.hoisted(() => vi.fn())
const docMock = vi.hoisted(() => vi.fn())
const updateDocMock = vi.hoisted(() => vi.fn())
const arrayUnionMock = vi.hoisted(() => vi.fn((value) => ({ __arrayUnion: value })))
const arrayRemoveMock = vi.hoisted(() => vi.fn((value) => ({ __arrayRemove: value })))
const timestampNowMock = vi.hoisted(() => vi.fn(() => ({ __timestamp: true })))

vi.mock('../firebase/config', () => ({
  db: { __db: true },
  storage: { __storage: true },
}))

vi.mock('firebase/storage', () => ({
  ref: (...args) => storageRefMock(...args),
  uploadBytes: (...args) => uploadBytesMock(...args),
  getDownloadURL: (...args) => getDownloadURLMock(...args),
  deleteObject: (...args) => deleteObjectMock(...args),
}))

vi.mock('firebase/firestore', () => ({
  Timestamp: { now: (...args) => timestampNowMock(...args) },
  doc: (...args) => docMock(...args),
  updateDoc: (...args) => updateDocMock(...args),
  arrayUnion: (...args) => arrayUnionMock(...args),
  arrayRemove: (...args) => arrayRemoveMock(...args),
}))

import { deleteTirePhoto, uploadTirePhoto } from './tirePhotos.js'

describe('tirePhotos', () => {
  beforeEach(() => {
    uploadBytesMock.mockReset()
    getDownloadURLMock.mockReset()
    deleteObjectMock.mockReset()
    storageRefMock.mockReset()
    docMock.mockReset()
    updateDocMock.mockReset()
    arrayUnionMock.mockClear()
    arrayRemoveMock.mockClear()
    timestampNowMock.mockClear()
    let uuidCounter = 0
    vi.spyOn(crypto, 'randomUUID').mockImplementation(() => {
      uuidCounter += 1
      return `uuid-${uuidCounter}`
    })
    storageRefMock.mockImplementation((_storage, path) => ({ __storageRef: path }))
    docMock.mockImplementation((_db, collection, id) => ({ __doc: `${collection}/${id}` }))
    getDownloadURLMock.mockResolvedValue('https://example.test/tire.jpg')
    updateDocMock.mockResolvedValue(undefined)
    uploadBytesMock.mockResolvedValue(undefined)
    deleteObjectMock.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('uploads tire photos to an MSPN-scoped storage path and appends metadata to the tire doc', async () => {
    const file = new File(['photo'], 'photo.jpg', { type: 'image/jpeg' })

    const photo = await uploadTirePhoto({ mspn: '09100', file, uploadedBy: 'u1' })

    expect(storageRefMock).toHaveBeenCalledWith({ __storage: true }, 'tires/09100/uuid-1.jpg')
    expect(uploadBytesMock).toHaveBeenCalledWith(
      { __storageRef: 'tires/09100/uuid-1.jpg' },
      file,
      { contentType: 'image/jpeg' },
    )
    expect(getDownloadURLMock).toHaveBeenCalledWith({ __storageRef: 'tires/09100/uuid-1.jpg' })
    expect(arrayUnionMock).toHaveBeenCalledWith({
      url: 'https://example.test/tire.jpg',
      storagePath: 'tires/09100/uuid-1.jpg',
      uploadedAt: { __timestamp: true },
      uploadedBy: 'u1',
    })
    expect(updateDocMock).toHaveBeenCalledWith(
      { __doc: 'tires/09100' },
      { photos: { __arrayUnion: arrayUnionMock.mock.calls[0][0] } },
    )
    expect(photo.storagePath).toBe('tires/09100/uuid-1.jpg')
  })

  it('uses a fresh random filename for each upload', async () => {
    const file = new File(['photo'], 'photo.jpg', { type: 'image/jpeg' })

    await uploadTirePhoto({ mspn: '09100', file, uploadedBy: 'u1' })
    await uploadTirePhoto({ mspn: '09100', file, uploadedBy: 'u1' })

    expect(storageRefMock.mock.calls.map((call) => call[1])).toEqual([
      'tires/09100/uuid-1.jpg',
      'tires/09100/uuid-2.jpg',
    ])
  })

  it('removes tire photo metadata and deletes the storage object', async () => {
    const photo = {
      url: 'https://example.test/tire.jpg',
      storagePath: 'tires/09100/uuid-1.jpg',
      uploadedBy: 'u1',
    }

    await deleteTirePhoto({ mspn: '09100', photo })

    expect(arrayRemoveMock).toHaveBeenCalledWith(photo)
    expect(updateDocMock).toHaveBeenCalledWith(
      { __doc: 'tires/09100' },
      { photos: { __arrayRemove: photo } },
    )
    expect(deleteObjectMock).toHaveBeenCalledWith({ __storageRef: 'tires/09100/uuid-1.jpg' })
  })
})
