---
id: 502
title: Analytics Wall — date-range presets + sensible default
branch: analytics-wall-presets
depends_on: []
touches_shared:
  - src/pages/AnalyticsPage.jsx
frontend_only: true
---

# Patch 502 — Analytics Wall date presets

The Wall tab on `/analytics` requires manual `mm/dd/yyyy` entry before any data appears. On first load the inputs are empty, so the page shows "No completions in this range" until the admin types two dates. That's a usability regression — most analytics dashboards default to "Last 30 days" and offer one-click presets.

## Branch

`analytics-wall-presets`

## Scope

Modify `src/pages/AnalyticsPage.jsx` Wall tab body. No new files, no shared utility extraction.

## Design

Add a row of preset chips above (or to the right of) the From/To/Min revenue inputs:

```
[ Today ]  [ 7d ]  [ 30d ]  [ 90d ]  [ YTD ]  [ All time ]   |   From: ___  To: ___  Min revenue: 0
```

Clicking a preset:
- Populates From + To with the appropriate ISO date strings
- Triggers the existing data fetch (probably already wired to the date-range state)

Default behavior on first load: select "30d" (Last 30 days). The user can still override by typing custom dates or clicking another preset.

```jsx
const PRESETS = [
  { id: 'today', label: 'Today', daysBack: 0 },
  { id: '7d', label: '7d', daysBack: 7 },
  { id: '30d', label: '30d', daysBack: 30, default: true },
  { id: '90d', label: '90d', daysBack: 90 },
  { id: 'ytd', label: 'YTD', kind: 'year-to-date' },
  { id: 'all', label: 'All time', kind: 'all' },
]

function applyPreset(preset, setFrom, setTo) {
  const today = new Date()
  const todayYmd = today.toISOString().slice(0, 10)
  if (preset.kind === 'all') {
    setFrom('')
    setTo('')
    return
  }
  if (preset.kind === 'year-to-date') {
    setFrom(`${today.getFullYear()}-01-01`)
    setTo(todayYmd)
    return
  }
  const back = new Date(today)
  back.setDate(back.getDate() - (preset.daysBack || 0))
  setFrom(back.toISOString().slice(0, 10))
  setTo(todayYmd)
}
```

```jsx
// In the Wall tab JSX, above the existing input row:
<div className="flex flex-wrap items-center gap-2 text-xs">
  {PRESETS.map((p) => (
    <button
      key={p.id}
      type="button"
      onClick={() => applyPreset(p, setFrom, setTo)}
      className={`rounded-full border px-3 py-1 font-medium ${
        activePreset === p.id
          ? 'border-amber-500 bg-amber-500/10 text-amber-100'
          : 'border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:bg-zinc-800/60'
      }`}
    >
      {p.label}
    </button>
  ))}
</div>
```

## Tasks

- [ ] `cd` into the worktree, `npm ci`
- [ ] Read `src/pages/AnalyticsPage.jsx` Wall tab body to understand current From/To state management
- [ ] Add the PRESETS constant + applyPreset helper
- [ ] Add the chip row above the existing input row
- [ ] On mount, default to the 30d preset (call applyPreset for the default preset in a useEffect)
- [ ] Track `activePreset` state so the chip highlights its active preset
- [ ] Verify lint, test, build, visual smoke
- [ ] Single commit: `Analytics Wall: add date-range presets + default to last 30 days`
- [ ] Open PR

## Out of scope

- Replacing the From/To inputs entirely with a date-range picker (separate UX overhaul)
- Adding presets to the other Analytics tabs (Metrics / Revenue / Leaderboard / Margin archive) — they have their own date logic, separate concern
- Custom preset definitions (admin-configurable)

## Acceptance criteria

- 6 preset chips render above the From/To inputs on the Wall tab
- Clicking a preset populates From + To and triggers the existing data fetch
- "30d" is selected by default on first load
- Active preset is visually highlighted (amber border + tinted bg)
- Custom date entry still works and clears the active-preset indicator
- Lint + tests + build clean

## Validation

```
npm run lint
npm run test
npm run build
```

Manual smoke at desktop and mobile: open `/analytics`, verify Wall tab shows last-30-days data on first load, click each preset and confirm date inputs update.

## PR title

`Analytics Wall: add date-range presets + default to last 30 days`

Execute this brief exactly. Branch from main, run all validation commands before opening the PR, and stop after the PR is open.
