/**
 * Floating action button bottom-right of the Tires page. Hidden when the
 * drawer is open (parent gates rendering, not this component).
 */
export function SalesAdvisorTrigger({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Open sales advisor"
      className="fixed bottom-6 right-6 z-30 inline-flex h-14 w-14 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 text-zinc-100 shadow-lg transition-transform hover:-translate-y-0.5 hover:border-amber-600/40 hover:bg-zinc-800"
    >
      <span aria-hidden className="text-2xl">💬</span>
    </button>
  )
}
