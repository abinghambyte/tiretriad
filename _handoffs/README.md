# Agent handoffs (`_handoffs/`)

Short-lived specs from Portal Architect → Field Executor (Cursor) or Site Verifier (Antigravity).  
**This folder is not required for the app to build**; treat it as a work queue + audit trail.

| File | Status | Notes |
|------|--------|--------|
| [CURSOR-invite-slack-step.md](./CURSOR-invite-slack-step.md) | **Done** (2026-04-17) | Slack step after invite registration; see file footer. |
| [CURSOR-invite-qr-code.md](./CURSOR-invite-qr-code.md) | **Done** (2026-04-15) | QR in `InviteUrlToolkit` when `!showHardware`; see file footer. |
| [CURSOR-price-research-failure-alert.md](./CURSOR-price-research-failure-alert.md) | **Done** (2026-04-15) | Slack on scheduler failure in `functions/index.js`; deploy functions. |
| [CURSOR-ebay-button-admin-only.md](./CURSOR-ebay-button-admin-only.md) | **Done** (2026-04-15) | Admin-only disabled eBay CTA in `ListingGenerator.jsx`; see footer. |
| [ANTIGRAVITY-live-audit-brief.md](./ANTIGRAVITY-live-audit-brief.md) | **Manual QA** | No code — run in browser against production when needed. |
| [HANDOFF-TEMPLATE.md](./HANDOFF-TEMPLATE.md) | Template | Copy for new handoffs; includes commit-style guide. |

When you finish a handoff, append a **Field Executor — completion notes** (or **Verifier — report**) section at the bottom of that `.md` file so the next person knows what shipped and what is still open.
