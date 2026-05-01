import { DiffStateTabs } from './DiffStateTabs.jsx'

function fmtCurrency(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return String(n ?? '')
  return `$${n.toFixed(2)}`
}

function DeltaList({ deltas }) {
  if (!deltas || deltas.length === 0) return null
  return (
    <ul className="font-mono text-[11px] text-zinc-300">
      {deltas.map((d) => {
        const before = d.field === 'price' || d.field === 'fet' ? fmtCurrency(d.before) : String(d.before ?? '')
        const after = d.field === 'price' || d.field === 'fet' ? fmtCurrency(d.after) : String(d.after ?? '')
        return (
          <li key={d.field}>
            <span className="text-zinc-500">{d.field}:</span> {before}{' '}
            <span className="text-zinc-500">→</span> <span className="text-red-300">{after}</span>
          </li>
        )
      })}
    </ul>
  )
}

function MismatchedTable({ rows }) {
  return (
    <table className="min-w-full text-left text-sm">
      <thead className="sticky top-0 bg-zinc-900/95 text-xs uppercase tracking-wide text-zinc-400">
        <tr>
          <th className="px-3 py-2">MSPN</th>
          <th className="px-3 py-2">Brand</th>
          <th className="px-3 py-2">Description</th>
          <th className="px-3 py-2">Deltas</th>
          <th className="px-3 py-2">Notes</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.mspn} className="border-t border-zinc-800/60">
            <td className="px-3 py-2 font-mono text-zinc-300">{r.mspn}</td>
            <td className="px-3 py-2 text-zinc-300">{r.brand}</td>
            <td className="px-3 py-2 text-zinc-400">{r.description}</td>
            <td className="px-3 py-2"><DeltaList deltas={r.deltas} /></td>
            <td className="px-3 py-2">
              {r.isBrandConflict ? (
                <span className="rounded bg-red-950/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-300">
                  BRAND CONFLICT
                </span>
              ) : null}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function InvOnlyTable({ rows }) {
  return (
    <table className="min-w-full text-left text-sm">
      <thead className="sticky top-0 bg-zinc-900/95 text-xs uppercase tracking-wide text-zinc-400">
        <tr>
          <th className="px-3 py-2">MSPN</th>
          <th className="px-3 py-2">Brand</th>
          <th className="px-3 py-2">Description</th>
          <th className="px-3 py-2">Notes</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.mspn} className="border-t border-zinc-800/60">
            <td className="px-3 py-2 font-mono text-zinc-300">{r.mspn}</td>
            <td className="px-3 py-2 text-zinc-300">{r.brand}</td>
            <td className="px-3 py-2 text-zinc-400">{r.description}</td>
            <td className="px-3 py-2">
              {r.isOffProgram ? (
                <span className="rounded bg-amber-950/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-300">
                  OFF-PROGRAM
                </span>
              ) : null}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function EFleetOnlyTable({ rows }) {
  return (
    <table className="min-w-full text-left text-sm">
      <thead className="sticky top-0 bg-zinc-900/95 text-xs uppercase tracking-wide text-zinc-400">
        <tr>
          <th className="px-3 py-2">MSPN</th>
          <th className="px-3 py-2">Brand</th>
          <th className="px-3 py-2">Description</th>
          <th className="px-3 py-2 text-right">eFleet Price</th>
          <th className="px-3 py-2 text-right">eFleet FET</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.mspn} className="border-t border-zinc-800/60">
            <td className="px-3 py-2 font-mono text-zinc-300">{r.mspn}</td>
            <td className="px-3 py-2 text-zinc-300">{r.brand}</td>
            <td className="px-3 py-2 text-zinc-400">{r.description}</td>
            <td className="px-3 py-2 text-right font-mono text-zinc-300">
              {r.recordPrice != null ? fmtCurrency(r.recordPrice) : '--'}
            </td>
            <td className="px-3 py-2 text-right font-mono text-zinc-300">
              {r.recordFet != null ? fmtCurrency(r.recordFet) : '--'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function AlignedTable({ rows }) {
  return (
    <table className="min-w-full text-left text-sm">
      <thead className="sticky top-0 bg-zinc-900/95 text-xs uppercase tracking-wide text-zinc-400">
        <tr>
          <th className="px-3 py-2">MSPN</th>
          <th className="px-3 py-2">Brand</th>
          <th className="px-3 py-2">Description</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.mspn} className="border-t border-zinc-800/40">
            <td className="px-3 py-2 font-mono text-zinc-500">{r.mspn}</td>
            <td className="px-3 py-2 text-zinc-500">{r.brand}</td>
            <td className="px-3 py-2 text-zinc-600">{r.description}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/**
 * Tab 3 of /admin/efleet: sub-tabs + per-state tables.
 *
 * Stateless WRT the active state -- receives initialState + onStateChange
 * so AdminEFleetPage can sync the URL ?state= param.
 */
export function EFleetDiffView({ diff, initialState, onStateChange }) {
  const active = initialState
  const rowsByState = {
    mismatched: diff.mismatched,
    invOnly: diff.invOnly,
    eFleetOnly: diff.eFleetOnly,
    aligned: diff.aligned,
  }
  const rows = rowsByState[active] || []
  const TableForState = {
    mismatched: MismatchedTable,
    invOnly: InvOnlyTable,
    eFleetOnly: EFleetOnlyTable,
    aligned: AlignedTable,
  }[active]
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-2 sm:p-3">
      <DiffStateTabs counts={diff.counts} active={active} onChange={onStateChange} />
      <div className="mt-3 max-h-[60vh] overflow-y-auto">
        {rows.length > 0 && TableForState ? (
          <TableForState rows={rows} />
        ) : (
          <div className="px-3 py-12 text-center text-sm text-zinc-500">
            No rows in this state.
          </div>
        )}
      </div>
    </section>
  )
}
