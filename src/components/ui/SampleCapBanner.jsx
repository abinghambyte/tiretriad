import { formatQty } from '../../utils/format'

/**
 * Amber banner shown at the top of Analytics tabs when the completed-orders
 * sample hits the cap. Previously repeated verbatim three times.
 */
export function SampleCapBanner({ count }) {
  return (
    <p className="rounded-lg border border-amber-800/50 bg-amber-950/20 px-3 py-2 text-xs text-amber-400">
      Showing the {formatQty(count)} most recent completed orders. Older orders are excluded from all calculations on this page.
    </p>
  )
}
