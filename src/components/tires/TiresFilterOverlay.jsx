import { useLayoutEffect, useState } from 'react'

/**
 * Tires filter overlay panel. Anchors itself dynamically 4px below the
 * sticky toolbar's bottom edge (measured via `toolbarRef`), removing the
 * drift risk from previously hardcoded `top-[148px]`/`sm:top-[164px]`
 * Tailwind classes.
 *
 * Renders nothing when `open` is false. The backdrop and panel are rendered
 * as siblings; clicking the backdrop or the in-panel close button calls
 * `onClose`.
 */
export function TiresFilterOverlay({ toolbarRef, open, onClose, children }) {
  const [overlayTop, setOverlayTop] = useState(0)

  useLayoutEffect(() => {
    if (!open || !toolbarRef?.current) return undefined
    const measure = () => {
      const node = toolbarRef?.current
      if (!node) return
      setOverlayTop(node.getBoundingClientRect().bottom + 4)
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [open, toolbarRef])

  if (!open) return null

  return (
    <>
      <div
        className="fixed inset-0 z-30"
        onClick={onClose}
        aria-hidden
      />
      <div
        id="tires-filter-panel"
        role="dialog"
        aria-label="Filter tires"
        style={{ top: overlayTop }}
        className="fixed left-4 right-4 z-[120] max-h-[80vh] overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-950 p-3 shadow-2xl sm:left-6 sm:right-6"
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-zinc-200">Filters</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close filters"
            className="flex h-11 w-11 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-100"
          >
            <svg
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden
            >
              <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </>
  )
}
