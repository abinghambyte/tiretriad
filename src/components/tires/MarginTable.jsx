import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { List, useListRef } from 'react-window'
import { useToast } from '../../context/ToastContext.jsx'
import { useMediaQuery } from '../../hooks/useMediaQuery.js'
import { doc, updateDoc } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { computeCts, effectiveCts, hasOverheadRecorded, tireOverheadParts } from '../../utils/ctsCalc'
import { computeListingMargin, marginBadgeLabel } from '../../utils/marginCalc'
import { confidenceTier, computeFloor } from '../../utils/opportunityScore'
import { isTireBeastMode } from '../../utils/tireBeastMode.js'
import { formatCurrency, formatCurrencyOrDash, formatPercent } from '../../utils/format'
import Spinner from '../ui/Spinner.jsx'
import { tireCatalogBuyNumber } from '../../utils/tireCatalogBuy'
import { tireCatalogRetailNumber, tireRetailIsEstimated, tireRetailIsResearched } from '../../utils/tireCatalogRetail'
import { parseDescription } from '../../utils/parseTireDescription.js'
import { copyToClipboard } from '../../utils/copyToClipboard.js'
import { timeAgo } from '../../utils/timeAgo'
import { listingStatus } from '../../utils/listingStatus'
import { brandColorCssVar } from '../../utils/brandColor.js'

/** Main data row height (px) -- desktop. CTS editor expands total row height via `rowHeight`. */
const ROW_BASE_PX = 56
/** Taller rows on narrow viewports for touch targets. */
const ROW_MOBILE_BASE_PX = 60
/** Extra height when CTS inline editor is open (preview line + grid + actions). */
const ROW_CTS_EDITOR_EXTRA_PX = 240
/** Max list viewport height (px). */
const LIST_MAX_H = 560
const LIST_MIN_H = 200

/** FET column header `title` (desktop sortable header + mobile static header). */
const FET_HEADER_TOOLTIP =
  'FET per tire. Tires marked Not FET show -- (applied to tire categories that are FET-exempt). Already included in buy price; shown for reference.'
/** FET data cell `title` (desktop grid + mobile horizontal row). */
const FET_CELL_TOOLTIP =
  'FET per tire. Tires marked Not FET show -- (applied to tire categories that are FET-exempt). Shown for reference; already included in buy price.'

const LISTING_PLATFORM_META = [
  { key: 'facebook', short: 'FB', name: 'Facebook Marketplace' },
  { key: 'offerup', short: 'OU', name: 'OfferUp' },
  { key: 'craigslist', short: 'CL', name: 'Craigslist' },
]

/**
 * Listing chip: filled amber/emerald when the tire IS listed on that platform,
 * dimmed outline when it isn't. Keeping the non-listed variant visible (not
 * hidden) preserves at-a-glance scannability of row coverage.
 */
function ListedPlatformsCell({ row }) {
  return (
    <span className="inline-flex gap-1 font-mono text-[10px] font-semibold tracking-tight">
      {LISTING_PLATFORM_META.map(({ key, short, name }) => {
        const st = listingStatus(row, key)
        const ts = row?.platformListings?.[key]?.lastPostedAt
        let cls
        let status
        if (st === 'active') {
          cls =
            'rounded-md border border-emerald-800/70 bg-emerald-950/70 px-1.5 py-0.5 text-emerald-200 ring-1 ring-inset ring-emerald-900/50'
          status = `listed · posted ${timeAgo(ts) || 'recently'}`
        } else if (st === 'stale') {
          cls =
            'rounded-md border border-amber-800/60 bg-amber-950/50 px-1.5 py-0.5 text-amber-200 ring-1 ring-inset ring-amber-900/40'
          status = `stale · posted ${timeAgo(ts) || 'a while ago'}`
        } else {
          cls =
            'rounded-md border border-zinc-800 bg-transparent px-1.5 py-0.5 text-zinc-600'
          status = 'never posted'
        }
        return (
          <span
            key={key}
            className={cls}
            title={`${name}: ${status}`}
            aria-label={`${name}: ${status}`}
            role="img"
          >
            <span aria-hidden>{short}</span>
          </span>
        )
      })}
    </span>
  )
}

function PhotoCountCell({ row }) {
  const count = Array.isArray(row?.photos) ? row.photos.length : 0
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md border border-zinc-800 px-1.5 py-0.5 font-mono text-[11px] text-zinc-300"
      title={`${count} tire ${count === 1 ? 'photo' : 'photos'}`}
    >
      <span aria-hidden>📷</span>
      <span>{count}</span>
    </span>
  )
}

/** @type {Record<string, string>} */
const COLUMN_TEMPLATE = {
  // select is always first and fixed-width
  select: '40px',
  // 7rem fits "BFGOODRICH" (10 chars) without truncation at the catalog font;
  // 6rem clipped the trailing letter and forced the title-tooltip workaround.
  brand: '7rem',
  // Description flexes but never collapses below 14rem so short rows still
  // have breathing room and wide rows don't squeeze the fixed columns to the
  // right. See Fix 1 in the PR notes: the old `2fr` let the grid overflow its
  // scroll parent and clipped the trailing Margin % column.
  description: 'minmax(11rem, 18rem)',
  mspn: '5rem',
  lr: '3rem',
  listed: '6.25rem',
  photos: '4.25rem',
  buy: '6rem',
  // 6.5rem fits four-figure retails like "$1,150.28" without clipping the
  // leading dollar sign at the catalog font.
  retail: '6.5rem',
  fet: '4.5rem',
  overhead: '5.5rem',
  // Net $ and Floor are opt-in columns hidden by default (see TiresDashboard
  // initial columnVisibility). 6rem lets large positives like "+$383.86"
  // breathe; 5rem clipped the leading sign.
  net: '6rem',
  floor: '6rem',
  // Slightly wider so "100.0%" never clips even with the mono `sk-figures`
  // font.
  margin: '6rem',
}

// Description track uses the first arg as its floor. Kept tight enough that
// with every other fixed column visible, the total grid width sits inside a
// standard 1152px (max-w-6xl) container so the Margin % cell never spills
// past the viewport edge at default desktop widths.

/** Approximate px width for each template token. Used to compute the grid's
 * `minWidth` so the horizontal scroll wrapper always gives the table enough
 * room for every fixed column + the description's own minimum. */
const COLUMN_MIN_PX = {
  select: 40,
  brand: 112, // 7rem
  description: 176, // matches the 11rem floor above
  mspn: 80,
  lr: 48,
  listed: 100,
  photos: 68,
  buy: 96,
  retail: 104, // 6.5rem
  fet: 72,
  overhead: 88,
  net: 96, // 6rem
  floor: 96, // 6rem
  margin: 96,
}

/** Ordered list of columns as they appear in the grid. */
const COLUMN_ORDER = [
  'brand',
  'description',
  'mspn',
  'lr',
  'listed',
  'photos',
  'buy',
  'retail',
  'fet',
  'overhead',
  'net',
  'floor',
  'margin',
]

function buildGridStyle(columnVisibility) {
  const parts = [COLUMN_TEMPLATE.select]
  let minWidth = COLUMN_MIN_PX.select
  for (const k of COLUMN_ORDER) {
    if (columnVisibility?.[k] !== false) {
      parts.push(COLUMN_TEMPLATE[k])
      minWidth += COLUMN_MIN_PX[k]
    }
  }
  return {
    display: 'grid',
    width: '100%',
    minWidth,
    gridTemplateColumns: parts.join(' '),
    alignItems: 'center',
    columnGap: 0,
  }
}

function buyPriceOf(row) {
  const n = tireCatalogBuyNumber(row)
  return Number.isFinite(n) && n > 0 ? n : 0
}

function BuyPriceCell({ row }) {
  const n = tireCatalogBuyNumber(row)
  const text = n > 0 && Number.isFinite(n) ? formatCurrency(n) : '--'
  return (
    <span className="inline-flex max-w-full whitespace-nowrap font-mono text-sm font-semibold tabular-nums text-zinc-200 max-sm:min-w-0">
      {text}
    </span>
  )
}

function confidenceDotClass(tier) {
  if (tier === 'high') return 'bg-emerald-400'
  if (tier === 'medium') return 'bg-amber-300'
  if (tier === 'estimated') return 'bg-zinc-400'
  return ''
}

function RetailPriceCell({ row }) {
  const n = tireCatalogRetailNumber(row)
  if (!(n > 0 && Number.isFinite(n))) {
    return <span className="font-mono text-sm text-zinc-600">--</span>
  }
  const estimated = tireRetailIsEstimated(row)
  const researched = tireRetailIsResearched(row)
  const tier = confidenceTier(row)
  // Three-state styling so Alex can tell at a glance where each retail came
  // from: cyan = real Gemini research, muted amber = catalog-median estimate
  // (approximate), grey = legacy pre-research.
  const className = estimated
    ? 'inline-flex max-w-full whitespace-nowrap font-mono text-sm tabular-nums text-amber-300/70 italic max-sm:min-w-0'
    : researched
      ? 'inline-flex max-w-full whitespace-nowrap font-mono text-sm font-semibold tabular-nums text-cyan-200/90 max-sm:min-w-0'
      : 'inline-flex max-w-full whitespace-nowrap font-mono text-sm tabular-nums text-zinc-400 max-sm:min-w-0'
  const title = estimated
    ? `Estimated from catalog-median markup × buy cost. Gemini could not find this tire; hover/click Refresh Price in the tire detail if you want to retry.`
    : researched
      ? 'Researched retail from the nightly Gemini price intel job.'
      : ''
  const dotCls = confidenceDotClass(tier)
  // Dot only for researched / estimated. Manual firm values (no retail here
  // means `researched` is false anyway; we still gate on tier to be explicit).
  const showDot = Boolean(dotCls) && (researched || estimated)
  return (
    <span className="inline-flex items-center gap-1">
      <span className={className} title={title}>
        {formatCurrency(n)}
      </span>
      {showDot ? (
        <span
          className={`inline-block h-[6px] w-[6px] shrink-0 rounded-full ${dotCls}`}
          aria-hidden
          title={title}
        />
      ) : null}
    </span>
  )
}

function netToneClass(net) {
  if (net == null || Number.isNaN(net)) return 'text-zinc-400'
  if (net < 5) return 'text-rose-300'
  if (net <= 20) return 'text-amber-300'
  return 'text-emerald-300'
}

function NetCell({ row }) {
  const op = row?.opportunity
  if (!op || op.netPerTire == null) return <span className="font-mono text-sm text-zinc-600">--</span>
  const n = op.netPerTire
  return (
    <span
      className={`inline-flex max-w-full whitespace-nowrap font-mono text-sm font-semibold tabular-nums ${netToneClass(n)}`}
      title={`Retail ${formatCurrency(op.retail)} minus buy ${formatCurrency(op.buy)} minus overhead ${formatCurrency(op.overhead)}${op.fet > 0 ? ` minus FET ${formatCurrency(op.fet)}` : ''} at current haggle.`}
    >
      {n >= 0 ? '+' : ''}
      {formatCurrency(n)}
    </span>
  )
}

function FloorCell({ row }) {
  const fl = row?.opportunity?.floor != null ? row.opportunity.floor : computeFloor(row)
  if (fl == null) return <span className="font-mono text-sm text-zinc-600">--</span>
  return (
    <span
      className="inline-flex max-w-full whitespace-nowrap font-mono text-sm tabular-nums text-zinc-400"
      title="All-in per-tire floor: buy + overhead + FET"
    >
      {formatCurrency(fl)}
    </span>
  )
}

function previewMarginWhileEditing(row, overheadDraft) {
  const buy = buyPriceOf(row)
  if (!buy) return null
  const overhead = computeCts(overheadDraft)
  return ((buy - overhead) / buy) * 100
}

function TableSkeleton({ gridStyle, columnCount }) {
  return [...Array(8)].map((_, i) => (
    <div
      key={i}
      className="box-border grid border-b border-zinc-800/40 px-0 py-2"
      style={{ ...gridStyle, minHeight: ROW_BASE_PX }}
    >
      {[...Array(columnCount)].map((__, j) => (
        <div key={j} className="px-3">
          <div className="h-3.5 animate-pulse rounded-md bg-zinc-800/65" />
        </div>
      ))}
    </div>
  ))
}

function listHeightPx(rowCount, basePx = ROW_BASE_PX) {
  const raw = rowCount * basePx + 8
  return Math.min(LIST_MAX_H, Math.max(LIST_MIN_H, raw))
}

function MiniNum({ label, value, onChange }) {
  return (
    <div>
      <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-zinc-400">
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

/**
 * Patch-602: margin pill styling. Thresholds per audit decision:
 *   green  ≥ 25%
 *   amber  20–24.99%
 *   red    < 20%
 *
 * Returns badge/pill classes (background + border + text + padding) so the
 * margin reads as a status chip at a glance instead of a color-only number.
 */
function marginPctTone(pct) {
  const base =
    'inline-flex items-center rounded-md border px-1.5 py-0.5 transition-colors duration-300 ease-out'
  if (pct == null || Number.isNaN(pct)) {
    return `${base} border-zinc-700 bg-zinc-900/40 text-zinc-400`
  }
  if (pct < 20) {
    return `${base} border-rose-800/60 bg-rose-950/40 text-rose-200`
  }
  if (pct < 25) {
    return `${base} border-amber-800/60 bg-amber-950/40 text-amber-200`
  }
  return `${base} border-emerald-800/60 bg-emerald-950/40 text-emerald-200`
}

/** Best-effort two-line split when parseKind is still raw (catalog edge cases). */
// Two extra `(?:\.\d+)?` groups vs the prior version handle commercial
// tire sizes that carry a decimal in the WIDTH (e.g. `16.00R20`) or in the
// RIM diameter (e.g. `11R22.5`). Without these the splitter regex didn't
// match and the description rendered as a single un-split line, while
// neighboring rows with `/`-separated sizes (e.g. `395/85R20 XZL LRJ`)
// got the cleaner two-line treatment — looked inconsistent.
function splitRawDescription(raw) {
  const r = String(raw || '').trim()
  const m = r.match(
    /^((?:LT|P)?\d{2,3}(?:\.\d+)?(?:[/X]\d{1,3}(?:\.\d+)?)?[A-Z]{1,2}\d{2}(?:\.\d+)?(?:LT)?(?:\/[A-F])?)\s*([0-9/]+[A-Z]{1,2})?\s*(.*)$/i,
  )
  if (m) {
    const size = (m[1] || '').trim()
    const loadSpeed = (m[2] || '').trim()
    const tread = (m[3] || '').trim()
    const primary = [size, loadSpeed].filter(Boolean).join(' · ')
    return { primary: primary || r, secondary: tread || null }
  }
  return { primary: r, secondary: null }
}

function SidewallPill({ tag }) {
  const styles = {
    XL: 'bg-zinc-700 text-zinc-100',
    MS: 'bg-cyan-900/60 text-cyan-200',
  }
  const labels = {
    XL: 'Extra Load tire',
    MS: 'Mud and Snow rated',
  }
  const display = tag === 'MS' ? 'M/S' : tag
  return (
    <span
      data-pill={tag}
      aria-label={labels[tag] ?? tag}
      className={`ml-1 inline-block rounded px-1.5 py-px text-[9px] font-bold tracking-wide align-middle ${styles[tag] ?? 'bg-zinc-700 text-zinc-100'}`}
    >
      {display}
    </span>
  )
}

const TireDescriptionCell = memo(function TireDescriptionCell({ description, pillTags }) {
  const d = String(description ?? '').trim()
  const parsed = useMemo(() => parseDescription(d), [d])
  const tags = Array.isArray(pillTags) ? pillTags : []
  if (!d) return <span className="text-zinc-400">--</span>

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
  if (parsed.loadIndex != null) {
    const li2 = parsed.loadIndexSecondary
    if (li2 != null && Number.isFinite(li2)) {
      loadParts.push(`${parsed.loadIndex}/${li2}`)
    } else {
      loadParts.push(String(parsed.loadIndex))
    }
  }
  if (parsed.speedRating) loadParts.push(parsed.speedRating)
  // XL intentionally NOT pushed into primary -- it renders as a SidewallPill on
  // the secondary line via pillTags.
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
    const split = splitRawDescription(d)
    primary = split.primary
    secondary = split.secondary
  }

  if (hasFlotation || hasMetric) {
    const t = String(parsed.treadName || '').trim()
    if (t && t !== d && t !== primary && !primary.includes(t)) {
      secondary = t
    }
  }

  const fullText = secondary ? `${primary} ${secondary}` : primary
  const hasPills = tags.length > 0

  return (
    <div className="group/desc relative min-w-0 max-w-full overflow-hidden pr-6 text-sm leading-snug text-zinc-300">
      <div className="break-words font-mono font-semibold text-zinc-200 [overflow-wrap:anywhere]">{primary}</div>
      {secondary ? (
        <div className="mt-0.5 line-clamp-1 max-w-full break-words text-xs font-medium text-zinc-400 [overflow-wrap:anywhere]">
          {secondary}
          {hasPills ? (
            <>
              {' · '}
              {tags.map((t) => (
                <SidewallPill key={t} tag={t} />
              ))}
            </>
          ) : null}
        </div>
      ) : hasPills ? (
        <div className="mt-0.5 line-clamp-1 max-w-full break-words text-xs">
          {tags.map((t) => (
            <SidewallPill key={t} tag={t} />
          ))}
        </div>
      ) : null}
      <CopyDescriptionButton text={fullText} />
    </div>
  )
})

// Test-only export. Tests import this aliased name; production code uses the
// memoized version above through the existing call sites.
export const TireDescriptionCellForTest = TireDescriptionCell

function CopyDescriptionButton({ text }) {
  const { toast } = useToast()
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return undefined
    const t = window.setTimeout(() => setCopied(false), 1200)
    return () => window.clearTimeout(t)
  }, [copied])

  async function onClick(e) {
    e.stopPropagation()
    const ok = await copyToClipboard(text)
    if (ok) {
      setCopied(true)
    } else {
      toast('Copy failed. Select and copy manually.', 'error')
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Copy description"
      title="Copy description"
      className="absolute right-0 top-0 inline-flex h-5 w-5 items-center justify-center rounded text-zinc-600 opacity-0 transition-opacity hover:bg-zinc-800/60 hover:text-zinc-200 focus:opacity-100 focus:outline-none focus:ring-1 focus:ring-zinc-500 group-hover/desc:opacity-100"
    >
      {copied ? (
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5 text-emerald-400">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 10l4 4 8-8" />
        </svg>
      ) : (
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-3.5 w-3.5">
          <rect x="6" y="6" width="10" height="10" rx="1.5" />
          <path d="M4 12V5a1.5 1.5 0 0 1 1.5-1.5h7" />
        </svg>
      )}
    </button>
  )
}

/**
 * Three-click header: ascending → descending → back to default. Parent owns
 * `sortKey` / `sortDir`; click handling applies the cycle and calls `onSortChange`.
 */
function SortButton({ label, columnKey, sortKey, sortDir, onClick, disabled, touchWide }) {
  const active = sortKey === columnKey
  const dir = active ? sortDir : null
  // Sort state is communicated to assistive tech via the button's `title`
  // (e.g. "Sort Brand descending (click again to clear)") and the visible
  // arrow glyph. aria-sort is not used because: (a) it requires a
  // columnheader/rowheader role on the host element, (b) the header cells
  // here are plain divs in a virtualized react-window grid (no real
  // <table>), and (c) jsx-a11y rejects aria-sort on a <button> as not
  // supported by the implicit button role.
  return (
    <button
      type="button"
      onClick={() => onClick(columnKey)}
      disabled={disabled}
      title={
        active
          ? dir === 'asc'
            ? `Sort ${label} descending`
            : `Sort ${label} ascending`
          : `Sort by ${label}`
      }
      className={`group inline-flex cursor-pointer items-center gap-1 rounded px-1 py-0.5 font-medium transition-colors hover:bg-zinc-800/50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent ${
        active ? 'text-zinc-100' : 'text-zinc-400 hover:text-zinc-100'
      } ${touchWide ? 'min-h-[44px] min-w-[44px] justify-center sm:min-h-0 sm:min-w-0' : ''}`}
    >
      {label}
      <span className="inline-block w-2.5 text-center text-zinc-400 group-hover:text-zinc-300">
        {active ? (dir === 'asc' ? '↑' : '↓') : '⇅'}
      </span>
    </button>
  )
}

/** Pure-looking header cell that isn't sortable. */
function StaticHeader({ label, className = '', title: titleAttr }) {
  return (
    <span className={className} title={titleAttr || undefined}>
      {label}
    </span>
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
  saveCosts,
  onToggle,
  setOverheadDraft,
  isMobile = false,
  columnVisibility,
  gridStyle,
  justJumpedToId,
}) {
  const row = rows[index]
  if (!row) return null
  const jumpHighlight = justJumpedToId && justJumpedToId === row?.id
  const jumpHighlightClass = jumpHighlight
    ? 'ring-2 ring-amber-500 ring-inset'
    : ''

  // Default display: listing margin at researched street retail (PR #34,
  // retail-based listing margin). Returns null when no retail is known yet
  // (unresearched or genuine not-found), which the cell renders as a dash.
  // IMPORTANT: the row's visible margin stays locked to this saved value
  // while the inline editor is open. Editing drafts must NOT mutate the
  // row value. The projected margin is exposed in the editor section only.
  const m = computeListingMargin(row)
  const showCostEditor = editingCostsId === row.id
  const projectedMargin = showCostEditor ? previewMarginWhileEditing(row, overheadDraft) : null

  const marginTitle = (() => {
    if (showCostEditor) {
      return buyPriceOf(row) <= 0
        ? 'No buy price on this catalog row.'
        : marginBadgeLabel(projectedMargin)
    }
    if (m == null) {
      return buyPriceOf(row) <= 0
        ? 'No buy price on this catalog row.'
        : 'Retail not researched yet. Runs hourly; check back.'
    }
    return marginBadgeLabel(m)
  })()
  const marginCell =
    m != null && !Number.isNaN(m) ? (
      <span
        className={`sk-figures inline-flex whitespace-nowrap text-sm font-semibold ${marginPctTone(m)}`}
        title={marginTitle}
      >
        {formatPercent(m, 1)}
      </span>
    ) : (
      <span className="whitespace-nowrap text-sm font-semibold text-zinc-400" title={marginTitle}>
        --
      </span>
    )

  const ctsEditorSection = showCostEditor ? (
    <div className="border-t border-zinc-800/80 bg-zinc-900/70 px-4 py-4">
      <p className="mb-3 text-xs text-zinc-400">
        Enter your overhead costs per tire: mount labor, delivery, and other. Buy price from the Sourcer
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
        <div className="flex w-full flex-col gap-1 font-mono text-[11px] leading-relaxed text-zinc-400">
          <p>
            Overhead = {formatCurrencyOrDash(Number(overheadDraft.mountCost) || 0)} mount +{' '}
            {formatCurrencyOrDash(Number(overheadDraft.deliveryCost) || 0)} delivery +{' '}
            {formatCurrencyOrDash(Number(overheadDraft.otherCost) || 0)} other ={' '}
            <span className="text-amber-200/90">{formatCurrencyOrDash(draftOverheadTotal)}</span>
          </p>
          <p className="flex flex-wrap items-center gap-x-3 text-zinc-400">
            <span>
              Current margin:{' '}
              <span className={`font-semibold ${m != null && !Number.isNaN(m) ? marginPctTone(m) : 'text-zinc-400'}`}>
                {m != null && !Number.isNaN(m) ? formatPercent(m, 1) : '--'}
              </span>
            </span>
            <span>
              Projected:{' '}
              <span
                className={`font-semibold ${
                  projectedMargin != null && !Number.isNaN(projectedMargin)
                    ? marginPctTone(projectedMargin)
                    : 'text-zinc-400'
                }`}
              >
                {projectedMargin != null && !Number.isNaN(projectedMargin)
                  ? formatPercent(projectedMargin, 1)
                  : '--'}
              </span>
            </span>
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
          <label className="flex items-center gap-2 text-xs text-zinc-300">
            <input
              type="checkbox"
              checked={Boolean(overheadDraft.doNotList)}
              onChange={(e) => setOverheadDraft((d) => ({ ...d, doNotList: e.target.checked }))}
              className="size-4 rounded border-zinc-600 accent-amber-400"
            />
            Do not list
          </label>
          <p className="text-xs text-zinc-400">
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
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-amber-400 disabled:opacity-50"
            >
              {costSaving && <Spinner className="h-3.5 w-3.5 text-zinc-800" />}
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
        className={`box-border flex flex-col border-b border-zinc-800/80 bg-zinc-950/0 transition-colors duration-150 hover:bg-zinc-800/25 ${jumpHighlightClass}`}
      >
        <div className="flex w-max min-w-full text-sm" style={{ minHeight: ROW_MOBILE_BASE_PX }}>
            <div className="sticky left-0 z-[15] flex shrink-0 items-stretch border-r border-zinc-800/80 bg-zinc-950 shadow-[8px_0_16px_-6px_rgba(0,0,0,0.55)]">
            <div className="flex w-11 shrink-0 flex-col items-center justify-center gap-0.5 px-0.5">
              <span className="text-[8px] font-semibold uppercase tracking-wide text-zinc-400">Pick</span>
              <input
                type="checkbox"
                checked={selected}
                onChange={() => onToggle(row.id)}
                aria-label={`Select ${row.mspn}`}
                className="h-4 w-4 rounded border-zinc-600"
              />
            </div>
            <div className="flex w-[200px] shrink-0 items-center border-r border-zinc-800/60 px-2">
              <span className="inline-flex min-w-0 items-start gap-1.5">
                <TireDescriptionCell description={row.description} />
              </span>
            </div>
            <div className="flex w-[76px] shrink-0 items-center border-r border-zinc-800/60 px-1 font-mono text-sm font-semibold text-zinc-300 tabular-nums">
              {row.mspn || '--'}
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
                <span className="min-w-0 truncate" title={row.brand || ''}>{row.brand || ''}</span>
              </span>
            </div>
            <div className="flex w-12 min-w-[2.75rem] shrink-0 items-center justify-center whitespace-nowrap px-1 text-zinc-400">
              {row.lr || '--'}
            </div>
            <div className="flex min-w-[6.25rem] shrink-0 items-center justify-center whitespace-nowrap px-0.5">
              <ListedPlatformsCell row={row} />
            </div>
            {columnVisibility?.photos !== false ? (
              <div className="flex min-w-[4.25rem] shrink-0 items-center justify-center whitespace-nowrap px-0.5">
                <PhotoCountCell row={row} />
              </div>
            ) : null}
            {columnVisibility?.fet !== false ? (
              <div
                className="flex min-w-[4.5rem] shrink-0 items-center justify-center whitespace-nowrap px-0.5 font-mono text-xs font-semibold tabular-nums text-zinc-300"
                title={FET_CELL_TOOLTIP}
              >
                {row.hasFet === false ? '--' : formatCurrencyOrDash(Number(row.fet) || 0)}
              </div>
            ) : null}
            <div className="flex min-w-[5rem] shrink-0 items-center justify-end whitespace-nowrap px-0.5 font-mono text-xs tabular-nums">
              <RetailPriceCell row={row} />
            </div>
            <div className="flex min-w-[5.75rem] shrink-0 items-center px-2 text-sm font-semibold tabular-nums text-zinc-200">
              <button
                type="button"
                onClick={() => openCostEdit(row)}
                title={hasOverheadRecorded(row) ? '' : 'Click to set mount, delivery, and other costs'}
                className={`whitespace-nowrap text-left underline-offset-2 hover:underline ${
                  editingCostsId === row.id
                    ? 'text-amber-200'
                    : hasOverheadRecorded(row)
                      ? 'text-zinc-200'
                      : 'text-zinc-400 italic'
                }`}
              >
                {hasOverheadRecorded(row) ? formatCurrencyOrDash(effectiveCts(row)) : 'not set'}
              </button>
            </div>
          </div>
        </div>
        {ctsEditorSection}
      </div>
    )
  }

  const vis = columnVisibility || {}

  return (
    <div
      style={{ ...style, borderLeft: `8px solid ${brandColorCssVar(row.brand)}` }}
      data-brand={row.brand || ''}
      className={`box-border flex flex-col border-b border-zinc-800/80 bg-zinc-950/0 transition-colors duration-150 hover:bg-zinc-800/25 ${jumpHighlightClass}`}
    >
      <div className="grid shrink-0 px-0 py-0 text-sm" style={{ ...gridStyle, height: ROW_BASE_PX }}>
        <div className="flex items-center justify-center px-0.5">
          <input
            type="checkbox"
            checked={selectedIds.has(row.id)}
            onChange={() => onToggle(row.id)}
            aria-label={`Select ${row.mspn}`}
            className="rounded border-zinc-600"
          />
        </div>
        {vis.brand !== false ? (
          <div className="truncate px-1.5 text-center font-medium text-zinc-200">
            <span className="inline-flex min-w-0 items-center justify-center gap-0.5">
              {isTireBeastMode(row) ? (
                <span className="sk-beast-pulse inline-flex shrink-0" title="Sold within 24h of intake" aria-hidden>
                  🔥
                </span>
              ) : null}
              <span className="min-w-0 truncate" title={row.brand || ''}>{row.brand || ''}</span>
            </span>
          </div>
        ) : null}
        {vis.description !== false ? (
          <div className="min-w-0 px-3">
            <span className="inline-flex min-w-0 items-start gap-1.5">
              <TireDescriptionCell description={row.description} />
            </span>
          </div>
        ) : null}
        {vis.mspn !== false ? (
          <div className="truncate px-3 font-mono text-sm font-bold tabular-nums text-[color:var(--color-brand-michelin)]">
            {row.mspn || '--'}
          </div>
        ) : null}
        {vis.lr !== false ? (
          <div className="whitespace-nowrap px-2 text-center text-zinc-400 tabular-nums">{row.lr || '--'}</div>
        ) : null}
        {vis.listed !== false ? (
          <div className="flex min-w-0 items-center justify-center px-1">
            <ListedPlatformsCell row={row} />
          </div>
        ) : null}
        {vis.photos !== false ? (
          <div className="flex min-w-0 items-center justify-center px-1">
            <PhotoCountCell row={row} />
          </div>
        ) : null}
        {vis.buy !== false ? (
          <div
            className="min-w-0 whitespace-nowrap px-2 text-right font-mono text-sm font-semibold text-zinc-200 tabular-nums"
            title="Buy price: catalog buy (includes FET component)"
          >
            <BuyPriceCell row={row} />
          </div>
        ) : null}
        {vis.retail !== false ? (
          <div
            className="min-w-0 whitespace-nowrap px-2 text-right font-mono text-sm tabular-nums"
            title={
              tireRetailIsResearched(row)
                ? 'Typical US retail (Gemini research)'
                : 'Legacy catalog retail. Will be refreshed on the next research pass.'
            }
          >
            <RetailPriceCell row={row} />
          </div>
        ) : null}
        {vis.fet !== false ? (
          <div
            className={`whitespace-nowrap px-2 text-center font-mono text-sm tabular-nums ${
              Number(row.fet) > 0 && row.hasFet !== false
                ? 'font-semibold text-[color:var(--color-brand-fet)]'
                : 'font-semibold text-zinc-600'
            }`}
            title={FET_CELL_TOOLTIP}
          >
            {row.hasFet === false ? '--' : formatCurrencyOrDash(Number(row.fet) || 0)}
          </div>
        ) : null}
        {vis.overhead !== false ? (
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
        ) : null}
        {vis.net !== false ? (
          <div className="flex min-w-0 items-center justify-end whitespace-nowrap px-2">
            <NetCell row={row} />
          </div>
        ) : null}
        {vis.floor !== false ? (
          <div className="flex min-w-0 items-center justify-end whitespace-nowrap px-2">
            <FloorCell row={row} />
          </div>
        ) : null}
        {vis.margin !== false ? (
          <div className="flex min-w-0 items-center justify-end whitespace-nowrap px-2">{marginCell}</div>
        ) : null}
      </div>
      {ctsEditorSection}
    </div>
  )
})

export function MarginTable({
  rows,
  selectedIds,
  onToggle,
  sortKey,
  sortDir,
  onSortChange,
  loading,
  emptyState,
  columnVisibility,
  externalListRef,
  justJumpedToId,
}) {
  const { toast } = useToast()
  const internalListRef = useListRef(null)
  const listRef = externalListRef || internalListRef
  const scrollRef = useRef(null)
  const isMobileTable = useMediaQuery('(max-width: 767px)')

  // Sort cycle: inactive column → asc; active column → toggle asc/desc.
  // The "reset to default" affordance lives in the toolbar's
  // "Sort: Margin %" button — clicking column headers should always
  // change direction, never become a dead-end identity action.
  const onHeaderSortClick = useCallback(
    (columnKey) => {
      if (sortKey !== columnKey) {
        onSortChange(columnKey, 'asc')
        return
      }
      onSortChange(columnKey, sortDir === 'asc' ? 'desc' : 'asc')
    },
    [sortKey, sortDir, onSortChange],
  )
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
    doNotList: false,
  }))
  const [costSaving, setCostSaving] = useState(false)

  const openCostEdit = useCallback((row) => {
    setEditingCostsId(row.id)
    setOverheadDraft({ ...tireOverheadParts(row), doNotList: Boolean(row.doNotList) })
  }, [])

  const closeCostEdit = useCallback(() => {
    setEditingCostsId(null)
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
          doNotList: Boolean(overheadDraft.doNotList),
        })
        toast('Overhead updated', 'success')
        closeCostEdit()
      } catch (e) {
        console.error(e)
        toast(
          e instanceof Error ? e.message : 'Could not save overhead. Check Firestore rules.',
          'error',
        )
      } finally {
        setCostSaving(false)
      }
    },
    [overheadDraft, toast, closeCostEdit],
  )

  const gridStyle = useMemo(() => buildGridStyle(columnVisibility), [columnVisibility])

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
      overheadDraft,
      draftOverheadTotal,
      costSaving,
      openCostEdit,
      closeCostEdit,
      saveCosts,
      onToggle,
      setOverheadDraft,
      isMobile: isMobileTable,
      mobileRowBasePx,
      columnVisibility,
      gridStyle,
      justJumpedToId,
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
      saveCosts,
      onToggle,
      setOverheadDraft,
      isMobileTable,
      mobileRowBasePx,
      columnVisibility,
      gridStyle,
      justJumpedToId,
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

  const visibleColumnCount = useMemo(() => {
    let count = 1 // select column
    for (const k of COLUMN_ORDER) {
      if (columnVisibility?.[k] !== false) count += 1
    }
    return count
  }, [columnVisibility])

  const vis = columnVisibility || {}

  return (
    <div>
      <div
        ref={scrollRef}
        onScroll={onTableScroll}
        className="relative overflow-x-auto rounded-2xl border border-zinc-800 max-sm:after:pointer-events-none max-sm:after:absolute max-sm:after:right-0 max-sm:after:top-0 max-sm:after:z-[5] max-sm:after:h-full max-sm:after:w-10 max-sm:after:bg-gradient-to-l max-sm:after:from-zinc-950 max-sm:after:to-transparent max-sm:after:opacity-90 max-sm:after:content-[''] sm:after:hidden"
      >
        {isMobileTable && rows.length > 0 && !loading && !scrollHintDismissed ? (
          <div className="mx-2 mb-2 rounded-full border border-amber-800/50 bg-amber-950/40 px-3 py-2 text-center text-xs font-medium text-amber-100/95 md:hidden">
            Scroll for overhead, FET, brand
          </div>
        ) : null}
        <div className={`w-full text-left text-sm ${isMobileTable ? 'min-w-0' : 'min-w-[1148px]'}`}>
          {/* Per-view counter moved up to the catalog toolbar row. The
              counter is now adjacent to the Filters/Sort/Table options
              controls so the user sees the filtered count and current
              sort glyph in the same horizontal scan as the controls
              that change them. */}
          <div
            className="box-border hidden border-b border-zinc-800 bg-zinc-900/90 py-3.5 text-xs font-semibold uppercase tracking-wide text-zinc-300 md:grid"
            style={gridStyle}
          >
            {/* Empty cell to preserve grid alignment with per-row select checkbox column. */}
            <div className="px-1" aria-hidden="true" />
            {vis.brand !== false ? (
              <div className="px-1.5 text-center">
                <SortButton
                  label="Brand"
                  columnKey="brand"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onClick={onHeaderSortClick}
                  disabled={loading}
                  touchWide={isMobileTable}
                />
              </div>
            ) : null}
            {vis.description !== false ? (
              <div className="px-3">
                <SortButton
                  label="Description"
                  columnKey="description"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onClick={onHeaderSortClick}
                  disabled={loading}
                />
              </div>
            ) : null}
            {vis.mspn !== false ? (
              <div className="px-3">
                <SortButton
                  label="MSPN"
                  columnKey="mspn"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onClick={onHeaderSortClick}
                  disabled={loading}
                />
              </div>
            ) : null}
            {vis.lr !== false ? (
              <div className="whitespace-nowrap px-2 text-center">
                <SortButton
                  label="LR"
                  columnKey="lr"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onClick={onHeaderSortClick}
                  disabled={loading}
                />
              </div>
            ) : null}
            {vis.listed !== false ? (
              <div className="whitespace-nowrap px-1 text-center">
                <SortButton
                  label="Listed"
                  columnKey="listed"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onClick={onHeaderSortClick}
                  disabled={loading}
                />
              </div>
            ) : null}
            {vis.photos !== false ? (
              <div className="whitespace-nowrap px-1 text-center">
                <SortButton
                  label="Photos"
                  columnKey="photos"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onClick={onHeaderSortClick}
                  disabled={loading}
                />
              </div>
            ) : null}
            {vis.buy !== false ? (
              <div className="min-w-0 whitespace-nowrap px-2 text-right">
                <SortButton
                  label="Buy Price"
                  columnKey="buy"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onClick={onHeaderSortClick}
                  disabled={loading}
                  touchWide={isMobileTable}
                />
              </div>
            ) : null}
            {vis.retail !== false ? (
              <div
                className="min-w-0 whitespace-nowrap px-2 text-right"
                title="Typical retail price from the nightly research job."
              >
                <SortButton
                  label="Retail"
                  columnKey="retail"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onClick={onHeaderSortClick}
                  disabled={loading}
                  touchWide={isMobileTable}
                />
              </div>
            ) : null}
            {vis.fet !== false ? (
              <div
                className="whitespace-nowrap px-2 text-center"
                title={FET_HEADER_TOOLTIP}
              >
                <SortButton
                  label="FET"
                  columnKey="fet"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onClick={onHeaderSortClick}
                  disabled={loading}
                />
              </div>
            ) : null}
            {vis.overhead !== false ? (
              <div className="whitespace-nowrap px-2 text-right">
                <SortButton
                  label="Overhead"
                  columnKey="overhead"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onClick={onHeaderSortClick}
                  disabled={loading}
                />
              </div>
            ) : null}
            {vis.net !== false ? (
              <div
                className="whitespace-nowrap px-2 text-right"
                title="Projected net per tire at the current haggle discount"
              >
                <SortButton
                  label="Net $"
                  columnKey="net"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onClick={onHeaderSortClick}
                  disabled={loading}
                />
              </div>
            ) : null}
            {vis.floor !== false ? (
              <div
                className="whitespace-nowrap px-2 text-right"
                title="All-in per-tire floor: buy + overhead + FET"
              >
                <SortButton
                  label="Floor"
                  columnKey="floor"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onClick={onHeaderSortClick}
                  disabled={loading}
                />
              </div>
            ) : null}
            {vis.margin !== false ? (
              <div className="min-w-0 whitespace-nowrap px-2 text-right">
                <SortButton
                  label="Margin %"
                  columnKey="margin"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onClick={onHeaderSortClick}
                  disabled={loading}
                  touchWide={isMobileTable}
                />
              </div>
            ) : null}
          </div>
          {isMobileTable && !loading && rows.length > 0 ? (
            <div className="flex w-max min-w-full border-b border-zinc-800 bg-zinc-900/90 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-300 md:hidden">
              <div className="sticky left-0 z-[16] flex shrink-0 items-stretch border-r border-zinc-800/80 bg-zinc-900/95 shadow-[8px_0_16px_-6px_rgba(0,0,0,0.45)]">
                {/* Empty spacer to preserve alignment with per-row pick column. */}
                <div className="w-11 shrink-0 px-0.5 py-0.5" aria-hidden="true" />
                <div className="flex w-[180px] shrink-0 items-center border-r border-zinc-800/60 px-2">
                  <StaticHeader label="Desc" />
                </div>
                <div className="flex w-[70px] shrink-0 items-center border-r border-zinc-800/60 px-1">
                  <StaticHeader label="MSPN" />
                </div>
                <div className="flex w-20 shrink-0 items-center border-r border-zinc-800/60 px-1">
                  <SortButton
                    label="Buy"
                    columnKey="buy"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onClick={onHeaderSortClick}
                    disabled={loading}
                    touchWide
                  />
                </div>
                <div className="flex w-20 shrink-0 items-center px-1">
                  <SortButton
                    label="Margin"
                    columnKey="margin"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onClick={onHeaderSortClick}
                    disabled={loading}
                    touchWide
                  />
                </div>
              </div>
              <div className="flex shrink-0 items-center divide-x divide-zinc-800/60 text-center">
                <div className="w-[76px] shrink-0 px-1">
                  <SortButton
                    label="Brand"
                    columnKey="brand"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onClick={onHeaderSortClick}
                    disabled={loading}
                    touchWide
                  />
                </div>
                <div className="flex w-12 min-w-[2.75rem] shrink-0 items-center justify-center whitespace-nowrap px-1">
                  <StaticHeader label="LR" />
                </div>
                <div className="flex min-w-[5.25rem] shrink-0 items-center justify-center whitespace-nowrap px-0.5 text-[10px]">
                  <StaticHeader label="Listed" />
                </div>
                {vis.photos !== false ? (
                  <div className="flex min-w-[4.25rem] shrink-0 items-center justify-center whitespace-nowrap px-0.5">
                    <StaticHeader label="Photos" />
                  </div>
                ) : null}
                {vis.fet !== false ? (
                  <div className="flex min-w-[4.5rem] shrink-0 items-center justify-center whitespace-nowrap px-0.5">
                    <StaticHeader label="FET" title={FET_HEADER_TOOLTIP} />
                  </div>
                ) : null}
                <div className="flex min-w-[5rem] shrink-0 items-center justify-center whitespace-nowrap px-0.5">
                  <SortButton
                    label="Retail"
                    columnKey="retail"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onClick={onHeaderSortClick}
                    disabled={loading}
                    touchWide
                  />
                </div>
                <div className="flex min-w-[5.75rem] shrink-0 items-center justify-center whitespace-nowrap px-1">
                  <StaticHeader label="OH" />
                </div>
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
              <TableSkeleton gridStyle={gridStyle} columnCount={visibleColumnCount} />
            )
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-4 px-6 py-16 text-center">
              <div
                className="rounded-2xl border border-zinc-800/90 bg-zinc-900/50 p-8 shadow-inner shadow-black/20"
                role="status"
              >
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-zinc-700 bg-zinc-800/50 text-zinc-400">
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
    </div>
  )
}
