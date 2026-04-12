import { Fragment, useMemo, useState } from 'react'
import { doc, updateDoc } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { computeCts, gradeLetter, gradePillClass, tireCostParts } from '../../utils/ctsCalc'
import { marginBadgeClass, marginBadgeLabel, marginPercent } from '../../utils/marginCalc'

function formatMoney(n) {
  if (n == null || Number.isNaN(n)) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(n)
}

function TableSkeleton() {
  return [...Array(8)].map((_, i) => (
    <tr key={i} className="border-b border-zinc-800/40">
      {[...Array(10)].map((__, j) => (
        <td key={j} className="px-3 py-3">
          <div className="h-4 animate-pulse rounded bg-zinc-800/70" />
        </td>
      ))}
    </tr>
  ))
}

const GRADES = ['A', 'B', 'C']

export function MarginTable({
  rows,
  selectedIds,
  onToggle,
  onToggleAllVisible,
  sortKey,
  sortDir,
  onSort,
  loading,
  emptyState,
  onLogSelectedSale,
  onLogSelectedProspective,
}) {
  const [editingCostsId, setEditingCostsId] = useState(null)
  const [costDraft, setCostDraft] = useState(() => ({
    cost: 0,
    mountCost: 0,
    deliveryCost: 0,
    otherCost: 0,
  }))
  const [costSaving, setCostSaving] = useState(false)
  const [editingGradeId, setEditingGradeId] = useState(null)
  const [gradeDraft, setGradeDraft] = useState('B')
  const [gradeSaving, setGradeSaving] = useState(false)

  const allVisibleSelected =
    rows.length > 0 && rows.every((r) => selectedIds.has(r.id))

  function openCostEdit(row) {
    setEditingGradeId(null)
    setEditingCostsId(row.id)
    setCostDraft(tireCostParts(row))
  }

  function closeCostEdit() {
    setEditingCostsId(null)
  }

  function openGradeEdit(row) {
    setEditingCostsId(null)
    setEditingGradeId(row.id)
    setGradeDraft(gradeLetter(row) || 'B')
  }

  function closeGradeEdit() {
    setEditingGradeId(null)
  }

  const draftCts = useMemo(() => computeCts(costDraft), [costDraft])

  async function saveCosts(rowId) {
    const cost = Number(costDraft.cost) || 0
    const mountCost = Number(costDraft.mountCost) || 0
    const deliveryCost = Number(costDraft.deliveryCost) || 0
    const otherCost = Number(costDraft.otherCost) || 0
    const cts = computeCts({ cost, mountCost, deliveryCost, otherCost })
    setCostSaving(true)
    try {
      await updateDoc(doc(db, 'tires', rowId), {
        cost,
        mountCost,
        deliveryCost,
        otherCost,
        cts,
      })
      closeCostEdit()
    } catch (e) {
      console.error(e)
      window.alert(
        e instanceof Error ? e.message : 'Could not save CTS. Check Firestore rules.',
      )
    } finally {
      setCostSaving(false)
    }
  }

  async function saveGrade(rowId) {
    const g = String(gradeDraft || 'B').toUpperCase()
    if (!GRADES.includes(g)) return
    setGradeSaving(true)
    try {
      await updateDoc(doc(db, 'tires', rowId), { grade: g })
      closeGradeEdit()
    } catch (e) {
      console.error(e)
      window.alert(
        e instanceof Error ? e.message : 'Could not save grade. Check Firestore rules.',
      )
    } finally {
      setGradeSaving(false)
    }
  }

  const showSelectionActions =
    selectedIds.size > 0 && (onLogSelectedSale || onLogSelectedProspective)

  return (
    <div>
      {showSelectionActions ? (
        <div className="mb-4 flex flex-wrap gap-2">
          {onLogSelectedSale ? (
            <button
              type="button"
              disabled={loading}
              onClick={() => onLogSelectedSale()}
              className="rounded-lg border border-amber-800/60 bg-amber-950/35 px-3 py-2 text-sm font-medium text-amber-100 hover:bg-amber-950/55 disabled:opacity-50"
            >
              Log sale / notify team
            </button>
          ) : null}
          {onLogSelectedProspective ? (
            <button
              type="button"
              disabled={loading}
              onClick={() => onLogSelectedProspective()}
              className="rounded-lg border border-fuchsia-900/50 bg-fuchsia-950/30 px-3 py-2 text-sm font-medium text-fuchsia-100 hover:bg-fuchsia-950/50 disabled:opacity-50"
            >
              Log prospective order
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="overflow-x-auto rounded-2xl border border-zinc-800">
        <table className="min-w-[980px] w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-900/60 text-xs uppercase tracking-wide text-zinc-500">
              <th className="w-10 px-3 py-3">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={() => onToggleAllVisible(rows)}
                  disabled={loading || rows.length === 0}
                  aria-label="Select all visible"
                  className="rounded border-zinc-600 disabled:opacity-40"
                />
              </th>
              <th className="px-3 py-3">
                <SortButton
                  label="Brand"
                  active={sortKey === 'brand'}
                  dir={sortDir}
                  onClick={() => onSort('brand')}
                  disabled={loading}
                />
              </th>
              <th className="px-3 py-3">Description</th>
              <th className="px-3 py-3">MSPN</th>
              <th className="px-3 py-3">LR</th>
              <th className="px-3 py-3">Grade</th>
              <th className="px-3 py-3">CTS</th>
              <th className="px-3 py-3">
                <SortButton
                  label="Retail"
                  active={sortKey === 'retail'}
                  dir={sortDir}
                  onClick={() => onSort('retail')}
                  disabled={loading}
                />
              </th>
              <th className="px-3 py-3">
                <SortButton
                  label="Margin %"
                  active={sortKey === 'margin'}
                  dir={sortDir}
                  onClick={() => onSort('margin')}
                  disabled={loading}
                />
              </th>
              <th className="px-3 py-3">Category</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableSkeleton />
            ) : rows.length === 0 ? (
              <tr>
                <td
                  colSpan={10}
                  className="px-4 py-14 text-center text-sm leading-relaxed text-zinc-500"
                >
                  {emptyState}
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const m = marginPercent(row.retailPrice, row.cts)
                const letter = gradeLetter(row)
                const showCostEditor = editingCostsId === row.id
                const showGradeEditor = editingGradeId === row.id
                const previewMargin = showCostEditor
                  ? marginPercent(row.retailPrice, draftCts)
                  : m

                return (
                  <Fragment key={row.id}>
                    <tr className="border-b border-zinc-800/80 hover:bg-zinc-900/40">
                      <td className="px-3 py-2 align-middle">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(row.id)}
                          onChange={() => onToggle(row.id)}
                          aria-label={`Select ${row.mspn}`}
                          className="rounded border-zinc-600"
                        />
                      </td>
                      <td className="px-3 py-2 font-medium text-zinc-200">
                        {row.brand || '—'}
                      </td>
                      <td className="max-w-[200px] px-3 py-2 text-zinc-400">
                        {row.description || '—'}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-zinc-400">
                        {row.mspn || '—'}
                      </td>
                      <td className="px-3 py-2 text-zinc-400">{row.lr || '—'}</td>
                      <td className="px-3 py-2 align-middle">
                        {showGradeEditor ? (
                          <div className="flex flex-wrap items-center gap-1.5">
                            <select
                              value={gradeDraft}
                              onChange={(e) => setGradeDraft(e.target.value)}
                              className="rounded border border-zinc-600 bg-zinc-900 px-2 py-1 text-xs text-zinc-100"
                            >
                              {GRADES.map((g) => (
                                <option key={g} value={g}>
                                  {g}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              disabled={gradeSaving}
                              onClick={() => saveGrade(row.id)}
                              className="rounded bg-zinc-200 px-2 py-0.5 text-[11px] font-semibold text-zinc-900 hover:bg-white disabled:opacity-50"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              disabled={gradeSaving}
                              onClick={closeGradeEdit}
                              className="text-[11px] text-zinc-500 hover:text-zinc-300"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => openGradeEdit(row)}
                            className={`inline-flex min-w-[2rem] justify-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${gradePillClass(letter)}`}
                          >
                            {letter || '—'}
                          </button>
                        )}
                      </td>
                      <td className="px-3 py-2 text-zinc-300">
                        <button
                          type="button"
                          onClick={() => openCostEdit(row)}
                          className={`text-left underline-offset-2 hover:underline ${
                            editingCostsId === row.id
                              ? 'text-amber-200'
                              : 'text-zinc-200'
                          }`}
                        >
                          {formatMoney(row.cts)}
                        </button>
                      </td>
                      <td className="px-3 py-2 text-zinc-300">
                        {formatMoney(row.retailPrice)}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${marginBadgeClass(previewMargin)}`}
                        >
                          {previewMargin != null ? `${previewMargin.toFixed(1)}%` : '—'}{' '}
                          <span className="ml-1 opacity-80">
                            {marginBadgeLabel(previewMargin)}
                          </span>
                        </span>
                      </td>
                      <td className="px-3 py-2 text-zinc-500">
                        {row.category || '—'}
                      </td>
                    </tr>
                    {showCostEditor ? (
                      <tr className="border-b border-zinc-800/80 bg-zinc-900/70">
                        <td colSpan={10} className="px-4 py-4">
                          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                            <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-4">
                              <MiniNum
                                label="Cost"
                                value={costDraft.cost}
                                onChange={(v) =>
                                  setCostDraft((d) => ({ ...d, cost: v }))
                                }
                              />
                              <MiniNum
                                label="Mount"
                                value={costDraft.mountCost}
                                onChange={(v) =>
                                  setCostDraft((d) => ({ ...d, mountCost: v }))
                                }
                              />
                              <MiniNum
                                label="Delivery"
                                value={costDraft.deliveryCost}
                                onChange={(v) =>
                                  setCostDraft((d) => ({ ...d, deliveryCost: v }))
                                }
                              />
                              <MiniNum
                                label="Other"
                                value={costDraft.otherCost}
                                onChange={(v) =>
                                  setCostDraft((d) => ({ ...d, otherCost: v }))
                                }
                              />
                            </div>
                            <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
                              <p className="text-xs text-zinc-500">
                                CTS after save:{' '}
                                <span className="font-mono text-amber-200/90">
                                  {formatMoney(draftCts)}
                                </span>
                              </p>
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  disabled={costSaving}
                                  onClick={closeCostEdit}
                                  className="rounded-lg border border-zinc-600 px-3 py-1.5 text-xs text-zinc-300 hover:border-zinc-500"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  disabled={costSaving}
                                  onClick={() => saveCosts(row.id)}
                                  className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-amber-400 disabled:opacity-50"
                                >
                                  {costSaving ? 'Saving…' : 'Save CTS'}
                                </button>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                )
              })
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-2 px-1 text-center text-[11px] text-zinc-600 md:hidden">
        Scroll horizontally to see all columns. Click CTS or Grade to edit.
      </p>
    </div>
  )
}

function MiniNum({ label, value, onChange }) {
  return (
    <div>
      <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </label>
      <input
        type="number"
        inputMode="decimal"
        min={0}
        step={0.01}
        value={Number.isFinite(Number(value)) ? value : 0}
        onChange={(e) => {
          const raw = e.target.value
          onChange(raw === '' ? 0 : Number(raw))
        }}
        className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 font-mono text-xs text-zinc-100 outline-none focus:border-amber-600/60"
      />
    </div>
  )
}

function SortButton({ label, active, dir, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1 font-medium disabled:cursor-not-allowed disabled:opacity-40 ${
        active ? 'text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
      }`}
    >
      {label}
      {active ? (dir === 'asc' ? '↑' : '↓') : ''}
    </button>
  )
}
