# Gemini visual UI walkthrough (review process)

**Purpose:** Replace automated unit-test gates with a **human-meaningful, visual** review of the portal. You feed Gemini **screenshots plus route context**; Gemini returns prioritized UX issues, polish ideas, and role-specific friction — aligned with [UI-POLISH-VISION.md](./UI-POLISH-VISION.md).

**When to run:** After meaningful UI changes, before merge to `main`, or on a quarterly “polish pass.”

---

## Tools

- **Google AI Studio** (gemini.google.com) or **Gemini** in Google Workspace — upload images in multi-turn chat.
- **Antigravity / Cursor** with Gemini — optional; same prompts work if the model can see images you paste.

---

## What to capture (full viewport)

Use a **consistent viewport** (e.g. 1440×900 or your target laptop size). For each **module**, capture:

1. **Default landing state** — first paint after navigation (loading settled).
2. **Primary action path** — e.g. Tires: open filter → one row expanded or modal; CRM: open a card; Orders: scroll to a busy section.
3. **Mobile** — one `max-sm` screenshot per critical route if you changed responsive behavior (per AGENTS.md: desktop layout must not regress).

**Routes checklist (minimum):**

| Route | Focus |
|-------|--------|
| `/dashboard` | Cards, credit strip, activity legibility |
| `/tires` | Table density, margin colors, Listing Generator entry |
| `/tires` → Orders tab | Pipeline clarity |
| `/crm` | Kanban readability |
| `/people` | Permissions / invite clarity |
| `/analytics` | Tabs, charts, wall |
| `/ops` | Admin tools scan |

---

## Master prompt (paste after attaching screenshots)

Use this verbatim or adapt the role line:

```
You are a senior product designer and accessibility-minded frontend reviewer for an internal B2B ops portal (dark UI, Tailwind). The app serves a small tire resale + mobile service crew: roles include Overwatch (admin), Source (supplier), Field (mechanic), Spotter (read-only).

For each screenshot I attached, in order:
1. Name the likely user goal on this screen.
2. List friction: unclear hierarchy, weak CTAs, cramped tables, ambiguous labels, error/empty states, color-only meaning without text.
3. Suggest concrete improvements (not generic advice) — spacing, typography scale, section headers, button placement, progressive disclosure.
4. Flag a11y risks: focus order, contrast, touch targets on mobile if visible.
5. Note anything that could confuse Kyle (supplier) vs DJ (field) vs Alex (admin).

Finish with a ranked top-5 list of changes that would most improve daily use, assuming we keep the existing information architecture.
```

---

## Follow-up prompts

- **Role filter:** “Re-analyze screenshot 3 assuming the viewer is **Field** only — what should we hide or simplify?”
- **Density:** “Where would you reduce visual noise without removing data?”
- **Consistency:** “Compare screenshots A and B — list typography or spacing inconsistencies.”

---

## Outputs

Save Gemini’s answer in the PR description or a short `docs/ui-review-YYYY-MM-DD.md` if you want a paper trail. No substitute for **manual click-through** on staging/production — Gemini amplifies judgment; it does not replace it.

---

## Relation to CI

CI runs **lint + build** only. This document is the **recommended** quality gate for **UI and core-vision polish**.
