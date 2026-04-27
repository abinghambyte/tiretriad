# My Queue relocation — design spec (STORMED 2026-04-27)

**Status:** Stormed. Implementation captured as `docs/handoffs/patch-628-my-queue-relocation.md`.

## Problem

Audit §5 — `My Queue` is a temporary task list, not a global business pillar. It currently occupies a top-nav slot. Storm 5's homepage module grid does not include a "Tasks" card. The queue UX exists at `/my-queue`; relocation needs to preserve discoverability without burning a nav slot.

## Decisions

### 1. Where it lives

**Bell in `<PortalTopBar>` + Dashboard widget.** Bell is the omnipresent unread-count surface; widget on home is the at-a-glance full list. Same data source, different ergonomics.

### 2. Bell content

**Queue items only.** Click-to-context navigation (e.g., "Review tire research" → `/my-queue?focus=...`). Notifications are a separate UX initiative — combining them creates scope creep. No "Mark all complete" — half the queue items need real action, not dismissal.

### 3. Role gating

**Universal — everyone gets a bell, content per-role.** DJ/Field crew see "3 jobs assigned today"; Kyle sees "5 tires to research"; Alex sees both. Aligns with multi-user mode (patch-304). Queue source is collection-level; filter by role in the hook.

### 4. Removal mechanics

**Keep `/my-queue` route as a fallback.** Drop only the nav entry. Bookmarks, Slack deep links, palette actions all keep working. Bell click navigates to `/my-queue` for the full-page view; popover is the quick-glance preview.

## Implementation surface

- **Header bell** — new `<MyQueueBell>` in `<PortalTopBar>`, between role pill and sign-out. Uses `useUserProfile` for role; reads queue count via existing `useDashboardSignals.kylesQueueCount` (or extends signals with a unified `myQueueCount` keyed on role).
- **Popover panel** — Reuse the existing `<Popover>` primitive (the same one used by row-actions menus). Lists 5 most recent queue items with relative timestamps. "Open full queue →" link footer.
- **Dashboard widget** — `<MyQueueWidget>` rendered between `<HomepageModuleGrid />` and the existing Recent Activity widget. Shows top 10 queue items with the same click-to-context behavior.
- **Nav entry removal** — `MobileBottomNav.jsx`: drop the `'/my-queue'` item. `DesktopTopNav.jsx`: same.
- **Route stays** — `/my-queue` remains routed to existing `<MyQueuePage>` for full-page view + bookmark fallback.

## Out of scope

- Bell-as-notification-stream (combining notifications + queue items) — separate UX initiative
- Push notifications / native browser notifications — separate auth + permission flow
- Sourcing-mode queue (the new "Source-mode catalog" parking lot entry from this storm) — different concern

## Decision log

- Bell + widget over either alone — bell hides queue when on home; widget alone leaves you blind elsewhere
- Queue-only over combined notifications — scope discipline
- Universal role-aware over sourcer-only — multi-user mode alignment
- Route stays as fallback — bookmarks and deep links matter

## Next step

Dispatch `docs/handoffs/patch-628-my-queue-relocation.md`. Single PR.
