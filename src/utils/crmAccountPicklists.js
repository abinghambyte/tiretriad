/** Segment = business / fleet lane (stored on `crmAccounts.segment`). */
export const CRM_ACCOUNT_SEGMENTS = [
  { value: '', label: 'Unassigned' },
  { value: 'delivery_last_mile', label: 'Delivery / last-mile' },
  { value: 'contractor_trades', label: 'Contractor / trades' },
  { value: 'agriculture', label: 'Agriculture & ag' },
  { value: 'municipal', label: 'Municipal / government' },
  { value: 'dealership_repair', label: 'Dealership / repair shop' },
  { value: 'towing_recovery', label: 'Towing & recovery' },
  { value: 'transport_warehouse', label: 'Transport / warehouse / yard' },
  { value: 'mixed_fleet', label: 'Mixed commercial fleet' },
]

/** Primary vehicle type category (stored on `vehicleProfile.vehicleTypeCategory`). */
export const CRM_VEHICLE_TYPE_CATEGORIES = [
  { value: '', label: 'Select a category' },
  { value: 'half_ton_pickup', label: '½-ton pickup / light truck' },
  { value: 'three_quarter_ton', label: '¾-ton pickup' },
  { value: 'one_ton_plus', label: '1-ton+ / medium duty' },
  { value: 'cargo_van', label: 'Cargo van (Transit / Sprinter / ProMaster style)' },
  { value: 'box_truck', label: 'Box truck / straight truck' },
  { value: 'semi_tractor', label: 'Semi / tractor-trailer' },
  { value: 'suv_crossover', label: 'SUV / crossover fleet' },
  { value: 'sedan_car', label: 'Sedan / car fleet' },
  { value: 'specialty', label: 'Specialty (coach, RV, equipment)' },
  { value: 'mixed_types', label: 'Mixed types' },
  { value: 'other', label: 'Other (use notes)' },
]

export const CRM_SEGMENT_VALUE_SET = new Set(CRM_ACCOUNT_SEGMENTS.map((s) => s.value).filter(Boolean))

/** @param {unknown} stored */
export function crmSegmentIsPreset(stored) {
  const s = String(stored ?? '').trim()
  return s === '' || CRM_SEGMENT_VALUE_SET.has(s)
}

/** @param {unknown} key */
export function crmSegmentLabel(key) {
  const k = String(key ?? '').trim()
  if (!k) return '—'
  const row = CRM_ACCOUNT_SEGMENTS.find((s) => s.value === k)
  return row ? row.label : k
}

/** @param {unknown} key */
export function crmVehicleTypeCategoryLabel(key) {
  const k = String(key ?? '').trim()
  if (!k) return '—'
  const row = CRM_VEHICLE_TYPE_CATEGORIES.find((s) => s.value === k)
  return row ? row.label : k
}

/** @param {unknown} raw */
export function normalizeCrmVin(raw) {
  const u = String(raw ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
  return u.slice(0, 17)
}
