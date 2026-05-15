# Tire Triad Portal

Tire Triad operator portal: inventory, orders, listings, and crew tools. Custom operations software for a northern Colorado tire resale and mobile road-service business. Replaces spreadsheets and ad hoc messaging with a single authenticated app and a deep Slack integration: catalog, sales, dispatch, CRM, and finance in one place.

> _Originally shipped as the Skedaddle Portal in early 2026; rebranded to Tire Triad on 2026-05-03 as part of the LLC restructuring documented in `docs/business/2026-05-02-rebrand-and-gtm-strategy.md`._

**Live (invite-only):** [skedaddleinc.com](https://skedaddleinc.com)

---

## What it does

**Portal (React SPA)**
- Tire catalog with margin visibility, buy price intelligence, and real-time search
- Order pipeline from intake through completion with server-side validation
- Rubber CRM: lead and account tracking tied to field dispatch
- Crew management, role-gated access, NFC-triggered invite onboarding
- Admin tools: expenses, inbound SMS, AI task routing, analytics

**Slack integration**
- 25 slash commands covering finance, inventory, scheduling, CRM, credit, and field ops
- Interactive modals and block-based message flows
- Scheduled automations: morning brief, dead stock radar, stale CRM check, price research
- AI-assisted wholesale price research across the full tire catalog via Gemini + Google Search

**Backend**
- Firebase Cloud Functions Gen2 (Node 22) with secrets in GCP Secret Manager
- Firestore real-time data model shared between client and server
- SMS (Sinch), email (Resend), Slack Bot + Interactivity, Anthropic, Gemini integrations

---

## Stack

| Layer | Technology |
|---|---|
| UI | React 19, Vite, Tailwind CSS |
| Hosting | Vercel, continuous deploy from `main` |
| Functions | Firebase Cloud Functions Gen2, Node 22 |
| Database | Firestore + Firebase Auth |
| Secrets | GCP Secret Manager |
| Integrations | Slack, Sinch SMS, Resend, Anthropic, Gemini |

---

## Architecture

React SPA in `src/`, Cloud Functions in `functions/`, Firestore rules and indexes at root. Business logic shared between client and server via common helpers. Production secrets never committed — all tokens live in GCP Secret Manager and are bound to functions at deploy time.

Deploy path: lint, test, build, Firebase (functions first), then Vercel picks up the frontend push automatically. CI runs the same checks on every push and PR to `main` via `.github/workflows/ci.yml`.

---

### Production error tracking (Sentry)

Sentry is initialized in production builds only. Configure these Vercel env vars:

- `VITE_SENTRY_DSN`: the Tire Triad Sentry project DSN (required)
- `VITE_RELEASE_SHA`: set to `$VERCEL_GIT_COMMIT_SHA` for source-map mapping

In dev / preview builds Sentry is dead-code-eliminated and these env vars are
ignored. See `src/sentry.js`.

---

## Repo notes

This is a **production system**, not an open source library. The code is public to show the work. Internal docs, field semantics, and runbooks live in [`docs/`](docs/).

Built by **[Alex Bingham](https://github.com/abinghambyte)**.
