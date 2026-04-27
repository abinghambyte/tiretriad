---
patch: 625
title: CRM Kanban UI rebuild — new stage labels + drag zones + Park picker + filters + metrics
status: ready-to-dispatch
priority: P1 — biggest UX impact in the CRM rebuild
depends_on: [624]
spec: docs/superpowers/specs/2026-04-27-crm-rebuild-design.md
batch: crm-rebuild
---

# patch-625 — CRM Kanban UI rebuild

Frontend-heavy patch. Lands the visible CRM redesign on top of the schema migration in patch-624. Single PR.

## Files touched

- `src/pages/CrmPage.jsx` — major surgery: column labels, drag zones, filter row, metrics in subheader
- `src/components/crm/CrmKanbanColumn.jsx` — **new** — single column component used by both the board layout and accordion mobile layout
- `src/components/crm/CrmKanbanCard.jsx` — **new** — card renderer with the 5 fields (name / source badge / last touch / est value / owner avatar)
- `src/components/crm/CrmDragZones.jsx` — **new** — three bottom-of-screen drop zones (Lost / Won / Park) visible only during drag
- `src/components/crm/ParkDurationPicker.jsx` — **new** — popover with 7d / 30d / 60d / 90d / custom radio-button picker
- `src/components/crm/NewLeadModal.jsx` — **new** — replaces existing inline form
- `functions/cleanupCrmParked.js` — **new** — hourly cron that resurfaces parked leads
- `functions/computeCrmStats.js` — **new** — periodic conversion-rate computation; cached on `meta/crmStats`
- `src/utils/crmPipeline.js` — flip the displayed labels to v3 (UI side)
- `src/components/layout/ModuleSubheader.jsx` — extend to accept right-aligned content slot for the metrics strip
- Tests: per-component, plus an integration test for the drag → drop → archive flow

## DnD library

Use the existing primitive in the codebase. Likely `dnd-kit` on React 19 (verify via `package.json` first; if missing, install `@dnd-kit/core` + `@dnd-kit/sortable`). **Do NOT introduce a new DnD library.**

## Drag zones — implementation skeleton

```jsx
// CrmDragZones.jsx
export function CrmDragZones({ activeDragCardId, onDropLost, onDropWon, onDropPark }) {
  if (!activeDragCardId) return null

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex justify-around gap-3 border-t border-zinc-800 bg-zinc-950/95 px-4 py-3 backdrop-blur-md max-sm:flex-col">
      <DropZone
        droppableId="lost-zone"
        className="bg-rose-950/60 border-rose-800/60"
        onDrop={onDropLost}
        label="Lost"
        sublabel="archive with reason"
      />
      <DropZone
        droppableId="won-zone"
        className="bg-emerald-950/60 border-emerald-800/60"
        onDrop={onDropWon}
        label="Won → Customer"
        sublabel="convert and archive"
      />
      <DropZone
        droppableId="park-zone"
        className="bg-amber-950/60 border-amber-800/60"
        onDrop={onDropPark}
        label="Park"
        sublabel="resurface later"
      />
    </div>
  )
}
```

## Park picker

When card lands on Park zone:

```jsx
// ParkDurationPicker.jsx
export function ParkDurationPicker({ anchorPos, accountName, onCommit, onCancel }) {
  const [choice, setChoice] = useState('30d')
  const [customDate, setCustomDate] = useState(() => addDaysIso(new Date(), 30))

  function commit() {
    const unparkAt = choice === 'custom'
      ? new Date(customDate)
      : addDays(new Date(), { '7d': 7, '30d': 30, '60d': 60, '90d': 90 }[choice])
    onCommit(unparkAt)
  }

  // Esc / outside-click cancels and returns the card to its original column
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onCancel])

  return (
    <div
      style={{ position: 'fixed', top: anchorPos.y, left: anchorPos.x, zIndex: 60 }}
      className="rounded-lg border border-zinc-700 bg-zinc-900 p-3 shadow-2xl"
      role="dialog"
      aria-label={`Park ${accountName}`}
    >
      <p className="text-xs text-zinc-300">Park <strong>{accountName}</strong> until:</p>
      <div className="mt-2 space-y-1">
        {['7d', '30d', '60d', '90d'].map((opt) => (
          <label key={opt} className="flex items-center gap-2 text-sm text-zinc-200">
            <input type="radio" checked={choice === opt} onChange={() => setChoice(opt)} />
            <span>{opt === '7d' ? '1 week' : opt === '30d' ? '1 month (default)' : opt === '60d' ? '2 months' : '3 months'}</span>
          </label>
        ))}
        <label className="flex items-center gap-2 text-sm text-zinc-200">
          <input type="radio" checked={choice === 'custom'} onChange={() => setChoice('custom')} />
          <span>Custom:</span>
          <input
            type="date"
            value={customDate}
            onChange={(e) => setCustomDate(e.target.value)}
            disabled={choice !== 'custom'}
            className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm"
          />
        </label>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button onClick={onCancel} className="rounded px-3 py-1 text-sm text-zinc-400 hover:bg-zinc-800">Cancel</button>
        <button onClick={commit} className="rounded bg-amber-500 px-3 py-1 text-sm font-semibold text-zinc-950 hover:bg-amber-400">Park</button>
      </div>
    </div>
  )
}
```

## Unpark Cloud Function

Per spec §4. Implementation in `functions/cleanupCrmParked.js`. Hourly schedule. Posts to `#fleet-ops`:

```
🔔 [Company X] back in **Researched** after park
```

The originating stage label comes from `parkedFromStage` field stamped at park time.

## Card content

Five fields, no more. Implementation matches spec §7. Reads denormalized `estValueCents` and `lastTouchAt` directly — no joins.

## Filters row

Replace existing filter row with:
- Stage dropdown (single-stage filter; 'All stages' default)
- Owner dropdown (admin / sourcer / mechanic / unassigned)
- Source dropdown (sms / research / manual / referral)
- **NEW:** Last touch dropdown (today / 7d / 30d / 90d / older / never)
- Search company text input (kept, moved into the same row)

Drop: location filter, min score, segment picklist.

## Metrics strip in ModuleSubheader

Render the right-aligned slot:
```
Total leads: 47  ·  Conversion rate: 12.3%  ·  Avg cycle: 18d
```

Reads from `meta/crmStats` doc (cached, recomputed every 6h by `computeCrmStats` Cloud Function). On first render before cache populates, show skeleton placeholders, not zeros.

## `+ New Lead` button

Top-right of `<ModuleSubheader>` action slot. Opens `<NewLeadModal>`. Modal posts a new `crmAccounts` doc with `pipelineStage: 1` (Spotted), `schemaVersion: 3`, `source: 'manual'`, `lastTouchAt: serverTimestamp()`, `estValueCents: 0`.

## Acceptance

- [ ] Kanban renders 5 columns: Spotted / Researched / Contacted / Quoted / Negotiating
- [ ] Static "Lost" column gone; toggle button still surfaces archived-lost via side panel
- [ ] Drag a card → 3 drop zones appear at bottom
- [ ] Drop on Park → picker appears at drop coordinates with 30d default
- [ ] Park commit writes `archivedAt` + `archivedReason: 'parked'` + `unparkAt` + `parkedFromStage`
- [ ] Hourly unpark Cloud Function tested in staging: parked card with `unparkAt < now` resurfaces in originating stage; Slack message includes stage label
- [ ] Drop on Won → creates `customers` doc, archives crmAccount, posts conversion to Slack
- [ ] Drop on Lost → archives with reason picker (or "lost" default); Slack message
- [ ] Esc during Park picker cancels and returns card to original column
- [ ] `+ New Lead` button in ModuleSubheader action slot
- [ ] Card shows 5 fields only (name, source badge, last touch, est value, owner avatar)
- [ ] Filter row shows: Stage / Owner / Source / Last touch / Search company. No geo, no min score, no segment picklist
- [ ] Metrics strip renders in ModuleSubheader right-aligned
- [ ] Mobile (max-sm) renders accordion-stacked columns; drag zones stack vertically
- [ ] `npm run lint && npm run test && npm run build` green
- [ ] Visual baselines refreshed for /crm at all 3 breakpoints

## Notes for the agent

- Patch-624 must be deployed and migration run **before** this patch lands. The new UI reads `estValueCents` and `lastTouchAt`; without the migration those fields are absent and cards render "—".
- Reuse `<CrmAccountDetailPanel>` for click-into-card detail view. Don't rebuild it.
- The conversion-rate metric formula in the spec is a starting point; refine with admin if the cycle window proves wrong.
- Slack channel target (`#fleet-ops` vs `#crm`) — confirm with admin before merging. Hardcoded for now.
- The accordion mobile layout already exists in `CrmPage.jsx` (search for `crmMobileStage`). Reuse the pattern; don't rebuild.
