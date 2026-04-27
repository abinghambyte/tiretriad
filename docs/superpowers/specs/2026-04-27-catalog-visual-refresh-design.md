# Catalog visual refresh — design spec (STORMED 2026-04-27)

**Status:** Stormed (spawn from Storm 6). Implementation captured as `docs/handoffs/patch-629-catalog-visual-refresh.md`.

## Source of inspiration

`docs/reference/Michelin_eFleet_Catalog_SKEDADDLE_v2.html` — static reference doc parked in this PR. Treat as the canonical visual spec for the patterns this storm imports. Future contributors reading the file see exactly what shape "good" looks like for a catalog page.

The eFleet HTML is **not** a replacement for the operational Skedaddle catalog (no search, no filter, no CTS, no order integration, page-numbered like a PDF). It nails several presentation patterns that the live `<MarginTable>` doesn't.

## What to import (ranked by import-worthiness)

### 1. Brand accent bars on every row

Currently the catalog forces the eye to read brand text on every row. A 6–10px left border per row colored by brand turns brand identification into a glance instead of a read.

```css
[data-brand="BFG"]      { border-left: 8px solid var(--brand-bfg-red); }
[data-brand="Michelin"] { border-left: 8px solid var(--brand-michelin-blue); }
[data-brand="Uniroyal"] { border-left: 8px solid var(--brand-uniroyal-green); }
/* fallback for unknown brand */
[data-brand]            { border-left: 8px solid var(--zinc-700); }
```

Brand color tokens defined once in `src/index.css` (or wherever the existing color tokens live). Highest leverage, ~30 lines of change.

### 2. MSPN column treatment

Make MSPN visually distinct from surrounding noise. Monospace, brand-blue, weight 700, leftmost data column.

```css
.col-mspn {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-weight: 700;
  color: var(--brand-michelin-blue);
}
```

### 3. FET column conditional styling

Visually reinforce the "FET washes out for most tires" rule we keep explaining:
- `$0.00` → dimmed grey (`text-zinc-600` or similar muted token)
- Non-zero → brand-orange accent (`text-amber-400` or a dedicated `--brand-fet-orange` token)

Operator scans the catalog and instantly sees which tires actually have FET to manage.

### 4. Brand-grouped sections (desktop-only toggle)

Add a "Group by brand" toggle in the existing toolbar. When on:
- Catalog renders as collapsible accordions per brand (Michelin / BFGoodrich / Uniroyal / etc.)
- Each accordion header shows count: "BFGoodrich · 247 tires"
- Default expanded; user can collapse to scan brand presence

Mobile **stays flat** per the April mobile audit findings — accordions on phone create too many tap targets in a virtualized list.

### 5. Quoted-locally / unconfirmed-price treatment

The eFleet uses italic + red for "PQL" (price quoted locally). Skedaddle's analogous states:
- `priceIntel.activeBuyPrice` missing → "Price unconfirmed" italic muted-red
- Tire flagged for research (Kyle's queue) → italic muted-red
- Future: tier 1 baseline missing (post-patch-617) → italic muted-red

Same visual pattern fits perfectly.

### 6. Disclaimer / status bar at top

Thin dismissible banner at the top of `/tires?tab=catalog`:
- FET reminder ("FET shown when present; usually rolled into buy price per pricing rules")
- Active manufacturer rebate windows (read from `pricingEvents` collection — Storm 1 / patch-621)
- Active tariff surcharge events
- Dismiss button (`localStorage.skedaddle.catalog.dismissedBanner` until next event change)

High-signal, low-cost. Surfaces operationally relevant context at the moment of work.

### 7. Print stylesheet

`@media print` rules:
- Page breaks at brand boundaries
- Color preservation (`-webkit-print-color-adjust: exact`)
- Hide the toolbar / filters / select-all
- Show only essential columns: MSPN / Description / Buy / FET / Margin
- Header repeats per printed page

Closes the latent "I want to PDF this catalog" use case the static eFleet was filling.

## What NOT to import

- **Static page-numbered structure ("48 pages" per brand)** — PDF-thinking. Skedaddle's catalog is interactive virtualized list; "X items across Y pages" stat boxes get reworded as just "X items"
- **TOC page** — replaced by existing nav, search, and Cmd+K palette (Storm 3)
- **Cover page treatment** — marketing surface; Skedaddle home is the 6-card grid (Storm 5)

## Spawn topic for parking lot

The eFleet has ~1,947 products; Skedaddle catalog has 1,160. The delta is **Kyle's broader sourcing catalog vs Alex's current inventory**. The portal currently treats those as the same thing (the catalog IS the inventory). There's a real distinction worth modeling:

- "Tires Kyle CAN source" (sourcing universe, ~1,947+)
- "Tires currently in Skedaddle catalog" (~1,160 active SKUs)

Source-mode toggle on the catalog OR a parallel sourcing surface. Ties into Kyle's research queue. Don't build now — flag for a future storm. **Adding to BRAINSTORM-PARKING-LOT.md as Topic 8.**

## Decision log

- Visual layer only — no data model changes; deploy via plain `git push`
- Brand color tokens centralized in `src/index.css` to prevent ad-hoc duplication
- Brand-grouping is a **desktop-only toggle** — mobile keeps flat virtualized list per April audit
- Print stylesheet is part of this patch, not deferred
- Disclaimer bar reads from `pricingEvents` (Storm 1 / patch-621); falls back to a static FET reminder if the collection is absent
- Update `docs/AI-CONTEXT.md` catalog section to document the visual hierarchy patterns so future contributors don't strip them in subsequent refactors
- Park the eFleet HTML as `docs/reference/Michelin_eFleet_Catalog_SKEDADDLE_v2.html` — treat as canonical visual spec

## Out of scope

- Source-mode catalog (parking-lot Topic 8)
- Catalog-as-PDF export button (the print stylesheet covers the use case via browser Print → Save as PDF)
- Brand color palette expansion beyond BFG / Michelin / Uniroyal (add new tokens as new brands enter the catalog)

## Next step

Dispatch `docs/handoffs/patch-629-catalog-visual-refresh.md`. Single PR, all visual layer.
