import { useEffect, useRef } from 'react'
import { brandColorCssVar } from '../../utils/brandColor.js'

/**
 * Tab-style pill row of brand aggregates above the catalog table. Clicking
 * a pill sets the brand filter; clicking the leading All pill clears it.
 * Click on the already-selected pill is a no-op (matches CategoryTabs).
 *
 * Keyboard: roving tabindex with ArrowLeft / ArrowRight / Home / End to move
 * focus across pills (matches the WAI-ARIA tabs pattern). Enter and Space
 * activate the focused pill via the native button click semantics.
 */
export function BrandStatsRow({
  brands,
  total,
  selectedBrand,
  onBrandChange,
}) {
  const items = [
    // zinc-700 keeps the "All" pill legible on both light page chrome
    // (~10:1 contrast on white) and the dark dashboard (~7:1 on zinc-950).
    // The brand pills below use their own brand-color tokens. zinc-300 here
    // failed the axe color-contrast rule on light mode (1.47:1).
    { brand: null, label: 'All', count: total, color: 'var(--color-zinc-700)' },
    ...brands.map((b) => ({
      brand: b.brand,
      label: b.brand,
      count: b.count,
      avgListingMarginPct: b.avgListingMarginPct,
      color: brandColorCssVar(b.brand),
    })),
  ]
  const buttonRefs = useRef([])
  buttonRefs.current.length = items.length

  // Auto-scroll the active pill into view when selectedBrand changes. Native
  // scroll-snap only fires on user-initiated scroll; programmatic state
  // changes (e.g., applyFilterPreset, deep-link via ?brand=X) need an
  // explicit scrollIntoView so the active pill is visible on mobile widths
  // where only 1-2 pills fit on screen.
  useEffect(() => {
    const idx = items.findIndex((it) => it.brand === selectedBrand)
    if (idx < 0) return
    const node = buttonRefs.current[idx]
    if (!node || typeof node.scrollIntoView !== 'function') return
    node.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBrand])

  function focusByIndex(i) {
    const target = (i + items.length) % items.length
    buttonRefs.current[target]?.focus()
  }

  function handleKeyDown(e, index) {
    switch (e.key) {
      case 'ArrowRight':
        e.preventDefault()
        focusByIndex(index + 1)
        break
      case 'ArrowLeft':
        e.preventDefault()
        focusByIndex(index - 1)
        break
      case 'Home':
        e.preventDefault()
        focusByIndex(0)
        break
      case 'End':
        e.preventDefault()
        focusByIndex(items.length - 1)
        break
      default:
    }
  }

  return (
    <div
      role="tablist"
      aria-label="Brand filter"
      className="flex flex-nowrap gap-2 overflow-x-auto scroll-smooth py-2 [scroll-snap-type:x_mandatory] sm:flex-wrap sm:overflow-visible"
    >
      {items.map((it, index) => {
        const selected = it.brand === selectedBrand
        const handleClick = () => {
          if (selected) return
          onBrandChange(it.brand)
        }
        const activeStyle = selected
          ? {
              borderColor: it.color,
              color: it.color,
              backgroundColor: `color-mix(in oklab, ${it.color} 18%, transparent)`,
            }
          : { borderColor: it.color, color: it.color }
        return (
          <button
            key={it.label}
            ref={(node) => {
              buttonRefs.current[index] = node
            }}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={handleClick}
            onKeyDown={(e) => handleKeyDown(e, index)}
            style={activeStyle}
            className={`inline-flex shrink-0 [scroll-snap-align:start] flex-col gap-0.5 rounded-lg border px-3 py-1.5 text-left transition-transform hover:-translate-y-px ${
              selected ? 'font-semibold shadow-sm' : 'font-medium'
            }`}
          >
            <span className="text-[11px] uppercase tracking-wide leading-none">{it.label}</span>
            <span className="font-mono text-base leading-none tabular-nums">{it.count}</span>
            {it.avgListingMarginPct != null ? (
              <span className="hidden text-[10px] font-normal opacity-80 leading-none sm:block">
                {it.avgListingMarginPct.toFixed(1)}% avg margin
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
