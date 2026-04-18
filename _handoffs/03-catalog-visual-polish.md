# Handoff 03 — Catalog Visual Polish

**After completing all steps and verifying the checklist, delete this file.**

---

## Context

With Grade, Category, and price intel indicators removed, the catalog table has 8 visible data columns (checkbox, Brand, Description, MSPN, LR, Buy Price, FET, Overhead, Margin %). This is the right moment to tighten proportions, tune the margin color thresholds, and clean up the overall table feel.

---

## File: `src/components/tires/MarginTable.jsx`

### 1. Update grid column template

The grid now has 9 columns (checkbox + 8 data). Adjust `gridTemplateColumns` to use the space well now that Grade and Category are gone. Suggested proportions:

| Column | Suggested width |
|--------|----------------|
| Checkbox | 52px |
| Brand | 7rem |
| Description | 2fr |
| MSPN | 5.5rem |
| LR | 3rem |
| Buy Price | 7rem |
| FET | 5rem |
| Overhead | 6rem |
| Margin % | 6rem |

Description gets more room since Category is gone — it was cramped before.

Update `minWidth` on the wrapper accordingly. With the tighter widths, aim for approximately **980px** minimum width.

### 2. Margin % color thresholds — tune for the business

Current thresholds: red <10%, amber ≤25%, green ≤35%, blue >35%.

These feel arbitrary. Proposed thresholds that better reflect a mobile tire operation's reality:
- **Red** — below 15% (losing or near-zero after overhead)
- **Amber** — 15–29% (thin, worth watching)
- **Green** — 30–44% (healthy)
- **Emerald** — 45%+ (strong margin)

Update the color logic in the Margin % cell render accordingly.

### 3. Dead stock indicator

The amber dot on Description for dead stock tires is easy to miss. Make it slightly more prominent — add a faint amber left border or row background tint (`bg-amber-950/10`) on rows where `row.deadStockFlag === true`, in addition to or instead of the dot.

### 4. Mobile "Select mode" discoverability

The select mode toggle is not obvious on mobile. Change the approach: always show the checkboxes on mobile (remove the "Select mode" toggle entirely). The column is narrow (just a checkbox) and the friction of a separate toggle is worse than always having it visible.

If always-visible causes layout issues on very small screens, a small "Select" label above the checkbox column is acceptable.

### 5. Scroll hint text

Update to reflect current columns (Grade and Category are gone):
```
← Scroll for overhead, FET, brand →
```
Only show this hint on the first load — it should auto-dismiss after any horizontal scroll (this behavior may already exist via `scrollHintDismissed` state).

### 6. Empty state

When all filters produce zero results (or the tire collection is empty), show a clean empty state message instead of just a blank virtual list area. Something like:

```
No tires match your filters.
```
With a small "Clear filters" button if any non-default filters are active.

### 7. Loading state

When `useTires` is loading, the skeleton cells should match the current 9-column layout. Verify skeleton count matches and spans correctly.

---

## File: `src/components/tires/MarginFilters.jsx`

### 8. Filter section spacing

Review overall spacing and make sure the filter panel feels clean and compact — not too padded, not cramped. The dead stock checkbox should be clearly separated from the multi-select filters visually (it's a binary toggle, not a multi-value filter).

### 9. Active filter badge

The active filter count badge is good — make sure it counts correctly with Category removed (Category was a filter option; remove it from the count if still present).

---

## File: `src/utils/exportMarginCsv.js`

### 10. CSV column order cleanup

Verify the export columns match the table: Brand, Description, MSPN, LR, Buy Price, FET, Mount Cost, Delivery Cost, Other Cost, Overhead Total, Margin %. No Grade, no Category.

---

## Verification checklist

- [ ] Grid proportions look balanced — Description column is wider, no wasted space
- [ ] Margin % colors: red <15%, amber 15–29%, green 30–44%, emerald 45%+
- [ ] Dead stock rows have a subtle amber row tint in addition to any existing dot
- [ ] Mobile checkboxes always visible (no "Select mode" toggle)
- [ ] Scroll hint text updated and auto-dismisses on scroll
- [ ] Empty state message shown when no tires match filters
- [ ] Skeleton loader matches 9-column layout
- [ ] CSV export has correct columns in correct order
- [ ] `npm run lint` passes
- [ ] `npm run build` passes

---

**Delete this file once all checklist items are confirmed.**
