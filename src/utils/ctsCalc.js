/**
 * Overhead total stored as `cts` on tire docs: mount + delivery + other (USD per tire).
 * FET is already included in Kyle's catalog `price` -- do not add it here.
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

/**
 * Returns true when at least one overhead component (mount / delivery / other
 * or the cached `cts` total) is a non-zero number, meaning the crew has
 * explicitly set an overhead figure for this tire. A record whose fields are
 * all missing or zero is treated as "not set yet" so the catalog can render
 * an explicit "not set" state instead of a misleading $0.00.
 * @param {Record<string, unknown>} tire
 */
export function hasOverheadRecorded(tire) {
  const n = (v) => {
    const x = Number(v)
    return Number.isFinite(x) ? x : 0
  }
  return n(tire?.cts) > 0 || n(tire?.mountCost) > 0 || n(tire?.deliveryCost) > 0 || n(tire?.otherCost) > 0
}
