# Handoff 02 — Catalog Price Intel Cleanup

**After completing all steps and verifying the checklist, delete this file.**

---

## Context

The nightly `tirePriceResearch` job (which uses Gemini to populate `priceIntel.activeBuyPrice`, `priceIntel.confidence`, `priceIntel.kyleConfirmed`, and `priceIntel.flagged` on tire docs) is **not running and not populating data**. As a result, every tire shows the "unknown" confidence dot and no `kyleConfirmed` or `flagged` indicators are meaningful.

Rather than show broken/empty indicators, we hide all price intel UI until the job is active. The underlying buy price now correctly reads from `retailPrice` as the fallback, so the catalog functions correctly without this layer.

---

## File: `src/components/tires/MarginTable.jsx`

### 1. Remove confidence dot indicator

In the Buy Price cell there is a colored dot (emerald/amber/red/zinc) based on `priceIntel.confidence`. Find it — it's likely something like:

```jsx
<span className={`h-2 w-2 rounded-full ${confidenceDotClass}`} title={...} />
```

Remove it entirely from the cell. The buy price number should display cleanly on its own.

### 2. Remove the `flagged` indicator

There is likely a flag icon or badge that shows when `priceIntel.flagged === true`. Remove it from the row.

### 3. Remove the `kyleConfirmed` checkmark/badge

There is a visual indicator for when `priceIntel.kyleConfirmed === true`. Remove it.

### 4. Remove any price intel tooltip or popover

If hovering the buy price shows a popover with confidence info, source, or last-researched date — remove that popover/tooltip entirely.

### 5. Clean up any price intel related functions or state

Search the file for:
- `confidence`
- `kyleConfirmed`
- `priceIntel`
- `flagged`
- `confidenceDot`

Remove any helper functions, derived variables, or class mappings that exist solely to render these indicators. Do not touch `tireCatalogBuyNumber` — that function correctly reads `priceIntel.activeBuyPrice` as the top priority and should stay as-is for when the job eventually runs.

---

## File: `src/utils/ctsCalc.js` (if applicable)

If any price intel display logic lives here, remove it.

---

## What to keep

- `tireCatalogBuyNumber()` in `src/utils/tireCatalogBuy.js` — keep entirely as-is. It correctly reads `priceIntel.activeBuyPrice` first, so when the nightly job does run in the future, prices will populate automatically with no code changes.
- The `priceIntel` field on tire docs in Firestore — don't touch the data layer.

---

## Verification checklist

- [ ] No colored confidence dots visible in the Buy Price column
- [ ] No flagged indicators in any row
- [ ] No kyleConfirmed indicators in any row
- [ ] Buy Price column shows just the dollar value, clean
- [ ] `npm run lint` passes
- [ ] `npm run build` passes

---

**Delete this file once all checklist items are confirmed.**
