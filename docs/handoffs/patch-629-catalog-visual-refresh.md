---
patch: 629
title: Catalog visual refresh — brand accent bars + MSPN treatment + FET styling + group-by-brand + print + disclaimer
status: ready-to-dispatch
priority: P1 — high-leverage visual signal, no data model changes
depends_on: []
spec: docs/superpowers/specs/2026-04-27-catalog-visual-refresh-design.md
batch: catalog-refresh
reference: docs/reference/Michelin_eFleet_Catalog_SKEDADDLE_v2.html
---

# patch-629 — Catalog visual refresh

## Goal

Import the visual hierarchy patterns from the parked Michelin eFleet HTML reference into the live `<MarginTable>` catalog. All visual layer — no data model, no schema, no Firestore changes. Single PR.

## Files touched

- `src/index.css` — add brand color tokens (`--brand-bfg-red`, `--brand-michelin-blue`, `--brand-uniroyal-green`, `--brand-fet-orange`)
- `src/components/tires/MarginTable.jsx` — add brand accent bar, MSPN column treatment, FET conditional styling, italic-red treatment for unconfirmed prices
- `src/components/tires/TiresDashboard.jsx` — add "Group by brand" toggle in existing toolbar, render brand-grouped accordion view when on (desktop only; mobile stays flat)
- `src/components/tires/CatalogDisclaimerBar.jsx` — **new** — top banner with FET reminder + active rebate windows from `pricingEvents`
- `src/components/tires/catalog-print.css` — **new** — `@media print` rules
- `src/utils/brandColor.js` — **new** — pure function `brandColorFor(brandName)` returning the right CSS variable name
- `docs/AI-CONTEXT.md` — extend the catalog section to document the visual hierarchy patterns
- Tests: `brandColor.test.js`, `MarginTable.test.jsx` extended for accent bar + MSPN treatment, `CatalogDisclaimerBar.test.jsx`

## Implementation skeleton

### 1. Brand color tokens

```css
/* src/index.css — add to :root */
:root {
  --brand-bfg-red: #B22234;
  --brand-michelin-blue: #2A4D9C;
  --brand-uniroyal-green: #2E7D4A;
  --brand-fet-orange: #F59E0B;
  --brand-default: var(--zinc-700);
}
```

### 2. brandColor helper

```js
// src/utils/brandColor.js

const BRAND_COLOR_MAP = {
  BFGOODRICH: '--brand-bfg-red',
  BFG: '--brand-bfg-red',
  MICHELIN: '--brand-michelin-blue',
  UNIROYAL: '--brand-uniroyal-green',
  // Add more as the catalog grows. Unknown brands fall back to default.
}

/**
 * Returns the CSS variable name (with leading --) for a given brand.
 * Case-insensitive; trims whitespace; returns the default token for unknown.
 *
 * @param {string} brand
 * @returns {string} CSS variable name like '--brand-bfg-red' or '--brand-default'
 */
export function brandColorVar(brand) {
  const key = String(brand || '').trim().toUpperCase()
  return BRAND_COLOR_MAP[key] || '--brand-default'
}

/**
 * Returns a `border-left` shorthand value for a row.
 * @param {string} brand
 * @returns {string} e.g. '8px solid var(--brand-bfg-red)'
 */
export function brandAccentBorder(brand) {
  return `8px solid var(${brandColorVar(brand)})`
}
```

### 3. MarginTable row accent

Add to the existing row rendering:

```jsx
<div
  data-brand={tire.brand}
  style={{ borderLeft: brandAccentBorder(tire.brand) }}
  className="..."
>
  ...row contents...
</div>
```

### 4. MSPN column

Existing MSPN cell becomes:

```jsx
<span className="col-mspn font-mono text-[13px] font-bold text-[color:var(--brand-michelin-blue)]">
  {tire.mspn}
</span>
```

### 5. FET conditional styling

```jsx
<span className={fetCents > 0 ? 'text-[color:var(--brand-fet-orange)] font-medium' : 'text-zinc-600'}>
  {formatCurrency(fetCents / 100)}
</span>
```

### 6. Unconfirmed-price treatment

```jsx
const isUnconfirmed = !tire.priceIntel?.activeBuyPrice || tire.priceIntel?.flaggedForResearch
return (
  <span className={isUnconfirmed ? 'italic text-rose-400' : 'text-zinc-100'}>
    {isUnconfirmed ? 'Unconfirmed' : formatCurrency(tire.buyPrice)}
  </span>
)
```

### 7. Group-by-brand toggle

In `<TiresDashboard>` toolbar (after the existing Sort + Table options buttons):

```jsx
<button
  type="button"
  aria-pressed={groupByBrand}
  onClick={() => setGroupByBrand((v) => !v)}
  className="hidden sm:inline-flex min-h-[44px] rounded-lg border border-zinc-600 px-3 py-2 text-sm sm:min-h-0 ..."
>
  {groupByBrand ? 'Ungroup' : 'Group by brand'}
</button>
```

When `groupByBrand && desktop`:
- Sort tires by brand, then existing sort
- Render each brand as a collapsible `<details>` element with header `<summary>` showing count
- Reuse existing virtualized row rendering inside each section

Mobile (`max-sm`) ignores this state and renders flat virtualized list per the April audit.

### 8. CatalogDisclaimerBar

```jsx
import { useState, useEffect } from 'react'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '../../firebase/config'

const DISMISSED_KEY = 'skedaddle.catalog.dismissedBanner'

export function CatalogDisclaimerBar() {
  const [activePromos, setActivePromos] = useState([])
  const [dismissed, setDismissed] = useState(() => {
    try { return Boolean(window.localStorage.getItem(DISMISSED_KEY)) } catch { return false }
  })

  useEffect(() => {
    // Read pricingEvents from Storm 1 / patch-621. Gracefully no-op if collection
    // doesn't exist yet (patch-621 not deployed).
    const now = new Date()
    getDocs(query(
      collection(db, 'pricingEvents'),
      where('startsAt', '<=', now),
    )).then((snap) => {
      const live = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((e) => !e.endsAt || e.endsAt.toDate() >= now)
      setActivePromos(live)
    }).catch(() => {})
  }, [])

  if (dismissed) return null

  function dismiss() {
    setDismissed(true)
    try { window.localStorage.setItem(DISMISSED_KEY, '1') } catch {}
  }

  const lines = [
    'FET shown when present. For most tires, FET is rolled into buy price per pricing rules.',
    ...activePromos.map((p) => `Active promo: ${p.notes || `${p.manufacturer} ${p.type}`} through ${p.endsAt?.toDate?.()?.toLocaleDateString?.() || 'TBD'}`),
  ]

  return (
    <div className="flex items-start justify-between gap-3 border-b border-amber-900/40 bg-amber-950/30 px-4 py-2 text-xs text-amber-100">
      <div>{lines.map((l, i) => <p key={i} className={i > 0 ? 'mt-1' : ''}>{l}</p>)}</div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss banner"
        className="shrink-0 rounded p-1 text-amber-300 hover:bg-amber-900/40"
      >
        ×
      </button>
    </div>
  )
}
```

Render at the top of `<TiresDashboard>` above the toolbar.

### 9. Print stylesheet

```css
/* src/components/tires/catalog-print.css */
@media print {
  /* Color preservation */
  * {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* Hide non-essential chrome */
  nav, .pc-toolbar, .filter-panel, [data-mobile-bottom-nav], .catalog-disclaimer {
    display: none !important;
  }

  /* Brand accent bars preserved */
  [data-brand] { border-left-width: 8px !important; }

  /* Page breaks at brand boundaries when grouped */
  details[data-brand-group] {
    page-break-before: always;
  }

  /* Repeat the column header on each printed page */
  thead { display: table-header-group; }
}
```

Import the stylesheet from `<TiresDashboard>` so it loads only on the catalog route.

## AI-CONTEXT.md update

Add to the Tires catalog section:

```md
## Catalog visual hierarchy (do not strip)

The Tires catalog uses brand-encoded visual hierarchy (patch-629):
- Every row has a left accent bar colored by brand (BFG red, Michelin blue,
  Uniroyal green, others zinc fallback)
- MSPN column is monospace, brand-blue, weight 700 — leftmost data column
- FET cell is dimmed grey when $0, brand-orange when non-zero
- Buy column shows italic muted-red 'Unconfirmed' for tires without
  priceIntel.activeBuyPrice or flagged for research
- Top banner reads from pricingEvents collection (patch-621) for active
  rebate / tariff windows; fallback to FET reminder

Reference: docs/reference/Michelin_eFleet_Catalog_SKEDADDLE_v2.html
(canonical visual spec, parked for context).

Do not strip the brand accent bars, MSPN treatment, FET styling, or
disclaimer bar in subsequent refactors. They encode pricing rules
(FET washes out, baseline confidence) into the visual layer.
```

## Acceptance

- [ ] Brand color tokens in `src/index.css`
- [ ] `brandColorVar()` + `brandAccentBorder()` helpers with unit tests covering known + unknown brands
- [ ] Every row in `<MarginTable>` has a left accent bar matching `tire.brand`
- [ ] MSPN column is monospace + brand-blue + weight 700
- [ ] FET cell is dimmed grey at $0, brand-orange when non-zero
- [ ] "Buy" cell shows italic muted-red "Unconfirmed" when `priceIntel.activeBuyPrice` is missing or `flaggedForResearch === true`
- [ ] "Group by brand" toggle visible in toolbar at `sm+` only; toggling renders accordion-grouped view; mobile stays flat
- [ ] `<CatalogDisclaimerBar>` renders at top of `<TiresDashboard>`; dismissal persists via localStorage
- [ ] `pricingEvents` reads gracefully no-op if collection doesn't exist (patch-621 not yet shipped)
- [ ] Print preview from Chrome shows: hidden chrome, page-break-before each brand group, color preservation
- [ ] `docs/reference/Michelin_eFleet_Catalog_SKEDADDLE_v2.html` parked in repo (already done in this PR)
- [ ] `docs/AI-CONTEXT.md` updated with the visual hierarchy section
- [ ] `npm run lint && npm run test && npm run build` green
- [ ] Visual snapshots refreshed after deploy via `visual-tests-update` workflow

## Notes for the agent

- All visual layer. NO data model changes, NO schema migration, NO Firestore writes from this patch. Deploy via `git push`; no `firebase deploy` needed.
- Don't break the existing virtualized list (react-window) — additions are CSS-only on existing rendered rows.
- The "Group by brand" toggle MUST be desktop-only (`hidden sm:inline-flex`). Mobile-flat is a load-bearing decision from the April mobile audit.
- The disclaimer bar's pricingEvents read is graceful — wraps the `getDocs` in `.catch(() => {})` so it doesn't break the catalog if the collection is empty or doesn't exist yet (pre-patch-621).
- The eFleet HTML reference at `docs/reference/Michelin_eFleet_Catalog_SKEDADDLE_v2.html` is the canonical visual spec. If your implementation diverges from what that file shows, document why in the PR description.
- The print stylesheet's brand-boundary page breaks only fire when "Group by brand" is on. When flat, print runs continuous.
