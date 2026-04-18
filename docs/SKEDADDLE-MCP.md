# Skedaddle MCP server (design)

**Status:** design / future — read-only Firestore access for Cursor and Claude-style agents. Listed in [ROADMAP.md](./ROADMAP.md) next priorities.

**Goal:** Let agents query **allowlisted** Firestore paths (e.g. `meta/revenueStats`, bounded `orders` queries) without pasting large exports — with **no default writes**.

**Threat model:** Least-privilege GCP service account; path allowlists; rate limits; secrets never in-repo.

**Implementation:** Node MCP server using Firebase Admin or Firestore REST, configured in Cursor MCP settings with `GOOGLE_APPLICATION_CREDENTIALS` and `FIREBASE_PROJECT_ID=skedaddle-inventory`.

**Scope:** Start with `meta/*` aggregate docs; expand only with explicit review. See also operational semantics in [AGENTS.md](../AGENTS.md) (pricing, qty rules).
