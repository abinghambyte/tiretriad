import Spinner from '../ui/Spinner.jsx'

/**
 * Centered loading block with a spinner and a label. Drop-in replacement
 * for the "Loading…" plain-text paragraphs scattered across a few pages.
 * Keeps padding/layout consistent with `EmptyState` so the page does not
 * jump vertically when data arrives.
 *
 * @param {object} props
 * @param {string} [props.label]  secondary text, e.g. "Loading jobs…"
 * @param {'card' | 'inline'} [props.variant]  card = padded bordered container; inline = just center+padding
 */
export function LoadingBlock({ label = 'Loading…', variant = 'card' }) {
  const body = (
    <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
      <Spinner className="h-6 w-6 text-zinc-400" />
      <p className="mt-3 text-xs text-zinc-500">{label}</p>
    </div>
  )
  if (variant === 'inline') return body
  return (
    <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30">
      {body}
    </div>
  )
}
