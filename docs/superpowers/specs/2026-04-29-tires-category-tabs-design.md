# Tires catalog category tabs — design spec

**Date:** 2026-04-29
**Branch:** `tires-category-tabs`
**Status:** Design approved (in-session brainstorm); awaiting plan generation.

## Goal

Add a sub-navigation row of category tabs (`[All] [Passenger] [Light Truck] [Truck]`) above the existing Tires catalog toolbar, with category derived authoritatively from the Michelin eFleet catalog (with a fallback heuristic for off-program SKUs and a manual override field for edge-case corrections).

## Background

Comparison of `scripts/tires.csv` (1,160 SKUs) against the Michelin eFleet HTML report (1,285 SKUs, dated 2026-04-19) revealed:

- **79% of portal SKUs (917) appear in eFleet**, where Michelin authoritatively groups them under Light Truck / Passenger / Truck sections
- Pricing parity is exact across all 817 overlapping SKUs (\$0.00 average delta)
- A pure size+LR heuristic mis-classifies SUV/CUV passenger sizing as Passenger when Michelin officially considers them Light Truck (193 → 502 Light Truck count delta)

The customer shopping flow today is "scroll through 1,160 rows sorted by margin." Categorization mirrors how Michelin organizes its catalog and how customers actually shop ("I'm looking for passenger tires"). Three sub-tabs collapse the cognitive load without losing access to the flat view.

## Non-goals

- Admin upload UI for eFleet HTML (CLI script only in v1)
- Override admin UI (override field is editable via Firestore console for now)
- Multi-source categorization (Michelin eFleet only)
- Automatic monthly import (manual run via `npm run import:efleet`)
- Side-by-side eFleet diff view (separate spec)
- Group-by-tread browse mode (separate spec)
- Touching the existing Catalog/Orders top-level tabs (CategoryTabs is sub-navigation under Catalog only)

## Architecture

```
                    ┌─────────────────────────────┐
                    │  scripts/import-efleet-     │
                    │  categories.mjs             │  (run on each eFleet drop)
                    │                             │
                    │  HTML → parse cat-section   │
                    │  blocks → emit MSPN→cat     │
                    │  map → write Firestore      │
                    └──────────────┬──────────────┘
                                   │
                                   ▼
                    ┌─────────────────────────────┐
                    │  Firestore: meta/categoryMap│
                    │  { version, importedAt,     │
                    │    sourceFile, sourceReport-│
                    │    Date, account,           │
                    │    totalParsed, mspns: {…}} │
                    └──────────────┬──────────────┘
                                   │  (one read per session)
                                   ▼
              ┌────────────────────────────────────────┐
              │  useDashboardSignals                   │
              │  - loads meta/categoryMap on mount     │
              │  - exposes `categoryMap` + selector    │
              │                                        │
              │  selectCategoryForTire(tire, map):     │
              │    1. tire.categoryOverride            │
              │    2. map.mspns[tire.mspn]             │
              │    3. fallbackHeuristic(tire)          │
              └──────────────┬─────────────────────────┘
                             │
                             ▼
              ┌────────────────────────────────────────┐
              │  TiresDashboard                        │
              │  ┌──────────────────────────────────┐  │
              │  │ <CategoryTabs>                   │  │
              │  │ [All 1160] [Passenger 490]       │  │
              │  │ [Light Truck 502] [Truck 168]    │  │
              │  └──────────────────────────────────┘  │
              │  Existing Filters/Sort/Select toolbar  │
              │  MarginTable (filtered by category)    │
              └────────────────────────────────────────┘
```

Three-layer flow:
1. **Import (offline)** — Node script ingests HTML, writes one Firestore meta doc.
2. **Hydration (per session)** — Hook loads the doc once, caches in memory.
3. **Render** — Tab clicks set `selectedCategory` state; the rows pipeline filters by `selectCategoryForTire(tire) === selectedCategory` (or skips if `'all'`).

Why a single meta doc (not per-tire fields):
- One Firestore read instead of 1,160 doc updates per refresh
- Categorization can change without touching tire docs (rerun script → new map → all tires re-categorize on next page load)
- Override field still lives on the tire doc when needed — only path that touches per-tire writes

## Categorization rules

```js
function selectCategoryForTire(tire, categoryMap) {
  // 1. Manual override always wins (admin escape hatch)
  if (tire.categoryOverride) return tire.categoryOverride

  // 2. eFleet authoritative
  const mapped = categoryMap?.mspns?.[String(tire.mspn).trim()]
  if (mapped) return mapped

  // 3. Fallback heuristic (for the ~243 portal-only off-program SKUs)
  return fallbackHeuristic(tire)
}

function fallbackHeuristic(tire) {
  const desc = String(tire.desc || '').toUpperCase().trim()
  const lr   = String(tire.lr   || '').toUpperCase().trim()
  const m    = desc.match(/R([0-9]+(?:\.[0-9]+)?)/)
  const wheel = m ? parseFloat(m[1]) : null

  // Truck: heavy commercial — 22.5"+ wheels OR heavy load range
  if ((wheel !== null && wheel >= 22.5) || ['H','J','L','M'].includes(lr)) {
    return 'truck'
  }
  // Light Truck: LT-prefix or commercial mid load range
  if (desc.startsWith('LT') || ['C','D','E','F','G'].includes(lr)) {
    return 'lightTruck'
  }
  // Default: passenger
  return 'passenger'
}
```

Three values: `'passenger' | 'lightTruck' | 'truck'`.

Override semantics:
- `tire.categoryOverride` is an optional string field on individual tire Firestore docs
- If absent (default for every tire today), it's ignored — eFleet/heuristic wins
- No migration; field gets written only when an admin explicitly corrects a tire
- Read by `selectCategoryForTire`; writeable via Firestore console for v1

Validated splits against current `scripts/tires.csv`:

| Source | Count | % |
|---|---|---|
| From eFleet (authoritative) | 917 | 79% |
| From fallback heuristic | 243 | 21% |
| **Total** | **1,160** | **100%** |

| Category | Final count |
|---|---|
| Passenger | 490 |
| Light Truck | 502 |
| Truck | 168 |

## UX behavior on tab switch

| State | On tab switch | Rationale |
|---|---|---|
| Filters (Brand, LR, Tags, Min margin, Needs reposting) | **Reset** | Within-category scope; filters often differ per category (LR distribution especially) |
| Search query | **Persist** | Search intent is independent of category |
| Sort key + direction | **Persist** | Stable user preference; sort by margin% across categories is the common path |
| Selection (selected tire IDs) | **Persist** | Cross-category bulk actions ("Generate listings" for mixed selection) |
| Saved filter presets | **Available everywhere** | Loading a preset auto-routes to its category, or stays on All if the preset has no category |
| URL query state | `?cat=passenger\|lightTruck\|truck` (omitted = `all`) | Deep-linkable, bookmarkable; browser back/forward works |
| Default landing tab | `all` | First visit + URL with no `cat` → All. URL `cat` wins otherwise. |

Tab UI specifics:
- Active tab: amber underline (matching existing `Catalog`/`Orders` tab treatment)
- Counts update live with active filters (when a filter is set in Passenger and you switch to All, the All count is the unfiltered total — because filters reset on switch)
- Counts derived render-time from the same `categorizedRows` memo (no extra fetches)
- 44×44 minimum tap target on mobile (`min-h-[44px] sm:min-h-0`)
- Mobile: horizontal-scroll tab strip if total tab width exceeds viewport

Empty states:

| Scenario | Treatment |
|---|---|
| Tab has 0 tires after a filter or no underlying data | "No tires in this category match. Try Filters or switch tabs." with link back to All |
| `meta/categoryMap` doc missing entirely (before first import) | All 1,160 tires fall to fallback heuristic. Banner: "Catalog source: heuristic only. Import latest Michelin eFleet HTML to enable authoritative categorization." Dismissible. |
| `meta/categoryMap` is stale (>30 days old based on `importedAt`) | Amber freshness badge in catalog header: "Categorization data 32 days old. Refresh recommended." Dismissible per session. |

Selection-aware messaging:
- Selection count badge stays at total across all tabs (e.g., `Deselect all (6)`)
- Only rows visible in the current tab show their checkboxes filled
- Hint next to count: `(2 in this tab, 4 in other tabs)` — clarifies cross-tab selection state

## Components

| Component | File | Type | Responsibilities |
|---|---|---|---|
| `<CategoryTabs>` *(new)* | `src/components/tires/CategoryTabs.jsx` | Presentational | Render 4 tab buttons with counts; emit `onSelect(category)`; `aria-selected` reflects active tab; 44×44 touch targets; horizontal-scroll wrapper for mobile overflow. |
| `selectCategoryForTire` *(new)* | `src/hooks/useDashboardSignals.js` (selectors block) | Pure function | Returns `'passenger' \| 'lightTruck' \| 'truck'` per the rules above. |
| `fallbackHeuristic` *(new, private)* | `src/hooks/useDashboardSignals.js` | Pure function | Size + LR rule. Exported only for tests. |
| `useDashboardSignals` *(modified)* | `src/hooks/useDashboardSignals.js` | Hook | Loads `meta/categoryMap` on mount alongside other meta reads; exposes `categoryMap` from the hook return. |
| `TiresDashboard` *(modified)* | `src/components/tires/TiresDashboard.jsx` | Container | Adds `selectedCategory` state (default `'all'`, synced to URL `?cat=`); renders `<CategoryTabs>` above the toolbar; filters `categorizedRows` memo by category; resets filters on tab switch (NOT search/sort/selection); updates count props. |
| `scripts/import-efleet-categories.mjs` *(new)* | `scripts/import-efleet-categories.mjs` | Node CLI | Parses HTML, builds `{ mspn → category }` map, writes Firestore `meta/categoryMap`. Usage: `npm run import:efleet -- path/to/efleet.html`. Reuses existing Firebase Admin SDK pattern (`migrate-crm-stages-v3.mjs`, etc). Supports `--dry-run` and `--yes` flags. |
| `scripts/import-efleet-categories.test.mjs` *(new)* | `scripts/import-efleet-categories.test.mjs` | Vitest | Asserts the parser produces correct MSPN→category from a fixture HTML snippet. Fixture committed alongside test. |

Files NOT touched:
- `MarginTable.jsx` — table row rendering unaffected; category narrows the row set passed in
- `MarginFilters.jsx` — filter UI unchanged; reset on tab switch is parent state management
- `SelectAllToggle.jsx` — works on whatever rows are passed
- `TiresFilterOverlay.jsx` — unchanged
- Firestore tire docs — no migration; `categoryOverride` is a future field

`<CategoryTabs>` interface:

```jsx
<CategoryTabs
  selected={selectedCategory}                                    // 'all' | 'passenger' | 'lightTruck' | 'truck'
  counts={{ all: 1160, passenger: 490, lightTruck: 502, truck: 168 }}
  onSelect={(cat) => setSelectedCategory(cat)}
/>
```

## Data model

### Firestore: `meta/categoryMap` (new doc)

```js
{
  version: 1,
  importedAt: Timestamp,
  sourceFile: 'Michelin_eFleet_Catalog_SKEDADDLE_v2_2026-04-19.html',
  sourceReportDate: '2026-04-19',
  account: '1580951 SKEDADDLE INC LOVELAND',
  totalParsed: 1285,
  mspns: {
    '13712': 'truck',
    '76025': 'lightTruck',
    '63392': 'passenger',
    // ... ~1,285 entries
  },
}
```

Rationale:
- One doc, not a collection. ~32 KB total. Well under the 1 MB Firestore limit.
- Map (object) for O(1) MSPN lookup. Cached in memory after one read.
- `version` field for forward-compat with future shape changes.
- Top-level metadata supports the freshness badge and a future "Catalog source" admin view.

### Firestore: `tires/{tireId}` (existing, additive)

```js
{
  // ... existing fields untouched
  categoryOverride: 'lightTruck',  // OPTIONAL — only present when admin corrects
}
```

No migration. Field accepts `'passenger' | 'lightTruck' | 'truck'`. Read by `selectCategoryForTire`.

### Local state in `TiresDashboard`

```js
const [selectedCategory, setSelectedCategory] = useState(() => {
  const fromUrl = new URLSearchParams(location.search).get('cat')
  return ['passenger', 'lightTruck', 'truck'].includes(fromUrl) ? fromUrl : 'all'
})
```

URL parameter:
- `?cat=passenger | ?cat=lightTruck | ?cat=truck`
- Omitted (or any other value) → `'all'`
- On `setSelectedCategory`, replace URL via `navigate({ search }, { replace: true })`

### Categorized rows memo

```js
const categorizedRows = useMemo(() => {
  if (loading || !tires) return { all: [], passenger: [], lightTruck: [], truck: [] }
  const buckets = { all: [], passenger: [], lightTruck: [], truck: [] }
  for (const t of tires) {
    const cat = selectCategoryForTire(t, categoryMap)
    buckets.all.push(t)
    buckets[cat].push(t)
  }
  return buckets
}, [tires, loading, categoryMap])
```

Counts for tab labels = `categorizedRows[cat].length`. Rows fed into the existing filter+sort pipeline = `categorizedRows[selectedCategory]`. Single pass through the catalog, four buckets populated simultaneously.

### Import script output contract

```bash
$ npm run import:efleet -- path/to/efleet.html

Parsing path/to/efleet.html…
  Source date: 2026-04-19
  Account: 1580951 SKEDADDLE INC LOVELAND
  Found 1,285 SKUs across 3 categories:
    - Light Truck:  567
    - Passenger:    627
    - Truck:        191

About to write to Firestore: meta/categoryMap
  Replacing existing version: 1, importedAt: 2026-04-19T13:30:22Z
  New version: 1, source: efleet.html

Continue? [y/N] y
✓ Wrote meta/categoryMap (32.4 KB, 1,285 entries)

Diff vs prior import:
  + 47 new MSPNs categorized
  - 12 MSPNs removed
  ~ 3 MSPNs changed category (logged below)

Done.
```

The `--dry-run` flag prints the diff without writing. The `--yes` flag skips confirmation for CI/automation.

The script writes to a staging field first (`meta/categoryMapStaging`), then atomic-moves to `meta/categoryMap` on success — failure leaves prior version intact.

## Testing strategy

### Unit tests

| File | Tests |
|---|---|
| `src/hooks/useDashboardSignals.test.js` *(new)* | `selectCategoryForTire` — override wins; map hit returns mapped; falls back to heuristic; null map → heuristic; null tire safe |
| `src/hooks/useDashboardSignals.test.js` *(same file)* | `fallbackHeuristic` — LT prefix → lightTruck; LR=H/J/L/M → truck; LR=C/D/E/F/G → lightTruck; wheel ≥22.5 → truck; default → passenger; 19.5" edge case locks current behavior |
| `src/components/tires/CategoryTabs.test.jsx` *(new)* | Renders 4 tabs with counts; clicking emits `onSelect` with right value; `aria-selected` reflects active; 44×44 size; supports counts of 0 (still renders) |
| `scripts/import-efleet-categories.test.mjs` *(new)* | Fixture HTML → expected `{ mspn: cat }` map; handles missing cover-page metadata gracefully; rejects empty/malformed input |

### Integration verification (manual on Vercel preview)

- Click each tab → row count updates correctly
- Apply Brand=Michelin filter → switch tabs → filter clears
- Search "defender" → switch tabs → search persists
- Sort by Margin → switch tabs → sort persists
- Select 3 tires → switch tabs → selection persists, count badge unchanged
- URL `/tires?cat=truck` lands directly on Truck tab
- Browser back/forward navigates between tabs
- Mobile (≤640px): tabs are tappable, scroll horizontally if overflowing

## Risks & mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `meta/categoryMap` doc missing on first deploy → all tires fall to heuristic, big visible split shift | High (first deploy will trigger this) | Medium — categories still work, just less accurate; banner explains | Run import script as part of v1 launch checklist; banner copy makes the state legible |
| Import script fails partway → catalog left with stale or empty map | Low | High | Script writes to `meta/categoryMapStaging` first, then atomic move to `meta/categoryMap` on success. Failure leaves prior version intact. |
| eFleet HTML format changes in a future Michelin export → parser breaks | Medium (over time) | Medium | Parser asserts on cover-page sentinels (e.g. "MSPN" header, "Ship To") before processing. Parser test fixture committed. Failure is a clear error message, not silent corruption. |
| `categorizedRows` memo recomputes on every `tires` change | Low | Low (1,160 items × O(1) per item ≈ 1ms) | Single-pass bucket population. Acceptable cost. |
| URL `?cat=` value gets stale (user bookmarks `?cat=foo`) | Low | Low | Validation falls back to `all` |
| Selection count "(2 in this tab, 4 in other tabs)" hint adds clutter | Medium | Low (UX only) | Verify on Vercel preview; remove if it reads as noise |
| Heuristic disagrees with eFleet for a SKU on later imports | Low | Low | eFleet wins next render; selector priority handles it |

## Out of scope (deferred to ROADMAP.md)

These are documented in `ROADMAP.md` for future work:

- Admin upload UI for eFleet HTML (Approach C from the proposal)
- Override admin UI (corrections via Firestore console only for v1)
- Multi-source categorization (BFG/Uniroyal structured catalogs if/when they publish)
- Automatic monthly import job (Cloud Function scheduled task)
- Side-by-side eFleet diff view
- Group-by-tread browse mode
- Touching the existing Catalog/Orders top-level tabs

## Open questions

None at spec time. Implementation may surface clarifications (e.g., precise visual treatment of the freshness badge) — those are addressed inline during plan/implementation phases.
