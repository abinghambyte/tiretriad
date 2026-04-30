# Tires catalog visual polish — design

**Status:** approved 2026-04-30
**Branch target:** `tires-table-polish`
**Roadmap entry:** *Tires catalog visual polish bundle* (Now)

## Goal

Three small, related upgrades to the desktop Tires catalog rendering shipped in
one PR:

1. Sidewall pills on each row (XL, M/S) below the tread name on the existing
   secondary description line.
2. Sticky header row with a deeper solid background bar that locks to the top
   while rows scroll.
3. Brand-tinted row hover that picks up the row's left-edge brand color at low
   opacity.

The roadmap also listed *XL filter chip* and *Tread/model typography hierarchy*
in this bundle. Both are dropped from scope after design review:

- **XL filter chip:** already shipped. `deriveTireTags` extracts `'XL'` and the
  Tags chip row in `MarginFilters` already renders all `useTags`. No work.
- **Stronger primary/secondary typography:** PR #193 already shipped the 2-line
  hierarchy. Pushing further (zinc-100 / zinc-500) risks crushed contrast on
  dim monitors. Skip.

## Non-goals

- TireCardMobile pill rendering — desktop table only this round.
- Sidewall pills beyond XL and M/S (no BSW, OWL, RWL, ORWL, RunFlat — explicitly
  excluded during brainstorming).
- A separate `parseSidewallTags.js` utility — the chosen approach extends
  `deriveTireTags`, keeping a single source of truth for tag derivation.
- Brand color palette saturation refresh — that's a coupled portal+website
  change, separate roadmap entry.

## Architecture

Single-PR change. Two files materially modified, no new components, no new
utilities, no Firestore schema changes.

### `src/utils/deriveTireTags.js`

Add a new tag emitter for `'MS'`. Today the regex
`RE_ALL_SEASON = /(?:M\+S|M\/S|\bMS2\b|\bAS\b|AllSeason)/i` produces the
`'All-Season'` tag. Add a parallel `RE_MS = /\b(?:M[\/+]S|MS2)\b/i` that emits
the standalone `'MS'` tag. Both tags coexist on a tire that is M/S-rated:
`['All-Season', 'MS', ...]`. `'XL'` detection is unchanged (`RE_XL = /\bXL\b/i`).

The pill renderer downstream filters `useTags` to `['XL', 'MS']`. Adding `'MS'`
to the global tag pool also makes it available as a filter chip in the existing
Tags row (acceptable — narrower than All-Season and useful for severe-service
filtering).

### `src/components/tires/MarginTable.jsx`

Three localized changes:

1. **`TireDescriptionCell` accepts a new `pillTags` prop** (string array,
   defaults to empty). Renders pills inline on the existing secondary line:

   ```
   Defender LTX · [M/S] [XL]
   ```

   When `secondary` is empty (rare malformed descriptions), pills render on a
   new third line below `primary` instead of being dropped.

2. **Stop pushing `'XL'` into the primary string at line 411.** Today
   `if (parsed.extraLoad) loadParts.push('XL')` injects `XL` into the size-spec
   string ("P255/55R18 109V XL"). With XL becoming a pill, drop that push so
   primary stays clean ("P255/55R18 109V"). The pill provides the same signal
   with stronger visual weight.

3. **Header sticky bar.** Wrap the desktop `<thead>` and the mobile-table
   header row containers in `sticky top-0 z-[14]`. Bump bg from
   `bg-zinc-900/90` to `bg-slate-900` (deeper solid). Add
   `border-b-2 border-slate-700` (was `border-b border-zinc-800`). Z-index 14
   sits below the sticky-left checkbox column (`z-[15]`/`z-[16]`) so the
   intersection of sticky-top and sticky-left renders correctly.

4. **Brand-tinted row hover.** Each row already has a left-edge brand strip
   driven by `row.brand`. Map `row.brand → brand-color CSS var` (already exists
   in `src/index.css`: `--color-brand-michelin: #2a4d9c`,
   `--color-brand-bfg: #b22234`, `--color-brand-uniroyal: #2e7d4a`,
   `--color-brand-default: #52525b` for unknown brands). Set inline
   `style={{ '--row-brand-hover':
   'color-mix(in oklab, var(--color-brand-X) 8%, transparent)' }}` and add
   class `hover:bg-[color:var(--row-brand-hover)]`. Tires with no brand fall
   through to `--color-brand-default` (zinc-600), which produces a neutral
   hover identical in feel to the current `hover:bg-zinc-800/25`.

### Pill component

A small inline component, defined in the same file as `TireDescriptionCell`
(under 30 LOC, no public export):

```jsx
function SidewallPill({ tag }) {
  const styles = {
    XL: 'bg-zinc-700 text-zinc-100',
    MS: 'bg-cyan-900/60 text-cyan-200',
  }
  const labels = {
    XL: 'Extra Load tire',
    MS: 'Mud and Snow rated',
  }
  return (
    <span
      className={`ml-1 inline-block rounded px-1.5 py-px text-[9px] font-bold tracking-wide ${styles[tag] ?? 'bg-zinc-700 text-zinc-100'}`}
      aria-label={labels[tag] ?? tag}
    >
      {tag === 'MS' ? 'M/S' : tag}
    </span>
  )
}
```

## Data flow

- `TiresDashboard.jsx` already attaches `derivedUseTags` to each `enriched`
  row.
- `MarginTable.jsx` row-render reads `row.derivedUseTags`, computes
  `pillTags = derivedUseTags.filter((t) => t === 'XL' || t === 'MS')`, passes to
  `<TireDescriptionCell pillTags={pillTags} />`.
- No new state. No new Firestore reads. No new selectors.

## Edge cases

- **Tread name already contains "M/S"** (e.g. *Defender LTX M/S*): pill still
  renders next to the tread name. Mild text duplication, acceptable trade — the
  pill is scannable in a way embedded text isn't.
- **No secondary line:** pills render on a new line below primary instead of
  being dropped on the floor.
- **Tire missing `brand` field:** hover bg falls back to existing
  `hover:bg-zinc-800/25`. No visual regression.
- **Sticky-top + sticky-left intersection:** z-index ordering established
  (`top` z-14, `left` z-15/16). Top-left checkbox header cell sits at z-16 and
  visually wins the corner intersection.
- **Mobile cards (`TireCardMobile.jsx`):** unchanged. Pills appear only on the
  table render path. Out of scope.

## Testing

### Unit — `deriveTireTags.test.js`

Add cases:
- `'265/70R17 115T M/S'` → tags include both `'All-Season'` and `'MS'`
- `'P255/55R18 109V XL'` → tags include `'XL'` (regression — already passes)
- `'265/70R17 LTX'` → no `'MS'`
- `'225/45R17 91W XL M/S'` → tags include both `'XL'` and `'MS'`

### Component — `MarginTable.test.jsx` (new file)

- Pill renders for a row with `derivedUseTags: ['XL']`
- Pill renders for a row with `derivedUseTags: ['MS']`
- Both pills render when both tags present
- No pill when `derivedUseTags` is empty / missing
- Primary description string no longer contains literal `' XL'` for an XL row
- `aria-label` on pills reads "Extra Load tire" / "Mud and Snow rated"

### Visual / a11y

- Sticky header element has computed `position: sticky` and `top: 0`
- Header z-index lower than sticky-left column z-index (no overlap regression)
- Brand-tint hover fires on `:hover` and reverts on mouseleave (manual eye
  check during PR review — not unit-tested)

### Existing tests

`MarginTable` is heavily snapshot-tested via consumer flows. Run the full
vitest suite; expect snapshot updates touching only the affected description
cell and header markup.

## Risks

- **Snapshot churn:** existing tests that capture row markup may need
  re-recording. Acceptable; the changes are intentional.
- **Brand-tint contrast on Uniroyal green:** at 8% opacity on a near-black
  background the green tint may be slightly less visible than Michelin's navy.
  Visual review during PR; bump to 10% if needed.
- **Bundle size:** `.size-limit.cjs` currently caps tires page at 42 KB. New
  code is ~30 LOC; expect <1 KB gzipped. No risk of breach.

## Out of scope

Tracked in roadmap, not part of this PR:
- TireCardMobile pill rendering
- BSW/OWL/RWL/ORWL/RunFlat pills
- Catalog-first navigation (drill-down)
- Brand color palette saturation refresh
