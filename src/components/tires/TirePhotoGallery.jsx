import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { deleteTirePhoto } from '../../utils/tirePhotos.js'

export function TirePhotoGallery({ tire, open, onClose, onDeleted }) {
  const [deletingPath, setDeletingPath] = useState(null)
  const photos = Array.isArray(tire?.photos) ? tire.photos : []

  useEffect(() => {
    if (!open) return undefined
    function onKeyDown(e) {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  async function onDelete(photo) {
    const ok = window.confirm('Delete this tire photo?')
    if (!ok) return
    setDeletingPath(photo.storagePath || photo.url)
    try {
      await deleteTirePhoto({ mspn: tire.mspn, photo })
      onDeleted?.(photo)
    } finally {
      setDeletingPath(null)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center">
      <button
        type="button"
        aria-label="Close tire photo gallery"
        className="absolute inset-0 cursor-default bg-black/70"
        onClick={onClose}
      />
      <div className="relative max-h-[86vh] w-full max-w-3xl overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-zinc-800 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100">Tire photo library</h2>
            <p className="mt-1 text-xs text-zinc-400">
              {tire?.mspn} · {photos.length} {photos.length === 1 ? 'photo' : 'photos'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-900"
          >
            Close
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-4">
          {photos.length === 0 ? (
            <p className="rounded-xl border border-dashed border-zinc-800 px-4 py-8 text-center text-sm text-zinc-400">
              No photos yet.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {photos.map((photo) => {
                const key = photo.storagePath || photo.url
                const deleting = deletingPath === key
                return (
                  <figure key={key} className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/70">
                    <img
                      src={photo.url}
                      alt={`Tire ${tire?.mspn || ''}`}
                      className="aspect-square w-full object-cover"
                    />
                    <figcaption className="flex items-center justify-between gap-2 px-2 py-2">
                      <span className="truncate text-[11px] text-zinc-500">
                        {photo.uploadedBy || 'unknown'}
                      </span>
                      <button
                        type="button"
                        disabled={deleting}
                        onClick={() => onDelete(photo)}
                        className="rounded-md border border-rose-900/60 px-2 py-1 text-[11px] font-medium text-rose-200 hover:bg-rose-950/40 disabled:opacity-50"
                      >
                        {deleting ? 'Deleting...' : 'Delete'}
                      </button>
                    </figcaption>
                  </figure>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
