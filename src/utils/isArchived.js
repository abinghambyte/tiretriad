/**
 * Soft-delete helper.
 *
 * Returns true if the doc has been archived via the wipe-safety pattern
 * (`archivedAt` field set to a truthy timestamp). Use to filter out
 * archived docs in client-side list rendering:
 *
 *   const visible = users.filter((u) => !isArchived(u))
 *
 * Why client-side:
 *   Firestore `where('archivedAt', '==', null)` does NOT match docs that
 *   lack the field at all (only docs with the field explicitly set to
 *   null). Most existing docs predate the pattern and have no field.
 *   Filtering in JS handles both shapes uniformly.
 *
 * @param {Record<string, unknown> | null | undefined} data Firestore doc data.
 * @returns {boolean}
 */
export function isArchived(data) {
  if (!data) return false
  const v = data.archivedAt
  if (v === null || v === undefined) return false
  // Truthy: Firestore Timestamp, Date, ISO string, or any non-empty value.
  return Boolean(v)
}
