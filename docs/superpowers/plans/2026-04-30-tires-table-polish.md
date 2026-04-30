# Tires catalog visual polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship three small visual polish items to the desktop Tires catalog in one PR — sidewall pills (XL, M/S), sticky header bar, and brand-tinted row hover.

**Architecture:** Two files materially modified. `src/utils/deriveTireTags.js` gains one new tag (`MS`). `src/components/tires/MarginTable.jsx` gains a small `SidewallPill` component, threads `pillTags` through `TireDescriptionCell`, drops the inline `XL` text from primary, makes `<thead>` sticky, and adds brand-tinted hover via `color-mix` on the existing `brandColorCssVar` helper. No new files, no Firestore changes.

**Tech Stack:** React 19, Tailwind v4 (`@theme` block), Vitest, plain `expect`/`fireEvent` (no `@testing-library/user-event`, no jest-dom matchers).

**Spec:** `docs/superpowers/specs/2026-04-30-tires-table-polish-design.md`

**Worktree:** `.claude/worktrees/tires-table-polish` (branch `tires-table-polish`)

---

## File map

| File | Change | Responsibility |
|---|---|---|
| `src/utils/deriveTireTags.js` | Modify | Emit new `MS` tag from `M/S` / `M+S` / `MS2` text |
| `src/utils/deriveTireTags.test.js` | Modify | Cover MS detection cases |
| `src/components/tires/MarginTable.jsx` | Modify | Add `SidewallPill`; thread `pillTags` to `TireDescriptionCell`; drop XL from primary; sticky header; brand hover |
| `src/components/tires/MarginTable.test.jsx` | Create | Cover pill rendering and primary-string XL removal |

---

## Task 1: Add `MS` tag emission in `deriveTireTags`

**Files:**
- Modify: `src/utils/deriveTireTags.js:152-153` (add `RE_MS` near `RE_ALL_SEASON`)
- Modify: `src/utils/deriveTireTags.js:43-45` (add `if (RE_MS.test(hay)) out.add('MS')` near the All-Season emitter)
- Test: `src/utils/deriveTireTags.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `src/utils/deriveTireTags.test.js` before the closing `})`:

```js
  it('emits both MS and All-Season for M/S-rated tires', () => {
    const tire = { description: '265/70R17 115T M/S', brand: 'Michelin', tread: '' }
    const tags = deriveTireTags(tire)
    expect(tags).toContain('MS')
    expect(tags).toContain('All-Season')
  })

  it('emits MS for M+S marking', () => {
    const tags = deriveTireTags({ description: 'P225/60R17 99H M+S', brand: 'Uniroyal' })
    expect(tags).toContain('MS')
  })

  it('emits MS for MS2 tread tag', () => {
    const tags = deriveTireTags({ description: 'P225/65R17 102H MS2', brand: 'Michelin' })
    expect(tags).toContain('MS')
  })

  it('does not emit MS when no M/S marking present', () => {
    const tags = deriveTireTags({ description: '265/70R17 LTX A/T', brand: 'Michelin' })
    expect(tags).not.toContain('MS')
  })

  it('emits both XL and MS when both present', () => {
    const tags = deriveTireTags({ description: '225/45R17 91W XL M/S', brand: 'Michelin' })
    expect(tags).toContain('XL')
    expect(tags).toContain('MS')
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd .claude/worktrees/tires-table-polish && npx vitest run src/utils/deriveTireTags.test.js`

Expected: 5 new failures — first three say `expected [...] to contain 'MS'`. The fourth and fifth fail similarly. Existing tests pass.

- [ ] **Step 3: Add the regex constant**

Edit `src/utils/deriveTireTags.js`. Find this block at line 152:

```js
const RE_ALL_SEASON = /(?:M\+S|M\/S|\bMS2\b|\bAS\b|AllSeason)/i
const RE_SUMMER = /\b(?:Summer)\b/i
```

Add a new line between them:

```js
const RE_ALL_SEASON = /(?:M\+S|M\/S|\bMS2\b|\bAS\b|AllSeason)/i
const RE_MS = /(?:M\+S|M\/S|\bMS2\b)/i
const RE_SUMMER = /\b(?:Summer)\b/i
```

- [ ] **Step 4: Add the emitter**

Find the season block at line 43:

```js
  // Season tags.
  if (RE_WINTER.test(hay)) out.add('Winter')
  if (RE_ALL_SEASON.test(hay)) out.add('All-Season')
  if (RE_SUMMER.test(hay)) out.add('Summer')
```

Replace with:

```js
  // Season tags.
  if (RE_WINTER.test(hay)) out.add('Winter')
  if (RE_ALL_SEASON.test(hay)) out.add('All-Season')
  if (RE_MS.test(hay)) out.add('MS')
  if (RE_SUMMER.test(hay)) out.add('Summer')
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd .claude/worktrees/tires-table-polish && npx vitest run src/utils/deriveTireTags.test.js`

Expected: all tests pass (existing + 5 new).

- [ ] **Step 6: Commit**

```bash
cd .claude/worktrees/tires-table-polish
git add src/utils/deriveTireTags.js src/utils/deriveTireTags.test.js
git commit -m "feat(tires): emit MS tag distinct from All-Season

Adds RE_MS so M/S-rated tires carry an explicit 'MS' tag in addition
to 'All-Season'. The MS pill in the catalog row reads from this tag.
The narrower MS chip is also useful for severe-service filtering."
```

---

## Task 2: Add `SidewallPill` component and pill rendering inside `TireDescriptionCell`

**Files:**
- Modify: `src/components/tires/MarginTable.jsx:383-454` (TireDescriptionCell + new SidewallPill)
- Test: `src/components/tires/MarginTable.test.jsx` (CREATE)

- [ ] **Step 1: Write the failing tests (create new file)**

Create `src/components/tires/MarginTable.test.jsx`:

```jsx
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { TireDescriptionCellForTest as TireDescriptionCell } from './MarginTable.jsx'

describe('TireDescriptionCell pills', () => {
  it('renders an XL pill when pillTags includes XL', () => {
    const { container } = render(
      <TireDescriptionCell description="P255/55R18 109V Pilot Sport" pillTags={['XL']} />
    )
    const pill = container.querySelector('[data-pill="XL"]')
    expect(pill).not.toBeNull()
    expect(pill.textContent).toBe('XL')
    expect(pill.getAttribute('aria-label')).toBe('Extra Load tire')
  })

  it('renders an MS pill displaying M/S', () => {
    const { container } = render(
      <TireDescriptionCell description="265/70R17 115T Defender LTX M/S" pillTags={['MS']} />
    )
    const pill = container.querySelector('[data-pill="MS"]')
    expect(pill).not.toBeNull()
    expect(pill.textContent).toBe('M/S')
    expect(pill.getAttribute('aria-label')).toBe('Mud and Snow rated')
  })

  it('renders both pills when both tags present', () => {
    const { container } = render(
      <TireDescriptionCell
        description="225/45R17 91W XL Pilot Sport"
        pillTags={['XL', 'MS']}
      />
    )
    expect(container.querySelector('[data-pill="XL"]')).not.toBeNull()
    expect(container.querySelector('[data-pill="MS"]')).not.toBeNull()
  })

  it('renders no pills when pillTags is empty or missing', () => {
    const { container: c1 } = render(
      <TireDescriptionCell description="265/70R17 LTX" pillTags={[]} />
    )
    expect(c1.querySelector('[data-pill]')).toBeNull()

    const { container: c2 } = render(
      <TireDescriptionCell description="265/70R17 LTX" />
    )
    expect(c2.querySelector('[data-pill]')).toBeNull()
  })

  it('does NOT render literal " XL" inside the primary description string', () => {
    const { container } = render(
      <TireDescriptionCell description="P255/55R18 109V" pillTags={['XL']} />
    )
    // Primary line is the first <div> child of the wrapper div with mono font
    const primary = container.querySelector('div.font-mono')
    expect(primary).not.toBeNull()
    expect(primary.textContent).not.toMatch(/\bXL\b/)
    // The pill still exists, just not in primary
    expect(container.querySelector('[data-pill="XL"]')).not.toBeNull()
  })

  it('falls back to a third line when secondary is empty and pills are present', () => {
    const { container } = render(
      <TireDescriptionCell description="GARBAGE-INPUT-NO-SIZE" pillTags={['XL']} />
    )
    expect(container.querySelector('[data-pill="XL"]')).not.toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd .claude/worktrees/tires-table-polish && npx vitest run src/components/tires/MarginTable.test.jsx`

Expected: failures because `TireDescriptionCellForTest` is not exported.

- [ ] **Step 3: Add `SidewallPill` and modify `TireDescriptionCell`**

Edit `src/components/tires/MarginTable.jsx`. Find this block at line 383:

```jsx
const TireDescriptionCell = memo(function TireDescriptionCell({ description }) {
```

Replace the whole component body (lines 383-454) with:

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
  const display = tag === 'MS' ? 'M/S' : tag
  return (
    <span
      data-pill={tag}
      aria-label={labels[tag] ?? tag}
      className={`ml-1 inline-block rounded px-1.5 py-px text-[9px] font-bold tracking-wide align-middle ${styles[tag] ?? 'bg-zinc-700 text-zinc-100'}`}
    >
      {display}
    </span>
  )
}

const TireDescriptionCell = memo(function TireDescriptionCell({ description, pillTags }) {
  const d = String(description ?? '').trim()
  const parsed = useMemo(() => parseDescription(d), [d])
  const tags = Array.isArray(pillTags) ? pillTags : []
  if (!d) return <span className="text-zinc-400">--</span>

  const hasMetric =
    parsed.parseKind === 'metric' &&
    parsed.width != null &&
    parsed.aspectRatio != null &&
    parsed.construction != null &&
    parsed.rimDiameter != null

  const hasFlotation =
    parsed.parseKind === 'flotation' &&
    parsed.width != null &&
    parsed.rimDiameter != null &&
    parsed.flotationMid != null

  const loadParts = []
  if (parsed.loadIndex != null) {
    const li2 = parsed.loadIndexSecondary
    if (li2 != null && Number.isFinite(li2)) {
      loadParts.push(`${parsed.loadIndex}/${li2}`)
    } else {
      loadParts.push(String(parsed.loadIndex))
    }
  }
  if (parsed.speedRating) loadParts.push(parsed.speedRating)
  // XL intentionally NOT pushed into primary — it renders as a SidewallPill on
  // the secondary line via pillTags.
  const loadSpeed = loadParts.join(' ')

  let primary = ''
  let secondary = /** @type {string | null} */ (null)

  if (hasFlotation) {
    const ltSuffix = parsed.trailingLt ? 'LT' : ''
    primary = `${parsed.width}X${parsed.flotationMid}R${parsed.rimDiameter}${ltSuffix}`
    if (loadSpeed) {
      primary += ` · ${loadSpeed}`
    }
  } else if (hasMetric) {
    primary = `${parsed.ltPrefixedMetric ? 'LT ' : ''}${parsed.width}/${parsed.aspectRatio}${String(parsed.construction || '').toUpperCase()}${parsed.rimDiameter}`
    if (loadSpeed) {
      primary += ` · ${loadSpeed}`
    }
  } else {
    const split = splitRawDescription(d)
    primary = split.primary
    secondary = split.secondary
  }

  if (hasFlotation || hasMetric) {
    const t = String(parsed.treadName || '').trim()
    if (t && t !== d && t !== primary && !primary.includes(t)) {
      secondary = t
    }
  }

  const fullText = secondary ? `${primary} ${secondary}` : primary
  const hasPills = tags.length > 0

  return (
    <div className="group/desc relative min-w-0 max-w-full overflow-hidden pr-6 text-sm leading-snug text-zinc-300">
      <div className="break-words font-mono font-semibold text-zinc-200 [overflow-wrap:anywhere]">{primary}</div>
      {secondary ? (
        <div className="mt-0.5 line-clamp-1 max-w-full break-words text-xs font-medium text-zinc-400 [overflow-wrap:anywhere]">
          {secondary}
          {hasPills ? (
            <>
              {' · '}
              {tags.map((t) => (
                <SidewallPill key={t} tag={t} />
              ))}
            </>
          ) : null}
        </div>
      ) : hasPills ? (
        <div className="mt-0.5 line-clamp-1 max-w-full break-words text-xs">
          {tags.map((t) => (
            <SidewallPill key={t} tag={t} />
          ))}
        </div>
      ) : null}
      <CopyDescriptionButton text={fullText} />
    </div>
  )
})

// Test-only export. Tests import this aliased name; production code uses the
// memoized version above through the existing call sites.
export const TireDescriptionCellForTest = TireDescriptionCell
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd .claude/worktrees/tires-table-polish && npx vitest run src/components/tires/MarginTable.test.jsx`

Expected: all 6 tests pass.

- [ ] **Step 5: Run the full vitest suite to catch snapshot regressions**

Run: `cd .claude/worktrees/tires-table-polish && npx vitest run`

Expected: all tests pass. If any snapshot tests touching tire-row markup fail, inspect the diff — the only expected change is removal of `' XL'` from primary description text in XL rows. If the diff matches that, update snapshots: `npx vitest run -u`. If anything else changed, stop and report.

- [ ] **Step 6: Commit**

```bash
cd .claude/worktrees/tires-table-polish
git add src/components/tires/MarginTable.jsx src/components/tires/MarginTable.test.jsx
git commit -m "feat(tires): sidewall pills (XL, M/S) on description cell

Adds SidewallPill component rendered on the secondary line of
TireDescriptionCell. XL is removed from the primary size-spec string
(was pushed via parsed.extraLoad) and instead rendered as a pill from
the new pillTags prop. M/S renders the same way when the row's
derivedUseTags contains 'MS'.

Pills carry aria-labels so screen readers say 'Extra Load tire' /
'Mud and Snow rated' rather than 'XL' / 'M slash S'."
```

---

## Task 3: Wire `pillTags` from row data into both `TireDescriptionCell` call sites

**Files:**
- Modify: `src/components/tires/MarginTable.jsx:724` (mobile call site)
- Modify: `src/components/tires/MarginTable.jsx:824` (desktop call site)

- [ ] **Step 1: Write the failing test**

Append to `src/components/tires/MarginTable.test.jsx` before the closing `})`:

```jsx
  it('XL primary string is dropped when pillTags=[XL] for an explicit-XL description', () => {
    const { container } = render(
      <TireDescriptionCell description="P255/55R18 109V XL" pillTags={['XL']} />
    )
    // Primary mono line never contains a bare 'XL' token (it's a pill now).
    const monoLine = container.querySelector('div.font-mono')
    expect(monoLine).not.toBeNull()
    expect(monoLine.textContent).not.toMatch(/\bXL\b/)
    // The pill still renders the XL signal, just on the secondary line.
    expect(container.querySelector('[data-pill="XL"]')).not.toBeNull()
  })
```

- [ ] **Step 2: Run test to verify behavior**

Run: `cd .claude/worktrees/tires-table-polish && npx vitest run src/components/tires/MarginTable.test.jsx`

Expected: pass (Task 2 already removed the XL push).

- [ ] **Step 3: Update mobile call site at line 724**

Find:

```jsx
              <span className="inline-flex min-w-0 items-start gap-1.5">
                <TireDescriptionCell description={row.description} />
              </span>
```

Replace with:

```jsx
              <span className="inline-flex min-w-0 items-start gap-1.5">
                <TireDescriptionCell
                  description={row.description}
                  pillTags={pillTagsFromRow(row)}
                />
              </span>
```

- [ ] **Step 4: Update desktop call site at line 824**

Find:

```jsx
            <span className="inline-flex min-w-0 items-start gap-1.5">
              <TireDescriptionCell description={row.description} />
            </span>
```

Replace with:

```jsx
            <span className="inline-flex min-w-0 items-start gap-1.5">
              <TireDescriptionCell
                description={row.description}
                pillTags={pillTagsFromRow(row)}
              />
            </span>
```

- [ ] **Step 5: Add the `pillTagsFromRow` helper**

Add this helper just above the `SidewallPill` component (around line 383):

```jsx
const PILL_TAG_SET = new Set(['XL', 'MS'])

function pillTagsFromRow(row) {
  const tags = Array.isArray(row?.derivedUseTags) ? row.derivedUseTags : []
  return tags.filter((t) => PILL_TAG_SET.has(t))
}
```

- [ ] **Step 6: Run vitest full suite**

Run: `cd .claude/worktrees/tires-table-polish && npx vitest run`

Expected: all tests pass. Snapshot updates only on tire rows that previously rendered an XL row — primary string drops " XL".

- [ ] **Step 7: Commit**

```bash
cd .claude/worktrees/tires-table-polish
git add src/components/tires/MarginTable.jsx src/components/tires/MarginTable.test.jsx
git commit -m "feat(tires): thread pillTags into both row call sites

pillTagsFromRow filters row.derivedUseTags down to the renderable
sidewall set ('XL', 'MS') and is passed to TireDescriptionCell on both
mobile-table and desktop-table render paths."
```

---

## Task 4: Sticky header solid-color bar

**Files:**
- Modify: `src/components/tires/MarginTable.jsx` (desktop thead container around line 1190 and mobile thead container around line 1275)

- [ ] **Step 1: Inspect both thead containers**

Run: `cd .claude/worktrees/tires-table-polish && grep -n "border-b border-zinc-800\|bg-zinc-900/9" src/components/tires/MarginTable.jsx | head -10`

Note the lines that wrap the header rows. There are two:

- Desktop header container: a `<div>` with classes including `border-b border-zinc-800` and a `bg-*` background, sitting just above the row map.
- Mobile header container at line ~1275: `border-b border-zinc-800 bg-zinc-900/90 py-2.5`.

Read each container's exact `className` so the next step is a clean find-and-replace.

- [ ] **Step 2: Apply sticky + bar styling on the desktop header**

For the desktop header `<div>` (find the one whose classes contain both `border-b border-zinc-800` and `bg-zinc-900` AND that is the parent of the SortButton row, near line 1190):

Add `sticky top-0 z-[14]` to its className. Change `bg-zinc-900/90` (or whatever the current bg is) to `bg-slate-900`. Change `border-b border-zinc-800` to `border-b-2 border-slate-700`.

Concrete: if the current line reads:

```jsx
            <div className="flex w-max min-w-full border-b border-zinc-800 bg-zinc-900/90 ..."
```

Replace with:

```jsx
            <div className="sticky top-0 z-[14] flex w-max min-w-full border-b-2 border-slate-700 bg-slate-900 ..."
```

(Preserve every other class — only the four named ones change.)

- [ ] **Step 3: Apply the same to the mobile header at line ~1275**

Find:

```jsx
            <div className="flex w-max min-w-full border-b border-zinc-800 bg-zinc-900/90 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-300 md:hidden">
```

Replace with:

```jsx
            <div className="sticky top-0 z-[14] flex w-max min-w-full border-b-2 border-slate-700 bg-slate-900 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-300 md:hidden">
```

- [ ] **Step 4: Manual smoke test**

Run: `cd .claude/worktrees/tires-table-polish && npm run dev`

Open the Tires page, scroll the catalog. Confirm:
- Header row stays glued to the top of the scroll container while rows scroll up under it.
- Header bg is solid (not translucent) — no row text bleed-through.
- The sticky-left checkbox column corner sits on top of the header (z-15/16 > z-14 — verify the corner cell looks correct).
- No layout shift; rows still align with header columns.

If the sticky element doesn't actually stick, the parent scroll container may not be the table host. In that case, check that the table host has `overflow-y-auto` (or `overflow-auto`) and a bounded height; sticky requires a scrollable ancestor. Do not introduce a new scroll container — adjust only if a clear miss exists.

- [ ] **Step 5: Run vitest full suite**

Run: `cd .claude/worktrees/tires-table-polish && npx vitest run`

Expected: pass. Snapshot updates may capture the new `sticky top-0 z-[14] ... bg-slate-900` classes — accept those updates.

- [ ] **Step 6: Commit**

```bash
cd .claude/worktrees/tires-table-polish
git add src/components/tires/MarginTable.jsx
git commit -m "feat(tires): sticky header solid-color bar

Both desktop and mobile-table header rows now stick to the top of the
scroll container with bg-slate-900 + border-b-2 border-slate-700.
Z-index 14 sits below the existing sticky-left checkbox column
(z-15/16) so the top-left corner intersection stays correct."
```

---

## Task 5: Brand-tinted row hover

**Files:**
- Modify: `src/components/tires/MarginTable.jsx:793-797` (desktop row container) and the mobile row container at line ~706

- [ ] **Step 1: Update the desktop row container at line ~793**

Find:

```jsx
    <div
      style={{ ...style, borderLeft: `8px solid ${brandColorCssVar(row.brand)}` }}
      data-brand={row.brand || ''}
      className={`box-border flex flex-col border-b border-zinc-800/80 bg-zinc-950/0 transition-colors duration-150 hover:bg-zinc-800/25 ${jumpHighlightClass}`}
    >
```

Replace with:

```jsx
    <div
      style={{
        ...style,
        borderLeft: `8px solid ${brandColorCssVar(row.brand)}`,
        '--row-brand-hover': `color-mix(in oklab, ${brandColorCssVar(row.brand)} 8%, transparent)`,
      }}
      data-brand={row.brand || ''}
      className={`box-border flex flex-col border-b border-zinc-800/80 bg-zinc-950/0 transition-colors duration-150 hover:bg-[var(--row-brand-hover)] ${jumpHighlightClass}`}
    >
```

(Three changes: the inline style gains `--row-brand-hover`; `hover:bg-zinc-800/25` is replaced with `hover:bg-[var(--row-brand-hover)]`. Keep the rest identical.)

- [ ] **Step 2: Update the mobile row container at line ~706**

Find:

```jsx
      <div
        style={style}
        className={`box-border flex flex-col border-b border-zinc-800/80 bg-zinc-950/0 transition-colors duration-150 hover:bg-zinc-800/25 ${jumpHighlightClass}`}
      >
```

Replace with:

```jsx
      <div
        style={{
          ...style,
          '--row-brand-hover': `color-mix(in oklab, ${brandColorCssVar(row.brand)} 8%, transparent)`,
        }}
        className={`box-border flex flex-col border-b border-zinc-800/80 bg-zinc-950/0 transition-colors duration-150 hover:bg-[var(--row-brand-hover)] ${jumpHighlightClass}`}
      >
```

- [ ] **Step 3: Manual visual smoke test**

Run: `cd .claude/worktrees/tires-table-polish && npm run dev`

Hover over rows of each brand. Confirm:
- Michelin rows tint navy on hover.
- BFGoodrich rows tint red.
- Uniroyal rows tint green.
- Tires with no brand fall back to a neutral zinc tint (via `--color-brand-default`).
- Tint is subtle (~8% opacity) — not loud.

If Uniroyal green looks too faint compared to Michelin navy, bump the `8%` constant to `10%` in both call sites and re-test.

- [ ] **Step 4: Run vitest full suite**

Run: `cd .claude/worktrees/tires-table-polish && npx vitest run`

Expected: pass. Snapshots may capture the new `--row-brand-hover` style and the `hover:bg-[var(...)]` class — accept those updates.

- [ ] **Step 5: Commit**

```bash
cd .claude/worktrees/tires-table-polish
git add src/components/tires/MarginTable.jsx
git commit -m "feat(tires): brand-tinted row hover

Each row exposes --row-brand-hover via inline style, computed via
color-mix from the row's brand color (already on the left edge strip).
Hover bg consumes the variable so Michelin rows tint navy, BFG red,
Uniroyal green. Tires without a brand fall through to
--color-brand-default and feel neutral, identical to the prior
zinc-800/25 treatment."
```

---

## Task 6: Lint, typecheck, bundle-size, full vitest

**Files:** none

- [ ] **Step 1: Lint**

Run: `cd .claude/worktrees/tires-table-polish && npm run lint`

Expected: clean.

- [ ] **Step 2: Bundle-size check**

Run: `cd .claude/worktrees/tires-table-polish && npm run build && npx size-limit`

Expected: tires page chunk under the 42 KB cap. If it breaches, inspect the report and either trim newly-added classes or bump the cap with a one-line note in `.size-limit.cjs`.

- [ ] **Step 3: Run full vitest one more time**

Run: `cd .claude/worktrees/tires-table-polish && npx vitest run`

Expected: green.

- [ ] **Step 4: Final manual eye-check**

`npm run dev`. Walk through:
- A row with XL only — pill renders, primary has no " XL".
- A row with M/S only — pill says "M/S" with cyan tint.
- A row with both — both pills render side by side.
- Header sticks while scrolling a long catalog.
- Row hover tints brand color (Michelin/BFG/Uniroyal each look distinct).
- Tab focus passes through pills without trapping (pills are not interactive).
- Mobile viewport (`<md`) renders correctly — pills visible, header still sticky.

- [ ] **Step 5: Final commit if anything was tweaked**

If you changed the opacity constant in Task 5 or bumped size-limit, commit those:

```bash
cd .claude/worktrees/tires-table-polish
git add -p
git commit -m "chore(tires): post-review polish tweaks"
```

If nothing changed, skip this step.

- [ ] **Step 6: Push branch**

```bash
cd .claude/worktrees/tires-table-polish
git push -u origin tires-table-polish
```

The branch is now ready to open as a PR via `superpowers:finishing-a-development-branch`.

---

## Verification checklist (final)

- All vitest tests green (`npx vitest run`)
- Lint clean (`npm run lint`)
- Bundle size under 42 KB for tires page (`npx size-limit`)
- XL pill renders, primary no longer contains literal "XL" for XL tires
- M/S pill renders for M/S-rated tires
- Both pills render together when both tags present
- Sticky header bar stays visible while catalog scrolls
- Brand-tinted hover distinct on Michelin / BFG / Uniroyal rows
- a11y pill labels read "Extra Load tire" / "Mud and Snow rated"
- Mobile-table renderer picks up the same pills + sticky header
