/** @vitest-environment jsdom */
globalThis.IS_REACT_ACT_ENVIRONMENT = true

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const uploadTirePhotoMock = vi.hoisted(() => vi.fn())

vi.mock('../../hooks/useUserProfile.js', () => ({
  useUserProfile: () => ({ profile: { uid: 'u1' } }),
}))

vi.mock('../../utils/tirePhotos.js', () => ({
  uploadTirePhoto: (...args) => uploadTirePhotoMock(...args),
}))

import { TirePhotoButton } from './TirePhotoButton.jsx'

const tire = {
  mspn: '09100',
  description: 'BFGOODRICH LT265/70R17 KO3',
}

beforeEach(() => {
  uploadTirePhotoMock.mockReset()
  uploadTirePhotoMock.mockResolvedValue({
    url: 'https://example.test/tire.jpg',
    storagePath: 'tires/09100/photo.jpg',
  })
})

afterEach(() => cleanup())

describe('TirePhotoButton', () => {
  it('renders the camera count and add affordance', () => {
    render(<TirePhotoButton tire={tire} count={3} />)

    expect(screen.getByRole('button', { name: /add photo for bfgoodrich/i }).textContent).toContain('3')
    expect(screen.getByText('+')).toBeTruthy()
  })

  it('opens the hidden file input when clicked', () => {
    render(<TirePhotoButton tire={tire} count={0} />)
    const input = document.querySelector('input[type="file"]')
    const clickSpy = vi.spyOn(input, 'click').mockImplementation(() => {})

    fireEvent.click(screen.getByRole('button', { name: /add photo for bfgoodrich/i }))

    expect(clickSpy).toHaveBeenCalledTimes(1)
  })

  it('uploads the selected file and calls onUploaded with the new photo', async () => {
    const onUploaded = vi.fn()
    render(<TirePhotoButton tire={tire} count={0} onUploaded={onUploaded} />)
    const input = document.querySelector('input[type="file"]')
    const file = new File(['photo'], 'photo.jpg', { type: 'image/jpeg' })

    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => expect(uploadTirePhotoMock).toHaveBeenCalled())
    expect(uploadTirePhotoMock).toHaveBeenCalledWith({
      mspn: '09100',
      file,
      uploadedBy: 'u1',
    })
    await waitFor(() =>
      expect(onUploaded).toHaveBeenCalledWith({
        url: 'https://example.test/tire.jpg',
        storagePath: 'tires/09100/photo.jpg',
      }),
    )
  })
})
