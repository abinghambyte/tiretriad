const STATUS_TONE_MAP = {
  pending: 'amber',
  available: 'sky',
  scheduled: 'violet',
  in_transit: 'sky',
  completed: 'emerald',
  ready: 'emerald',
  rejected: 'rose',
  cancelled: 'zinc',
  prospective: 'violet',
}

/**
 * Resolve an order/fulfillment status string to a StatusPill tone. Unknown
 * values fall through to the dashed `unknown` tone so they are visually
 * distinct from the muted-zinc `cancelled` tone.
 */
export function statusPillTone(status) {
  const k = String(status || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
  return STATUS_TONE_MAP[k] || 'unknown'
}
