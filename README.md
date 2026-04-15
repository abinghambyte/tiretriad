# Skedaddle Portal

**Alex Bingham** — *Full-stack software engineer* (internal tools & line-of-business applications). I design and ship production systems with **React**, **Node**, and **Firebase** (Firestore, Cloud Functions Gen2, Auth), plus integrations such as **Slack**, **SMS**, **email**, and **server-side LLM** workflows—turning messy operational reality into reliable software.

**Custom operations software** for a northern Colorado tire resale and mobile road-service business. The product replaces spreadsheets and ad hoc messaging with a single authenticated app plus a deep Slack integration so a small crew can run catalog, sales, dispatch, CRM, and finance workflows in one place.

**Live (invite-only):** [skedaddleinc.com](https://skedaddleinc.com)

This repository backs a **real production system**, not an open-source library. The README is here to **describe the project**—scope, architecture, and what makes it interesting—rather than to onboard strangers who would clone and self-host it.

---

## The problem

High-volume used and wholesale tire operations sit at the intersection of inventory that moves fast (including pre-sold stock), field delivery, supplier coordination, and tight margin visibility. Off-the-shelf retail or fleet tools did not match how this business actually works, so the team needed **purpose-built software**: fast catalog search, an order pipeline aligned to their stages, CRM tied to real dispatch, and **Slack-first** shortcuts for people who live in chat on the job.

---

## What the application does

- **Operations hub** — One React SPA for tires, orders, people, analytics, and admin-only tools (expenses, inbound SMS, experiments).
- **Order lifecycle** — Firestore-backed pipeline from intake through completion, with real-time UI updates and server-side validation on status and payment fields.
- **Rubber CRM** — Pipeline for leads and accounts connected to field workflows (not a generic rename of “fleet CRM”; naming is intentional in-product).
- **Crew and customers** — Firebase Auth, role gates, invites, and flows tuned for phones (including HTTPS dev paths where NFC-related features matter).
- **Slack as a control plane** — Dozens of slash commands and interactive messages for finance, inventory, scheduling, credit, and field status so common actions do not require opening the portal.
- **Automation** — Scheduled Cloud Functions (e.g. catalog research, notifications), callables from the UI, and integrations for SMS and email.
- **AI-assisted pieces** — Where enabled: listing guidance, admin task routing, and wholesale price research—wired as server-side callables and jobs, not client-side API key leakage.

---

## Technical highlights

- **Full-stack JavaScript** — React 19 SPA (Vite, Tailwind) and Node **22** Cloud Functions **Gen2** on a shared Firestore data model.
- **Serverless architecture** — Vercel for the static/SPA deploy; Firebase for Auth, Firestore, rules, indexes, and Functions with **secrets in GCP Secret Manager** (not committed env files for production tokens).
- **Complex domain in one codebase** — Shared formatting and business helpers between client and `functions/`, with internal docs (`docs/`, `AGENTS.md`) guarding easy-to-break rules around money and status vocabulary.
- **Integrations** — Slack (commands + Block Kit / interactivity), SMS (Sinch), email (Resend), Anthropic and Gemini for specific productized flows.

---

## Stack

| Area | Choice |
|------|--------|
| UI | React 19, Vite, Tailwind CSS |
| Hosting | Vercel (continuous deploy from `main`) |
| Backend | Firebase Cloud Functions Gen2, Node 22, `us-central1` |
| Data | Firestore, Firebase Auth |
| Tooling | ESLint, Firebase CLI (`firebase-tools` in devDependencies) |

---

## Repository shape

React app in **`src/`**, Cloud Functions and shared server logic in **`functions/`**, product and runbook markdown in **`docs/`**, plus Firestore rules/indexes and small **`scripts/`** for imports and maintenance. Detailed module maps, command lists, and field semantics live in [docs/AI-CONTEXT.md](docs/AI-CONTEXT.md); roadmap and phases in [docs/ROADMAP.md](docs/ROADMAP.md); contributor and agent guardrails in [AGENTS.md](AGENTS.md).

---

## For maintainers only

If you are on the team and setting up locally: use Node 22, `npm install`, `npm run dev`, and read **Local HTTPS** / **Secrets** in [docs/AI-CONTEXT.md](docs/AI-CONTEXT.md). Deploy path: `npm run lint && npm run build`, then Firebase when backend changes, Vercel on push—**Firebase before frontend** when both move in one release.

---

## Additional internal docs

Runbooks and phase write-ups (fleet alerts, tire tooling, Gen2 env notes, etc.) live under [`docs/`](docs/) alongside [docs/SKEDADDLE-MASTER.md](docs/SKEDADDLE-MASTER.md) and the phase handoff files linked from [docs/ROADMAP.md](docs/ROADMAP.md).
