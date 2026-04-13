import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { List, useListRef } from 'react-window'
import { useToast } from '../../context/ToastContext.jsx'
import { useMediaQuery } from '../../hooks/useMediaQuery.js'
import { doc, updateDoc } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { computeCts, gradeLetter, gradePillClass, tireCostParts } from '../../utils/ctsCalc'
import { marginBadgeClass, marginBadgeLabel, marginPercent } from '../../utils/marginCalc'

/** Main data row height (px) — desktop. CTS editor expands total row height via `rowHeight`. */
const ROW_BASE_PX = 48
/** Taller rows on narrow viewports for touch targets. */
const ROW_MOBILE_BASE_PX = 52
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

function listHeightPx(rowCount, basePx = ROW_BASE_PX) {
  const raw = rowCount * basePx + 8
  return Math.min(LIST_MAX_H, Math.max(LIST_MIN_H, raw))
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

function SortButton({ label, active, dir, onClick, disabled, touchWide }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1 font-medium disabled:cursor-not-allowed disabled:opacity-40 ${
        active ? 'text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
      } ${touchWide ? 'min-h-[44px] min-w-[44px] justify-center sm:min-h-0 sm:min-w-0' : ''}`}
    >
      {label}
      {active ? (dir === 'asc' ? '↑' : '↓') : ''}
    </button>
  )
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
  isMobile = false,
  selectMode = false,
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

  const marginCell =
    previewMargin != null && !Number.isNaN(previewMargin) && previewMargin > 35 ? (
      <span
        className={`inline-flex max-w-full items-center truncate rounded-full px-2 py-0.5 text-xs font-medium ${marginBadgeClass(previewMargin)}`}
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
    )

  const ctsEditorSection = showCostEditor ? (
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
  ) : null

  if (isMobile) {
    const selected = selectedIds.has(row.id)
    return (
      <div
        style={style}
        className="box-border flex flex-col border-b border-zinc-800/80 bg-zinc-950/0 hover:bg-zinc-900/40"
      >
        <div className="flex w-max min-w-full text-sm" style={{ minHeight: ROW_MOBILE_BASE_PX }}>
          <div className="sticky left-0 z-[15] flex shrink-0 items-stretch border-r border-zinc-800/80 bg-zinc-950 shadow-[8px_0_16px_-6px_rgba(0,0,0,0.55)]">
            <div className="flex w-10 shrink-0 items-center justify-center px-1">
              <input
                type="checkbox"
                checked={selected}
                onChange={() => onToggle(row.id)}
                aria-label={`Select ${row.mspn}`}
                className="h-4 w-4 rounded border-zinc-600"
              />
            </div>
            {selectMode ? (
              <button
                type="button"
                onClick={() => onToggle(row.id)}
                className="flex w-12 min-w-12 shrink-0 flex-col items-center justify-center border-r border-zinc-800/60 bg-zinc-900/50 text-[11px] font-semibold leading-tight text-amber-200/95 active:bg-zinc-800"
                aria-label={selected ? 'Deselect row' : 'Select row'}
              >
                {selected ? '✓' : 'Select'}
              </button>
            ) : null}
            <div className="flex w-[180px] shrink-0 items-center border-r border-zinc-800/60 px-2">
              <span className="inline-flex min-w-0 items-start gap-1.5">
                {row.deadStockFlag ? (
                  <span
                    className="mt-0.5 inline-block h-2 w-2 shrink-0 rounded-full bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.5)]"
                    title="No orders in 90+ days."
                    aria-label="Dead stock"
                  />
                ) : null}
                <span className="min-w-0 truncate text-zinc-400">{row.description || '—'}</span>
              </span>
            </div>
            <div className="flex w-[70px] shrink-0 items-center border-r border-zinc-800/60 px-1 font-mono text-xs text-zinc-400">
              {row.mspn || '—'}
            </div>
            <div className="flex w-20 shrink-0 items-center border-r border-zinc-800/60 px-1 text-xs text-zinc-300">
              {formatMoney(row.retailPrice)}
            </div>
            <div className="flex w-20 shrink-0 items-center px-1">{marginCell}</div>
          </div>
          <div className="flex shrink-0 items-stretch divide-x divide-zinc-800/60">
            <div className="flex w-[88px] shrink-0 items-center truncate px-2 font-medium text-zinc-200">
              {row.brand || '—'}
            </div>
            <div className="flex w-10 shrink-0 items-center justify-center truncate px-1 text-zinc-400">
              {row.lr || '—'}
            </div>
            <div className="flex w-[72px] shrink-0 items-center justify-center px-1">
              {showGradeEditor ? (
                <div className="flex flex-wrap items-center gap-1">
                  <select
                    value={gradeDraft}
                    onChange={(e) => setGradeDraft(e.target.value)}
                    className="max-w-[4rem] rounded border border-zinc-600 bg-zinc-900 px-1 py-0.5 text-xs text-zinc-100"
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
                    className="rounded bg-zinc-200 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-900"
                  >
                    OK
                  </button>
                </div>
              ) : letter ? (
                <button
                  type="button"
                  onClick={() => openGradeEdit(row)}
                  className={`inline-flex min-w-[2rem] justify-center rounded-full px-2 py-0.5 text-xs font-semibold ${gradePillClass(letter)}`}
                >
                  {letter}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => openGradeEdit(row)}
                  className="inline-flex min-h-[1.5rem] min-w-[2rem] items-center justify-center rounded-full border border-dashed border-zinc-700 px-2 text-[10px] text-zinc-600"
                  aria-label="Set grade"
                >
                  {'\u00a0'}
                </button>
              )}
            </div>
            <div className="flex w-[88px] shrink-0 items-center px-2 text-xs text-zinc-300">
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
            <div className="flex min-w-[100px] shrink-0 items-center truncate px-2 text-xs text-zinc-500">
              {row.category || '—'}
            </div>
          </div>
        </div>
        {ctsEditorSection}
      </div>
    )
  }

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
        <div className="flex items-center px-3">{marginCell}</div>
        <div className="hidden truncate px-3 text-zinc-500 md:block">{row.category || '—'}</div>
      </div>
      {ctsEditorSection}
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
  selectMode = false,
}) {
  const { toast } = useToast()
  const listRef = useListRef(null)
  const scrollRef = useRef(null)
  const isMobileTable = useMediaQuery('(max-width: 767px)')
  const [scrollHintDismissed, setScrollHintDismissed] = useState(false)

  useEffect(() => {
    setScrollHintDismissed(false)
  }, [rows.length])

  const mobileRowBasePx = isMobileTable ? ROW_MOBILE_BASE_PX : ROW_BASE_PX
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

  const rowHeightFn = useCallback((index, rp) => {
    const base = rp.mobileRowBasePx ?? ROW_BASE_PX
    const r = rp.rows[index]
    if (!r) return base
    if (rp.editingCostsId === r.id) return base + ROW_CTS_EDITOR_EXTRA_PX
    return base
  }, [])

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
      isMobile: isMobileTable,
      selectMode,
      mobileRowBasePx,
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
      setCostDraft,
      setGradeDraft,
      isMobileTable,
      selectMode,
      mobileRowBasePx,
    ],
  )

  const listH = useMemo(
    () => listHeightPx(rows.length, mobileRowBasePx),
    [rows.length, mobileRowBasePx],
  )

  function onTableScroll() {
    const el = scrollRef.current
    if (el && el.scrollLeft > 12) setScrollHintDismissed(true)
  }

  useEffect(() => {
    if (!editingCostsId || !listRef.current) return
    const idx = rows.findIndex((r) => r.id === editingCostsId)
    if (idx >= 0) {
      listRef.current.scrollToRow({ index: idx, align: 'start', behavior: 'smooth' })
    }
  }, [editingCostsId, rows, listRef])

  return (
    <div>
      <div
        ref={scrollRef}
        onScroll={onTableScroll}
        className="overflow-x-auto rounded-2xl border border-zinc-800"
      >
        {isMobileTable && rows.length > 0 && !loading && !scrollHintDismissed ? (
          <div className="mx-2 mb-2 rounded-full border border-amber-800/50 bg-amber-950/40 px-3 py-2 text-center text-xs font-medium text-amber-100/95 md:hidden">
            ← Scroll for CTS, grade, brand, category →
          </div>
        ) : null}
        <div className={`w-full text-left text-sm ${isMobileTable ? 'min-w-0' : 'min-w-[980px]'}`}>
          <div
            className="box-border hidden border-b border-zinc-800 bg-zinc-900/60 py-3 text-xs uppercase tracking-wide text-zinc-500 md:grid"
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
                touchWide={isMobileTable}
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
                touchWide={isMobileTable}
              />
            </div>
            <div className="px-3">
              <SortButton
                label="Margin %"
                active={sortKey === 'margin'}
                dir={sortDir}
                onClick={() => onSort('margin')}
                disabled={loading}
                touchWide={isMobileTable}
              />
            </div>
            <div className="hidden px-3 md:block">Category</div>
          </div>
          {isMobileTable && !loading && rows.length > 0 ? (
            <div className="flex w-max min-w-full border-b border-zinc-800 bg-zinc-900/60 py-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500 md:hidden">
              <div className="sticky left-0 z-[16] flex shrink-0 items-stretch border-r border-zinc-800/80 bg-zinc-900/95 shadow-[8px_0_16px_-6px_rgba(0,0,0,0.45)]">
                <div className="flex w-10 shrink-0 items-center justify-center px-1">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={() => onToggleAllVisible(rows)}
                    disabled={loading || rows.length === 0}
                    aria-label="Select all visible"
                    className="rounded border-zinc-600 disabled:opacity-40"
                  />
                </div>
                {selectMode ? <div className="w-12 shrink-0 border-r border-zinc-800/60" aria-hidden /> : null}
                <div className="flex w-[180px] shrink-0 items-center border-r border-zinc-800/60 px-2">
                  Desc
                </div>
                <div className="flex w-[70px] shrink-0 items-center border-r border-zinc-800/60 px-1">
                  MSPN
                </div>
                <div className="flex w-20 shrink-0 items-center border-r border-zinc-800/60 px-1">
                  <SortButton
                    label="Retail"
                    active={sortKey === 'retail'}
                    dir={sortDir}
                    onClick={() => onSort('retail')}
                    disabled={loading}
                    touchWide
                  />
                </div>
                <div className="flex w-20 shrink-0 items-center px-1">
                  <SortButton
                    label="Margin"
                    active={sortKey === 'margin'}
                    dir={sortDir}
                    onClick={() => onSort('margin')}
                    disabled={loading}
                    touchWide
                  />
                </div>
              </div>
              <div className="flex shrink-0 items-center divide-x divide-zinc-800/60 text-center">
                <div className="w-[88px] shrink-0 px-2">
                  <SortButton
                    label="Brand"
                    active={sortKey === 'brand'}
                    dir={sortDir}
                    onClick={() => onSort('brand')}
                    disabled={loading}
                    touchWide
                  />
                </div>
                <div className="flex w-10 shrink-0 items-center justify-center px-1">LR</div>
                <div className="flex w-[72px] shrink-0 items-center justify-center">Gr</div>
                <div className="flex w-[88px] shrink-0 items-center justify-center px-1">CTS</div>
                <div className="flex min-w-[100px] shrink-0 items-center justify-center px-2">Cat</div>
              </div>
            </div>
          ) : null}
          {loading ? (
            isMobileTable ? (
              <div className="space-y-2 py-4 md:hidden">
                {[1, 2, 3, 4, 5].map((k) => (
                  <div key={k} className="h-12 animate-pulse rounded-lg bg-zinc-800/50" />
                ))}
              </div>
            ) : (
              <TableSkeleton />
            )
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
    </div>
  )
}
