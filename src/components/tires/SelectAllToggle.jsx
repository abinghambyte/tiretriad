/**
 * Two-stage Select All toggle for the Tires sticky toolbar.
 *
 * Stage 1 (default): "Select page (N)" — selects only the rows currently
 * visible on the page. While the page selection is partial-of-total, an
 * optional secondary "Select all M matching" link appears so the user can
 * promote the selection to every filtered row.
 * Stage 2 (page selected): "{N} selected" — clicking again clears.
 * Stage 3 (all matching selected): "Deselect all (N)".
 *
 * The component is purely presentational: callers own selection state and
 * pass derived booleans plus toggle handlers.
 *
 * Today the Tires dashboard has no pagination, so `pageRows === sortedRows`
 * and `moreBeyondVisible` will always be false. The abstraction is kept in
 * place to future-proof against later virtualization or pagination.
 */
export function SelectAllToggle({
  pageCount,
  totalCount,
  selectedCount,
  visibleSelected,
  allMatchingSelected,
  moreBeyondVisible,
  onTogglePage,
  onSelectAllMatching,
}) {
  const label = allMatchingSelected
    ? `Deselect all (${totalCount})`
    : visibleSelected
      ? `${selectedCount} selected`
      : `Select page (${pageCount})`

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        aria-pressed={visibleSelected}
        onClick={onTogglePage}
        className={`min-h-[44px] whitespace-nowrap rounded-lg border px-3 py-2 text-sm sm:min-h-0 ${
          visibleSelected
            ? 'border-amber-600 bg-amber-950/40 text-amber-100 hover:bg-amber-950/60'
            : 'border-zinc-600 text-zinc-200 hover:border-zinc-500 hover:bg-zinc-900/60'
        }`}
      >
        {label}
      </button>
      {visibleSelected && !allMatchingSelected && moreBeyondVisible ? (
        <button
          type="button"
          onClick={onSelectAllMatching}
          className="min-h-[44px] px-2 text-xs text-amber-300 underline-offset-2 hover:underline sm:min-h-0 sm:px-0"
        >
          Select all {totalCount} matching
        </button>
      ) : null}
    </div>
  )
}
