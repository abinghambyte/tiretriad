# Skedaddle MCP server (design)

**Status:** design only — implementation TBD. Listed as a next priority in [ROADMAP.md](./ROADMAP.md).

**Goal:** A **read-first** MCP server that lets Cursor / Claude query **Firestore** (and optionally **function metadata**) for this repo without pasting large JSON into chat — faster onboarding and safer than ad-hoc exports.

---

## Threat model

| Risk | Mitigation |
|------|------------|
| Data exfiltration from a stolen laptop | MCP runs **only** with credentials the developer already has; document **least privilege** IAM. |
| Accidental writes | **Default: no mutations.** Optional second phase: gated `mutation` tools behind explicit env flag + confirmation. |
| Secret leakage | No service account JSON in repo; use **GOOGLE_APPLICATION_CREDENTIALS** or **ADC** locally; production MCP never embeds keys in MCP config committed to git. |

---

## Scope (read)

Suggested **allowlisted** operations:

1. **Get document** — `projects/{project}/databases/(default)/documents/{path}` via Firestore REST or Admin SDK **read** only.
2. **Query collection** — structured query with **max rows** (e.g. 50), **required** `where` on known fields when possible (e.g. `orders` by `status`).
3. **List subcollections** — shallow list for known parents (optional).

**Deny by default:** arbitrary collection group queries, full collection scans, deletes, batch writes.

---

## Collections (suggested allowlist)

Align with [docs/AI-CONTEXT.md](./AI-CONTEXT.md):

- `orders/*` — operational; redact or omit raw phone if policy requires (configurable).
- `tires/*` — catalog; large; always require **mspn** or **limit + filter**.
- `meta/revenueStats`, `meta/crewEarnings`, `meta/creditTracker`, `meta/reorderQueue`, `meta/quotaTargets` — aggregates.
- `users/*` — **high sensitivity**; default **off** or admin-only tool.

Implement **path prefixes** in code; reject anything outside the list.

---

## Authentication

- **Local dev:** Application Default Credentials or a **dedicated** Firebase service account JSON with **Cloud Datastore User** (read) only — stored outside the repo.
- **Cursor MCP config:** `command` + `args` pointing at `node path/to/mcp-server.js`, env vars for `GOOGLE_APPLICATION_CREDENTIALS` and `FIREBASE_PROJECT_ID=skedaddle-inventory`.

---

## Tool surface (illustrative)

| Tool | Input | Output |
|------|--------|--------|
| `firestore_get` | `path` (must match allowlist) | Document JSON or 404 |
| `firestore_query_orders` | `status`, `limit` | Array of order summaries |
| `firestore_get_meta` | key one of `revenueStats`, `crewEarnings`, … | `meta/*` snapshot |

Add **rate limiting** (per minute) inside the server to prevent runaway agent loops.

---

## Implementation sketch

- **Runtime:** Node 22, `@google-cloud/firestore` or Firebase Admin **read-only** wrapper.
- **Package:** `@modelcontextprotocol/sdk` (or official MCP server template).
- **Repo placement:** e.g. `packages/skedaddle-mcp/` or top-level `mcp-server/` — **not** deployed to Vercel; runs on developer machines only unless later hosted as a private service with auth.

---

## Alignment with AGENTS.md

- Respect **pricing semantics** in answers (paymentAmount, no FET in margin, etc.) — MCP returns **raw fields**; agents should still follow [AGENTS.md](../AGENTS.md) when interpreting.
- **Inventory `qty`** is manual — MCP must not imply auto-sync with orders.

---

## Next steps

1. Scaffold MCP server with **one** tool (`firestore_get` for `meta/revenueStats` only).
2. Add order/tire tools with strict limits.
3. Document Cursor **Settings → MCP** JSON snippet in this file or [docs/AI-CONTEXT.md](./AI-CONTEXT.md).
