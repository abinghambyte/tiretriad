/**
 * Overhead total stored as `cts` on tire docs: mount + delivery + other (USD per tire).
 * FET is already included in Kyle's catalog `price` — do not add it here.
 * @param {{ mountCost?: unknown, deliveryCost?: unknown, otherCost?: unknown }} parts
 * @returns {number}
 */
export function computeCts(parts) {
  const n = (v) => {
    const x = Number(v)
    return Number.isFinite(x) ? x : 0
  }
  return n(parts?.mountCost) + n(parts?.deliveryCost) + n(parts?.otherCost)
}

/** Editable overhead fields for inline / bulk editors. */
export function tireOverheadParts(tire) {
  return {
    mountCost: Number(tire?.mountCost) || 0,
    deliveryCost: Number(tire?.deliveryCost) || 0,
    otherCost: Number(tire?.otherCost) || 0,
  }
}

/** Overhead total from catalog row (matches Firestore `cts` after save). */
export function effectiveCts(tire) {
  return computeCts(tire)
}
