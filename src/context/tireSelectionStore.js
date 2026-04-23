/**
 * Tire-selection pub/sub store.
 *
 * TiresDashboard owns the selection state, related bulk-action modals, and
 * all of the closures those modals need (toast, sortedRows, tireCatalogBuy,
 * etc.). The command palette lives outside the route tree (mounted in
 * PortalChrome as a sibling to `<Outlet />`), so it cannot read this state
 * through normal React context. This module-level store + a
 * `useSyncExternalStore` subscription bridges the gap without lifting
 * TiresDashboard's entire innards up the tree.
 *
 * Snapshot shape -- all fields optional, missing means the action is not
 * available. `count` is the one field that always reflects reality; action
 * runners are present only when the publisher can currently honor them.
 *
 * {
 *   count: number,            // selected tires
 *   canQuote: boolean,        // exactly 1 tire + the single-tire modal can open
 *   canLogSale: boolean,      // >= 1 tire + a primary MSPN is resolvable
 *   canGenerateListings: boolean,
 *   canBulkOverhead: boolean,
 *   runQuote?: () => void,
 *   runLogSale?: () => void,
 *   runGenerateListings?: () => void,
 *   runBulkOverhead?: () => void,
 *   runClearSelection?: () => void,
 * }
 *
 * When no publisher is mounted (e.g. user is on Analytics), `getSnapshot`
 * returns the stable `EMPTY` object so React doesn't tear on reference
 * equality checks.
 */

const EMPTY = Object.freeze({
  count: 0,
  canQuote: false,
  canLogSale: false,
  canGenerateListings: false,
  canBulkOverhead: false,
})

let snapshot = EMPTY
/** @type {Set<() => void>} */
const listeners = new Set()

/**
 * Current selection snapshot. Returned by reference so React's
 * `useSyncExternalStore` can skip re-renders when nothing changed.
 * @returns {typeof EMPTY}
 */
export function getTireSelectionSnapshot() {
  return snapshot
}

/**
 * Replace the current snapshot and notify subscribers. Publishers (the
 * TiresDashboard `useEffect`) call this whenever selection, loading, or
 * derived availability changes. Pass `null` to clear (on unmount).
 *
 * @param {typeof EMPTY | null} next
 */
export function setTireSelection(next) {
  snapshot = next || EMPTY
  for (const fn of listeners) {
    try {
      fn()
    } catch (e) {
      // A broken listener must not poison the notification loop for others.
      console.error('tireSelectionStore listener threw', e)
    }
  }
}

/**
 * Subscribe to snapshot changes. Returns the unsubscribe function in the
 * shape `useSyncExternalStore` expects.
 *
 * @param {() => void} listener
 * @returns {() => void}
 */
export function subscribeTireSelection(listener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
