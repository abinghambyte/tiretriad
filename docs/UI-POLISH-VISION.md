# UI polish — core vision

**Intent:** The portal already *does* the job (catalog, orders, CRM, finance, Slack). **Polish** means the same power with less cognitive load: faster scanning, clearer role-appropriate surfaces, and calmer density — without breaking desktop layouts when improving mobile (see AGENTS.md).

---

## Principles

1. **One obvious next action per screen** for the primary crew role on that route (e.g. Field: “my orders”; Source: “confirm availability”; Overwatch: “see risk + revenue at a glance”).
2. **Typography and spacing first** before new features — hierarchy beats more chrome.
3. **Tables are tools, not walls** — virtualized rows are necessary at 1,160 tires; align column meaning (margin bands, CTS) with legend or inline hints where new users stall.
4. **Empty and loading states** should read as intentional — what to do next, not a dead end.
5. **Reuse** `formatCurrency`, `formatPercent`, `formatQty`, crew labels from `portalCrewTag.js` — polish is consistency as much as pixels.

---

## Module-specific focus (non-exhaustive)

| Area | Polish targets |
|------|----------------|
| **Dashboard** | Card scan order, credit strip vs grid balance, recent activity scannability |
| **Tires** | Filters + presets discoverability, Listing Generator vs table relationship, long row readability |
| **Orders** | Status semantics, mobile row actions, Kyle override / discrepancy visibility |
| **CRM** | Kanban column clarity, account panel density, dispatch handoff |
| **People** | Permission matrix fear-factor vs clarity, invite flow success states |
| **Analytics** | Tab memory, chart legibility on dark background |
| **Ops** | Expense vs SMS vs reorder — section boundaries |

---

## AI listing advisor (product direction)

**Shipped:** `listingAdvisor` callable + Listing Generator integration.

**Next:** Treat listing advisor as a **first-class UX**: stronger defaults, explainability (“why this title”), and optional **inventory-aware** suggestions (slow movers, margin band) — without auto-changing prices. Deeper market signals can wait; **copy and clarity** beat raw automation for this crew.

---

## Review workflow

Use [GEMINI-UI-WALKTHROUGH.md](./GEMINI-UI-WALKTHROUGH.md) for screenshot-driven reviews with Gemini.

---

## What we are not optimizing for in this doc

- **eBay / SellerChamp** — deferred as a business priority; see [ROADMAP.md](./ROADMAP.md).
- **Automated browser/unit tests** — not the primary quality gate; visual and manual verification + Gemini walkthrough preferred per product direction.
