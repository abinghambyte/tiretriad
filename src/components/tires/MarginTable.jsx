import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { List, useListRef } from 'react-window'
import { useToast } from '../../context/ToastContext.jsx'
import { doc, updateDoc } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { computeCts, gradeLetter, gradePillClass, tireCostParts } from '../../utils/ctsCalc'
import { marginBadgeClass, marginBadgeLabel, marginPercent } from '../../utils/marginCalc'

/** Main data row height (px). CTS editor expands total row height via `rowHeight`. */
const ROW_BASE_PX = 48
/** Extra height when CTS inline editor is open (py-4 + grid + actions). */
const ROW_CTS_EDITOR_EXTRA_PX = 176
/** Max list viewport height (px). */
const LIST_MAX_H = 560
const LIST_MIN_H = 200

const GRID_STYLE = {
  display: 'grid',
  width: '100%',
  minWidth: 980,
  gridTemplateColumns:
    '40px minmax(88px,1fr) minmax(120px,1.6fr) 88px 36px 72px 80px 80px 88px minmax(64px,1fr)',
  alignItems: 'center',
  columnGap: 0,
}

function formatMoney(n) {
  if (n == null || Number.isNaN(n)) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(n)
}

function TableSkeleton() {
  return [...Array(8)].map((_, i) => (
    <div
      key={i}
      className="box-border grid border-b border-zinc-800/40 px-0 py-2"
      style={{ ...GRID_STYLE, minHeight: ROW_BASE_PX }}
    >
      {[...Array(10)].map((__, j) => (
        <div key={j} className="px-3">
          <div className="h-4 animate-pulse rounded bg-zinc-800/70" />
        </div>
      ))}
    </div>
  ))
}

const GRADES = ['A', 'B', 'C']

function listHeightPx(rowCount) {
  const raw = rowCount * ROW_BASE_PX + 8
  return Math.min(LIST_MAX_H, Math.max(LIST_MIN_H, raw))
}

/**
 * Virtual list row: main grid row + optional CTS editor block (same list item).
 * Props come from react-window `rowProps` plus `index` and `style`.
 */
const TireMarginVirtualRow = memo(function TireMarginVirtualRow({
  index,
  style,
  rows,
  selectedIds,
  editingCostsId,
  editingGradeId,
  costDraft,
  draftCts,
  gradeDraft,
  gradeSaving,
  costSaving,
  openCostEdit,
  closeCostEdit,
  openGradeEdit,
  closeGradeEdit,
  saveCosts,
  saveGrade,
  onToggle,
  setCostDraft,
  setGradeDraft,
}) {
  const row = rows[index]
  if (!row) return null

  const m = marginPercent(row.retailPrice, row.cts)
  const letter = gradeLetter(row)
  const showCostEditor = editingCostsId === row.id
  const showGradeEditor = editingGradeId === row.id
  const previewMargin = showCostEditor
    ? marginPercent(row.retailPrice, draftCts)
    : m

  return (
    <div
      style={style}
      className="box-border flex flex-col border-b border-zinc-800/80 bg-zinc-950/0 hover:bg-zinc-900/40"
    >
      <div className="grid shrink-0 px-0 py-0 text-sm" style={{ ...GRID_STYLE, height: ROW_BASE_PX }}>
        <div className="flex items-center px-3">
          <input
            type="checkbox"
            checked={selectedIds.has(row.id)}
            onChange={() => onToggle(row.id)}
            aria-label={`Select ${row.mspn}`}
            className="rounded border-zinc-600"
          />
        </div>
        <div className="truncate px-3 font-medium text-zinc-200">{row.brand || '—'}</div>
        <div className="max-w-[200px] truncate px-3 text-zinc-400">
          <span className="inline-flex min-w-0 items-start gap-1.5">
            {row.deadStockFlag ? (
              <span
                className="mt-0.5 inline-block h-2 w-2 shrink-0 rounded-full bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.5)]"
                title="No orders in 90+ days."
                aria-label="Dead stock"
              />
            ) : null}
            <span className="min-w-0 truncate">{row.description || '—'}</span>
          </span>
        </div>
        <div className="truncate px-3 font-mono text-xs text-zinc-400">{row.mspn || '—'}</div>
        <div className="truncate px-3 text-zinc-400">{row.lr || '—'}</div>
        <div className="flex items-center px-3">
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
          ) : letter ? (
            <button
              type="button"
              onClick={() => openGradeEdit(row)}
              className={`inline-flex min-w-[2rem] justify-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${gradePillClass(letter)}`}
            >
              {letter}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => openGradeEdit(row)}
              className="inline-flex min-h-[1.5rem] min-w-[2rem] items-center justify-center rounded-full border border-dashed border-zinc-700 px-2 text-[10px] text-zinc-600 hover:border-zinc-500 hover:text-zinc-400"
              aria-label="Set grade"
            >
              {'\u00a0'}
            </button>
          )}
        </div>
        <div className="truncate px-3 text-zinc-300">
          <button
            type="button"
            onClick={() => openCostEdit(row)}
            className={`max-w-full truncate text-left underline-offset-2 hover:underline ${
              editingCostsId === row.id ? 'text-amber-200' : 'text-zinc-200'
            }`}
          >
            {formatMoney(row.cts)}
          </button>
        </div>
        <div className="truncate px-3 text-zinc-300">{formatMoney(row.retailPrice)}</div>
        <div className="flex items-center px-3">
          {previewMargin != null && !Number.isNaN(previewMargin) && previewMargin > 35 ? (
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${marginBadgeClass(previewMargin)}`}
            >
              {`${previewMargin.toFixed(1)}% `}
              <span className="ml-1 opacity-80">{marginBadgeLabel(previewMargin)}</span>
            </span>
          ) : (
            <span className="text-xs font-medium text-zinc-400">
              {previewMargin != null && !Number.isNaN(previewMargin)
                ? `${previewMargin.toFixed(1)}%`
                : '—'}
            </span>
          )}
        </div>
        <div className="hidden truncate px-3 text-zinc-500 md:block">{row.category || '—'}</div>
      </div>
      {showCostEditor ? (
        <div className="border-t border-zinc-800/80 bg-zinc-900/70 px-4 py-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-4">
              <MiniNum
                label="Cost"
                value={costDraft.cost}
                onChange={(v) => setCostDraft((d) => ({ ...d, cost: v }))}
              />
              <MiniNum
                label="Mount"
                value={costDraft.mountCost}
                onChange={(v) => setCostDraft((d) => ({ ...d, mountCost: v }))}
              />
              <MiniNum
                label="Delivery"
                value={costDraft.deliveryCost}
                onChange={(v) => setCostDraft((d) => ({ ...d, deliveryCost: v }))}
              />
              <MiniNum
                label="Other"
                value={costDraft.otherCost}
                onChange={(v) => setCostDraft((d) => ({ ...d, otherCost: v }))}
              />
            </div>
            <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
              <p className="text-xs text-zinc-500">
                CTS after save:{' '}
                <span className="font-mono text-amber-200/90">{formatMoney(draftCts)}</span>
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
        </div>
      ) : null}
    </div>
  )
})

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
}) {
  const { toast } = useToast()
  const listRef = useListRef(null)
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

  const openCostEdit = useCallback((row) => {
    setEditingGradeId(null)
    setEditingCostsId(row.id)
    setCostDraft(tireCostParts(row))
  }, [])

  const closeCostEdit = useCallback(() => {
    setEditingCostsId(null)
  }, [])

  const openGradeEdit = useCallback((row) => {
    setEditingCostsId(null)
    setEditingGradeId(row.id)
    setGradeDraft(gradeLetter(row) || 'B')
  }, [])

  const closeGradeEdit = useCallback(() => {
    setEditingGradeId(null)
  }, [])

  const draftCts = useMemo(() => computeCts(costDraft), [costDraft])

  const saveCosts = useCallback(
    async (rowId) => {
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
        toast('CTS updated', 'success')
        closeCostEdit()
      } catch (e) {
        console.error(e)
        window.alert(
          e instanceof Error ? e.message : 'Could not save CTS. Check Firestore rules.',
        )
      } finally {
        setCostSaving(false)
      }
    },
    [costDraft, toast, closeCostEdit],
  )

  const saveGrade = useCallback(
    async (rowId) => {
      const g = String(gradeDraft || 'B').toUpperCase()
      if (!GRADES.includes(g)) return
      setGradeSaving(true)
      try {
        await updateDoc(doc(db, 'tires', rowId), { grade: g })
        toast('Grade saved', 'success')
        closeGradeEdit()
      } catch (e) {
        console.error(e)
        window.alert(
          e instanceof Error ? e.message : 'Could not save grade. Check Firestore rules.',
        )
      } finally {
        setGradeSaving(false)
      }
    },
    [gradeDraft, toast, closeGradeEdit],
  )

  const rowHeightFn = useCallback(
    (index, rp) => {
      const r = rp.rows[index]
      if (!r) return ROW_BASE_PX
      if (rp.editingCostsId === r.id) return ROW_BASE_PX + ROW_CTS_EDITOR_EXTRA_PX
      return ROW_BASE_PX
    },
    [],
  )

  const rowProps = useMemo(
    () => ({
      rows,
      selectedIds,
      editingCostsId,
      editingGradeId,
      costDraft,
      draftCts,
      gradeDraft,
      gradeSaving,
      costSaving,
      openCostEdit,
      closeCostEdit,
      openGradeEdit,
      closeGradeEdit,
      saveCosts,
      saveGrade,
      onToggle,
      setCostDraft,
      setGradeDraft,
    }),
    [
      rows,
      selectedIds,
      editingCostsId,
      editingGradeId,
      costDraft,
      draftCts,
      gradeDraft,
      gradeSaving,
      costSaving,
      openCostEdit,
      closeCostEdit,
      openGradeEdit,
      closeGradeEdit,
      saveCosts,
      saveGrade,
      onToggle,
    ],
  )

  const listH = useMemo(() => listHeightPx(rows.length), [rows.length])

  useEffect(() => {
    if (!editingCostsId || !listRef.current) return
    const idx = rows.findIndex((r) => r.id === editingCostsId)
    if (idx >= 0) {
      listRef.current.scrollToRow({ index: idx, align: 'start', behavior: 'smooth' })
    }
  }, [editingCostsId, rows, listRef])

  return (
    <div>
      <div className="overflow-x-auto rounded-2xl border border-zinc-800">
        <div className="min-w-[980px] w-full text-left text-sm">
          <div
            className="box-border border-b border-zinc-800 bg-zinc-900/60 py-3 text-xs uppercase tracking-wide text-zinc-500"
            style={GRID_STYLE}
          >
            <div className="flex items-center px-3">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                onChange={() => onToggleAllVisible(rows)}
                disabled={loading || rows.length === 0}
                aria-label="Select all visible"
                className="rounded border-zinc-600 disabled:opacity-40"
              />
            </div>
            <div className="px-3">
              <SortButton
                label="Brand"
                active={sortKey === 'brand'}
                dir={sortDir}
                onClick={() => onSort('brand')}
                disabled={loading}
              />
            </div>
            <div className="px-3">Description</div>
            <div className="px-3">MSPN</div>
            <div className="px-3">LR</div>
            <div className="px-3">Grade</div>
            <div className="px-3">CTS</div>
            <div className="px-3">
              <SortButton
                label="Retail"
                active={sortKey === 'retail'}
                dir={sortDir}
                onClick={() => onSort('retail')}
                disabled={loading}
              />
            </div>
            <div className="px-3">
              <SortButton
                label="Margin %"
                active={sortKey === 'margin'}
                dir={sortDir}
                onClick={() => onSort('margin')}
                disabled={loading}
              />
            </div>
            <div className="hidden px-3 md:block">Category</div>
          </div>
          {loading ? (
            <TableSkeleton />
          ) : rows.length === 0 ? (
            <div className="px-4 py-14 text-center text-sm leading-relaxed text-zinc-500">
              {emptyState}
            </div>
          ) : (
            <List
              listRef={listRef}
              rowCount={rows.length}
              rowHeight={rowHeightFn}
              rowComponent={TireMarginVirtualRow}
              rowProps={rowProps}
              overscanCount={6}
              style={{ height: listH, width: '100%' }}
              defaultHeight={listH}
            />
          )}
        </div>
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
