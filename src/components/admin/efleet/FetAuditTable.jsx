function fmtCurrency(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return String(n ?? '')
  return `$${n.toFixed(2)}`
}

/**
 * Tab 2 of /admin/efleet: tax-compliance focus on FET deltas.
 *
 * Filters diff.mismatched to entries with a FET delta. Sorts by absolute
 * delta descending so the biggest tax-compliance risks float to the top.
 * Read-only — operator follows up by editing the tire doc directly or
 * running a one-off script.
 */
export function FetAuditTable({ diff }) {
  const rows = (diff.mismatched || [])
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
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.absDelta - a.absDelta)

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
            <tr key={r.mspn} className="border-t border-zinc-800/60">
              <td className="px-3 py-2 font-mono text-zinc-300">{r.mspn}</td>
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
