# Patch H - Sinch lead detail drawer

You are a Cursor agent shipping ONE patch from a parallel rollout. Two other patches (I, J) are in flight concurrently. Do not touch any file outside the scope below. See `docs/handoffs/README.md` for the full ownership map if needed.

## Goal

Surface the Sinch-chat lead fields (contactName, phone, email, inquiry, pageUrl, referrer, sinchConversationId) in the CRM Leads tab. Today those fields are written by `createSinchChatLead` but invisible in the UI.

## Branch

`sinch-lead-drawer` (cut from latest `main`).

## Context

- `src/pages/CrmPage.jsx` around line 1126 renders the Leads table with six columns: Business, Source, Segment, Vehicles, Urgency, Follow-up. No way to see which leads came from chat vs. phone vs. a referral, and no place to read the visitor's inquiry text.
- Firestore `crmLeads` docs written by `createSinchChatLead` carry: `businessName`, `source: 'sinch_chat'`, `contactName`, `phone`, `email`, `inquiry`, `pageUrl`, `referrer`, `sinchConversationId`, `createdAt`, plus the legacy `segment / fleetSize / urgency / followUpAt / convertedToAccountId`.

## Scope (only touch these files)

- `src/pages/CrmPage.jsx` - add Inquiry column, source pill, row click handler
- NEW: `src/components/crm/CrmLeadDetailDrawer.jsx` - the slide-in detail panel
- NEW: `src/components/crm/CrmLeadDetailDrawer.test.jsx` - render test
- NEW: `src/components/crm/leadSourceBadge.jsx` - tiny component that returns the correctly-colored pill for a lead's `source` (sinch_chat = violet, phone = zinc, referral = emerald, other = zinc-neutral)

## Tasks

1. **Inquiry column** - add a new `<th>Inquiry</th>` between `Segment` and `Vehicles`, hidden on `max-sm`. In each row's `<td>`, render the first 80 chars of `r.inquiry` with ellipsis; `title={r.inquiry}` for the full text on hover. If inquiry is empty, render an em-dash placeholder.

2. **Source pill** - replace the plain-text `r.source` cell with `<LeadSourceBadge source={r.source} />`. The badge renders a rounded pill with:
   - `sinch_chat` - violet (`bg-violet-500/15 text-violet-200 ring-violet-500/40`), label "Sinch chat"
   - `phone` - zinc (`bg-zinc-700/40 text-zinc-300`), label "Phone"
   - `referral` - emerald, label "Referral"
   - Anything else - neutral zinc with the raw source string Title-cased

3. **Detail drawer** - clicking anywhere on a lead row (not the Convert button) opens `CrmLeadDetailDrawer` as a right-side drawer (same backdrop + z-index pattern as `CrmAccountDetailPanel`, see `src/components/crm/CrmAccountDetailPanel.jsx` for the shape). The drawer shows:
   - Header: business name, source pill, created-at relative time
   - Contact block: `contactName`, `phone`, `email` (when present)
   - Inquiry block: full text in a preformatted bordered box
   - Context block: `pageUrl` (rendered as a truncated span with `title` for the full URL; do not autolink), `referrer` (same), `sinchConversationId` as monospaced copyable text
   - Footer: "Convert to VIP client" button when not yet converted, Close button

   Do NOT auto-link `pageUrl` or any field to external URLs. The agent handling the drawer should have no `<a target="_blank">` pointing at user-supplied URLs.

4. **Test** - `CrmLeadDetailDrawer.test.jsx` renders the drawer with a fully-populated mock lead and asserts each block appears with the expected text. Use the render pattern from `src/components/people/PeopleDashboard.permissions.test.jsx` if you need a React Testing Library template.

## Out of scope

- "Open in Sinch inbox" deep links - Sinch does not expose a stable conversation-URL pattern; skip rather than invent one.
- Editing the lead from the drawer (no Firestore writes). Convert-to-VIP reuses the existing handler.
- Keyboard navigation between leads inside the drawer (follow-up if needed).
- Source filter buttons in the filter bar.

## Validation (must all pass before PR)

```
./node_modules/.bin/vitest run
./node_modules/.bin/eslint src/pages/CrmPage.jsx src/components/crm/
./node_modules/.bin/vite build
```

## PR

- Title: `CRM Leads: source pill + inquiry preview + detail drawer`
- Body: short summary plus Test plan checklist. Note explicitly that Sinch-inbox linking was deliberately omitted (no stable URL pattern). No Claude trailers, no em dashes in published text.

Execute this brief exactly. Branch from main, run all validation commands before opening the PR, and stop after the PR is open.
