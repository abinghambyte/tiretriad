# Brand bolt theme expansion — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface the purple lightning-bolt brand identity in product chrome (top bar, empty states, auth pages, advisor CTAs, fresh-sale moment) without changing existing color semantics.

**Architecture:** Add a single reusable `<BrandBolt />` SVG component plus 4 `bolt-*` Tailwind colors. Place the component at 6 locations across chrome, dashboard, auth, and CRUD CTAs. No data layer or routing changes. All work is dark-mode visual.

**Tech Stack:** React 18 + Tailwind 3 + Vitest + react-router-dom v6.

**Spec:** `docs/superpowers/specs/2026-04-24-brand-bolt-design.md`

---

## File structure

- **Create:** `src/components/ui/BrandBolt.jsx` — reusable SVG glyph with size/tone/className props
- **Create:** `src/components/ui/BrandBolt.test.jsx` — unit test for the three tones + size + a11y default
- **Modify:** `tailwind.config.js` — extend `colors.bolt` with primary/accent/highlight/spark
- **Modify:** `src/components/layout/PortalTopBar.jsx` — render bolt mark before breadcrumbs/wordmark, wrapped in Link to `/`
- **Modify:** `src/components/dashboard/Dashboard.jsx` — bolt above the "No orders yet" empty-state copy
- **Modify:** `src/components/dashboard/TopSellersCard.jsx` — bolt above the "No sales yet" empty-state copy
- **Modify:** `src/pages/HandshakePage.jsx` — bolt hero above the "SKEDADDLE" wordmark
- **Modify:** `src/pages/InvitePage.jsx` — same hero treatment in both wordmark spots (lines 248, 484)
- **Modify:** `src/components/tires/ListingGenerator.jsx` — leading bolt icon inside the "Post" CTA
- **Modify:** `src/components/tires/TiresDashboard.jsx` — leading bolt icon inside the "Log prospective sale" CTA
- **Modify:** `src/components/dashboard/TodayStrip.jsx` — fresh-sale ring + glow + trailing bolt when `daysSince <= 1`
- **Modify:** `src/components/dashboard/TodayStrip.test.jsx` — assert fresh-sale visual classes appear/disappear at boundary

---

## Task 1 — `BrandBolt` component + Tailwind tokens

**Files:**
- Create: `src/components/ui/BrandBolt.jsx`
- Create: `src/components/ui/BrandBolt.test.jsx`
- Modify: `tailwind.config.js` (add `colors.bolt`)

- [ ] **Step 1: Add Tailwind tokens**

In `tailwind.config.js`, under `theme.extend.colors`, add:

```js
bolt: {
  primary: '#7e14ff',
  accent: '#863bff',
  highlight: '#ede6ff',
  spark: '#47bfff',
},
```

- [ ] **Step 2: Write the failing test**

Create `src/components/ui/BrandBolt.test.jsx`:

```jsx
/** @vitest-environment jsdom */
globalThis.IS_REACT_ACT_ENVIRONMENT = true

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { BrandBolt } from './BrandBolt.jsx'

afterEach(() => cleanup())

describe('BrandBolt', () => {
  it('renders an svg with the brand-bolt test id', () => {
    const { getByTestId } = render(<BrandBolt />)
    const el = getByTestId('brand-bolt')
    expect(el.tagName.toLowerCase()).toBe('svg')
  })

  it('uses the size prop for width and height', () => {
    const { getByTestId } = render(<BrandBolt size={32} />)
    const el = getByTestId('brand-bolt')
    expect(el.getAttribute('width')).toBe('32')
    expect(el.getAttribute('height')).toBe('32')
  })

  it('reports the tone via data attribute', () => {
    const { getByTestId } = render(<BrandBolt tone="glow" />)
    expect(getByTestId('brand-bolt').dataset.tone).toBe('glow')
  })

  it('defaults tone to solid', () => {
    const { getByTestId } = render(<BrandBolt />)
    expect(getByTestId('brand-bolt').dataset.tone).toBe('solid')
  })

  it('is aria-hidden by default', () => {
    const { getByTestId } = render(<BrandBolt />)
    expect(getByTestId('brand-bolt').getAttribute('aria-hidden')).toBe('true')
  })

  it('drops aria-hidden when given an aria-label', () => {
    const { getByTestId } = render(<BrandBolt aria-label="Skedaddle" />)
    const el = getByTestId('brand-bolt')
    expect(el.getAttribute('aria-hidden')).toBeNull()
    expect(el.getAttribute('aria-label')).toBe('Skedaddle')
  })

  it('forwards className', () => {
    const { getByTestId } = render(<BrandBolt className="ml-2" />)
    expect(getByTestId('brand-bolt').classList.contains('ml-2')).toBe(true)
  })
})
```

- [ ] **Step 3: Run the test — expect failure**

```
npx vitest run src/components/ui/BrandBolt.test.jsx
```

Expected: all 7 tests fail because `BrandBolt.jsx` does not exist.

- [ ] **Step 4: Implement `BrandBolt.jsx`**

Create `src/components/ui/BrandBolt.jsx`:

```jsx
/**
 * Brand lightning-bolt glyph. Single source of truth for the Skedaddle
 * mark; consumers pick a size and tone. Path is a simplified flat-purple
 * version of public/favicon.svg (no gaussian blurs — those are expensive
 * in the DOM and would make every empty-state card more costly).
 *
 * @param {object} props
 * @param {number} [props.size=20] Pixel size for both width and height.
 * @param {'solid' | 'glow' | 'muted'} [props.tone='solid']
 * @param {string} [props.className]
 * @param {string} [props['aria-label']] If provided, the svg becomes
 *   focusable to assistive tech and aria-hidden is dropped.
 */
export function BrandBolt({
  size = 20,
  tone = 'solid',
  className = '',
  'aria-label': ariaLabel,
  ...rest
}) {
  const labelled = Boolean(ariaLabel)
  const fill =
    tone === 'muted' ? 'rgba(134, 59, 255, 0.45)' : '#7e14ff'
  const filter =
    tone === 'glow' ? 'drop-shadow(0 0 8px rgba(126, 20, 255, 0.5))' : undefined

  return (
    <svg
      data-testid="brand-bolt"
      data-tone={tone}
      width={size}
      height={size}
      viewBox="0 0 48 46"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden={labelled ? undefined : 'true'}
      aria-label={labelled ? ariaLabel : undefined}
      role={labelled ? 'img' : undefined}
      className={className}
      style={filter ? { filter } : undefined}
      {...rest}
    >
      <path
        d="M25.946 44.938c-.664.845-2.021.375-2.021-.698V33.937a2.26 2.26 0 0 0-2.262-2.262H10.287c-.92 0-1.456-1.04-.92-1.788l7.48-10.471c1.07-1.497 0-3.578-1.842-3.578H1.237c-.92 0-1.456-1.04-.92-1.788L10.013.474c.214-.297.556-.474.92-.474h28.894c.92 0 1.456 1.04.92 1.788l-7.48 10.471c-1.07 1.498 0 3.579 1.842 3.579h11.377c.943 0 1.473 1.088.89 1.83L25.947 44.94z"
        fill={fill}
      />
    </svg>
  )
}
```

- [ ] **Step 5: Run the test — expect pass**

```
npx vitest run src/components/ui/BrandBolt.test.jsx
```

Expected: 7/7 pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/BrandBolt.jsx src/components/ui/BrandBolt.test.jsx tailwind.config.js
git commit -m "Add reusable BrandBolt glyph + bolt-* Tailwind tokens"
```

---

## Task 2 — Top bar brand mark

**Files:**
- Modify: `src/components/layout/PortalTopBar.jsx`

- [ ] **Step 1: Add the import**

```jsx
import { BrandBolt } from '../ui/BrandBolt.jsx'
```

- [ ] **Step 2: Wrap the breadcrumb area with the mark**

Replace the existing `<nav aria-label="Breadcrumb" ...>` opening with a flex row that puts the bolt first, then the breadcrumb nav. The Link wraps the bolt only.

Find the section starting at line 30 (`<div className="mx-auto flex w-full max-w-6xl items-center gap-2 px-3 py-2.5 sm:px-4">`) and modify the immediate next child:

```jsx
<Link
  to="/"
  className="flex shrink-0 items-center rounded-md p-1 transition-colors hover:bg-zinc-800/40"
  aria-label="Skedaddle — go to dashboard"
>
  <BrandBolt size={18} tone="solid" aria-hidden />
</Link>
<nav aria-label="Breadcrumb" className="min-w-0 flex-1 overflow-hidden">
  {/* existing crumbs JSX unchanged */}
</nav>
```

The wrapping `<div>` already has `gap-2`, so the spacing between the bolt and the breadcrumb is automatic.

- [ ] **Step 3: Visual smoke test**

```
npm run dev
```

Load `/`. Confirm the purple bolt sits to the left of "Skedaddle". Click it — should reload `/` (no-op navigation, no console errors). Navigate to `/tires` and confirm the bolt still sits to the left of the "Tires" crumb.

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/PortalTopBar.jsx
git commit -m "Add brand bolt mark to top bar"
```

---

## Task 3 — Dashboard empty-state glyphs

**Files:**
- Modify: `src/components/dashboard/Dashboard.jsx`
- Modify: `src/components/dashboard/TopSellersCard.jsx`

- [ ] **Step 1: Recent Activity empty state**

In `Dashboard.jsx`, find the `EmptyState` rendered when `recentActivity.orders.length === 0` (search "No orders yet."). Replace:

```jsx
<EmptyState variant="compact" title="No orders yet." />
```

with:

```jsx
<EmptyState
  variant="compact"
  icon={<BrandBolt size={28} tone="muted" />}
  title="No orders yet."
/>
```

Add the import at the top of the file:

```jsx
import { BrandBolt } from '../ui/BrandBolt.jsx'
```

If `EmptyState` does not already accept an `icon` prop, fall back to wrapping it:

```jsx
<div className="flex flex-col items-center gap-2">
  <BrandBolt size={28} tone="muted" />
  <EmptyState variant="compact" title="No orders yet." />
</div>
```

(Read `src/components/ui/EmptyState.jsx` first — use the prop path if it's already there.)

- [ ] **Step 2: Top Sellers empty state**

In `TopSellersCard.jsx`, find the empty branch (`if (!sellers || sellers.length === 0)`) and add the bolt above the eyebrow:

```jsx
return (
  <div className="pc-card rounded-xl bg-zinc-900/60 p-[14px]">
    <p className="pc-eyebrow">Top Sellers</p>
    <div className="mt-2 flex items-center gap-2">
      <BrandBolt size={28} tone="muted" />
      <p className="text-sm text-zinc-400">No sales yet.</p>
    </div>
  </div>
)
```

Add the import:

```jsx
import { BrandBolt } from '../ui/BrandBolt.jsx'
```

- [ ] **Step 3: Run targeted tests**

```
npx vitest run src/components/dashboard/TopSellersCard.test.jsx
```

Expected: still passes (the empty-state assertion only checks for "No sales yet.", which is unchanged).

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/Dashboard.jsx src/components/dashboard/TopSellersCard.jsx
git commit -m "Add brand bolt to dashboard empty states"
```

---

## Task 4 — Auth / handshake hero

**Files:**
- Modify: `src/pages/HandshakePage.jsx`
- Modify: `src/pages/InvitePage.jsx`

- [ ] **Step 1: HandshakePage hero**

In `HandshakePage.jsx`, find the line `<p className="text-xs tracking-[0.35em] text-zinc-400">SKEDADDLE</p>` (~line 93). Wrap it in a flex column and add the bolt above:

```jsx
<div className="flex flex-col items-center gap-4">
  <BrandBolt size={56} tone="glow" aria-label="Skedaddle" />
  <p className="text-xs tracking-[0.35em] text-zinc-400">SKEDADDLE</p>
</div>
```

Add the import.

- [ ] **Step 2: InvitePage hero (two spots)**

In `InvitePage.jsx`, do the same wrap at line 248 and line 484. Both should match the HandshakePage layout exactly.

- [ ] **Step 3: Visual smoke test**

```
npm run dev
```

Visit `/handshake` (or whatever route renders these in dev — may need fixture). Confirm the glowing bolt sits above the wordmark with comfortable spacing and no layout shift below.

- [ ] **Step 4: Commit**

```bash
git add src/pages/HandshakePage.jsx src/pages/InvitePage.jsx
git commit -m "Add brand bolt hero to auth + handshake pages"
```

---

## Task 5 — Listing Advisor + prospective CTAs get a leading bolt

**Files:**
- Modify: `src/components/tires/ListingGenerator.jsx`
- Modify: `src/components/tires/TiresDashboard.jsx`

- [ ] **Step 1: ListingGenerator "Post" CTA**

Find the AI listing advisor block (~line 449) — the violet button that says "Post" or similar. Add a leading bolt inside the button:

```jsx
<button className="..." onClick={...}>
  <BrandBolt size={14} tone="solid" />
  Post it
</button>
```

The button already has `gap-2` from `inline-flex items-center gap-2`. If not, add `gap-2`.

- [ ] **Step 2: "Log prospective sale" CTA**

In `TiresDashboard.jsx` (~line 1127), the fuchsia "Log prospective sale" button. Same leading-bolt treatment:

```jsx
<button className="...">
  {loggingProspective ? <Spinner ... /> : <BrandBolt size={14} tone="solid" />}
  Log prospective sale
</button>
```

(Replace the spinner placement so the bolt sits in the spinner's slot when not loading.)

- [ ] **Step 3: Run targeted tests**

```
npx vitest run src/components/tires/
```

Expected: all tires tests pass (button DOM structure changes do not break behavioral assertions).

- [ ] **Step 4: Commit**

```bash
git add src/components/tires/ListingGenerator.jsx src/components/tires/TiresDashboard.jsx
git commit -m "Add leading brand bolt to advisor + prospective sale CTAs"
```

---

## Task 6 — Fresh-sale moment on the Last Sale card

**Files:**
- Modify: `src/components/dashboard/TodayStrip.jsx`
- Modify: `src/components/dashboard/TodayStrip.test.jsx`

- [ ] **Step 1: Add the failing test**

In `TodayStrip.test.jsx`, append:

```jsx
it('flags the hero as fresh when the last sale is within 24h', () => {
  renderStrip({
    lastSale: { amount: 500, completedAtMs: Date.now() - 6 * 60 * 60 * 1000 },
  })
  expect(screen.getByTestId('hero-last-sale').dataset.fresh).toBe('true')
})

it('leaves the hero non-fresh when the last sale is older than 24h', () => {
  renderStrip({
    lastSale: { amount: 500, completedAtMs: Date.now() - 2 * MS_PER_DAY },
  })
  expect(screen.getByTestId('hero-last-sale').dataset.fresh).toBe('false')
})
```

- [ ] **Step 2: Run — expect failure**

```
npx vitest run src/components/dashboard/TodayStrip.test.jsx
```

Expected: 2 new tests fail with `undefined === 'true'`.

- [ ] **Step 3: Implement**

In `TodayStrip.jsx`, add to the existing computed flags:

```jsx
const fresh = !loading && daysSince != null && daysSince <= 1
```

Then update the Link wrapping the hero card to add ring/shadow classes when `fresh`:

```jsx
<Link
  to="/orders?status=completed"
  className={[
    'pc-card rounded-xl bg-gradient-to-b from-emerald-500/10 to-transparent p-[14px] transition-colors hover:from-emerald-500/15',
    fresh ? 'ring-1 ring-violet-500/40 shadow-[0_0_20px_rgba(126,20,255,0.15)]' : '',
  ].join(' ')}
>
```

And on the existing `<p data-testid="hero-last-sale">`, add `data-fresh={fresh ? 'true' : 'false'}` and place a trailing bolt when fresh:

```jsx
<p
  data-testid="hero-last-sale"
  data-stale={stale ? 'true' : 'false'}
  data-fresh={fresh ? 'true' : 'false'}
  className="mt-1 flex items-baseline gap-2 text-[34px] font-bold tabular-nums tracking-[-0.02em] text-emerald-300"
>
  {formatCurrency(saleAmount)}
  {fresh ? <BrandBolt size={16} tone="glow" /> : null}
</p>
```

Add the import.

- [ ] **Step 4: Run — expect pass**

```
npx vitest run src/components/dashboard/TodayStrip.test.jsx
```

Expected: 10/10 pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/TodayStrip.jsx src/components/dashboard/TodayStrip.test.jsx
git commit -m "Last Sale card lights up violet when sale is within 24h"
```

---

## Task 7 — Verification + PR

- [ ] **Step 1: Lint + full test suite + build**

```
npm run lint
npm run test
npm run build
```

Expected: all clean, 480+ tests pass (existing 480 + 7 new BrandBolt + 2 new TodayStrip = 489).

- [ ] **Step 2: Visual smoke test**

```
npm run dev
```

Walk the surface manually:
- `/` — bolt in top-left, empty Recent Activity has bolt, empty Top Sellers has bolt
- `/handshake` — glowing bolt over wordmark
- `/tires` — Listing Advisor "Post" button has leading bolt; "Log prospective sale" has leading bolt
- Reload `/` after wiping orders — confirm Last Sale shows "No sales yet" without the violet ring

- [ ] **Step 3: Push branch + open PR**

```
git push -u origin brand-bolt-theme
gh pr create --title "Theme: surface the brand bolt across product chrome" --body "..."
```

PR body should reference the spec at `docs/superpowers/specs/2026-04-24-brand-bolt-design.md`.

---

## Self-review checklist

- [x] **Spec coverage:** Every numbered section in the spec maps to a Task above (1→Task 1, 2→Task 2, 3→Task 3, 4→Task 4, 5→Task 5, 6→Task 6).
- [x] **No placeholders:** Each step has either exact code or an exact command.
- [x] **Type consistency:** `<BrandBolt size={N} tone="..." />` API is identical across all 6 placement sites.
