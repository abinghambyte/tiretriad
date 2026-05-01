# Tire detail page (v1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** New `/tires/:mspn` route with header, pricing card, platforms card, and related-sizes grid. Read-only v1; defers posting history + margin trend per spec.

**Architecture:** Four small presentational components + a route page that owns Firestore reads. MarginTable's MSPN cell becomes a `<Link>` to the detail page. Reuses existing helpers (`brandColorCssVar`, `tireCatalogBuyNumber`, `computeListingMargin`, `listingStatus`, `SidewallPill`).

**Tech Stack:** React 19, react-router-dom, Tailwind v4, Vitest + `@testing-library/react`.

**Spec:** `docs/superpowers/specs/2026-05-01-tire-detail-page-design.md`

**Worktree:** `.claude/worktrees/tire-detail-page` (branch `tire-detail-page`)

---

## File map

| File | Change | Responsibility |
|---|---|---|
| `src/components/tires/detail/TireDetailHeader.jsx` | Create | Brand-tinted hero card |
| `src/components/tires/detail/TireDetailHeader.test.jsx` | Create | Tests |
| `src/components/tires/detail/TirePricingCard.jsx` | Create | Buy/Retail/FET/Margin + eFleet provenance |
| `src/components/tires/detail/TirePricingCard.test.jsx` | Create | Tests |
| `src/components/tires/detail/TirePlatformsCard.jsx` | Create | FB/OU/CL state |
| `src/components/tires/detail/TirePlatformsCard.test.jsx` | Create | Tests |
| `src/components/tires/detail/TireRelatedSizes.jsx` | Create | Tread-family grid |
| `src/components/tires/detail/TireRelatedSizes.test.jsx` | Create | Tests |
| `src/pages/TireDetailPage.jsx` | Create | Route component |
| `src/pages/TireDetailPage.test.jsx` | Create | Integration tests with mocked Firestore |
| `src/App.jsx` | Modify | Register `/tires/:mspn` |
| `src/components/tires/MarginTable.jsx` | Modify | Wrap MSPN cell in `<Link>` |

---

## Task 1: `TireDetailHeader`

**Files:**
- Create: `src/components/tires/detail/TireDetailHeader.jsx`
- Create: `src/components/tires/detail/TireDetailHeader.test.jsx`

- [ ] **Step 1: Write the failing tests**

Create `src/components/tires/detail/TireDetailHeader.test.jsx`:

```jsx
/** @vitest-environment jsdom */
import { describe, expect, it, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { TireDetailHeader } from './TireDetailHeader.jsx'

afterEach(cleanup)

const baseTire = {
  id: '12345',
  mspn: '12345',
  brand: 'MICHELIN',
  description: 'P255/55R18 109V Pilot Sport AS 4',
  tread: 'Pilot Sport AS 4',
  category: 'passenger',
  lr: '',
  derivedUseTags: ['XL'],
}

function withRouter(ui) {
  return <MemoryRouter>{ui}</MemoryRouter>
}

describe('TireDetailHeader', () => {
  it('renders the brand and MSPN', () => {
    const { container } = render(withRouter(<TireDetailHeader tire={baseTire} backHref="/tires" />))
    expect(container.textContent).toContain('MICHELIN')
    expect(container.textContent).toContain('12345')
  })

  it('renders the tread family', () => {
    const { container } = render(withRouter(<TireDetailHeader tire={baseTire} backHref="/tires" />))
    expect(container.textContent).toContain('Pilot Sport AS 4')
  })

  it('renders sidewall pills from derivedUseTags filtered to XL/MS', () => {
    const tire = { ...baseTire, derivedUseTags: ['XL', 'MS', 'AT'] }
    const { container } = render(withRouter(<TireDetailHeader tire={tire} backHref="/tires" />))
    expect(container.querySelector('[data-pill="XL"]')).not.toBeNull()
    expect(container.querySelector('[data-pill="MS"]')).not.toBeNull()
    // AT is not a sidewall pill, should not render as a pill
    expect(container.querySelector('[data-pill="AT"]')).toBeNull()
  })

  it('renders the back link with the provided href', () => {
    const { container } = render(withRouter(<TireDetailHeader tire={baseTire} backHref="/tires?cat=passenger&highlight=12345" />))
    const link = container.querySelector('a')
    expect(link).not.toBeNull()
    expect(link.getAttribute('href')).toBe('/tires?cat=passenger&highlight=12345')
  })

  it('shows -- when LR is empty', () => {
    const { container } = render(withRouter(<TireDetailHeader tire={baseTire} backHref="/tires" />))
    expect(container.textContent).toMatch(/LR.*--/)
  })

  it('shows the LR letter when present', () => {
    const tire = { ...baseTire, lr: 'E' }
    const { container } = render(withRouter(<TireDetailHeader tire={tire} backHref="/tires" />))
    expect(container.textContent).toMatch(/LR.*E/)
  })
})
```

- [ ] **Step 2: Verify failure**

`cd .claude/worktrees/tire-detail-page && npx vitest run src/components/tires/detail/TireDetailHeader.test.jsx`

- [ ] **Step 3: Implement**

Create `src/components/tires/detail/TireDetailHeader.jsx`:

```jsx
import { Link } from 'react-router-dom'
import { brandColorCssVar } from '../../../utils/brandColor.js'
import { TireDescriptionCell } from '../MarginTable.jsx'

const SIDEWALL_TAGS = new Set(['XL', 'MS'])

const CATEGORY_LABELS = {
  passenger: 'Passenger',
  lightTruck: 'Light Truck',
  truck: 'Truck',
}

/**
 * Hero card for the tire detail page. Brand-color left edge, sidewall pills
 * via the existing TireDescriptionCell rendering path, MSPN + LR + category
 * metadata line, back link to the catalog.
 */
export function TireDetailHeader({ tire, backHref }) {
  const sidewallTags = Array.isArray(tire?.derivedUseTags)
    ? tire.derivedUseTags.filter((t) => SIDEWALL_TAGS.has(t))
    : []
  const lr = String(tire?.lr ?? '').trim() || '--'
  const categoryLabel = CATEGORY_LABELS[tire?.category] || '--'
  const brandColor = brandColorCssVar(tire?.brand)
  return (
    <div>
      <Link
        to={backHref}
        className="mb-3 inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200"
      >
        <span aria-hidden>←</span> Back to catalog
      </Link>
      <section
        className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 sm:p-6"
        style={{ borderLeftWidth: '6px', borderLeftColor: brandColor }}
      >
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span
            className="text-xs font-semibold uppercase tracking-wide"
            style={{ color: brandColor }}
          >
            {String(tire?.brand || '--')}
          </span>
          <span className="text-[11px] text-zinc-500">MSPN {String(tire?.mspn ?? '--')}</span>
          <span className="text-[11px] text-zinc-500">·</span>
          <span className="text-[11px] text-zinc-500">LR {lr}</span>
          <span className="text-[11px] text-zinc-500">·</span>
          <span className="text-[11px] text-zinc-500">{categoryLabel}</span>
        </div>
        <div className="mt-2">
          <TireDescriptionCell description={tire?.description} pillTags={sidewallTags} />
        </div>
      </section>
    </div>
  )
}
```

- [ ] **Step 4: Run tests + commit**

```bash
cd .claude/worktrees/tire-detail-page
npx vitest run src/components/tires/detail/TireDetailHeader.test.jsx
git add src/components/tires/detail/TireDetailHeader.jsx src/components/tires/detail/TireDetailHeader.test.jsx
git commit -m "feat(tires): TireDetailHeader for /tires/:mspn

Brand-tinted hero card. Reuses TireDescriptionCell for the size +
tread + sidewall-pill render so the detail page and the catalog row
share one visual model. Back link goes to a deep-linked catalog row
via ?cat=&highlight=."
```

---

## Task 2: `TirePricingCard`

**Files:**
- Create: `src/components/tires/detail/TirePricingCard.jsx`
- Create: `src/components/tires/detail/TirePricingCard.test.jsx`

- [ ] **Step 1: Write the failing tests**

Create `src/components/tires/detail/TirePricingCard.test.jsx`:

```jsx
/** @vitest-environment jsdom */
import { describe, expect, it, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { TirePricingCard } from './TirePricingCard.jsx'

afterEach(cleanup)

const baseTire = {
  id: '12345',
  mspn: '12345',
  brand: 'MICHELIN',
  description: 'P255/55R18 109V',
  price: 100,
  fet: 0,
  priceIntel: { retailPrice: 200, sources: [{ source: 'gemini_retail_search' }] },
}

describe('TirePricingCard', () => {
  it('renders Buy / Retail / FET / Margin rows', () => {
    const { container } = render(<TirePricingCard tire={baseTire} efleetRecord={null} efleetDate={null} />)
    expect(container.textContent).toContain('Buy')
    expect(container.textContent).toContain('Retail')
    expect(container.textContent).toContain('FET')
    expect(container.textContent).toContain('Margin')
    expect(container.textContent).toMatch(/\$100/)
    expect(container.textContent).toMatch(/\$200/)
  })

  it('renders eFleet provenance when efleetRecord + efleetDate provided', () => {
    const ef = { fet: 0, price: 100, brand: 'MICHELIN', description: '...', lr: '', tread: '...' }
    const { container } = render(
      <TirePricingCard tire={baseTire} efleetRecord={ef} efleetDate="2026-04-29" />,
    )
    expect(container.textContent).toContain('Michelin eFleet')
    expect(container.textContent).toContain('2026-04-29')
  })

  it('renders the not-from-eFleet message when no efleetRecord', () => {
    const { container } = render(<TirePricingCard tire={baseTire} efleetRecord={null} efleetDate={null} />)
    expect(container.textContent).toMatch(/not from a known eFleet import/i)
  })

  it('renders a drift line when portal price differs from eFleet price', () => {
    const ef = { fet: 0, price: 150, brand: 'MICHELIN', description: '...', lr: '', tread: '...' }
    const { container } = render(
      <TirePricingCard tire={baseTire} efleetRecord={ef} efleetDate="2026-04-29" />,
    )
    expect(container.textContent).toMatch(/eFleet/)
    expect(container.textContent).toMatch(/disagrees/i)
  })

  it('renders Retail as -- when no priceIntel.retailPrice', () => {
    const tire = { ...baseTire, priceIntel: {} }
    const { container } = render(<TirePricingCard tire={tire} efleetRecord={null} efleetDate={null} />)
    expect(container.textContent).toMatch(/Retail.*--/s)
  })

  it('renders Margin as -- when no retail', () => {
    const tire = { ...baseTire, priceIntel: {} }
    const { container } = render(<TirePricingCard tire={tire} efleetRecord={null} efleetDate={null} />)
    expect(container.textContent).toMatch(/Margin.*--/s)
  })
})
```

- [ ] **Step 2: Verify failure**

`cd .claude/worktrees/tire-detail-page && npx vitest run src/components/tires/detail/TirePricingCard.test.jsx`

- [ ] **Step 3: Implement**

Create `src/components/tires/detail/TirePricingCard.jsx`:

```jsx
import { tireCatalogBuyNumber } from '../../../utils/tireCatalogBuy.js'
import { tireCatalogRetailNumber, tireRetailIsResearched, tireRetailIsEstimated } from '../../../utils/tireCatalogRetail.js'
import { computeListingMargin } from '../../../utils/marginCalc.js'
import { formatCurrency } from '../../../utils/format.js'

function fmtNum(n) {
  return Number.isFinite(n) && n > 0 ? formatCurrency(n) : '--'
}

function fmtPct(n) {
  return Number.isFinite(n) ? `${n.toFixed(1)}%` : '--'
}

function row(label, value, valueClass = 'font-mono text-zinc-200') {
  return (
    <div className="flex items-baseline justify-between border-b border-zinc-800/60 py-1.5 last:border-b-0">
      <dt className="text-xs uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className={`text-sm ${valueClass}`}>{value}</dd>
    </div>
  )
}

export function TirePricingCard({ tire, efleetRecord, efleetDate }) {
  const buy = tireCatalogBuyNumber(tire)
  const retail = tireCatalogRetailNumber(tire)
  const researched = tireRetailIsResearched(tire)
  const estimated = tireRetailIsEstimated(tire)
  const margin = computeListingMargin(tire)
  const fet = Number(tire?.fet) || 0

  const retailClass = estimated
    ? 'font-mono italic text-amber-300/70'
    : researched
      ? 'font-mono font-semibold text-cyan-200/90'
      : 'font-mono text-zinc-200'

  const portalPrice = Number(tire?.price) || 0
  const efleetPrice = Number(efleetRecord?.price) || 0
  const drift = efleetRecord && Math.abs(portalPrice - efleetPrice) > 0.01

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 sm:p-6">
      <h2 className="mb-3 text-sm font-semibold text-zinc-100">Pricing</h2>
      <dl>
        {row('Buy', fmtNum(buy))}
        {row('Retail', fmtNum(retail), retailClass)}
        {row('FET', fmtNum(fet))}
        {row('Margin', fmtPct(margin))}
      </dl>
      <div className="mt-4 border-t border-zinc-800 pt-3 text-xs">
        {efleetRecord ? (
          <>
            <p className="text-zinc-400">
              Source: <span className="text-zinc-200">Michelin eFleet</span>
              {efleetDate ? <span className="text-zinc-500"> ({efleetDate})</span> : null}
            </p>
            {drift ? (
              <p className="mt-1 inline-block rounded bg-amber-950/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-300">
                Portal price disagrees with eFleet (${portalPrice.toFixed(2)} vs ${efleetPrice.toFixed(2)})
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-zinc-500">Not from a known eFleet import.</p>
        )}
      </div>
    </section>
  )
}
```

- [ ] **Step 4: Run tests + commit**

```bash
cd .claude/worktrees/tire-detail-page
npx vitest run src/components/tires/detail/TirePricingCard.test.jsx
git add src/components/tires/detail/TirePricingCard.jsx src/components/tires/detail/TirePricingCard.test.jsx
git commit -m "feat(tires): TirePricingCard with eFleet provenance

Buy / Retail / FET / Margin rows reusing the catalog helpers.
Estimated-retail row gets the same italic amber treatment as the
catalog cell. eFleet provenance footer shows Michelin eFleet
[date]; if no efleetRecord, renders 'Not from a known eFleet
import'. Drift pill surfaces when portal price disagrees with
eFleet price."
```

---

## Task 3: `TirePlatformsCard`

**Files:**
- Create: `src/components/tires/detail/TirePlatformsCard.jsx`
- Create: `src/components/tires/detail/TirePlatformsCard.test.jsx`

- [ ] **Step 1: Write the failing tests**

Create `src/components/tires/detail/TirePlatformsCard.test.jsx`:

```jsx
/** @vitest-environment jsdom */
import { describe, expect, it, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { TirePlatformsCard } from './TirePlatformsCard.jsx'

afterEach(cleanup)

describe('TirePlatformsCard', () => {
  it('renders all three platform names always', () => {
    const { container } = render(<TirePlatformsCard tire={{}} />)
    expect(container.textContent).toMatch(/Facebook/i)
    expect(container.textContent).toMatch(/OfferUp/i)
    expect(container.textContent).toMatch(/Craigslist/i)
  })

  it('shows "never posted" when no platformListings', () => {
    const { container } = render(<TirePlatformsCard tire={{}} />)
    const neverCount = container.textContent.match(/never posted/gi)?.length || 0
    expect(neverCount).toBeGreaterThanOrEqual(3)
  })

  it('shows relative time when lastPostedAt is set', () => {
    const tire = {
      platformListings: {
        facebook: { lastPostedAt: Date.now() - 5 * 86400000 },
      },
    }
    const { container } = render(<TirePlatformsCard tire={tire} />)
    expect(container.textContent).toMatch(/d ago|days ago/)
  })

  it('renders an active status pill when listingStatus returns active', () => {
    // Recent post
    const tire = {
      platformListings: {
        facebook: { lastPostedAt: Date.now() - 1000 * 60 * 60 },
      },
    }
    const { container } = render(<TirePlatformsCard tire={tire} />)
    const fbRow = [...container.querySelectorAll('[data-platform]')].find(
      (n) => n.getAttribute('data-platform') === 'facebook',
    )
    expect(fbRow).not.toBeNull()
    expect(fbRow.getAttribute('data-status')).toBe('active')
  })
})
```

- [ ] **Step 2: Verify failure**

`cd .claude/worktrees/tire-detail-page && npx vitest run src/components/tires/detail/TirePlatformsCard.test.jsx`

- [ ] **Step 3: Implement**

Create `src/components/tires/detail/TirePlatformsCard.jsx`:

```jsx
import { listingStatus } from '../../../utils/listingStatus.js'
import { timeAgo } from '../../../utils/timeAgo.js'

const PLATFORMS = [
  { key: 'facebook', label: 'Facebook Marketplace' },
  { key: 'offerup', label: 'OfferUp' },
  { key: 'craigslist', label: 'Craigslist' },
]

function statusToneClass(status) {
  if (status === 'active') return 'bg-emerald-950/40 text-emerald-300'
  if (status === 'stale') return 'bg-amber-950/40 text-amber-300'
  return 'bg-zinc-900 text-zinc-500'
}

export function TirePlatformsCard({ tire }) {
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 sm:p-6">
      <h2 className="mb-3 text-sm font-semibold text-zinc-100">Platform listings</h2>
      <ul className="space-y-2">
        {PLATFORMS.map((p) => {
          const ts = tire?.platformListings?.[p.key]?.lastPostedAt
          const status = listingStatus(tire, p.key)
          const ago = ts ? timeAgo(ts) : null
          return (
            <li
              key={p.key}
              data-platform={p.key}
              data-status={status}
              className="flex items-center justify-between gap-3 text-sm"
            >
              <span className="text-zinc-200">{p.label}</span>
              <span className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${statusToneClass(status)}`}>
                {ts ? `${status} · ${ago || 'recently'}` : 'never posted'}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
```

- [ ] **Step 4: Run tests + commit**

```bash
cd .claude/worktrees/tire-detail-page
npx vitest run src/components/tires/detail/TirePlatformsCard.test.jsx
git add src/components/tires/detail/TirePlatformsCard.jsx src/components/tires/detail/TirePlatformsCard.test.jsx
git commit -m "feat(tires): TirePlatformsCard with FB/OU/CL state

Three rows always render. listingStatus drives active/stale/never
classification; tone matches the catalog's row chips
(emerald/amber/zinc). Lastposted relative time appended when
present. data-platform + data-status hooks for tests."
```

---

## Task 4: `TireRelatedSizes`

**Files:**
- Create: `src/components/tires/detail/TireRelatedSizes.jsx`
- Create: `src/components/tires/detail/TireRelatedSizes.test.jsx`

- [ ] **Step 1: Write the failing tests**

Create `src/components/tires/detail/TireRelatedSizes.test.jsx`:

```jsx
/** @vitest-environment jsdom */
import { describe, expect, it, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { TireRelatedSizes } from './TireRelatedSizes.jsx'

afterEach(cleanup)

const mkTire = (overrides) => ({
  id: '12345',
  mspn: '12345',
  brand: 'MICHELIN',
  description: 'P255/55R18 109V',
  tread: 'Pilot Sport AS 4',
  price: 200,
  ...overrides,
})

function withRouter(ui) {
  return <MemoryRouter>{ui}</MemoryRouter>
}

describe('TireRelatedSizes', () => {
  it('sorts by buy ascending', () => {
    const current = mkTire({ id: 'A', mspn: 'A' })
    const related = [
      mkTire({ id: 'B', mspn: 'B', price: 300 }),
      mkTire({ id: 'C', mspn: 'C', price: 100 }),
      mkTire({ id: 'D', mspn: 'D', price: 200 }),
    ]
    const { container } = render(withRouter(<TireRelatedSizes currentTire={current} relatedTires={related} />))
    const cards = container.querySelectorAll('[data-related-card]')
    expect(cards[0].getAttribute('data-mspn')).toBe('C')
    expect(cards[1].getAttribute('data-mspn')).toBe('D')
    expect(cards[2].getAttribute('data-mspn')).toBe('B')
  })

  it('each card links to its detail page', () => {
    const current = mkTire({ id: 'A', mspn: 'A' })
    const related = [mkTire({ id: 'B', mspn: 'B', price: 100 })]
    const { container } = render(withRouter(<TireRelatedSizes currentTire={current} relatedTires={related} />))
    const link = container.querySelector('a[data-related-card]')
    expect(link.getAttribute('href')).toBe('/tires/B')
  })

  it('renders the count in the heading', () => {
    const current = mkTire({ id: 'A', mspn: 'A' })
    const related = [mkTire({ id: 'B', mspn: 'B' }), mkTire({ id: 'C', mspn: 'C' })]
    const { container } = render(withRouter(<TireRelatedSizes currentTire={current} relatedTires={related} />))
    expect(container.textContent).toMatch(/2/)
    expect(container.textContent).toMatch(/Pilot Sport AS 4/)
  })
})
```

- [ ] **Step 2: Verify failure**

`cd .claude/worktrees/tire-detail-page && npx vitest run src/components/tires/detail/TireRelatedSizes.test.jsx`

- [ ] **Step 3: Implement**

Create `src/components/tires/detail/TireRelatedSizes.jsx`:

```jsx
import { Link } from 'react-router-dom'
import { tireCatalogBuyNumber } from '../../../utils/tireCatalogBuy.js'
import { computeListingMargin } from '../../../utils/marginCalc.js'
import { formatCurrency } from '../../../utils/format.js'

function fmtCurrency(n) {
  return Number.isFinite(n) && n > 0 ? formatCurrency(n) : '--'
}

function fmtPct(n) {
  return Number.isFinite(n) ? `${n.toFixed(0)}%` : '--'
}

export function TireRelatedSizes({ currentTire, relatedTires }) {
  const sorted = [...relatedTires].sort((a, b) => {
    const ab = tireCatalogBuyNumber(a) || 0
    const bb = tireCatalogBuyNumber(b) || 0
    if (ab !== bb) return ab - bb
    return String(a.mspn).localeCompare(String(b.mspn))
  })
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold text-zinc-100">
        Other sizes in {currentTire.tread}{' '}
        <span className="text-zinc-500">({sorted.length})</span>
      </h2>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {sorted.map((t) => {
          const buy = tireCatalogBuyNumber(t)
          const margin = computeListingMargin(t)
          return (
            <li key={t.id}>
              <Link
                data-related-card
                data-mspn={t.mspn}
                to={`/tires/${encodeURIComponent(t.mspn)}`}
                className="block rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 transition-colors hover:border-amber-600/40 hover:bg-zinc-900"
              >
                <p className="font-mono text-xs text-zinc-300">{t.description}</p>
                <p className="mt-1 text-[10px] uppercase tracking-wide text-zinc-500">MSPN {t.mspn}</p>
                <div className="mt-2 flex items-baseline justify-between text-xs">
                  <span className="font-mono text-zinc-200">{fmtCurrency(buy)}</span>
                  <span className="font-mono text-emerald-300">{fmtPct(margin)}</span>
                </div>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
```

- [ ] **Step 4: Run tests + commit**

```bash
cd .claude/worktrees/tire-detail-page
npx vitest run src/components/tires/detail/TireRelatedSizes.test.jsx
git add src/components/tires/detail/TireRelatedSizes.jsx src/components/tires/detail/TireRelatedSizes.test.jsx
git commit -m "feat(tires): TireRelatedSizes grid

Compact card grid of other tires in the same tread family. Sorted
by buy ascending, ties by MSPN. Each card links to its own detail
page. Heading shows count + tread name."
```

---

## Task 5: `TireDetailPage` route + 404 + App.jsx wiring

**Files:**
- Create: `src/pages/TireDetailPage.jsx`
- Create: `src/pages/TireDetailPage.test.jsx`
- Modify: `src/App.jsx`

- [ ] **Step 1: Write the failing test**

Create `src/pages/TireDetailPage.test.jsx`:

```jsx
/** @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({})),
  getDoc: vi.fn(),
}))
vi.mock('../firebase/config', () => ({ db: {} }))
vi.mock('../hooks/useTires', () => ({ useTires: () => ({ tires: [], loading: false }) }))

import { getDoc } from 'firebase/firestore'
import { TireDetailPage } from './TireDetailPage.jsx'

afterEach(cleanup)

beforeEach(() => {
  getDoc.mockReset()
})

function withRouter(mspn) {
  return (
    <MemoryRouter initialEntries={[`/tires/${mspn}`]}>
      <Routes>
        <Route path="/tires/:mspn" element={<TireDetailPage />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('TireDetailPage', () => {
  it('renders all sections on happy path', async () => {
    getDoc
      .mockResolvedValueOnce({
        exists: () => true,
        id: '12345',
        data: () => ({
          mspn: '12345',
          brand: 'MICHELIN',
          description: 'P255/55R18 109V Pilot Sport AS 4',
          tread: 'Pilot Sport AS 4',
          category: 'passenger',
          price: 100,
          fet: 0,
          priceIntel: { retailPrice: 200, sources: [{ source: 'gemini_retail_search' }] },
          platformListings: {},
        }),
      })
      .mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ records: { '12345': { fet: 0, price: 100, brand: 'MICHELIN', description: '...', lr: '', tread: '...' } }, sourceReportDate: '2026-04-29' }),
      })
    const { container } = render(withRouter('12345'))
    await waitFor(() => expect(container.textContent).toContain('Pricing'))
    expect(container.textContent).toContain('MICHELIN')
    expect(container.textContent).toContain('12345')
    expect(container.textContent).toContain('Platform listings')
    expect(container.textContent).toContain('Michelin eFleet')
  })

  it('renders not-found when tire doc missing', async () => {
    getDoc
      .mockResolvedValueOnce({ exists: () => false })
      .mockResolvedValueOnce({ exists: () => false })
    const { container } = render(withRouter('99999'))
    await waitFor(() => expect(container.textContent).toContain('not found'))
    expect(container.textContent).toContain('99999')
  })

  it('renders without eFleet provenance when categoryMap missing', async () => {
    getDoc
      .mockResolvedValueOnce({
        exists: () => true,
        id: '12345',
        data: () => ({
          mspn: '12345',
          brand: 'MICHELIN',
          description: 'P255/55R18 109V',
          price: 100,
          priceIntel: {},
          platformListings: {},
        }),
      })
      .mockResolvedValueOnce({ exists: () => false })
    const { container } = render(withRouter('12345'))
    await waitFor(() => expect(container.textContent).toContain('not from a known eFleet import'))
  })
})
```

- [ ] **Step 2: Verify failure**

`cd .claude/worktrees/tire-detail-page && npx vitest run src/pages/TireDetailPage.test.jsx`

- [ ] **Step 3: Implement**

Create `src/pages/TireDetailPage.jsx`:

```jsx
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useTires } from '../hooks/useTires'
import Spinner from '../components/ui/Spinner.jsx'
import { TireDetailHeader } from '../components/tires/detail/TireDetailHeader.jsx'
import { TirePricingCard } from '../components/tires/detail/TirePricingCard.jsx'
import { TirePlatformsCard } from '../components/tires/detail/TirePlatformsCard.jsx'
import { TireRelatedSizes } from '../components/tires/detail/TireRelatedSizes.jsx'

function TireNotFound({ mspn }) {
  return (
    <main className="mx-auto max-w-5xl px-6 py-12 text-center">
      <h1 className="text-lg font-semibold text-zinc-100">Tire {mspn} not found</h1>
      <p className="mt-2 text-sm text-zinc-400">
        It may have been removed from the catalog. Use the catalog to find an active SKU.
      </p>
      <Link
        to="/tires"
        className="mt-6 inline-flex items-center rounded-lg border border-zinc-600 px-4 py-2 text-sm font-medium text-zinc-100 hover:border-amber-600/40 hover:bg-zinc-900"
      >
        ← Back to catalog
      </Link>
    </main>
  )
}

function TireLoadError({ onRetry }) {
  return (
    <main className="mx-auto max-w-5xl px-6 py-12 text-center">
      <h1 className="text-lg font-semibold text-zinc-100">Couldn't load this tire</h1>
      <p className="mt-2 text-sm text-zinc-400">Network or permission error.</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-6 inline-flex items-center rounded-lg border border-zinc-600 px-4 py-2 text-sm font-medium text-zinc-100 hover:border-amber-600/40 hover:bg-zinc-900"
      >
        Retry
      </button>
    </main>
  )
}

export function TireDetailPage() {
  const { mspn } = useParams()
  const [tire, setTire] = useState(null)
  const [categoryMap, setCategoryMap] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)
  const { tires } = useTires()

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    Promise.all([
      getDoc(doc(db, 'tires', mspn)),
      getDoc(doc(db, 'meta', 'categoryMap')),
    ])
      .then(([t, c]) => {
        if (cancelled) return
        setTire(t.exists() ? { id: t.id, ...t.data() } : null)
        setCategoryMap(c.exists() ? c.data() : null)
      })
      .catch((err) => {
        if (!cancelled) setError(err)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [mspn, reloadKey])

  if (loading) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-12 text-center">
        <Spinner className="h-6 w-6" />
      </main>
    )
  }
  if (error) return <TireLoadError onRetry={() => setReloadKey((k) => k + 1)} />
  if (!tire) return <TireNotFound mspn={mspn} />

  const efleetRecord = categoryMap?.records?.[mspn] ?? null
  const efleetDate = categoryMap?.sourceReportDate ?? null
  const relatedTires = tire.tread
    ? tires.filter((t) => t.tread === tire.tread && t.id !== tire.id)
    : []
  const backHref = `/tires?cat=${tire.category || 'all'}&highlight=${encodeURIComponent(tire.id)}`

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <main className="mx-auto max-w-5xl space-y-6 px-6 py-8 sm:py-10">
        <TireDetailHeader tire={tire} backHref={backHref} />
        <div className="grid gap-4 md:grid-cols-2">
          <TirePricingCard tire={tire} efleetRecord={efleetRecord} efleetDate={efleetDate} />
          <TirePlatformsCard tire={tire} />
        </div>
        {relatedTires.length > 0 ? (
          <TireRelatedSizes currentTire={tire} relatedTires={relatedTires} />
        ) : null}
      </main>
    </div>
  )
}
```

- [ ] **Step 4: Register route in `src/App.jsx`**

Find the existing `/tires` route. Add a parallel `<Route path="/tires/:mspn" ...>` route using the same wrappers (e.g., `ProtectedRoute`). Add the lazy import beside the existing `TiresPage` import:

```jsx
const TireDetailPage = lazy(() => import('./pages/TireDetailPage').then((m) => ({ default: m.TireDetailPage })))
```

Then in the routes:

```jsx
<Route
  path="/tires/:mspn"
  element={
    <ProtectedRoute>
      <TireDetailPage />
    </ProtectedRoute>
  }
/>
```

(Match the existing route's exact wrapper pattern; read the file first to confirm.)

- [ ] **Step 5: Run tests + commit**

```bash
cd .claude/worktrees/tire-detail-page
npx vitest run src/pages/TireDetailPage.test.jsx
git add src/pages/TireDetailPage.jsx src/pages/TireDetailPage.test.jsx src/App.jsx
git commit -m "feat(tires): /tires/:mspn detail route

TireDetailPage owns the two getDoc reads (tire + categoryMap) plus
the cached useTires() collection for related-sizes filtering. Loading
spinner + retry-on-error + 404 paths handled inline. Three sections
(header / pricing / platforms / related-sizes-when-applicable) wired
to the components shipped in earlier tasks."
```

---

## Task 6: Wrap MSPN cell in `<Link>` in `MarginTable`

**Files:**
- Modify: `src/components/tires/MarginTable.jsx`

- [ ] **Step 1: Add the Link import**

In `src/components/tires/MarginTable.jsx` near the top, ensure `Link` is imported from `react-router-dom`:

```jsx
import { Link } from 'react-router-dom'
```

(Check imports first — `Link` may already be imported elsewhere in the file. If yes, skip.)

- [ ] **Step 2: Wrap each MSPN cell**

Find the existing MSPN cell render in both the desktop and mobile-table row paths. The cell typically looks like:

```jsx
<div className="...">{row.mspn || '--'}</div>
```

Wrap the MSPN value in a `<Link>`:

```jsx
<div className="...">
  {row.mspn ? (
    <Link
      to={`/tires/${encodeURIComponent(row.mspn)}`}
      className="hover:text-amber-300 hover:underline"
    >
      {row.mspn}
    </Link>
  ) : (
    '--'
  )}
</div>
```

(If multiple MSPN cells render in the file — desktop, mobile, header — only wrap the data-row cells, NOT the header label.)

- [ ] **Step 3: Run vitest**

`cd .claude/worktrees/tire-detail-page && npx vitest run src/`

Expected: existing tests pass; if a snapshot in `MarginTable.test.jsx` captures the MSPN cell shape, accept the diff (only the MSPN cell markup changed).

- [ ] **Step 4: Commit**

```bash
cd .claude/worktrees/tire-detail-page
git add src/components/tires/MarginTable.jsx
git commit -m "feat(tires): MSPN cell links to detail page

Each row's MSPN cell now navigates to /tires/:mspn on click. Other
row interactions (select checkbox, copy description, sort, etc.)
remain unchanged."
```

---

## Task 7: Lint, bundle, full vitest, manual eye-check

**Files:** none

- [ ] **Step 1: Lint**

`cd .claude/worktrees/tire-detail-page && npm run lint`

Expected: 0 errors.

- [ ] **Step 2: Bundle**

`cd .claude/worktrees/tire-detail-page && npm run build && npx size-limit`

Expected: tires page chunk under 47 KB. New TireDetailPage chunk lands separately and isn't capped today; if size-limit complains about a new chunk, leave it (uncapped pages are not a regression).

- [ ] **Step 3: Full vitest**

`cd .claude/worktrees/tire-detail-page && npx vitest run src/`

Expected: green.

- [ ] **Step 4: Manual eye-check**

`npm run dev`. Sign in. Navigate to `/tires`. Click an MSPN cell.

- Detail page loads with header, pricing, platforms, related-sizes
- Brand-color left edge matches the tire's brand
- Sidewall pills render for XL / MS tires
- eFleet provenance shows for tires that came from the import
- Drift pill shows when portal price disagrees with eFleet (try MSPN 54802 if it's still in your catalog)
- "Not from a known eFleet import" shows for tires that have no record (rare)
- Back link returns to catalog with the row highlighted
- Click a related-size card → navigates to its detail page
- Hit `/tires/00000` (or any non-existent MSPN) → 404 state with back-to-catalog link

- [ ] **Step 5: Hold for user direction on push**

Do NOT push without user confirmation. Stop here, report status, and wait.

---

## Verification checklist

- All vitest tests green (`npx vitest run src/`)
- Lint clean
- Bundle within caps
- `/tires/:mspn` reachable
- MSPN cell on catalog rows links to detail
- Back link returns to catalog with row highlighted
- 4 sections render when data is present (header / pricing / platforms / related)
- Related sizes section omitted when 0 matches
- 404 state for missing MSPN
- eFleet drift pill renders when prices disagree

---

## Out of scope

- Posting history timeline
- Margin trend chart
- AI listing advisor inline
- Inline edit
- Photo gallery
