function fmtDate(ts) {
  if (!ts || typeof ts.toMillis !== 'function') return null
  const ms = ts.toMillis()
  if (!Number.isFinite(ms)) return null
  return new Date(ms).toISOString().slice(0, 19).replace('T', ' ') + ' UTC'
}

function dl(label, value) {
  return (
    <div className="flex items-baseline gap-3 border-b border-zinc-800/60 py-1.5 last:border-b-0">
      <dt className="w-44 shrink-0 text-xs uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className="font-mono text-sm text-zinc-200">{value || '--'}</dd>
    </div>
  )
}

/**
 * Tab 1 of /admin/efleet: a single card listing the latest categoryMap
 * metadata + diff counts. Operator sanity-checks "did the right import land
 * against the right account?" without leaving the page.
 */
export function AccountCard({ categoryMap, diffCounts }) {
  const totalParsed = categoryMap?.records ? Object.keys(categoryMap.records).length : 0
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 sm:p-6">
      <h2 className="mb-3 text-lg font-semibold text-white">eFleet account &amp; import</h2>
      <dl className="text-sm">
        {dl('Account (Ship-To)', categoryMap?.account || null)}
        {dl('Last imported', fmtDate(categoryMap?.importedAt))}
        {dl('Source report date', categoryMap?.sourceReportDate)}
        {dl('Source file', categoryMap?.sourceFile)}
        {dl('Total parsed (records)', totalParsed > 0 ? String(totalParsed) : null)}
        {dl('Mismatched', String(diffCounts.mismatched))}
        {dl('Inventory only', String(diffCounts.invOnly))}
        {dl('eFleet only', String(diffCounts.eFleetOnly))}
        {dl('Aligned', String(diffCounts.aligned))}
      </dl>
    </section>
  )
}
