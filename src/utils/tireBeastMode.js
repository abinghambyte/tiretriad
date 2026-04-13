/**
 * Beast mode: sold within 24h of intake (same-day turnaround signal).
 * @param {{ lastSoldAt?: { toMillis?: () => number }; lastIntakeAt?: { toMillis?: () => number } }} tire
 */
export function isTireBeastMode(tire) {
  if (!tire || typeof tire !== 'object') return false
  const sold = tire.lastSoldAt
  const intake = tire.lastIntakeAt
  const sm = sold && typeof sold.toMillis === 'function' ? sold.toMillis() : null
  const im = intake && typeof intake.toMillis === 'function' ? intake.toMillis() : null
  if (sm == null || im == null) return false
  const dt = Math.abs(sm - im)
  return dt <= 24 * 3600000
}
