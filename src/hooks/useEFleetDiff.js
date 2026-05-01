import { useMemo } from 'react'

const EFLEET_SOURCED_FIELDS = ['price', 'fet', 'description', 'lr', 'tread']

/**
 * @typedef {Object} EFleetRecord
 * @property {number} fet
 * @property {number} price
 * @property {string} brand
 * @property {string} description
 * @property {string} lr
 * @property {string} tread
 */

/**
 * @typedef {Object} DiffEntry
 * @property {string} mspn
 * @property {string} brand
 * @property {string} description
 * @property {boolean} isOffProgram
 * @property {boolean} isBrandConflict
 * @property {Array<{ field: string, before: unknown, after: unknown }>} deltas
 * @property {number | null} tireFet     — present when a tire row exists
 * @property {number | null} tirePrice   — present when a tire row exists
 * @property {number | null} recordFet   — present when an eFleet record exists
 * @property {number | null} recordPrice — present when an eFleet record exists
 */

/**
 * Bucket each MSPN into {mismatched, invOnly, eFleetOnly, aligned} relative
 * to the latest eFleet snapshot.
 *
 * Soft-archived tires (`archivedAt` set) are excluded entirely; the operator
 * already removed them from active inventory. If the eFleet has a record for
 * an archived tire's MSPN, the MSPN lands in `eFleetOnly` (eFleet sees it,
 * active inventory does not).
 *
 * @param {Array<Record<string, unknown>>} tires
 * @param {Record<string, EFleetRecord>} records
 * @returns {{
 *   mismatched: Array<DiffEntry>,
 *   invOnly: Array<DiffEntry>,
 *   eFleetOnly: Array<DiffEntry>,
 *   aligned: Array<DiffEntry>,
 *   counts: { mismatched: number, invOnly: number, eFleetOnly: number, aligned: number, total: number },
 * }}
 */
export function useEFleetDiff(tires, records) {
  return useMemo(() => {
    const out = { mismatched: [], invOnly: [], eFleetOnly: [], aligned: [] }
    const recordsObj = records && typeof records === 'object' ? records : {}
    const tireByMspn = new Map()
    for (const t of Array.isArray(tires) ? tires : []) {
      if (t?.archivedAt) continue
      const key = String(t?.mspn ?? t?.id ?? '').trim()
      if (!key) continue
      tireByMspn.set(key, t)
    }

    const seen = new Set()
    for (const [mspn, tire] of tireByMspn) {
      seen.add(mspn)
      const record = recordsObj[mspn]
      if (!record) {
        out.invOnly.push({
          mspn,
          brand: String(tire.brand ?? ''),
          description: String(tire.description ?? ''),
          isOffProgram: !!tire.offProgramAt,
          isBrandConflict: false,
          deltas: [],
          tireFet: Number.isFinite(Number(tire.fet)) ? Number(tire.fet) : null,
          tirePrice: Number.isFinite(Number(tire.price)) ? Number(tire.price) : null,
          recordFet: null,
          recordPrice: null,
        })
        continue
      }
      const deltas = []
      if (String(tire.brand ?? '') !== String(record.brand ?? '')) {
        deltas.push({ field: 'brand', before: tire.brand, after: record.brand })
      }
      for (const f of EFLEET_SOURCED_FIELDS) {
        if (tire[f] !== record[f]) {
          deltas.push({ field: f, before: tire[f], after: record[f] })
        }
      }
      const entry = {
        mspn,
        brand: String(tire.brand ?? ''),
        description: String(tire.description ?? ''),
        isOffProgram: !!tire.offProgramAt,
        isBrandConflict: String(tire.brand ?? '') !== String(record.brand ?? ''),
        // Strip the synthetic 'brand' delta from the public list -- brand
        // conflict has its own pill; deltas should only carry eFleet-sourced
        // fields the importer would normally update.
        deltas: deltas.filter((d) => d.field !== 'brand'),
        tireFet: Number.isFinite(Number(tire.fet)) ? Number(tire.fet) : null,
        tirePrice: Number.isFinite(Number(tire.price)) ? Number(tire.price) : null,
        recordFet: Number.isFinite(Number(record.fet)) ? Number(record.fet) : null,
        recordPrice: Number.isFinite(Number(record.price)) ? Number(record.price) : null,
      }
      if (deltas.length > 0) {
        out.mismatched.push(entry)
      } else {
        out.aligned.push(entry)
      }
    }

    for (const mspn of Object.keys(recordsObj)) {
      if (seen.has(mspn)) continue
      const record = recordsObj[mspn]
      out.eFleetOnly.push({
        mspn,
        brand: String(record.brand ?? ''),
        description: String(record.description ?? ''),
        isOffProgram: false,
        isBrandConflict: false,
        deltas: [],
        tireFet: null,
        tirePrice: null,
        recordFet: Number.isFinite(Number(record.fet)) ? Number(record.fet) : null,
        recordPrice: Number.isFinite(Number(record.price)) ? Number(record.price) : null,
      })
    }

    const counts = {
      mismatched: out.mismatched.length,
      invOnly: out.invOnly.length,
      eFleetOnly: out.eFleetOnly.length,
      aligned: out.aligned.length,
      total: out.mismatched.length + out.invOnly.length + out.eFleetOnly.length + out.aligned.length,
    }
    return { ...out, counts }
  }, [tires, records])
}
