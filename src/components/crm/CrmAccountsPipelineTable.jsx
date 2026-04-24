import { useMemo, useState } from 'react'
import { formatCurrency } from '../../utils/format'
import {
  crmStageLabel,
  estimatedDealValue,
  lastActivityAt,
} from '../../utils/crmPipeline'
import { EmptyState, EmptyStateIcons } from '../shared/EmptyState.jsx'

function fmtTs(ts) {
  if (!ts || typeof ts.toDate !== 'function') return '--'
  try {
    return ts.toDate().toLocaleDateString('en-US', {
      timeZone: 'America/Denver',
      dateStyle: 'short',
    })
  } catch {
    return '--'
  }
}

function nextDueTs(a) {
  const na = a.nextAction || {}
  const d = na.dueDate
  return d && typeof d.toMillis === 'function' ? d : null
}

/**
 * @param {object} props
 * @param {Array<Record<string, unknown>>} props.accounts
 * @param {number} props.avgBuyPerTire
 * @param {(a: Record<string, unknown>) => void} props.onOpen
 */
export function CrmAccountsPipelineTable({ accounts, avgBuyPerTire, onOpen }) {
  const [sortKey, setSortKey] = useState('company')
  const [sortDir, setSortDir] = useState('asc')

  const rows = useMemo(() => {
    const list = accounts.map((a) => ({
      raw: a,
      company: String(a.companyName || '').toLowerCase(),
      stageLabel: crmStageLabel(a.pipelineStage, a),
      nextDue: nextDueTs(a),
      est: estimatedDealValue(a.vehicleProfile || {}, avgBuyPerTire),
      lastAt: lastActivityAt(a),
    }))
    const dir = sortDir === 'asc' ? 1 : -1
    list.sort((x, y) => {
      let cmp = 0
      if (sortKey === 'company') cmp = x.company.localeCompare(y.company)
      else if (sortKey === 'stage') cmp = x.stageLabel.localeCompare(y.stageLabel)
      else if (sortKey === 'nextDue') {
        const mx = x.nextDue?.toMillis?.() ?? 0
        const my = y.nextDue?.toMillis?.() ?? 0
        cmp = mx - my
      } else if (sortKey === 'est') {
        cmp = (x.est ?? -1) - (y.est ?? -1)
      } else if (sortKey === 'last') {
        const lx = x.lastAt?.toMillis?.() ?? 0
        const ly = y.lastAt?.toMillis?.() ?? 0
        cmp = lx - ly
      }
      return cmp * dir
    })
    return list
  }, [accounts, avgBuyPerTire, sortKey, sortDir])

  function toggleSort(key) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const th = (key, label) => (
    <th className="px-3 py-2">
      <button
        type="button"
        onClick={() => toggleSort(key)}
        className="font-semibold uppercase tracking-wide text-zinc-300 hover:text-zinc-100"
      >
        {label}
        {sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
      </button>
    </th>
  )

  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-800">
      <table className="w-full max-sm:min-w-0 text-left text-sm sm:min-w-[720px]">
        <thead>
          <tr className="border-b border-zinc-800 bg-zinc-900/60 text-xs">
            {th('company', 'Company')}
            {th('stage', 'Stage')}
            {th('nextDue', 'Next action due')}
            {th('est', 'Est. deal')}
            {th('last', 'Last activity')}
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <EmptyState
              variant="row"
              colSpan={6}
              icon={EmptyStateIcons.users}
              title="No VIP clients match"
              description="Nothing matches the current filters. Clear them or add a new VIP client to start populating the pipeline."
            />
          ) : null}
          {rows.map(({ raw }) => (
            <tr key={raw.id} className="border-b border-zinc-800/80 hover:bg-zinc-900/30">
              <td className="px-3 py-2 font-medium text-zinc-100">{raw.companyName}</td>
              <td className="px-3 py-2 text-zinc-400">{crmStageLabel(raw.pipelineStage, raw)}</td>
              <td className="px-3 py-2 text-xs text-zinc-400">{fmtTs(nextDueTs(raw))}</td>
              <td className="px-3 py-2 text-zinc-300">
                {estimatedDealValue(raw.vehicleProfile || {}, avgBuyPerTire) != null
                  ? formatCurrency(estimatedDealValue(raw.vehicleProfile || {}, avgBuyPerTire))
                  : '--'}
              </td>
              <td className="px-3 py-2 text-xs text-zinc-400">{fmtTs(lastActivityAt(raw))}</td>
              <td className="px-3 py-2 text-right">
                <button
                  type="button"
                  className="text-xs text-violet-300 hover:underline"
                  onClick={() => onOpen(raw)}
                >
                  Open
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
