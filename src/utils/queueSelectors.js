/**
 * Pure selectors for the research queue. Kept out of page modules so
 * react-refresh can fast-refresh the page components cleanly.
 */

function queueAtMillis(tire) {
  const at = tire?.researchQueue?.at
  if (at && typeof at.toMillis === 'function') return at.toMillis()
  if (typeof at === 'number') return at
  if (at && typeof at.seconds === 'number') return at.seconds * 1000
  return 0
}

/**
 * Open queue rows (researchQueue set, no resolvedAt), newest-at-top.
 *
 * @param {Array<Record<string, unknown>>} tires
 */
export function selectOpenQueueRows(tires) {
  const rows = []
  for (const t of tires || []) {
    const rq = t?.researchQueue
    if (!rq || typeof rq !== 'object') continue
    if (rq.resolvedAt != null) continue
    rows.push(t)
  }
  rows.sort((a, b) => queueAtMillis(b) - queueAtMillis(a))
  return rows
}
