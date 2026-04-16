import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { List, useListRef } from 'react-window'
import { useToast } from '../../context/ToastContext.jsx'
import { useMediaQuery } from '../../hooks/useMediaQuery.js'
import { TireGradeModal } from './TireGradeModal.jsx'
import { doc, updateDoc } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { computeCts, effectiveCts, gradeLetter, gradePillClass, tireOverheadParts } from '../../utils/ctsCalc'
import { computeMargin, marginBadgeLabel } from '../../utils/marginCalc'
import { isTireBeastMode } from '../../utils/tireBeastMode.js'
import { formatCurrency, formatCurrencyOrDash, formatPercent } from '../../utils/format'
import { tireCatalogBuyNumber } from '../../utils/tireCatalogBuy'
import { parseDescription } from '../../utils/parseTireDescription.js'

/** Main data row height (px) — desktop. CTS editor expands total row height via `rowHeight`. */
const ROW_BASE_PX = 48
/** Taller rows on narrow viewports for touch targets. */
const ROW_MOBILE_BASE_PX = 52
/** Extra height when CTS inline editor is open (preview line + grid + actions). */
const ROW_CTS_EDITOR_EXTRA_PX = 220
/** Max list viewport height (px). */
const LIST_MAX_H = 560
const LIST_MIN_H = 200

const GRID_STYLE = {
  display: 'grid',
  width: '100%',
  minWidth: 1220,
  gridTemplateColumns:
    '52px minmax(56px,6.5rem) minmax(100px,1.3fr) 5.25rem minmax(2.75rem,3.25rem) 3.25rem minmax(6.75rem,7.25rem) minmax(4.5rem,4.85rem) minmax(5.25rem,5.75rem) minmax(4.25rem,5.5rem) minmax(8.5rem,1.15fr)',
  alignItems: 'center',
  columnGap: 0,
}

function buyPriceOf(row) {
  const n = tireCatalogBuyNumber(row)
  return Number.isFinite(n) && n > 0 ? n : 0
}

function BuyPriceCell({ row }) {
  const pi = row?.priceIntel && typeof row.priceIntel === 'object' ? row.priceIntel : null
  const n = tireCatalogBuyNumber(row)
  const text = n > 0 && Number.isFinite(n) ? formatCurrency(n) : '—'
  const conf = pi ? String(pi.confidence || '').toLowerCase() : ''
  const dotTitle =
    conf === 'high'
      ? 'Confidence: high'
      : conf === 'medium'
        ? 'Confidence: medium'
        : conf === 'low'
          ? 'Confidence: low'
          : pi
            ? 'Confidence: unknown'
            : 'No price intelligence yet'
  const dotClass =
    conf === 'high'
      ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.45)]'
      : conf === 'medium'
        ? 'bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.4)]'
        : conf === 'low'
          ? 'bg-red-400 shadow-[0_0_6px_rgba(248,113,113,0.45)]'
          : 'bg-zinc-500'
  const flagReason = pi?.flagged ? String(pi.flagReason || 'flagged') : ''
  return (
    <span className="inline-flex max-w-full whitespace-nowrap max-sm:min-w-0 max-sm:items-center max-sm:gap-0.5 sm:items-center sm:gap-1">
      {pi?.flagged ? (
        <span className="max-sm:text-[11px] sm:text-xs" title={flagReason} aria-label={`Flagged: ${flagReason}`}>
          🔴
        </span>
      ) : null}
      {pi?.kyleConfirmed ? (
        <span className="max-sm:text-[11px] sm:text-xs" title="Kyle confirmed" aria-label="Kyle confirmed">
          ✅
        </span>
      ) : null}
      <span className="font-mono text-sm font-semibold tabular-nums text-zinc-200">{text}</span>
      <span
        className={`inline-block h-2 w-2 shrink-0 rounded-full max-sm:translate-y-px sm:translate-y-px ${dotClass}`}
        title={dotTitle}
        aria-hidden
      />
    </span>
  )
}

function previewMarginWhileEditing(row, overheadDraft) {
  const buy = buyPriceOf(row)
  if (!buy) return null
  const overhead = computeCts(overheadDraft)
  return ((buy - overhead) / buy) * 100
}

function TableSkeleton() {
  return [...Array(8)].map((_, i) => (
    <div
      key={i}
      className="box-border grid border-b border-zinc-800/40 px-0 py-2"
      style={{ ...GRID_STYLE, minHeight: ROW_BASE_PX }}
    >
      {[...Array(11)].map((__, j) => (
        <div key={j} className="px-3">
          <div className="h-3.5 animate-pulse rounded-md bg-zinc-800/65" />
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
        className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 font-mono text-xs text-zinc-100 outline-none transition-shadow duration-200 focus:border-amber-600/50 focus:ring-2 focus:ring-amber-500/30"
      />
    </div>
  )
}

function marginPctTone(pct) {
  const t = 'transition-colors duration-300 ease-out '
  if (pct == null || Number.isNaN(pct)) return t + 'text-zinc-500'
  if (pct < 10) return t + 'text-red-400'
  if (pct <= 25) return t + 'text-amber-300'
  return t + 'text-emerald-300'
}

const TireDescriptionCell = memo(function TireDescriptionCell({ description }) {
  const d = String(description ?? '').trim()
  const parsed = useMemo(() => parseDescription(d), [d])
  if (!d) return <span className="text-zinc-500">—</span>

  const hasMetric =
    parsed.parseKind === 'metric' &&
    parsed.width != null &&
    parsed.aspectRatio != null &&
    parsed.construction != null &&
    parsed.rimDiameter != null

  const hasFlotation =
    parsed.parseKind === 'flotation' &&
    parsed.width != null &&
    parsed.rimDiameter != null &&
    parsed.flotationMid != null

  const loadParts = []
  if (parsed.loadIndex != null) loadParts.push(String(parsed.loadIndex))
  if (parsed.speedRating) loadParts.push(parsed.speedRating)
  if (parsed.extraLoad) loadParts.push('XL')
  const loadSpeed = loadParts.join(' ')

  let primary = ''
  let secondary = /** @type {string | null} */ (null)

  if (hasFlotation) {
    const ltSuffix = parsed.trailingLt ? 'LT' : ''
    primary = `${parsed.width}X${parsed.flotationMid}R${parsed.rimDiameter}${ltSuffix}`
    if (loadSpeed) {
      primary += ` · ${loadSpeed}`
    }
  } else if (hasMetric) {
    primary = `${parsed.ltPrefixedMetric ? 'LT ' : ''}${parsed.width}/${parsed.aspectRatio}${String(parsed.construction || '').toUpperCase()}${parsed.rimDiameter}`
    if (loadSpeed) {
      primary += ` · ${loadSpeed}`
    }
  } else {
    primary = d
  }

  if (hasFlotation || hasMetric) {
    const t = String(parsed.treadName || '').trim()
    if (t && t !== d && t !== primary && !primary.includes(t)) {
      secondary = t
    }
  }

  return (
    <div className="min-w-0 max-w-full overflow-hidden text-sm leading-snug text-zinc-300">
      <div className="line-clamp-2 break-words font-mono text-zinc-200 [overflow-wrap:anywhere]">{primary}</div>
      {secondary ? (
        <div className="mt-0.5 line-clamp-2 max-w-full break-words text-xs font-medium text-zinc-500 [overflow-wrap:anywhere]">
          {secondary}
        </div>
      ) : null}
    </div>
  )
})

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
  overheadDraft,
  draftOverheadTotal,
  costSaving,
  openCostEdit,
  closeCostEdit,
  openGradeEdit,
  saveCosts,
  onToggle,
  setOverheadDraft,
  isMobile = false,
  selectMode = false,
}) {
  const row = rows[index]
  if (!row) return null

  const m = computeMargin(row)
  const letter = gradeLetter(row)
  const showCostEditor = editingCostsId === row.id
  const previewMargin = showCostEditor ? previewMarginWhileEditing(row, overheadDraft) : m

  const marginTitle =
    (previewMargin == null || Number.isNaN(previewMargin)) && (showCostEditor ? buyPriceOf(row) <= 0 : m == null)
      ? 'No buy price on this catalog row.'
      : marginBadgeLabel(previewMargin)
  const marginCell =
    previewMargin != null && !Number.isNaN(previewMargin) ? (
      <span
        className={`sk-figures inline-flex text-sm font-semibold ${marginPctTone(previewMargin)}`}
        title={marginTitle}
      >
        {formatPercent(previewMargin, 1)}
      </span>
    ) : (
      <span className="text-sm font-semibold text-zinc-500" title={marginTitle}>
        —
      </span>
    )

  const ctsEditorSection = showCostEditor ? (
    <div className="border-t border-zinc-800/80 bg-zinc-900/70 px-4 py-4">
      <p className="mb-3 text-xs text-zinc-500">
        Enter your overhead costs per tire — mount labor, delivery, and other. Buy price from Kyle
        is fixed.
      </p>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-3">
          <MiniNum
            label="Mount"
            value={overheadDraft.mountCost}
            onChange={(v) => setOverheadDraft((d) => ({ ...d, mountCost: v }))}
          />
          <MiniNum
            label="Delivery"
            value={overheadDraft.deliveryCost}
            onChange={(v) => setOverheadDraft((d) => ({ ...d, deliveryCost: v }))}
          />
          <MiniNum
            label="Other"
            value={overheadDraft.otherCost}
            onChange={(v) => setOverheadDraft((d) => ({ ...d, otherCost: v }))}
          />
        </div>
        <p className="w-full font-mono text-[11px] leading-relaxed text-zinc-400">
          Overhead = {formatCurrencyOrDash(Number(overheadDraft.mountCost) || 0)} mount +{' '}
          {formatCurrencyOrDash(Number(overheadDraft.deliveryCost) || 0)} delivery +{' '}
          {formatCurrencyOrDash(Number(overheadDraft.otherCost) || 0)} other ={' '}
          <span className="text-amber-200/90">{formatCurrencyOrDash(draftOverheadTotal)}</span>
          {' · '}
          Margin ={' '}
          <span
            className={`font-semibold ${(() => {
              const pm = previewMarginWhileEditing(row, overheadDraft)
              return pm != null && !Number.isNaN(pm) ? marginPctTone(pm) : 'text-zinc-500'
            })()}`}
          >
            {(() => {
              const pm = previewMarginWhileEditing(row, overheadDraft)
              return pm != null && !Number.isNaN(pm) ? formatPercent(pm, 1) : '—'
            })()}
          </span>
        </p>
        <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
          <p className="text-xs text-zinc-500">
            Overhead after save:{' '}
            <span className="font-mono text-amber-200/90">{formatCurrencyOrDash(draftOverheadTotal)}</span>
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={costSaving}
              onClick={closeCostEdit}
              className="rounded-lg border border-rose-900/50 bg-rose-950/20 px-3 py-1.5 text-xs font-medium text-rose-200 transition-colors duration-200 hover:border-rose-800/60 hover:bg-rose-950/35"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={costSaving}
              onClick={() => saveCosts(row.id)}
              className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-amber-400 disabled:opacity-50"
            >
              {costSaving ? 'Saving…' : 'Save overhead'}
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
        className="box-border flex flex-col border-b border-zinc-800/80 bg-zinc-950/0 transition-colors duration-150 hover:bg-zinc-800/25"
      >
        <div className="flex w-max min-w-full text-sm" style={{ minHeight: ROW_MOBILE_BASE_PX }}>
            <div className="sticky left-0 z-[15] flex shrink-0 items-stretch border-r border-zinc-800/80 bg-zinc-950 shadow-[8px_0_16px_-6px_rgba(0,0,0,0.55)]">
            <div className="flex w-11 shrink-0 items-center justify-center px-0.5">
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
            <div className="flex w-[200px] shrink-0 items-center border-r border-zinc-800/60 px-2">
              <span className="inline-flex min-w-0 items-start gap-1.5">
                {row.deadStockFlag ? (
                  <span
                    className="mt-0.5 inline-block h-2 w-2 shrink-0 rounded-full bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.5)]"
                    title="No orders in 90+ days."
                    aria-label="Dead stock"
                  />
                ) : null}
                <TireDescriptionCell description={row.description} />
              </span>
            </div>
            <div className="flex w-[76px] shrink-0 items-center border-r border-zinc-800/60 px-1 font-mono text-sm font-semibold text-zinc-300">
              {row.mspn || '—'}
            </div>
            <div className="flex min-w-[6.25rem] shrink-0 items-center whitespace-nowrap border-r border-zinc-800/60 px-1 text-sm font-semibold tabular-nums text-zinc-200">
              <BuyPriceCell row={row} />
            </div>
            <div className="flex w-20 shrink-0 items-center px-1">{marginCell}</div>
          </div>
          <div className="flex shrink-0 items-stretch divide-x divide-zinc-800/60">
            <div className="flex w-[76px] shrink-0 items-center justify-center truncate px-1 text-center font-medium text-zinc-200">
              <span className="inline-flex min-w-0 items-center justify-center gap-0.5">
                {isTireBeastMode(row) ? (
                  <span className="sk-beast-pulse inline-flex shrink-0" title="Sold within 24h of intake" aria-hidden>
                    🔥
                  </span>
                ) : null}
                <span className="min-w-0 truncate">{row.brand || '—'}</span>
              </span>
            </div>
            <div className="flex w-12 min-w-[2.75rem] shrink-0 items-center justify-center whitespace-nowrap px-1 text-zinc-400">
              {row.lr || '—'}
            </div>
            <div className="flex min-w-[4.5rem] shrink-0 items-center justify-center whitespace-nowrap px-0.5 font-mono text-xs font-semibold tabular-nums text-zinc-300">
              {formatCurrencyOrDash(Number(row.fet) || 0)}
            </div>
            <div className="flex w-[72px] shrink-0 items-center justify-center px-1">
              {letter ? (
                <button
                  type="button"
                  onClick={() => openGradeEdit(row)}
                  title="Change grade"
                  className={`inline-flex min-w-[2rem] justify-center rounded-full px-2 py-0.5 text-xs font-semibold ${gradePillClass(letter)}`}
                >
                  {letter}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => openGradeEdit(row)}
                  title="Set grade"
                  className="inline-flex min-h-[1.5rem] min-w-[2rem] items-center justify-center rounded-full border border-dashed border-zinc-700 px-2 text-[10px] text-zinc-600 hover:border-zinc-500 hover:text-zinc-400"
                  aria-label="Set grade"
                >
                  {'\u00a0'}
                </button>
              )}
            </div>
            <div className="flex min-w-[5.75rem] shrink-0 items-center px-2 text-sm font-semibold tabular-nums text-zinc-200">
              <button
                type="button"
                onClick={() => openCostEdit(row)}
                className={`whitespace-nowrap text-left underline-offset-2 hover:underline ${
                  editingCostsId === row.id ? 'text-amber-200' : 'text-zinc-200'
                }`}
              >
                {formatCurrencyOrDash(effectiveCts(row))}
              </button>
            </div>
            <div className="flex min-w-[7.5rem] shrink-0 items-center break-words px-2 text-left text-xs leading-snug text-zinc-500">
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
      className="box-border flex flex-col border-b border-zinc-800/80 bg-zinc-950/0 transition-colors duration-150 hover:bg-zinc-800/25"
    >
      <div className="grid shrink-0 px-0 py-0 text-sm" style={{ ...GRID_STYLE, height: ROW_BASE_PX }}>
        <div className="flex items-center justify-center px-0.5">
          <input
            type="checkbox"
            checked={selectedIds.has(row.id)}
            onChange={() => onToggle(row.id)}
            aria-label={`Select ${row.mspn}`}
            className="rounded border-zinc-600"
          />
        </div>
        <div className="truncate px-1.5 text-center font-medium text-zinc-200">
          <span className="inline-flex min-w-0 items-center justify-center gap-0.5">
            {isTireBeastMode(row) ? (
              <span className="sk-beast-pulse inline-flex shrink-0" title="Sold within 24h of intake" aria-hidden>
                🔥
              </span>
            ) : null}
            <span className="min-w-0 truncate">{row.brand || '—'}</span>
          </span>
        </div>
        <div className="min-w-0 px-3">
          <span className="inline-flex min-w-0 items-start gap-1.5">
            {row.deadStockFlag ? (
              <span
                className="mt-0.5 inline-block h-2 w-2 shrink-0 rounded-full bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.5)]"
                title="No orders in 90+ days."
                aria-label="Dead stock"
              />
            ) : null}
            <TireDescriptionCell description={row.description} />
          </span>
        </div>
        <div className="truncate px-3 font-mono text-sm font-semibold text-zinc-300 tabular-nums">
          {row.mspn || '—'}
        </div>
        <div className="whitespace-nowrap px-2 text-center text-zinc-400">{row.lr || '—'}</div>
        <div className="flex items-center px-3">
          {letter ? (
            <button
              type="button"
              onClick={() => openGradeEdit(row)}
              title="Change grade — opens guide"
              className={`inline-flex min-w-[2rem] justify-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${gradePillClass(letter)}`}
            >
              {letter}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => openGradeEdit(row)}
              title="Set grade — opens guide"
              className="inline-flex min-h-[1.5rem] min-w-[2rem] items-center justify-center rounded-full border border-dashed border-zinc-700 px-2 text-[10px] text-zinc-600 hover:border-zinc-500 hover:text-zinc-400"
              aria-label="Set grade"
            >
              {'\u00a0'}
            </button>
          )}
        </div>
        <div
          className="min-w-0 whitespace-nowrap px-2 text-right font-mono text-sm font-semibold text-zinc-200 tabular-nums"
          title="Buy price — catalog buy (includes FET component)"
        >
          <BuyPriceCell row={row} />
        </div>
        <div
          className="whitespace-nowrap px-2 text-center font-mono text-sm font-semibold text-zinc-300 tabular-nums"
          title="FET — shown for reference; already included in buy price"
        >
          {formatCurrencyOrDash(Number(row.fet) || 0)}
        </div>
        <div className="flex min-w-0 items-center justify-end px-2">
          <button
            type="button"
            onClick={() => openCostEdit(row)}
            className={`whitespace-nowrap text-right font-mono text-sm font-semibold tabular-nums underline-offset-2 hover:underline ${
              editingCostsId === row.id ? 'text-amber-200' : 'text-zinc-200'
            }`}
          >
            {formatCurrencyOrDash(effectiveCts(row))}
          </button>
        </div>
        <div className="flex min-w-0 items-center justify-end whitespace-nowrap px-2">{marginCell}</div>
        <div className="hidden break-words px-2 text-left text-xs leading-snug text-zinc-500 lg:block">
          {row.category || '—'}
        </div>
      </div>
      {ctsEditorSection}
    </div>
  )
})

export function MarginTable({
  rows,
  selectedIds,
  onToggle,
  onSelectAllVisible,
  onDeselectAllVisible,
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
  const [overheadDraft, setOverheadDraft] = useState(() => ({
    mountCost: 0,
    deliveryCost: 0,
    otherCost: 0,
  }))
  const [costSaving, setCostSaving] = useState(false)
  const [editingGradeId, setEditingGradeId] = useState(null)
  const [gradeDraft, setGradeDraft] = useState('B')
  const [gradeSaving, setGradeSaving] = useState(false)

  const allVisibleSelected = rows.length > 0 && rows.every((r) => selectedIds.has(r.id))
  const anyVisibleSelected = rows.some((r) => selectedIds.has(r.id))

  const openCostEdit = useCallback((row) => {
    setEditingGradeId(null)
    setEditingCostsId(row.id)
    setOverheadDraft(tireOverheadParts(row))
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

  const draftOverheadTotal = useMemo(() => computeCts(overheadDraft), [overheadDraft])

  const saveCosts = useCallback(
    async (rowId) => {
      const mountCost = Number(overheadDraft.mountCost) || 0
      const deliveryCost = Number(overheadDraft.deliveryCost) || 0
      const otherCost = Number(overheadDraft.otherCost) || 0
      const cts = computeCts({ mountCost, deliveryCost, otherCost })
      setCostSaving(true)
      try {
        await updateDoc(doc(db, 'tires', rowId), {
          mountCost,
          deliveryCost,
          otherCost,
          cts,
        })
        toast('Overhead updated', 'success')
        closeCostEdit()
      } catch (e) {
        console.error(e)
        window.alert(
          e instanceof Error ? e.message : 'Could not save overhead. Check Firestore rules.',
        )
      } finally {
        setCostSaving(false)
      }
    },
    [overheadDraft, toast, closeCostEdit],
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

  const gradeEditTire = useMemo(
    () => (editingGradeId ? (rows.find((r) => r.id === editingGradeId) ?? null) : null),
    [editingGradeId, rows],
  )

  const confirmGradeSave = useCallback(() => {
    if (!editingGradeId) return
    void saveGrade(editingGradeId)
  }, [editingGradeId, saveGrade])

  const rowProps = useMemo(
    () => ({
      rows,
      selectedIds,
      editingCostsId,
      overheadDraft,
      draftOverheadTotal,
      costSaving,
      openCostEdit,
      closeCostEdit,
      openGradeEdit,
      saveCosts,
      onToggle,
      setOverheadDraft,
      isMobile: isMobileTable,
      selectMode,
      mobileRowBasePx,
    }),
    [
      rows,
      selectedIds,
      editingCostsId,
      overheadDraft,
      draftOverheadTotal,
      costSaving,
      openCostEdit,
      closeCostEdit,
      openGradeEdit,
      saveCosts,
      onToggle,
      setOverheadDraft,
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
        className="relative overflow-x-auto rounded-2xl border border-zinc-800 max-sm:after:pointer-events-none max-sm:after:absolute max-sm:after:right-0 max-sm:after:top-0 max-sm:after:z-[5] max-sm:after:h-full max-sm:after:w-10 max-sm:after:bg-gradient-to-l max-sm:after:from-zinc-950 max-sm:after:to-transparent max-sm:after:opacity-90 max-sm:after:content-[''] sm:after:hidden"
      >
        {isMobileTable && rows.length > 0 && !loading && !scrollHintDismissed ? (
          <div className="mx-2 mb-2 rounded-full border border-amber-800/50 bg-amber-950/40 px-3 py-2 text-center text-xs font-medium text-amber-100/95 md:hidden">
            ← Scroll for overhead, FET, grade, brand →
          </div>
        ) : null}
        <div className={`w-full text-left text-sm ${isMobileTable ? 'min-w-0' : 'min-w-[1220px]'}`}>
          <div
            className="box-border hidden border-b border-zinc-800 bg-zinc-900/90 py-3.5 text-xs font-semibold uppercase tracking-wide text-zinc-400 md:grid"
            style={GRID_STYLE}
          >
            <div className="flex flex-col items-stretch justify-center gap-0.5 px-1 sm:flex-row sm:flex-wrap sm:items-center sm:justify-center sm:gap-0.5">
              <button
                type="button"
                title="Select all rows in the current filtered view"
                onClick={() => onSelectAllVisible(rows)}
                disabled={loading || rows.length === 0 || allVisibleSelected}
                className="rounded border border-zinc-700 bg-zinc-950/80 px-1.5 py-0.5 text-[9px] font-semibold uppercase leading-tight tracking-wide text-zinc-300 hover:border-zinc-500 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                All
              </button>
              <button
                type="button"
                title="Clear selection for rows in the current filtered view"
                onClick={() => onDeselectAllVisible(rows)}
                disabled={loading || rows.length === 0 || !anyVisibleSelected}
                className="rounded border border-zinc-700 bg-zinc-950/80 px-1.5 py-0.5 text-[9px] font-semibold uppercase leading-tight tracking-wide text-zinc-300 hover:border-zinc-500 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                None
              </button>
            </div>
            <div className="px-1.5 text-center">
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
            <div className="whitespace-nowrap px-2 text-center">LR</div>
            <div className="px-3">Grade</div>
            <div className="min-w-0 whitespace-nowrap px-2 text-right">
              <SortButton
                label="Buy Price"
                active={sortKey === 'buy'}
                dir={sortDir}
                onClick={() => onSort('buy')}
                disabled={loading}
                touchWide={isMobileTable}
              />
            </div>
            <div className="whitespace-nowrap px-2 text-center" title="Already included in buy price; shown for reference">
              FET
            </div>
            <div className="whitespace-nowrap px-2 text-right">Overhead</div>
            <div className="min-w-0 whitespace-nowrap px-2 text-right">
              <SortButton
                label="Margin %"
                active={sortKey === 'margin'}
                dir={sortDir}
                onClick={() => onSort('margin')}
                disabled={loading}
                touchWide={isMobileTable}
              />
            </div>
            <div className="hidden px-2 text-left lg:block">Category</div>
          </div>
          {isMobileTable && !loading && rows.length > 0 ? (
            <div className="flex w-max min-w-full border-b border-zinc-800 bg-zinc-900/90 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400 md:hidden">
              <div className="sticky left-0 z-[16] flex shrink-0 items-stretch border-r border-zinc-800/80 bg-zinc-900/95 shadow-[8px_0_16px_-6px_rgba(0,0,0,0.45)]">
                <div className="flex w-11 shrink-0 flex-col items-stretch justify-center gap-0.5 px-0.5 py-0.5">
                  <button
                    type="button"
                    title="Select all visible"
                    onClick={() => onSelectAllVisible(rows)}
                    disabled={loading || rows.length === 0 || allVisibleSelected}
                    className="rounded border border-zinc-700 bg-zinc-950/80 px-1 py-0.5 text-[8px] font-semibold uppercase leading-tight tracking-wide text-zinc-300 hover:border-zinc-500 disabled:opacity-40"
                  >
                    All
                  </button>
                  <button
                    type="button"
                    title="Deselect all visible"
                    onClick={() => onDeselectAllVisible(rows)}
                    disabled={loading || rows.length === 0 || !anyVisibleSelected}
                    className="rounded border border-zinc-700 bg-zinc-950/80 px-1 py-0.5 text-[8px] font-semibold uppercase leading-tight tracking-wide text-zinc-300 hover:border-zinc-500 disabled:opacity-40"
                  >
                    None
                  </button>
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
                    label="Buy"
                    active={sortKey === 'buy'}
                    dir={sortDir}
                    onClick={() => onSort('buy')}
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
                <div className="w-[76px] shrink-0 px-1">
                  <SortButton
                    label="Brand"
                    active={sortKey === 'brand'}
                    dir={sortDir}
                    onClick={() => onSort('brand')}
                    disabled={loading}
                    touchWide
                  />
                </div>
                <div className="flex w-12 min-w-[2.75rem] shrink-0 items-center justify-center whitespace-nowrap px-1">
                  LR
                </div>
                <div className="flex min-w-[4.5rem] shrink-0 items-center justify-center whitespace-nowrap px-0.5">
                  FET
                </div>
                <div className="flex w-[72px] shrink-0 items-center justify-center">Gr</div>
                <div className="flex min-w-[5.75rem] shrink-0 items-center justify-center whitespace-nowrap px-1">
                  OH
                </div>
                <div className="flex min-w-[7.5rem] shrink-0 items-center justify-center px-2 text-center">Cat</div>
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
            <div className="flex flex-col items-center justify-center gap-4 px-6 py-16 text-center">
              <div
                className="rounded-2xl border border-zinc-800/90 bg-zinc-900/50 p-8 shadow-inner shadow-black/20"
                role="status"
              >
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-zinc-700 bg-zinc-800/50 text-zinc-500">
                  <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
                    <circle cx="12" cy="12" r="7.25" />
                    <circle cx="12" cy="12" r="2.25" />
                    <path strokeLinecap="round" d="M12 4.75v2M12 17.25v2M4.75 12h2M17.25 12h2" />
                  </svg>
                </div>
                <div className="max-w-sm text-sm leading-relaxed text-zinc-400">{emptyState}</div>
              </div>
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
      <TireGradeModal
        open={editingGradeId != null}
        tire={gradeEditTire}
        draftGrade={gradeDraft === 'A' || gradeDraft === 'B' || gradeDraft === 'C' ? gradeDraft : 'B'}
        onDraftChange={setGradeDraft}
        onClose={closeGradeEdit}
        onSave={confirmGradeSave}
        saving={gradeSaving}
      />
    </div>
  )
}
