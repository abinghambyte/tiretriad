import { useRef, useState } from 'react'
import { useUserProfile } from '../../hooks/useUserProfile.js'
import { uploadTirePhoto } from '../../utils/tirePhotos.js'

export function TirePhotoButton({ tire, count = 0, onUploaded }) {
  const inputRef = useRef(null)
  const { profile } = useUserProfile()
  const [busy, setBusy] = useState(false)

  async function handleChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true)
    try {
      const photo = await uploadTirePhoto({
        mspn: tire.mspn,
        file,
        uploadedBy: profile?.uid || 'unknown',
      })
      onUploaded?.(photo)
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        aria-label={`Add photo for ${tire.description}`}
        className="inline-flex h-9 items-center gap-1 rounded-md border border-zinc-700 bg-zinc-900/60 px-2 text-xs font-medium text-zinc-200 hover:border-zinc-500 hover:bg-zinc-800 disabled:opacity-50"
      >
        <span aria-hidden>📷</span>
        <span className="tabular-nums">{count}</span>
        {busy ? <span className="text-zinc-400">...</span> : <span>+</span>}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleChange}
        className="sr-only"
      />
    </>
  )
}
