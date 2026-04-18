# Handoff 05 — Listing Management (replaces Dead Stock)

**After completing all steps and verifying the checklist, delete this file.**

---

## Context

Skedaddle is a just-in-time operation — no physical inventory is held. Tires in the catalog are a menu of sourceable SKUs, not stock on a shelf. The "dead stock" concept is therefore meaningless.

What actually matters is **listing activity** — is a tire currently advertised anywhere, when was it last posted, and does it need refreshing?

This handoff:
1. Removes all dead stock UI from the catalog
2. Adds a `platformListings` tracking field to tire docs (written from the portal, not a backend job)
3. Adds listing status indicators to catalog rows
4. Adds "Mark as posted" to the ListingGenerator
5. Adds a "Needs reposting" filter replacing "Dead stock only"
6. Disables the backend dead stock radar job (does not delete it)

---

## Firestore data model

Each tire doc gains a new field (written by the portal, no migration needed — absence = never posted):

```js
platformListings: {
  facebook:   { lastPostedAt: Timestamp | null },
  offerup:    { lastPostedAt: Timestamp | null },
  craigslist: { lastPostedAt: Timestamp | null },
}
```

**Stale threshold: 7 days.** A platform is considered stale if `lastPostedAt` is older than 7 days. Never posted = stale. Posted within 7 days = active.

---

## Part 1 — Remove dead stock from the catalog UI

### `src/components/tires/MarginTable.jsx`

- Remove the amber left border / `bg-amber-950/10` row tint applied when `row.deadStockFlag === true`
- Remove the amber dot indicator on the Description cell for dead stock rows
- Remove any `deadStockFlag` references in row rendering

### `src/components/tires/TiresDashboard.jsx`

- Remove `deadStockOnly` state variable
- Remove dead stock filtering logic from the filtered/sorted rows computation
- Remove `deadStockOnly` prop passed to `MarginFilters`

### `src/components/dashboard/Dashboard.jsx` — update signal card

The dashboard (Handoff 04) added a "Dead Stock" signal card that links to `/tires?deadStockOnly=true`. Replace it with a **"Needs Reposting"** card:

- **Label:** `Needs Reposting`
- **Data source:** Count of tires where ALL THREE platforms are stale or never posted. Use `getCountFromServer` if a composite index exists, otherwise fetch with `getDocs(collection(db, 'tires'), limit(2000))` and compute client-side using `listingStatus()`.
- **Color:** Amber if > 0, neutral if 0
- **Link:** `/tires?needsReposting=true`
- **Remove:** the old dead stock `getCountFromServer` query from `useDashboardSignals.js`

Also update `TiresDashboard.jsx` to read `?needsReposting=true` from the URL on mount (same pattern as `deadStockOnly` was reading `?deadStockOnly=1`).

### `src/components/tires/MarginFilters.jsx`

- Remove the "Dead stock only" checkbox and its label
- Remove `deadStockOnly` and `onDeadStockOnlyChange` props

### `src/components/tires/FilterPresetsBar.jsx`

- Remove `deadStockOnly` from preset snapshots and restore logic

---

## Part 2 — Listing status indicator in catalog rows

### `src/components/tires/MarginTable.jsx`

Add a new **Listing** column after the LR column (before Buy Price).

**Column header:** `Listed`

**Column width:** `6rem`

**Cell content:** Three compact platform badges in a row — `FB`, `OU`, `CL` — each color-coded:

| State | Color | Condition |
|-------|-------|-----------|
| Active | `text-emerald-400` | `lastPostedAt` within 7 days |
| Stale | `text-amber-500/70` | `lastPostedAt` older than 7 days |
| Never | `text-zinc-700` | `lastPostedAt` is null/missing |

Each badge is just 2-letter text, no background, tight spacing. Example:
```
FB  OU  CL
(emerald) (amber) (zinc)
```

On hover, show a tooltip with the actual date posted (e.g. "OfferUp — posted 3d ago") using the existing `timeAgo()` utility.

**Grid update:** Grid goes from 9 columns to 10. Add `5.5rem` for the Listed column. Update `minWidth` from `980` to `1068`. Update skeleton cell count to 10.

**Helper function** (add near top of file or in a utils file):

```js
const STALE_MS = 7 * 24 * 60 * 60 * 1000

export function listingStatus(tire, platform) {
  const ts = tire?.platformListings?.[platform]?.lastPostedAt
  if (!ts) return 'never'
  const ms = typeof ts.toMillis === 'function' ? ts.toMillis() : Number(ts)
  return Date.now() - ms < STALE_MS ? 'active' : 'stale'
}
```

---

## Part 3 — "Needs reposting" filter

### `src/components/tires/TiresDashboard.jsx`

Add `needsReposting` boolean state (default `false`).

Filter logic when `needsReposting === true`: show only tires where ALL THREE platforms are either `'never'` or `'stale'` — i.e. no platform has been posted within the last 7 days.

```js
if (needsReposting) {
  rows = rows.filter((t) =>
    ['facebook', 'offerup', 'craigslist'].every(
      (p) => listingStatus(t, p) !== 'active'
    )
  )
}
```

Pass `needsReposting` and `onNeedsRepostingChange` to `MarginFilters`.

### `src/components/tires/MarginFilters.jsx`

Replace the "Dead stock only" checkbox with a **"Needs reposting"** checkbox.

Label: `Needs reposting`
Helper text: `All platforms stale or never posted`

Same visual treatment as the old dead stock checkbox — top border, binary toggle, separated from the multi-select filters.

### `src/components/tires/FilterPresetsBar.jsx`

Replace `deadStockOnly` with `needsReposting` in preset snapshots and restore logic.

---

## Part 4 — "Mark as posted" in ListingGenerator

### `src/components/tires/ListingGenerator.jsx`

After listing copy is generated for a tire, show per-platform "Mark as posted" buttons.

**Where to add:** In the generated listing output area for each tire, below the copy text.

**UI:** A row of three small buttons — one per platform:

```
[✓ Mark FB posted]  [✓ Mark OU posted]  [✓ Mark CL posted]
```

Each button:
- On click: writes to Firestore `tires/{tireId}` → `platformListings.{platform}.lastPostedAt = serverTimestamp()`
- Shows a brief "Posted ✓" confirmation state for 2 seconds then resets
- If already posted within 7 days: shows "FB — posted Xd ago" as a muted label instead of a button (still clickable to re-mark)

**Firestore write:**
```js
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../../firebase/config'

async function markPosted(tireId, platform) {
  await updateDoc(doc(db, 'tires', tireId), {
    [`platformListings.${platform}.lastPostedAt`]: serverTimestamp(),
  })
}
```

**State per tire:** Track `{ [tireId]: { facebook: 'idle'|'saving'|'done', offerup: ..., craigslist: ... } }` — reset 'done' back to 'idle' after 2 seconds.

---

## Part 5 — Disable dead stock backend job

### `functions/index.js`

Find the `deadStockRadar` scheduled Cloud Function export. Comment it out with a note:

```js
// Dead stock radar disabled — Skedaddle is just-in-time, no held inventory.
// Replaced by manual listing tracking (platformListings on tire docs).
// exports.deadStockRadar = onSchedule(...)
```

Do NOT delete the function file (`functions/phase5Scheduled.js`) — just disable the export so Firebase stops scheduling it.

---

## Part 6 — Update CSV export

### `src/utils/exportMarginCsv.js`

Add three columns after LR:
- `FB Last Posted` — formatted date or "Never"
- `OU Last Posted` — formatted date or "Never"  
- `CL Last Posted` — formatted date or "Never"

Helper:
```js
function fmtPosted(ts) {
  if (!ts) return 'Never'
  const d = typeof ts.toDate === 'function' ? ts.toDate() : new Date(ts)
  return d.toLocaleDateString('en-US')
}
```

---

## Verification checklist

- [ ] No dead stock indicators anywhere in the catalog (no amber row tints, no dots)
- [ ] "Dead stock only" filter gone, replaced by "Needs reposting"
- [ ] Listed column visible in catalog with FB/OU/CL badges color-coded correctly
- [ ] Active (posted <7d) = emerald, Stale = amber, Never = dim grey
- [ ] "Needs reposting" filter correctly shows tires with no active platform listings
- [ ] ListingGenerator shows "Mark as posted" buttons per platform after copy is generated
- [ ] Clicking "Mark as posted" writes to Firestore and shows confirmation
- [ ] Dead stock radar job commented out in functions/index.js
- [ ] CSV export includes three listing date columns
- [ ] Grid updated to 10 columns, minWidth 1068, skeleton 10 cells
- [ ] `npm run lint` passes
- [ ] `npm run build` passes

---

**Delete this file once all checklist items are confirmed.**
