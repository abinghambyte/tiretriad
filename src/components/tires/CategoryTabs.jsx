/**
 * Sub-navigation tabs for the Tires catalog. Sits above the existing
 * Filters/Select/Sort toolbar row. Categories are derived elsewhere
 * (see `selectCategoryForTire` in useDashboardSignals); this component
 * is purely presentational.
 *
 * Active-tab styling matches the existing Catalog/Orders top-level
 * tab treatment (amber underline). Each tab is 44x44 minimum on
 * mobile per WCAG 2.5.5 AAA.
 *
 * @typedef {'all' | 'passenger' | 'lightTruck' | 'truck'} CategoryKey
 */

import { useRef } from 'react'
import { TIRE_CATEGORY_KEYS, CATEGORY_LABELS } from '../../constants/tireCategory.js'

const TABS = [
  { key: 'all', label: 'All' },
  ...TIRE_CATEGORY_KEYS.map((key) => ({ key, label: CATEGORY_LABELS[key] })),
]

/**
 * @param {object} props
 * @param {CategoryKey} props.selected
 * @param {Record<CategoryKey, number>} props.counts
 * @param {(cat: CategoryKey) => void} props.onSelect
 */
export function CategoryTabs({ selected, counts, onSelect }) {
  const tabRefs = useRef({})

  const handleKeyDown = (e, currentIndex) => {
    let nextIndex = null
    if (e.key === 'ArrowRight') {
      nextIndex = (currentIndex + 1) % TABS.length
    } else if (e.key === 'ArrowLeft') {
      nextIndex = (currentIndex - 1 + TABS.length) % TABS.length
    } else if (e.key === 'Home') {
      nextIndex = 0
    } else if (e.key === 'End') {
      nextIndex = TABS.length - 1
    } else {
      return
    }
    e.preventDefault()
    const nextKey = TABS[nextIndex].key
    onSelect(nextKey)
    // Focus the new tab so keyboard users see focus follow selection.
    queueMicrotask(() => {
      tabRefs.current[nextKey]?.focus()
    })
  }

  return (
    <div
      role="tablist"
      aria-label="Tire category"
      className="flex gap-1 overflow-x-auto border-b border-zinc-800/80 px-1"
    >
      {TABS.map((tab, idx) => {
        const active = selected === tab.key
        const count = counts?.[tab.key] ?? 0
        return (
          <button
            key={tab.key}
            ref={(el) => { tabRefs.current[tab.key] = el }}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onSelect(tab.key)}
            onKeyDown={(e) => handleKeyDown(e, idx)}
            className={`min-h-[44px] whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors sm:min-h-0 ${
              active
                ? 'border-amber-400 text-amber-100'
                : 'border-transparent text-zinc-400 hover:border-zinc-600 hover:text-zinc-200'
            }`}
          >
            {tab.label} · {count}
          </button>
        )
      })}
    </div>
  )
}
