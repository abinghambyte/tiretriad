---
patch: 623
title: Command palette refresh — trigger UX + Recent/Suggested + aliases + mobile full-screen
status: ready-to-dispatch
priority: P1 — discoverability + workflow acceleration
depends_on: []
spec: docs/superpowers/specs/2026-04-27-command-palette-refresh-design.md
batch: command-palette
---

# patch-623 — Command palette refresh

Single cohesive PR refactoring the existing CommandPalette with the trigger UX rework, empty-state Recent/Suggested sections, alias expansion, and mobile full-screen overlay decided in the 2026-04-27 storm.

## Files touched

- `src/components/layout/CommandPalette.jsx` — modal container styling for mobile, empty-state section rendering, footer hint, comment update at lines 14-18
- `src/components/layout/CommandPaletteTrigger.jsx` — **new file** (extract from PortalTopBar; same component handles desktop wide-bar and mobile icon)
- `src/components/layout/PortalTopBar.jsx` — replace inline search button with `<CommandPaletteTrigger />`
- `src/components/layout/paletteActions.js` — alias additions, no structural changes
- `src/lib/palette/recent.js` — **new** localStorage Recent state helper
- `src/lib/palette/suggestions.js` — **new** route-keyed Suggested map
- `src/components/layout/CommandPalette.test.jsx` — extend with empty-state, Recent eviction, alias matching, full-screen mobile breakpoint
- `src/lib/palette/recent.test.js` — **new** unit tests for Recent helper (cap, FIFO, try/catch)
- `src/lib/palette/suggestions.test.js` — **new** unit tests for the suggestion map

## Implementation

### 1. CommandPaletteTrigger component (new)

```jsx
// src/components/layout/CommandPaletteTrigger.jsx
import { useEffect, useState } from 'react'

/**
 * Dual-presentation palette trigger.
 *   Desktop (sm+): wide search-bar styled <div> with placeholder + ⌘K kbd badge
 *   Mobile (max-sm): existing 44×44 icon button
 *
 * Both render the same component — Tailwind hidden classes select the
 * presentation per breakpoint. Shape teaches scope.
 *
 * @param {object} props
 * @param {() => void} props.onOpen
 */
export function CommandPaletteTrigger({ onOpen }) {
  // Detect platform once for the kbd hint copy. Ctrl on non-Mac, ⌘ on Mac.
  const [isMac, setIsMac] = useState(false)
  useEffect(() => {
    setIsMac(/(Mac|iPhone|iPad)/i.test(navigator.platform || navigator.userAgent || ''))
  }, [])
  const meta = isMac ? '⌘' : 'Ctrl'

  const onClick = () => onOpen()
  const onKey = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onOpen()
    }
  }

  return (
    <>
      {/* Desktop wide bar */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Open command palette"
        onClick={onClick}
        onKeyDown={onKey}
        className="hidden sm:flex h-9 w-full max-w-sm cursor-pointer items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900/60 px-3 text-sm text-zinc-400 transition-colors hover:bg-zinc-900/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60"
      >
        <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
          <circle cx="11" cy="11" r="7" />
          <path strokeLinecap="round" d="M20 20l-3-3" />
        </svg>
        <span className="flex-1 truncate">Search tires, orders, contacts…</span>
        <kbd className="ml-auto inline-flex items-center gap-0.5 rounded border border-zinc-700 bg-zinc-950/60 px-1.5 py-0.5 font-mono text-[11px] text-zinc-400">
          <span>{meta}</span>
          <span>K</span>
        </kbd>
      </div>

      {/* Mobile icon */}
      <button
        type="button"
        onClick={onClick}
        aria-label="Open search"
        title={`Search (${meta}K)`}
        className="flex h-11 min-h-[44px] w-11 min-w-[44px] shrink-0 items-center justify-center rounded-lg border border-zinc-700 text-zinc-400 transition-all duration-200 hover:border-amber-600/40 hover:bg-zinc-800/80 hover:text-zinc-100 sm:hidden"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
          <circle cx="11" cy="11" r="7" />
          <path strokeLinecap="round" d="M20 20l-3-3" />
        </svg>
      </button>
    </>
  )
}
```

Replace the inline search button in `PortalTopBar.jsx` (currently around lines 75-86) with `<CommandPaletteTrigger onOpen={onOpenPalette} />`.

### 2. Recent helper (new)

```js
// src/lib/palette/recent.js

const KEY = 'skedaddle.palette.recent'
const CAP = 5

/** Read recent action IDs (newest first). Silently no-ops on storage failure. */
export function readRecent() {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : []
  } catch {
    return []
  }
}

/** Append action ID. Cap at 5, FIFO eviction. Silently no-ops on storage failure. */
export function pushRecent(id) {
  if (!id || typeof id !== 'string') return
  try {
    const current = readRecent()
    // Remove if already present so the push moves it to the front
    const filtered = current.filter((x) => x !== id)
    filtered.unshift(id)
    const capped = filtered.slice(0, CAP)
    window.localStorage.setItem(KEY, JSON.stringify(capped))
  } catch {
    // Safari private mode + quota errors land here. Silently no-op.
  }
}

/** Used by tests to reset between cases. Not part of the public surface. */
export function _clearRecent() {
  try { window.localStorage.removeItem(KEY) } catch {}
}
```

### 3. Suggested map (new)

```js
// src/lib/palette/suggestions.js

/**
 * Route → list of action IDs to surface in Suggested at empty state.
 * IDs match those in paletteActions.js. If the current route has no
 * entry, render no Suggested section — generic suggestions are noise.
 */
export const ROUTE_SUGGESTIONS = {
  '/dashboard': ['nav-tires', 'nav-crm', 'nav-analytics'],
  '/tires': ['action-generate-listings', 'action-bulk-overhead', 'action-export-csv'],
  '/crm': ['action-add-lead', 'nav-crm'],
  '/analytics': ['nav-analytics', 'nav-analytics-revenue'],
  '/people': ['action-invite-crew', 'action-view-access-log'],
}

export function suggestedFor(pathname) {
  // Match the deepest known prefix; '/tires/orders' falls back to '/tires'.
  const known = Object.keys(ROUTE_SUGGESTIONS)
  const match = known
    .filter((p) => pathname === p || pathname.startsWith(p + '/'))
    .sort((a, b) => b.length - a.length)[0]
  return match ? ROUTE_SUGGESTIONS[match] : []
}
```

**During the handoff:** verify the action IDs referenced in `ROUTE_SUGGESTIONS` actually exist in `paletteActions.js`. Some (like `action-export-csv`, `action-add-lead`, `action-invite-crew`, `action-view-access-log`) may not exist yet — in that case either skip them in the map or add corresponding palette actions in the same PR. Don't reference IDs that resolve to nothing.

### 4. CommandPalette.jsx changes

- Update the doc comment at lines 14-18 to add the 2026-04-27 decision-review note about theme/sign-out exclusion (see spec §Q3c)
- Compose Recent + Suggested + Selection + Navigation at empty state
- Dedupe across sections: action ID in Recent suppresses it from Suggested + Navigation below (same suppression pattern as existing tab-aware redundancy)
- Add muted footer line at the bottom: `<p className="border-t border-zinc-800 px-4 py-2 text-xs text-zinc-500">Type 2+ characters to search tires, orders, contacts, leads…</p>` — visible only when `query.length === 0`
- Mobile full-screen modal: container becomes `max-sm:inset-0 max-sm:rounded-none max-sm:flex-col`; remove centering classes at `max-sm`
- Mobile-only close button in top-right: `<button aria-label="Close palette" className="sm:hidden ... h-11 w-11 ...">×</button>`
- z-index audit: verify modal z-index sits above header. If header is `z-50` or `z-40`, modal `z-50` works. If header is sticky with no explicit z-index, bump modal to `z-[60]`

### 5. paletteActions.js changes

Add the alias list per spec §Q3a:

```js
// nav-tires entry
keywords: ['tires', 'catalog', 'inventory', 'skedaddle', 'skedaddle tires'],

// nav-crm entry
keywords: ['crm', 'pipeline', 'leads', 'vip', 'rubber', 'rubber crm', 'fleet crm'],

// nav-people entry
keywords: ['people', 'crew', 'users', 'contacts', 'people systems'],

// nav-ops entry
keywords: ['ops', 'expenses', 'credit', 'reorder', 'ops command'],

// nav-growth entry
keywords: ['growth', 'experiments', 'tools', 'growth lab'],
```

**Pre-edit audit:** with current code, run the dev server and search the palette for `tires`. Verify `nav-tires` ranks first. If canonical-name matching already handles bare words equally to keyword aliases, bare-word additions are redundant but harmless. If aliases rank higher than canonical-name match, they're necessary. Either way the result is correct after this change.

### 6. Action-firing wires Recent

In `CommandPalette.jsx` where an action's `run()` is invoked:

```js
import { pushRecent } from '../../lib/palette/recent.js'

function fire(action) {
  // Don't push entity-search hits to Recent — IDs are unstable. Only
  // push if the action came from the static palette registry.
  if (action.id && action.section !== 'Tires' && action.section !== 'Orders' && action.section !== 'Contacts' && action.section !== 'CRM') {
    pushRecent(action.id)
  }
  action.run()
}
```

The exclusion guard depends on how entity-search hits are surfaced today; adjust the section names to match the actual values used.

## Tests

### `src/lib/palette/recent.test.js`

- `readRecent()` returns `[]` when storage is empty
- `readRecent()` returns `[]` when JSON is invalid
- `readRecent()` returns `[]` when localStorage throws (mock window.localStorage to throw)
- `pushRecent('a')` then `readRecent()` → `['a']`
- 6 pushes → only 5 retained, FIFO
- pushing duplicate → moves to front, doesn't grow array
- `pushRecent('')` and `pushRecent(null)` → no-op
- `pushRecent('a')` when localStorage.setItem throws → no-op (no exception bubbles)

### `src/lib/palette/suggestions.test.js`

- `suggestedFor('/tires')` → `['action-generate-listings', ...]`
- `suggestedFor('/tires/orders')` → falls back to `/tires` entries
- `suggestedFor('/unknown')` → `[]`
- `suggestedFor('/')` → `/dashboard` entries (or `[]` if `/` not mapped — clarify based on routing)

### `src/components/layout/CommandPalette.test.jsx` extensions

- Renders CommandPaletteTrigger with placeholder text on desktop viewport (≥640px)
- Renders icon-only trigger on mobile viewport (<640px)
- Empty state shows Recent section only when storage has entries
- Empty state shows Suggested section only when current route has a map entry
- Recent action click adds to Recent; ranking moves to top on next open
- Entity-search hits do NOT enter Recent after click
- Mobile full-screen modal renders close button in top-right
- Esc closes both desktop and mobile presentations
- Footer hint visible at empty state, hidden once user types

## Acceptance

- [ ] Pre-edit audit done: bare-word aliases verified necessary or noted as redundant-harmless
- [ ] Desktop top bar shows wide search-shaped div with `⌘K`/`CtrlK` kbd badge
- [ ] Mobile top bar shows existing 44×44 icon (unchanged)
- [ ] Cmd+K (or Ctrl+K) opens palette in both presentations
- [ ] Recent section appears at empty state when localStorage has entries
- [ ] Suggested section appears for `/tires`, `/crm`, `/analytics`, `/dashboard`, `/people`
- [ ] Footer hint visible at empty state, hidden after typing
- [ ] Searching "tires", "skedaddle", "rubber", "fleet crm" all rank correct nav entry first
- [ ] Mobile palette goes full-screen with explicit close button (44×44, top-right)
- [ ] z-index check passed (modal above header)
- [ ] Comment in CommandPalette.jsx:14-18 updated with 2026-04-27 review note + revisit condition
- [ ] `npm run lint && npm run build` green
- [ ] Tests added for Recent + Suggested + new palette behaviors
- [ ] Manual test on Vercel preview: 375px width and 1280px width

## Notes for the agent

- Keep this as a **single PR**. The user's storm explicitly noted that splitting the package would mean two rounds of audit-the-deploy work for one cohesive UX change.
- The kbd hint should detect platform once (lazy effect) and use `⌘` on Mac/iOS, `Ctrl` elsewhere. Don't render an SR-incorrect "Cmd" on Windows or Linux.
- Don't break the existing `useSyncExternalStore` subscription to `tireSelectionStore` — Selection-section actions are load-bearing.
- The 5-minute pre-edit alias audit catches a class of "keyword vs canonical match weight" bugs. Don't skip it; document the result in the PR description.
- The `archive-test-data.mjs` exclusion check (PR #171's `isArchived` filter) is already in place for entity search results — verify it still works after the section dedupe logic lands.
