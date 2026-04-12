/**
 * CTS = cost to sell — sum of landed cost components (FET excluded; add to cost if needed).
 * @param {{ cost?: unknown, mountCost?: unknown, deliveryCost?: unknown, otherCost?: unknown }} parts
 * @returns {number}
 */
export function computeCts(parts) {
  const n = (v) => {
    const x = Number(v)
    return Number.isFinite(x) ? x : 0
  }
  return (
    n(parts?.cost) +
    n(parts?.mountCost) +
    n(parts?.deliveryCost) +
    n(parts?.otherCost)
  )
}

export function tireCostParts(tire) {
  return {
    cost: Number(tire?.cost) || 0,
    mountCost: Number(tire?.mountCost) || 0,
    deliveryCost: Number(tire?.deliveryCost) || 0,
    otherCost: Number(tire?.otherCost) || 0,
  }
}

/** @returns {'A' | 'B' | 'C' | ''} */
export function gradeLetter(tire) {
  const g = String(tire?.grade || '').trim().toUpperCase()
  if (g === 'A' || g === 'B' || g === 'C') return g
  return ''
}

/** @param {'A' | 'B' | 'C' | ''} letter */
export function gradePillClass(letter) {
  switch (letter) {
    case 'A':
      return 'bg-emerald-950/90 text-emerald-200 ring-1 ring-emerald-800/70'
    case 'B':
      return 'bg-amber-950/90 text-amber-200 ring-1 ring-amber-800/60'
    case 'C':
      return 'bg-zinc-700/90 text-zinc-200 ring-1 ring-zinc-600/80'
    default:
      return 'bg-zinc-800/80 text-zinc-500 ring-1 ring-zinc-700'
  }
}
