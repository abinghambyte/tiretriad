# Skedaddle Portal — UI optimization plan (2026-04-16)

Source audit: `docs/UI-AUDIT-2026-04-16.md` (Phase 2 accepted).  
Constraints: desktop layout unchanged; mobile-only via **`max-sm:`** / **`sm:`** per project rules. One commit per pass severity (Pass 1 alone, then Pass 2 alone).

**Explicitly out of scope for this plan:** P1-4, P2-1, P2-2 (no work, no commits).

---

## Pass 1 — P0 fixes (single item: P0-1)

**Goal:** `/dispatch` remains a real route under `PortalChrome` but **stops** `window.location.replace` to the broken Workforce URL. Show a temporary in-portal placeholder until the standalone app is deployed.

| # | Item | Files | Diff summary | Acceptance criteria |
|---|------|-------|--------------|----------------------|
| 1.1 | Dispatch placeholder | `src/components/DispatchRedirect.jsx` (primary). Optionally `src/App.jsx` only if import/rename is cleaner. | Remove `useEffect` + `window.location.replace`. Render a centered main region (e.g. `min-h-[50vh]` flex column) with the **exact** copy: *"Task Dispatcher is being extracted to a standalone application. This route will reconnect when the external deployment is live."* Use existing tonal patterns: `text-zinc-400` body, `text-sm` / `text-center`, optional `max-w-md mx-auto px-4`, parent `bg-zinc-950` or inherit from portal — align with empty rows like `OpsPage` “No expenses yet.” (`text-zinc-500`, padded cell) and `ContactsPage` empty copy. Remove unused `WORKFORCE_URL` import from this file. | Visiting `/dispatch` while signed in as Overwatch shows placeholder inside top bar + outlet; **no** navigation to `workforce-abinghambyte.vercel.app`. No 404. Browser back/forward sane. `npm run lint && npm run build` pass. **Single commit** message scoped to P0-1 only. |

**Rollback:** Restore previous `DispatchRedirect` behavior from git history when Workforce URL is live; then delete or gate placeholder behind env flag (future, not in this pass).

---

## Pass 2 — P1 fixes (P1-1, P1-2, P1-3 only)

### P1-1 — Ops tables mobile column set (`OpsPage.jsx`)

**Tables:**

1. **Expenses** (`~L331–369`): columns Amount, Category, Note, Date, Logged by, Recorded. Table wrapper `overflow-x-auto` + `min-w-[720px]`.

2. **Reorder queue** (`~L411–440+`): columns MSPN, Description, Qty, Requested by, Requested at, Actions. Table `min-w-[800px]`.

**Approach:**

- Add **`max-sm:hidden`** to **matching** `<th>` and `<td>` pairs for non-critical columns so **desktop shows all columns unchanged** (no `max-sm:` on `sm:` and up).
- On the `<table>` element, add **`max-sm:min-w-0`** (keep existing `min-w-[720px]` / `min-w-[800px]` for `sm:`+) so the table can shrink when fewer columns render on small viewports — removes inner horizontal scroll on typical phone widths.
- Keep **`colSpan={6}`** on loading/empty rows (column count unchanged in DOM).

**Proposed mobile-visible columns (field-oriented default — confirm or adjust before implement):**

| Table | Stay visible on mobile (`< sm`) | Hidden on mobile (`max-sm:hidden`) |
|-------|-----------------------------------|--------------------------------------|
| Expenses | **Amount**, **Date**, **Note** | Category, Logged by, Recorded |
| Reorder queue | **MSPN**, **Qty**, **Description** (truncation already), **Actions** | Requested by, Requested at |

**Ambiguity:** For expenses, **Category** is useful for tax context; hiding it favors speed in the field. If you want Category visible on mobile, swap it in for Note (or drop Logged by/Recorded only and keep four columns) — **reply before Pass 2 if you want a different set.**

### P1-2 — CRM Leads table mobile column set (`CrmPage.jsx`)

**Table:** Leads tab (`~L648–698`): Business, Source, Segment, Vehicles, Urgency, Follow-up, trailing actions column. `min-w-[640px]`.

**Approach:** Same as Ops: paired `max-sm:hidden` on th/td + `max-sm:min-w-0` on table while retaining `min-w-[640px]` from `sm:` breakpoint up.

**Proposed mobile-visible columns:**

| Stay visible on mobile | Hidden on mobile |
|------------------------|------------------|
| **Business**, **Urgency**, **Follow-up**, **actions** column (Convert / Converted) | Source, Segment, Vehicles |

**Ambiguity:** **Vehicles** (fleet size) can matter for quoting in the field. If you prefer Vehicles over Follow-up on mobile, say so before Pass 2.

### P1-3 — Login label size (`LoginForm.jsx`)

| # | Item | File | Diff summary | Acceptance criteria |
|---|------|------|----------------|---------------------|
| 2.3 | Login labels | `src/components/auth/LoginForm.jsx` | Change label `className` from `text-xs` to **`text-sm`** for Email and Password labels only (inputs unchanged unless spacing needs one-line tweak). | Labels render at `text-sm` on `/`; no layout regression on desktop or mobile login card. Lint + build pass. |

**Single commit** for Pass 2 containing P1-1 + P1-2 + P1-3 together (same severity band per your batching rule — if you prefer three separate commits, split by sub-item instead).

---

## Pass 3 — Polish and consistency

**No work in this phase** for the scoped engagement (P2-1, P2-2 deferred). Optional later: theme wait-before-screenshot (P1-4), bundle split (P2-1), dashboard micro-polish (P2-2).

---

## Pass 4 — Feature unification

**Not in scope** for this plan. When Workforce is live: restore external redirect (or add “Open external dispatcher” CTA on placeholder + deep link).

---

## Verification checklist (after Pass 1 + Pass 2)

1. `npm run lint && npm run build` from repo root.
2. Manual smoke: `/dispatch` placeholder; `/ops` both tables at 390px width — no horizontal scrollbar inside table card (spot-check in DevTools).
3. `/crm?tab=leads` table at mobile width — same.
4. `/` login labels visually ≥14px effective size.

---

Plan written — confirm to execute Pass 1.
