/**
 * Canonical tire category keys + display labels. Source of truth for the
 * 'passenger' | 'lightTruck' | 'truck' triple that previously lived inline
 * across CategoryTabs.jsx, TiresDashboard.jsx, and useDashboardSignals.js.
 *
 * Adding a new category (e.g. OTR):
 *   1. Append to TIRE_CATEGORY_KEYS in the order it should appear in tabs.
 *   2. Add the human label to CATEGORY_LABELS.
 *   3. Update the meta/categoryMap importer (scripts/import-efleet.mjs) to
 *      emit the new category for matching MSPNs.
 */

/** @type {ReadonlyArray<'passenger' | 'lightTruck' | 'truck'>} */
export const TIRE_CATEGORY_KEYS = ['passenger', 'lightTruck', 'truck']

/** @type {Record<string, string>} */
export const CATEGORY_LABELS = {
  passenger: 'Passenger',
  lightTruck: 'Light Truck',
  truck: 'Truck',
}

/**
 * Brands the Skedaddle Loveland account stocks (per Michelin eFleet). Used
 * by `useBrandAggregates` to surface a NOT STOCKED warning when one of these
 * drops to zero in the catalog.
 */
export const EXPECTED_BRANDS = ['MICHELIN', 'BFGOODRICH', 'UNIROYAL']
