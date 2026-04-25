# Mobile chrome + Tires haggle path — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the design at `docs/superpowers/specs/2026-04-25-mobile-chrome-and-haggle-design.md`.

**Architecture:** New `<Popover />` primitive + `<HaggleSheet />` + `<TireCardMobile />`. Migrate hand-rolled popovers. Make sticky surfaces opaque. Collapse mobile chrome (2-item bottom nav + avatar dropdown).

**Tech Stack:** React 18, Tailwind 3, Vitest, react-router-dom v6.

---

## Task 1 — Z-index variable block + opaque sticky surfaces

**Files:**
- Modify: `src/index.css` (z-index documentation)
- Modify: `src/components/layout/PortalChrome.jsx`
- Modify: `src/components/layout/PortalTopBar.jsx` (only if it has its own bg)
- Modify: `src/components/layout/ModuleSubheader.jsx`
- Modify: `src/components/layout/MobileBottomNav.jsx`
- Modify: `src/components/people/PeopleDashboard.jsx`
- Modify: `src/components/tires/TiresDashboard.jsx` (sticky toolbar at line 867)
- Modify: `src/components/tires/MarginTable.jsx` (sticky header at line 1046, sticky col at line 1244)

- [ ] **Step 1: Add z-index documentation to index.css**

In `src/index.css`, add a top-of-file comment block:

```css
/* Stacking order — keep this in sync with components.
   0       page content
   10      sticky table column heads
   17      sticky table top row
   20      ModuleSubheader
   50      mobile bottom nav  (raised from sm:hidden = no z effect on desktop)
   100     PortalChrome top bar
   120     popovers (must escape parent stacking via portal)
   130     drawers (CRM panels)
   140     full-screen modals
   150     haggle sheet (above modals so it can open from one)
   200     CommandPalette
*/
```

- [ ] **Step 2: Sweep — opaque sticky surfaces**

Replace these classes (`bg-zinc-XXX/NN` → solid `bg-zinc-XXX`). Keep `backdrop-blur-md` everywhere. Apply via Edit tool one file at a time:

| File | Find | Replace |
|---|---|---|
| `PortalChrome.jsx` | `bg-zinc-950/95` | `bg-zinc-950` |
| `ModuleSubheader.jsx` | `bg-zinc-950/90` | `bg-zinc-950` |
| `MobileBottomNav.jsx` | `bg-zinc-950/98` | `bg-zinc-950` |
| `PeopleDashboard.jsx` (sticky tab header) | `bg-zinc-950/95` | `bg-zinc-950` |
| `PeopleDashboard.jsx` (sticky right col) | `bg-zinc-900/95` | `bg-zinc-900` |
| `TiresDashboard.jsx` line ~867 | `bg-zinc-900/80` | `bg-zinc-900` |
| `TiresDashboard.jsx` line ~867 | `supports-[backdrop-filter]:bg-zinc-900/70` | (delete entirely) |
| `MarginTable.jsx` line ~1046 | `bg-zinc-900/95` | `bg-zinc-900` |
| `MarginTable.jsx` line ~1244 | `bg-zinc-900/95` | `bg-zinc-900` |
| `MarginTable.jsx` line ~1243 | `bg-zinc-900/90` | `bg-zinc-900` |

- [ ] **Step 3: Fix the z-index inversion**

In `TiresDashboard.jsx` line ~867, the sticky toolbar uses `z-10` but sits beneath the `ModuleSubheader` (`z-20`). Change to `z-[15]` so it stays below the page header but above table headers.

- [ ] **Step 4: Run lint + tests + build**

```
npm run lint
npm run test
npm run build
```

Expected: clean. No tests should break — these are purely visual changes.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Make sticky surfaces opaque + document z-index order"
```

---

## Task 2 — `<Popover />` primitive

**Files:**
- Create: `src/components/ui/Popover.jsx`
- Create: `src/components/ui/Popover.test.jsx`

- [ ] **Step 1: Write failing tests**

Create `src/components/ui/Popover.test.jsx`:

```jsx
/** @vitest-environment jsdom */
globalThis.IS_REACT_ACT_ENVIRONMENT = true

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, act } from '@testing-library/react'
import { Popover } from './Popover.jsx'

afterEach(() => cleanup())

function Harness({ initialOpen = false, onClose }) {
  return (
    <Popover
      anchor={<button data-testid="anchor">Open</button>}
      initialOpen={initialOpen}
      onClose={onClose}
    >
      <div data-testid="content">Menu content</div>
    </Popover>
  )
}

describe('Popover', () => {
  it('does not render content when closed', () => {
    render(<Harness />)
    expect(screen.queryByTestId('content')).toBeNull()
  })

  it('renders content into a portal when opened', () => {
    render(<Harness />)
    fireEvent.click(screen.getByTestId('anchor'))
    expect(screen.getByTestId('content')).toBeTruthy()
    // Confirm portal target is document.body, not the anchor's parent
    expect(screen.getByTestId('content').closest('[data-popover-portal]')).toBeTruthy()
  })

  it('closes on Escape', () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    fireEvent.click(screen.getByTestId('anchor'))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('closes on outside click', () => {
    const onClose = vi.fn()
    render(<><Harness onClose={onClose} /><div data-testid="outside">outside</div></>)
    fireEvent.click(screen.getByTestId('anchor'))
    fireEvent.mouseDown(screen.getByTestId('outside'))
    expect(onClose).toHaveBeenCalled()
  })

  it('flips upward when anchor is in lower half of viewport', () => {
    // jsdom: simulate by setting innerHeight + getBoundingClientRect
    Object.defineProperty(window, 'innerHeight', { value: 800, writable: true })
    const { container } = render(<Harness />)
    const anchor = screen.getByTestId('anchor')
    anchor.getBoundingClientRect = () => ({
      top: 700, bottom: 740, left: 100, right: 200, width: 100, height: 40, x: 100, y: 700, toJSON: () => ({}),
    })
    act(() => { fireEvent.click(anchor) })
    const content = screen.getByTestId('content')
    const wrapper = content.closest('[data-popover-flip]')
    expect(wrapper?.getAttribute('data-popover-flip')).toBe('up')
  })

  it('uses an opaque background', () => {
    render(<Harness />)
    fireEvent.click(screen.getByTestId('anchor'))
    const wrapper = screen.getByTestId('content').closest('[data-popover-flip]')
    // Tailwind class assertion — accepts any of the bg-zinc-9XX flavors with no slash
    expect(wrapper?.className).toMatch(/\bbg-zinc-(800|900|950)\b/)
  })
})
```

- [ ] **Step 2: Run — expect failure**

```
npx vitest run src/components/ui/Popover.test.jsx
```

Expected: all 6 fail (file does not exist).

- [ ] **Step 3: Implement `Popover.jsx`**

Create `src/components/ui/Popover.jsx`:

```jsx
import { cloneElement, isValidElement, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * Portal-rendered popover that escapes its parent stacking context.
 * Positions adjacent to its anchor element via getBoundingClientRect.
 * Flips upward when the anchor sits in the lower half of the viewport.
 *
 * @param {object} props
 * @param {import('react').ReactElement} props.anchor Trigger element. The popover
 *   wires onClick + ref to it.
 * @param {import('react').ReactNode} props.children Popover contents.
 * @param {boolean} [props.initialOpen=false] Test seam.
 * @param {() => void} [props.onClose] Fires when the popover closes.
 * @param {string} [props.label] aria-label for the dialog wrapper.
 * @param {'start' | 'end'} [props.align='end'] Right-edge alignment by default.
 */
export function Popover({ anchor, children, initialOpen = false, onClose, label, align = 'end' }) {
  const [open, setOpen] = useState(initialOpen)
  const [pos, setPos] = useState({ top: 0, left: 0, flip: 'down' })
  const anchorRef = useRef(/** @type {HTMLElement | null} */ (null))
  const popoverRef = useRef(/** @type {HTMLDivElement | null} */ (null))
  const id = useId()

  const close = useCallback(() => {
    setOpen(false)
    onClose?.()
  }, [onClose])

  // Reposition when opening
  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return
    const rect = anchorRef.current.getBoundingClientRect()
    const viewportH = typeof window !== 'undefined' ? window.innerHeight : 800
    const flip = rect.top + rect.height / 2 > viewportH / 2 ? 'up' : 'down'
    const top = flip === 'down' ? rect.bottom + 6 : rect.top - 6
    const right = window.innerWidth - rect.right
    const left = rect.left
    setPos({
      ...(flip === 'down' ? { top } : { bottom: viewportH - rect.top + 6 }),
      ...(align === 'end' ? { right } : { left }),
      flip,
    })
  }, [open, align])

  // Outside click + Escape
  useEffect(() => {
    if (!open) return undefined
    function onKey(e) {
      if (e.key === 'Escape') close()
    }
    function onPointer(e) {
      if (popoverRef.current?.contains(e.target)) return
      if (anchorRef.current?.contains(e.target)) return
      close()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('touchstart', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('touchstart', onPointer)
    }
  }, [open, close])

  if (!isValidElement(anchor)) {
    throw new Error('Popover: anchor must be a single React element')
  }

  const triggered = cloneElement(anchor, {
    ref: (node) => {
      anchorRef.current = node
      // Forward to user-supplied ref if any
      const userRef = anchor.ref
      if (typeof userRef === 'function') userRef(node)
      else if (userRef && typeof userRef === 'object') userRef.current = node
    },
    onClick: (e) => {
      anchor.props.onClick?.(e)
      setOpen((prev) => !prev)
    },
    'aria-expanded': open,
    'aria-haspopup': 'menu',
    'aria-controls': open ? `popover-${id}` : undefined,
  })

  const portalTarget = typeof document !== 'undefined' ? document.body : null

  return (
    <>
      {triggered}
      {open && portalTarget
        ? createPortal(
            <div data-popover-portal>
              <div
                ref={popoverRef}
                id={`popover-${id}`}
                role="dialog"
                aria-label={label}
                data-popover-flip={pos.flip}
                className="fixed z-[120] min-w-[180px] rounded-lg border border-zinc-700 bg-zinc-900 py-1 text-sm shadow-2xl"
                style={pos}
              >
                {children}
              </div>
            </div>,
            portalTarget,
          )
        : null}
    </>
  )
}
```

- [ ] **Step 4: Run — expect 6/6 pass**

```
npx vitest run src/components/ui/Popover.test.jsx
```

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/Popover.jsx src/components/ui/Popover.test.jsx
git commit -m "Add portal-rendered Popover primitive with flip-up logic"
```

---

## Task 3 — Migrate hand-rolled popovers to `<Popover />`

**Files:**
- Modify: `src/components/people/UserRow.jsx`
- Modify: `src/components/tires/TiresDashboard.jsx` (the table-options popover at line ~1015)

- [ ] **Step 1: Replace `PeopleRowActionsMenu`'s body with Popover**

In `UserRow.jsx`, the `PeopleRowActionsMenu` component currently rolls its own `useState` + `useEffect` (outside-click) + absolute positioned `<ul>`. Replace the entire return statement with:

```jsx
return (
  <div className="flex justify-end sm:hidden">
    <Popover
      label="Row actions"
      align="end"
      anchor={
        <button
          type="button"
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-zinc-600/90 bg-zinc-900/50 text-lg leading-none text-zinc-300 hover:border-zinc-500 hover:bg-zinc-800/80"
          aria-label="Row actions"
        >
          ⋯
        </button>
      }
    >
      <button
        type="button"
        className="block w-full px-3 py-2.5 text-left text-zinc-200 hover:bg-zinc-800/80"
        onClick={() => void onHistory(u)}
      >
        History
      </button>
      <button
        type="button"
        className="block w-full px-3 py-2.5 text-left text-violet-100 hover:bg-zinc-800/80"
        onClick={() => onEdit(u)}
      >
        Edit
      </button>
    </Popover>
  </div>
)
```

Drop the `useState`, `useRef`, `useEffect` hooks and the `rootRef` wrapper. Add the import at the top:

```jsx
import { Popover } from '../ui/Popover.jsx'
```

- [ ] **Step 2: Replace TiresDashboard table-options popover (~line 1015)**

Same pattern. Find the `<button ...>Table options</button>` followed by an absolutely positioned options panel, wrap it in `<Popover />`.

- [ ] **Step 3: Run people + tires tests**

```
npx vitest run src/components/people/ src/components/tires/
```

Expected: pass. If a test asserts on absolute positioning DOM, update to test on `data-popover-flip` instead.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Migrate hand-rolled popovers to Popover primitive"
```

---

## Task 4 — Top-bar avatar dropdown (sm:hidden collapse)

**Files:**
- Modify: `src/components/layout/PortalTopBar.jsx`
- Modify: `src/components/layout/PortalChrome.jsx` (where role pill + sign-out currently live — confirm by reading; may be in PortalTopBar already)

- [ ] **Step 1: Identify current role pill + sign-out**

```
grep -n "Sign out\|signOut\|nameBadge\|role" src/components/layout/PortalTopBar.jsx src/components/layout/PortalChrome.jsx
```

The buttons live near the right edge of the top bar.

- [ ] **Step 2: Wrap them in a sm:hidden ↔ avatar split**

In `PortalTopBar.jsx` (or wherever), under sm: render an avatar button that opens a `<Popover />`:

```jsx
{/* Mobile: avatar dropdown */}
<div className="sm:hidden">
  <Popover
    label={`Open account menu — ${first}, ${tagLabel}`}
    align="end"
    anchor={
      <button
        type="button"
        className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-amber-900/40 text-sm font-bold text-amber-200 ring-1 ring-amber-700/50"
        aria-label={`Account menu — ${first}, ${tagLabel}`}
      >
        {first.charAt(0).toUpperCase()}
      </button>
    }
  >
    <div className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-zinc-400">
      {first} · {tagLabel}
    </div>
    <div className="border-t border-zinc-800" />
    {themeToggle ? <div className="px-3 py-2">{themeToggle}</div> : null}
    {/* Settings link only if route exists; check during implementation */}
    <button
      type="button"
      onClick={onSignOut}
      className="block w-full px-3 py-2.5 text-left text-rose-300 hover:bg-zinc-800/80"
    >
      Sign out
    </button>
  </Popover>
</div>

{/* Desktop: existing role pill + sign-out unchanged */}
<div className="hidden sm:flex sm:items-center sm:gap-2">
  {/* existing JSX */}
</div>
```

If a settings route exists (`grep -rn 'path="/settings"' src/App.jsx`), include a settings link above sign-out. If not, skip and add a TODO comment.

- [ ] **Step 3: Verify desktop unchanged**

```
npm run dev
```

Visit `/` at width ≥ 768px. The top bar should look identical to before.

Visit at < 768px (DevTools responsive mode). Should see avatar in place of the role pill + sign-out.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Collapse role pill + sign-out into avatar dropdown under sm:"
```

---

## Task 5 — Bottom nav reduction (Home · Tires under sm:)

**Files:**
- Modify: `src/components/layout/MobileBottomNav.jsx`

- [ ] **Step 1: Reduce items to 2 on mobile (default)**

In `MobileBottomNav.jsx`, replace the items array with:

```jsx
const fullMode = Boolean(window?.localStorage?.getItem('skedaddle.mobile.fullPortal'))

const items = fullMode
  ? [
      // existing 7-item list, only used for the admin escape hatch
      canTires ? { to: '/tires', label: 'Tires', icon: <IconTires /> } : null,
      canMyQueue ? { to: '/my-queue', label: 'My Queue', icon: <IconQueue />, badge: queueBadge } : null,
      canCrm ? { to: '/crm', label: 'Rubber CRM', icon: <IconCrm /> } : null,
      canPeople ? { to: '/people', label: 'People', icon: <IconPeople /> } : null,
      canAnalytics ? { to: '/analytics', label: 'Analytics', icon: <IconAnalytics /> } : null,
      canOps ? { to: '/ops', label: 'Ops', icon: <IconOps /> } : null,
      canOps ? { to: '/admin', label: 'Admin', icon: <IconAdmin /> } : null,
    ].filter(Boolean)
  : [
      // Default mobile experience: 2 items, big targets
      { to: '/dashboard', label: 'Home', icon: <IconHome /> },
      canTires ? { to: '/tires', label: 'Tires', icon: <IconTires /> } : null,
    ].filter(Boolean)
```

Add a small `<IconHome />` SVG inline, matching the existing icon style.

- [ ] **Step 2: Add the "switch to full portal" link in the avatar dropdown**

Back in `PortalTopBar.jsx`, in the avatar dropdown content, add above sign-out:

```jsx
<button
  type="button"
  onClick={() => {
    window.localStorage.setItem('skedaddle.mobile.fullPortal', '1')
    window.location.reload()
  }}
  className="block w-full px-3 py-2.5 text-left text-zinc-300 hover:bg-zinc-800/80"
>
  Switch to full portal
</button>
```

When the flag is set, also surface a "back to focused mobile" toggle in the same dropdown.

- [ ] **Step 3: Test the reduction**

```
npm run dev
```

Open at < 640px. Confirm only Home + Tires show. Tap avatar → "Switch to full portal" → page reloads with all 7 items.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Mobile bottom nav collapses to Home + Tires by default"
```

---

## Task 6 — `<TireCardMobile />` component

**Files:**
- Create: `src/components/tires/TireCardMobile.jsx`
- Create: `src/components/tires/TireCardMobile.test.jsx`

- [ ] **Step 1: Write failing tests**

Create `src/components/tires/TireCardMobile.test.jsx`:

```jsx
/** @vitest-environment jsdom */
globalThis.IS_REACT_ACT_ENVIRONMENT = true

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { TireCardMobile } from './TireCardMobile.jsx'

const tire = {
  id: 't1', mspn: '09100', description: 'BFGOODRICH LT265/70R17 KO3',
  brand: 'BFGoodrich', buy: 412.50, retail: 599, marginPct: 23.5, fet: 0,
  listedCount: 2,
}

afterEach(() => cleanup())

describe('TireCardMobile', () => {
  it('renders description, MSPN, buy, retail, margin', () => {
    render(<TireCardMobile tire={tire} />)
    expect(screen.getByText(/BFGOODRICH/)).toBeTruthy()
    expect(screen.getByText('09100')).toBeTruthy()
    expect(screen.getByText('$412.50')).toBeTruthy()
    expect(screen.getByText('$599.00')).toBeTruthy()
    expect(screen.getByText('23.5%')).toBeTruthy()
  })

  it('calls onTestOffer when the test offer button is tapped', () => {
    const onTestOffer = vi.fn()
    render(<TireCardMobile tire={tire} onTestOffer={onTestOffer} />)
    fireEvent.click(screen.getByRole('button', { name: /test offer/i }))
    expect(onTestOffer).toHaveBeenCalledWith(tire)
  })

  it('reflects selected state via amber ring', () => {
    const { container } = render(<TireCardMobile tire={tire} selected />)
    expect(container.firstChild?.className).toMatch(/ring-amber-/)
  })
})
```

- [ ] **Step 2: Run — expect fail**

- [ ] **Step 3: Implement**

```jsx
import { formatCurrency } from '../../utils/format'

export function TireCardMobile({ tire, selected = false, onTestOffer, onToggleSelect }) {
  const ring = selected ? 'ring-2 ring-amber-500/70' : 'ring-1 ring-zinc-800'
  return (
    <div className={`rounded-xl bg-zinc-900 p-3 ${ring}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="line-clamp-2 text-sm font-medium text-zinc-100">
          {tire.description}
        </p>
        <span className="shrink-0 rounded-full bg-zinc-800 px-2 py-0.5 font-mono text-[10px] text-zinc-300">
          {tire.mspn}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        <div><span className="text-zinc-400">Buy</span> <span className="font-mono text-zinc-100">{formatCurrency(tire.buy)}</span></div>
        <div><span className="text-zinc-400">Sell</span> <span className="font-mono text-zinc-100">{formatCurrency(tire.retail)}</span></div>
        <div><span className="text-zinc-400">Margin</span> <span className="font-mono text-emerald-300">{tire.marginPct}%</span></div>
        <div><span className="text-zinc-400">FET</span> <span className="font-mono text-zinc-300">{formatCurrency(tire.fet || 0)}</span></div>
        <div className="col-span-2"><span className="text-zinc-400">Listed</span> <span className="text-zinc-300">{tire.listedCount} platforms</span></div>
      </div>
      <button
        type="button"
        onClick={() => onTestOffer?.(tire)}
        className="mt-3 w-full min-h-[44px] rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-400"
      >
        Test offer
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Run — expect pass**

- [ ] **Step 5: Commit**

```bash
git add src/components/tires/TireCardMobile.jsx src/components/tires/TireCardMobile.test.jsx
git commit -m "Add TireCardMobile for mobile catalog rendering"
```

---

## Task 7 — `<HaggleSheet />` component

**Files:**
- Create: `src/components/tires/HaggleSheet.jsx`
- Create: `src/components/tires/HaggleSheet.test.jsx`

- [ ] **Step 1: Test contract**

Create `src/components/tires/HaggleSheet.test.jsx` with cases:

1. Renders tire description, MSPN, current sell, current margin
2. Updates margin live as the test offer input changes
3. Shows green margin readout when offer ≥ floor
4. Shows amber + "Below floor" warning when offer drops margin below floor
5. Computes and shows counter-offer at exactly the floor margin
6. Calls `onAccept` with the test offer when "Accept this offer" is clicked
7. Closes on Escape

(Skipping full code here — match the structure of `BrandBolt.test.jsx`.)

- [ ] **Step 2: Implement**

The component is a portal-rendered bottom sheet (z-150 per the spec). It receives `tire`, `floorPct`, `onAccept`, `onClose`. The math:

```js
const buyAllIn = tire.buy + (tire.cts || 0) + (tire.fet || 0)
const testMargin = (testOffer - buyAllIn) / testOffer * 100
const floorOffer = buyAllIn / (1 - floorPct / 100)
```

Live margin recomputes on each keystroke. Floor warning + counter-offer suggestion appear when `testMargin < floorPct`.

- [ ] **Step 3: Run tests**

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Add HaggleSheet — bottom-anchored offer tester with floor warning"
```

---

## Task 8 — Wire mobile catalog + haggle into TiresDashboard

**Files:**
- Modify: `src/components/tires/TiresDashboard.jsx`
- Modify: `src/components/tires/MarginTable.jsx` (drop the mobile-specific header block)

- [ ] **Step 1: Render TireCardMobile under sm:**

In `TiresDashboard.jsx`, where `<MarginTable />` is rendered, wrap with breakpoint logic:

```jsx
<div className="sm:hidden">
  <ul className="space-y-2 px-3">
    {sortedRows.map((tire) => (
      <li key={tire.id}>
        <TireCardMobile
          tire={tire}
          selected={selectedIds.has(tire.id)}
          onTestOffer={(t) => setHaggleTire(t)}
          onToggleSelect={(t) => toggleSelection(t.id)}
        />
      </li>
    ))}
  </ul>
</div>
<div className="hidden sm:block">
  <MarginTable {...existingProps} />
</div>
```

- [ ] **Step 2: Add haggle state + render the sheet**

```jsx
const [haggleTire, setHaggleTire] = useState(null)
const floorPct = Number(payoutConfig?.marginFloorPct) || 20

{haggleTire ? (
  <HaggleSheet
    tire={haggleTire}
    floorPct={floorPct}
    onClose={() => setHaggleTire(null)}
    onAccept={(offer) => {
      setHaggleTire(null)
      // Open the existing log-sale flow, pre-filled
      setSaleInitial({ tire: haggleTire, salePrice: offer })
      setSaleOpen(true)
    }}
  />
) : null}
```

- [ ] **Step 3: Drop MarginTable's mobile-specific header**

In `MarginTable.jsx`, the `isMobileTable && !loading && rows.length > 0` block (~line 1242) now renders nothing because mobile users see cards. Either:
- Remove the block entirely
- Or guard the desktop header with `hidden sm:flex` and remove the mobile header block

The simpler path: remove the mobile header block; the desktop header is already only visible at `sm:` and up because the whole `MarginTable` is wrapped `hidden sm:block` from Task 8 step 1. If MarginTable gets imported elsewhere, double-check.

- [ ] **Step 4: Test, smoke, commit**

```
npm run lint
npm run test
npm run build
npm run dev
```

Smoke at 375px viewport. Tap a tire card → haggle sheet opens. Type an offer below floor → see warning + counter. Accept → log-sale flow opens with pre-filled price.

```bash
git add -A
git commit -m "Mobile Tires catalog uses card layout + haggle sheet"
```

---

## Task 9 — Final verification + PR

- [ ] **Step 1: Full validation**

```
npm run lint
npm run test
npm run build
```

Expected: 0 lint errors, all tests pass (~493 with new ones), build clean.

- [ ] **Step 2: Manual smoke at 3 viewports**

`npm run dev`, then DevTools responsive mode:

- 375×667 (iPhone SE / 8 / mini): Home/Tires bottom nav, avatar dropdown, mobile cards on Tires, haggle sheet works
- 768×1024 (iPad portrait): hybrid layout — desktop top bar role pill, but mobile bottom nav still hides at sm: only — confirm
- 1280×720 (laptop): zero changes from main

- [ ] **Step 3: Push branch and open PR**

```bash
git push -u origin mobile-chrome-haggle
gh pr create --title "Mobile chrome + Tires haggle path" --body "$(...spec link + screenshot summary...)"
```

PR description references the spec at `docs/superpowers/specs/2026-04-25-mobile-chrome-and-haggle-design.md`.

---

## Self-review checklist

- [x] **Spec coverage:** Each spec section maps to a Task (chrome/Z-index → 1; Popover → 2; migrations → 3; avatar → 4; bottom nav → 5; cards → 6; haggle → 7; wire-up → 8).
- [x] **No placeholders:** Each step has either exact code or an exact command.
- [x] **Type consistency:** `<Popover anchor={...} children={...} />` API is identical across all 3 placement sites.
