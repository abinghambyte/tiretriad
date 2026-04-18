# Notebook LM + inventory “study bot” (plan)

**Goal:** Help the crew **internalize inventory** — sizes, patterns, margin bands, what’s dead vs hot — through **random, lightweight questions**, not another dashboard. Tie the **knowledge base** to **Notebook LM** (uploaded sources) and optionally surface prompts via **Slack** on a schedule.

**This is not a replacement** for Firestore or `/stock`; it is **training and fluency**.

---

## Why Notebook LM

[Notebook LM](https://notebooklm.google/) lets you upload **PDFs / docs / structured exports** and ask grounded questions with citations. It is a good fit for:

- A **static snapshot** of the catalog (export) + your own markdown notes (pricing philosophy, customer archetypes).
- **Ad-hoc study** — Kyle or DJ opens the notebook and asks “what LT sizes do we rarely move?” without querying the live DB.

Notebook LM does **not** expose a public API for “send random question” today — the **automation** layer below complements it.

---

## Recommended hybrid architecture

### A — Knowledge corpus (manual refresh)

1. **Scheduled or on-demand export** from Firestore (future small Cloud Function or script): `tires` summary — MSPN, description, qty, margin band, velocity fields, `priceIntel` summary text-only.
2. Export **Markdown or PDF** → upload to a **shared Notebook LM** notebook titled e.g. *Skedaddle Inventory Study*.
3. Crew bookmarks the notebook for **free-form Q&A** grounded in that export.

Refresh cadence: weekly or after large `/intake` events — document owner: Overwatch.

### B — “Random question” bot (Slack or email)

Implement with **Gemini API** (already used in Cloud Functions for listing advisor / tire research):

1. **Scheduled function** (e.g. weekday 9am MT): load a **compact JSON summary** of N random tires + meta/stats (dead stock list from existing jobs, etc.).
2. Prompt Gemini: “Generate **one** multiple-choice or short-answer question about inventory or tire types useful for field staff. Include answer key.”
3. Post to `#fleet-ops` or a dedicated `#rubber-trivia` channel via existing Slack patterns (`functions/slackSecrets.js`).

**Notebook LM** remains the **deep reference**; **Slack + Gemini** is the **nudge** to actually study.

### C — Optional: link out

Slack message can include **“Open Notebook LM”** link + one-line reminder to refresh sources when export is stale.

---

## Safety and accuracy

- **Never** let the bot auto-write Firestore or change prices.
- Label bot output as **training only** — verify against portal for operational decisions.
- Keep prompts **RAG-style**: only use fields you pass in the scheduled payload (no hallucinated SKUs).

---

## Implementation phases

1. **No code:** Create Notebook LM notebook + first catalog export (manual CSV → PDF/Markdown upload).
2. **Slack trivia MVP:** One scheduled function + Gemini + `chat.postMessage` (reuse secret patterns).
3. **Polish:** Question difficulty by role (Field vs Source), opt-out per user, link to listing advisor for “how would you list this SKU?”

---

## Related

- AI listing advisor — [UI-POLISH-VISION.md](./UI-POLISH-VISION.md)
- Gemini UI reviews — [GEMINI-UI-WALKTHROUGH.md](./GEMINI-UI-WALKTHROUGH.md)
