/**
 * Tires filter panel. Renders inline within the catalog content column
 * when `open` is true, pushing the table down. Naturally inherits the
 * page's content width so it doesn't extend beyond other surfaces.
 *
 * Earlier iterations used `position: fixed` with dynamic toolbar-bottom
 * measurement; that was abandoned because (a) the panel rendered wider
 * than the page chrome on large viewports and (b) sticky-toolbar reflow
 * during scroll left the panel stale until the next resize event.
 *
 * Inline rendering is simpler and correct: the panel sits between the
 * sticky toolbar and the table, so the trigger button stays clickable to
 * close, and the table is visibly pushed down rather than obscured.
 */
export function TiresFilterOverlay({ open, onClose, children }) {
  if (!open) return null

  return (
    <div
      id="tires-filter-panel"
      role="region"
      aria-label="Filter tires"
      className="rounded-xl border border-zinc-700 bg-zinc-950 p-3"
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
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
      {children}
    </div>
  )
}
