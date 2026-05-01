function fmtCurrency(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return String(n ?? '')
  return `$${n.toFixed(2)}`
}

/**
 * Tab 2 of /admin/efleet: tax-compliance focus on FET amounts.
 *
 * Two passes:
 *   1. diff.mismatched entries with a FET delta — portal disagrees with
 *      eFleet on the FET amount.
 *   2. diff.invOnly entries where the tire carries fet > 0 but eFleet has no
 *      record for the MSPN — surfaces the over-applied-FET shape from the
 *      spec (`$3.00 overhead-as-FET typo` on aged stock).
 *
 * Sorts by absolute FET amount descending so biggest tax-compliance risks
 * float to the top. Read-only.
 */
export function FetAuditTable({ diff }) {
  const mismatchedRows = (diff.mismatched || [])
    .map((m) => {
      const fetDelta = m.deltas.find((d) => d.field === 'fet')
      if (!fetDelta) return null
      const before = Number(fetDelta.before) || 0
      const after = Number(fetDelta.after) || 0
      return {
        ...m,
        portalFet: before,
        eFleetFet: after,
        absDelta: Math.abs(after - before),
        kind: 'mismatch',
      }
    })
    .filter(Boolean)

  const overAppliedRows = (diff.invOnly || [])
    .map((iv) => {
      const fet = Number(iv.tireFet) || 0
      if (fet <= 0) return null
      return {
        ...iv,
        portalFet: fet,
        eFleetFet: 0,
        absDelta: fet,
        kind: 'over-applied',
      }
    })
    .filter(Boolean)

  const rows = [...mismatchedRows, ...overAppliedRows].sort(
    (a, b) => b.absDelta - a.absDelta,
  )

  if (rows.length === 0) {
    return (
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 text-center">
        <p className="text-sm text-zinc-400">No FET mismatches between portal and eFleet. Tax compliance is clean.</p>
      </section>
    )
  }

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-2 sm:p-3">
      <table className="min-w-full text-left text-sm">
        <thead className="sticky top-0 bg-zinc-900/95 text-xs uppercase tracking-wide text-zinc-400">
          <tr>
            <th className="px-3 py-2">MSPN</th>
            <th className="px-3 py-2">Brand</th>
            <th className="px-3 py-2">Description</th>
            <th className="px-3 py-2 text-right">Portal FET</th>
            <th className="px-3 py-2 text-right">eFleet FET</th>
            <th className="px-3 py-2 text-right">Δ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.kind}-${r.mspn}`} className="border-t border-zinc-800/60">
              <td className="px-3 py-2 font-mono text-zinc-300">
                {r.mspn}
                {r.kind === 'over-applied' ? (
                  <span
                    className="ml-2 rounded bg-amber-950/40 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-300"
                    title="Tire carries FET but eFleet has no record for this MSPN"
                  >
                    OVER-APPLIED
                  </span>
                ) : null}
              </td>
              <td className="px-3 py-2 text-zinc-300">{r.brand}</td>
              <td className="px-3 py-2 text-zinc-400">{r.description}</td>
              <td className="px-3 py-2 text-right font-mono text-zinc-300">{fmtCurrency(r.portalFet)}</td>
              <td className="px-3 py-2 text-right font-mono text-red-300">{fmtCurrency(r.eFleetFet)}</td>
              <td className="px-3 py-2 text-right font-mono font-bold text-red-300">{fmtCurrency(r.absDelta)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
