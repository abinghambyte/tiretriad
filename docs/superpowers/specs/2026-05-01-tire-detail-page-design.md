# Tire detail page (v1) — design

**Status:** approved 2026-05-01 (auto mode)
**Branch target:** `tire-detail-page`
**Roadmap entry shipped:** *Product detail page with eFleet provenance* (Next).

## Goal

New per-SKU detail route `/tires/:mspn` showing the tire's identity, pricing block with eFleet provenance, current platform-listing state, and related sizes in the same tread family. Read-only. Operator clicks an MSPN cell in the catalog → lands on the detail page → uses Back to return to the highlighted catalog row.

## Non-goals (deferred from v1)

- **Posting history timeline.** Roadmap calls for "active platform listings + posting history". Today the data only carries `platformListings.{platform}.lastPostedAt` (single timestamp) — there's no append-only audit log of every post event. Adding that requires a new write path on every post + a backfill plan. Out of scope; v1 shows current state only.
- **Margin trend over 90 days.** Requires historical `priceIntel` snapshots that don't exist today. Adding a daily snapshot job + read path is its own piece of work.
- **AI listing advisor inline on the detail page.** The advisor already exists on the catalog row (`<ListingAdvisorPanel>`); duplicating it here adds surface without proving the detail page itself is useful first.
- **Inline edit fields.** Detail page is read-only. Operator edits via the existing catalog inline editors or Firestore Console.

## Architecture

```
src/pages/TireDetailPage.jsx                          NEW   route component
src/pages/TireDetailPage.test.jsx                     NEW
src/components/tires/detail/TireDetailHeader.jsx      NEW   brand-tinted hero
src/components/tires/detail/TireDetailHeader.test.jsx NEW
src/components/tires/detail/TirePricingCard.jsx       NEW   buy/retail/fet/margin + eFleet provenance
src/components/tires/detail/TirePricingCard.test.jsx  NEW
src/components/tires/detail/TirePlatformsCard.jsx     NEW   FB / OU / CL state
src/components/tires/detail/TirePlatformsCard.test.jsx NEW
src/components/tires/detail/TireRelatedSizes.jsx      NEW   tread-family grid
src/components/tires/detail/TireRelatedSizes.test.jsx NEW
src/components/tires/MarginTable.jsx                  MODIFY  wrap MSPN cells in <Link>
src/App.jsx                                           MODIFY  register /tires/:mspn route
```

### Route + entry

- New route: `/tires/:mspn`
- Entry: existing MSPN cells in `<MarginTable>` rows wrap in `<Link to={`/tires/${row.mspn}`}>` with hover styling. The cell click navigates; the row's other interactions (select checkbox, copy description, etc.) stay unchanged.
- Back link in detail header: `← Back to catalog` → `/tires?cat=<category>&highlight=<mspn>`. Reuses the existing `?highlight=` deep-link path so returning lands on the row.

### Component contracts

#### `<TireDetailHeader>`

```jsx
<TireDetailHeader tire={tire} backHref="/tires?cat=passenger&highlight=12345" />
```

- Brand-color left-edge strip (`brandColorCssVar(tire.brand)`)
- Brand pill + size string (`P255/55R18 109V`)
- Tread family + sidewall pills (`<SidewallPill tag="XL" />`, `<SidewallPill tag="MS" />`)
- MSPN, LR, category metadata line
- Back link rendered above the hero card

#### `<TirePricingCard>`

```jsx
<TirePricingCard tire={tire} efleetRecord={efleetRecord} efleetDate={efleetDate} />
```

- Four numeric rows: Buy, Retail (with confidence dot), FET, Margin
- Buy from `tireCatalogBuyNumber(tire)`
- Retail from `tireCatalogRetailNumber(tire)` + `tireRetailIsResearched` / `tireRetailIsEstimated` for the dot/styling
- Margin from `computeListingMargin(tire)`
- Provenance footer: "Source: Michelin eFleet ([efleetDate])" if `efleetRecord` present; else "Not from a known eFleet import"
- Drift line if `efleetRecord.price !== tire.price` or `efleetRecord.fet !== tire.fet`: e.g., "Portal price disagrees with eFleet ($182 vs $200)" — small info pill

#### `<TirePlatformsCard>`

```jsx
<TirePlatformsCard tire={tire} />
```

- Three rows: Facebook Marketplace / OfferUp / Craigslist
- Each row: platform name, `lastPostedAt` relative time, status (active / stale / never) using existing `listingStatus()` helper
- "Never posted" rendered in dim text; "active" in emerald; "stale" in amber (matches catalog row chips)

#### `<TireRelatedSizes>`

```jsx
<TireRelatedSizes currentTire={tire} relatedTires={relatedTires} />
```

- Grid of compact cards, each showing size string + MSPN + buy + margin
- Each card is a `<Link to={`/tires/${other.mspn}`}>`
- Empty state: when `relatedTires.length === 0`, the section is omitted entirely (don't render an empty heading)
- Sort: by `tireCatalogBuyNumber` ascending (cheapest first); ties by MSPN

### `TireDetailPage` shape

```jsx
export function TireDetailPage() {
  const { mspn } = useParams()
  const navigate = useNavigate()
  const [tire, setTire] = useState(null)
  const [categoryMap, setCategoryMap] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const { tires } = useTires()

  useEffect(() => {
    let cancelled = false
    setLoading(true)
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
  }, [mspn])

  if (loading) return <Spinner />
  if (error) return <ErrorState error={error} />
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

### Empty / error states

- **`tires/:mspn` doc doesn't exist:** `<TireNotFound mspn={mspn} />` renders "Tire 12345 not found" + a link back to `/tires`. Inline component or shared `<EmptyState>` if one exists in the codebase.
- **Firestore read fails:** `<ErrorState>` shows "Couldn't load this tire" + a Retry button (re-runs the effect via state bump).
- **`meta/categoryMap` missing:** detail still renders; eFleet provenance reads "Not from a known eFleet import".
- **Tire has no `tread`:** related-sizes section omitted (no heading).
- **Tire has no `platformListings`:** all three platform rows render "never posted".
- **Tire has no `priceIntel.retailPrice`:** Retail and Margin rows render `--`.

## Data flow

The page reads two Firestore docs on mount + one collection (already cached via `useTires`). No real-time subscriptions — the detail page is a snapshot view; if the operator made an edit, they refresh.

## Testing

Each component has a focused test:

- `TireDetailHeader`: brand color set; sidewall pills render when `derivedUseTags` includes XL/MS; back link href matches input prop
- `TirePricingCard`: all four rows render; eFleet provenance line shows when `efleetRecord` provided; drift line shows when `tire.price !== efleetRecord.price`; estimated retail gets the muted/italic treatment
- `TirePlatformsCard`: three rows always render; "never posted" when no `lastPostedAt`; relative time for posted; emerald/amber/zinc tint per `listingStatus`
- `TireRelatedSizes`: cards sorted by buy ascending; current tire excluded from list; each card is a link to its MSPN
- `TireDetailPage`: mocked Firestore returns happy path → renders all sections; mocked tire missing → renders `<TireNotFound>`; mocked categoryMap missing → eFleet provenance shows "not from a known eFleet import"

## Bundle impact

New code ~12 KB unminified, ~3 KB gzipped. Lands in its own `TireDetailPage` chunk via existing route-level lazy import pattern. Tires page chunk unchanged (the new components are NOT imported into MarginTable; the only catalog change is the `<Link>` wrap on the MSPN cell).

## Risks

- **MSPN as route param.** Most MSPNs are numeric strings (`12345`, `54802`). Special characters in MSPNs would need URL encoding. Today's catalog has no special chars; the spec assumes alphanumeric MSPNs.
- **Tread-family matching is exact-string.** `tire.tread === otherTire.tread`. Variations like `KO2` vs `All-Terrain T/A KO2` are NOT matched. Acceptable for v1; future enhancement: tokenized matching via a small util.
- **Stale data on back-navigation.** If operator edits a tire on a different surface, then comes back to detail, they see stale data until refresh. Acceptable for read-only v1.

## Out of scope

- Posting history timeline
- Margin trend chart
- AI listing advisor inline
- Inline edit
- Photo gallery beyond what `<TirePhotoGallery>` already provides on the catalog row (the detail page can render the gallery if useful, but v1 keeps the layout focused on data; defer photos to v2 if signal warrants)
