# Cursor handoff — Tire Description Cell Formatting

>Worker: Field Executor (Cursor)
>Author: Portal Architect (Sonnet 4.6)
>Date: 2026-04-16
>Run after: CURSOR-price-researcher-fix-and-cleanup.md

## Goal

Fix the tire description column in the catalog table so every row renders in a consistent two-line format regardless of whether the parser succeeds. Currently, tires that fail to parse dump a raw compressed string like `LT265/70R17/C112/109SATT/AKO3` as a single line with no structure. Tires that parse correctly show a clean two-line layout.

---

## Problem

### Files involved
- `src/utils/parseTireDescription.js` — client-side parser
- `src/components/tires/MarginTable.jsx` — `TireDescriptionCell` component (line ~146)

### Root cause

The catalog descriptions use a compressed format that the parser doesn't handle:

```
LT265/70R17/C112/109SATT/AKO3
```

Breaking this down:
- `LT` prefix
- `265/70R17` size
- `/C` load range embedded with a slash
- `112/109S` dual load index + speed rating  
- `ATT/AKO3` tread name (no space separator)

The current metric regex expects `265/70R17` followed by a space and then load/speed. It doesn't handle the `/C` load range segment or the run-together tread name. When it fails to parse, `parseKind` stays `'raw'` and `TireDescriptionCell` renders the full raw string as `primary` with no secondary line.

### Current broken output (raw fallback)
```
LT265/70R17/C112/109SATT/AKO3     ← entire string crammed on one line
```

### Desired output (all rows)
```
LT265/70R17  ·  112/109S           ← size + load/speed — bold, monospace
ATT/AKO3                            ← tread name — smaller, muted
```

---

## Fix — two parts

### Part 1: Improve `parseTireDescription.js`

Add a new regex branch **before** the existing metric branch to handle the compressed catalog format. Pattern to match:

```
/^(LT|P)?(\d{3})\/(\d{2})(R|ZR|D|B)(\d{2})(?:\/([A-F]))?(\d{2,3}(?:\/\d{2,3})?[A-Z]?)(.*)$/i
```

This handles:
- Optional `LT`/`P` prefix
- Width (3 digits)
- `/` + aspect ratio (2 digits)  
- Construction (`R`, `ZR`, `D`, `B`) + rim diameter (2 digits)
- Optional `/` + load range letter (`C`, `D`, `E`, `F`)
- Load index (may be dual like `112/109`)
- Speed rating
- Remaining string = tread name

Extract `treadName` from the trailing characters after stripping known patterns. The tread name in these compressed strings starts after the speed rating letter (e.g., after `112/109S`, the rest is `ATT/AKO3`).

If parsing succeeds, return `parseKind: 'metric'` with all fields populated including `treadName`.

### Part 2: Fallback formatter in `TireDescriptionCell`

Even if the parser still can't handle some edge case, the cell should never dump a raw string. Add a fallback formatter that applies a regex to split the raw string into a best-guess size line and tread line:

```jsx
function splitRawDescription(raw) {
  // Match: optional LT/P, size (digits/digits + R + digits), optional /LR, remainder
  const m = raw.match(
    /^((?:LT|P)?\d{2,3}(?:[\/X]\d{1,3}(?:\.\d+)?)?[A-Z]{1,2}\d{2}(?:LT)?(?:\/[A-F])?)\s*([0-9\/]+[A-Z]{1,2})?\s*(.*)$/i
  )
  if (m) {
    const size = (m[1] || '').trim()
    const loadSpeed = (m[2] || '').trim()
    const tread = (m[3] || '').trim()
    const primary = [size, loadSpeed].filter(Boolean).join(' · ')
    return { primary: primary || raw, secondary: tread || null }
  }
  return { primary: raw, secondary: null }
}
```

Use this in the `else` branch of `TireDescriptionCell` (the `parseKind === 'raw'` path) instead of setting `primary = d`.

### Part 3: Remove `line-clamp-2` truncation on primary line

The current primary line has `line-clamp-2` which can cut off the size string. Change it:

```jsx
// Before
<div className="line-clamp-2 break-words font-mono text-zinc-200 [overflow-wrap:anywhere]">

// After  
<div className="break-words font-mono text-zinc-200 [overflow-wrap:anywhere]">
```

Keep the secondary line at one line max (`line-clamp-1`) — tread names are short.

### Part 4: Consistent cell height

The virtual scroll list uses a fixed `ROW_BASE_PX = 48`. With two lines per row, some rows will overflow. Update `ROW_BASE_PX` from `48` to `56` and `ROW_MOBILE_BASE_PX` from `52` to `60` to accommodate the two-line layout consistently.

---

## Expected result after fix

Every row in the catalog table should look like:

```
┌─────────────────────────────────────────────────┐
│  BFGOODRICH   265/70R17 · 112/109S    09100  ... │
│               ATT/AKO3                           │
├─────────────────────────────────────────────────┤
│  MICHELIN     245/70R17 · 114T XL     00546  ... │
│               DEF LTX M/S2                       │
└─────────────────────────────────────────────────┘
```

No more raw compressed strings. No more single-line dumps.

---

## Constraints

- Do NOT change `parseTireDescription.js` in `functions/` — only update `src/utils/parseTireDescription.js`
- Do NOT change any other column in `MarginTable.jsx`
- Do NOT change filter logic, sort logic, or CTS editor
- Do NOT touch any backend files

## After changes

```bash
npm run lint
npm run build
```

Fix any errors, then push to main — Vercel auto-deploys.

Verify in the live portal that the catalog table shows consistent two-line rows for both parsed and previously-raw descriptions.
