# Production observations — 2026-04-25 evening

Findings from screenshots of the live https://skedaddleinc.com after today's PR batch landed. Sourced from admin's "not good not good" reaction during a walk-through of Tires, Listing Generator, Customers, CRM Board, and Analytics Wall.

These complement (not replace) the morning's `2026-04-25-desktop-scope-audit.md`. Where the morning audit found code smells from reading source, these findings come from looking at the deployed app and saying "this doesn't feel right."

## Severity buckets

- **P0 — broken or data-quality blocking** (silent miscalculation, missing data the product needs to function)
- **P1 — feels broken even if it's working** (degraded user experience, looks-broken-but-isn't)
- **P2 — polish** (one-click improvements)
- **P3 — process / future-proofing** (won't bite again next time)

## Findings

### 🔴 P0-A — Tire retail prices are estimated, not real (1160 of 1160 tires)

**File:** data, not code. Specifically `tires/{mspn}.retail` field on every doc in the catalog.

**Symptom:** Every row in `/tires?tab=catalog` shows yellow `EST` next to the retail price. The HaggleSheet on a real tire (BFGOODRICH KO3 LT265/70R17) showed `$0.00` current sell because there's no real `retail` field — only an inferred estimate.

**Why it matters:** Quote and bundle margin math is unreliable. The HaggleSheet displays a "current sell" of `$0.00` and the test-offer math falls back to whatever buy + cts + fet sums to. On a tire with mostly-zero data the displayed margin is meaningless. We caught the FET regression in PR #154 because real tires have real FET; we didn't catch it in casual smoke testing because the catalog has no real retail anywhere.

**Effort:** L. Real fix is per-tire data entry — either CSV import, scrape from existing platform listings, or a derive-from-priceIntel formula. Needs a spec.

**Recommendation:** Spec a "tire retail backfill" effort. Options to weigh in the spec:
- One-shot CSV import from a master spreadsheet (if admin has one)
- Auto-derive `retail = priceIntel.activeRetailPrice` (if that field exists and is reliable)
- Auto-derive `retail = buy * (1 + targetMarginPct/100)` as a starting estimate, marked clearly as derived
- Manual MarginTable inline-edit campaign (1160 rows × 5 sec each = ~90 min of admin time)

### 🔴 P0-B — Customer history was wiped along with test orders

**Files:** `orders` collection (post-wipe), `contacts` collection (likely also affected if any contact cleanup ran), `users` collection (test invites linger).

**Symptom:** `/people?tab=customers` shows "No contacts yet" with the explanation "Customer contacts fill in automatically after their first completed order." Combined with admin's confirmation that real sales did happen pre-wipe, this means real customer relationship history was deleted by `scripts/wipe-test-orders.mjs` along with the intended test data.

**Why it matters:** Customer relationships are the long-tail asset of the business. Losing them means the next time a real customer phones, there's no history of the deal we did with them.

**Recovery option (worth checking):** Firebase Firestore Point-in-Time Recovery (PITR) keeps point-in-time snapshots for 7 days by default if enabled at the project level. If PITR is on, the wiped customer docs can be restored from a pre-wipe timestamp.

**Effort:** S to investigate (check PITR status); M to restore (export pre-wipe snapshot, diff against current, cherry-pick real customer docs).

**Future-proofing:** Spec a "soft-delete" or "tombstone" pattern for future wipes so customer-tied data is never bulk-deleted again.

### 🟡 P1-A — Skedaddle Inc is a CRM lead in its own CRM

**File:** `crmAccounts` collection — there's a doc with name "Skedaddle Inc" in the Contacted stage, score 32, 1 pain point.

**Symptom:** The CRM Board shows "Total leads 1, Conversion rate 0.0%" because the only "lead" is the company itself. That can never close, so conversion is permanently 0%.

**Why it matters:** Looks like seeded test data left over from initial CRM development. Self-as-customer is conceptually nonsensical and skews any CRM metrics permanently.

**Effort:** S — delete the `crmAccounts/skedaddle-inc` doc via Firebase Console, OR use the CRM Board's "Mark Lost" action to remove it from the active funnel.

### 🟡 P1-B — Listing Generator: ANTHROPIC FALLBACK + "Narrative unavailable (retry)" + 35% sell probability

**File:** Probably `functions/listingAdvisor*.js` or wherever the per-platform narrative is generated.

**Symptom:** Opening the Listing Generator on a real tire shows three concerning signals stacked:
- **Red error:** "Narrative unavailable (retry)."
- **Tag:** "ANTHROPIC FALLBACK · claude-haiku-4-5"
- **Confidence:** "35% sell probability" (red)

**Why it matters:** The advisor's primary model call failed and fell back to Claude Haiku, which is the smallest/cheapest Claude model and likely returns degraded narrative quality. The "Narrative unavailable" error is unrecoverable without manual retry.

**Probable root cause:** Connects to the API budget exhaustion observed in Cursor's Plan & Usage panel. Whatever model the advisor was calling (Cursor's API budget or a configured Anthropic API key tied to the same account) hit its monthly cap. The fallback to Haiku is the safety net firing as designed.

**Effort:** M — investigate which model the advisor is calling, why the primary failed, and whether the fallback chain should escalate to a different provider (Gemini, OpenAI) before settling on Haiku. Might also want to surface a clearer admin-facing error than "Narrative unavailable (retry)" so the issue doesn't look like a generic bug.

### 🟡 P1-C — Test crew accounts on the People page

**File:** `users` collection — entries for "User" (Spotter, renewed invite, 1-day streak) and "Sinch Test" (Spotter, expired, never signed in).

**Symptom:** Crew tab lists three people: Alex Bingham (real), User (test), Sinch Test (test). Makes the org look more populated than it is.

**Effort:** S — delete via the existing People page actions (revoke invite, delete user). 30 seconds total for both.

### 🔵 P2-A — Analytics Wall has no date-range presets

**File:** `src/pages/AnalyticsPage.jsx` (Wall tab body, around the From/To/Min revenue inputs).

**Symptom:** Wall tab requires manual date entry (`mm/dd/yyyy` placeholders) before any data appears. Defaults to no range (empty). Most analytics dashboards default to "Last 30 days" on first load and offer one-click presets.

**Why it matters:** The Wall is the headline tab. Forcing data entry to see anything is a usability regression compared to e.g. a default "Last 30 days" view with preset chips.

**Effort:** S — add a row of `<button>` chips above the date inputs: Today / 7d / 30d / 90d / YTD. Default the inputs to "Last 30 days" on mount.

### 🔵 P2-B — Crew widget renders on both mobile and desktop in different ways

**File:** `src/components/people/PeopleDashboard.jsx` (CrewDirectoryWidget mount).

**Symptom:** Mobile hides the widget (PR #142). Desktop still shows it as a top-of-page summary AND the full users table below. The summary widget is small and shows zero useful info on a single-user system (everyone says "0 today, 0 day streak").

**Why it matters:** Marginal. The widget is intended to be useful when there are 3+ active crew members. With one real user, it adds visual noise.

**Effort:** S — gate the widget behind `flags.multiUserMode` (already proposed in patch-304). When that ships, the widget auto-hides on desktop too until DJ/Kyle come online.

### 🔵 P2-C — CRM Field Dispatch tab still visible on desktop

**File:** `src/utils/crmModuleTabs.js` + `src/pages/CrmPage.jsx`.

**Status:** Already covered by patch-304 (multi-user mode flag). When that ships, Field Dispatch hides until `multiUserMode = true`.

**Effort:** None — already in queue.

### 🟣 P3-A — Wipe-script safety pattern needs hardening

**File:** `scripts/wipe-test-orders.mjs` and any future cleanup script.

**Symptom:** Tonight's wipe deleted real customer relationships along with test orders because both lived in the same `orders` collection and the wipe was scoped by collection, not by intent.

**Why it matters:** This pattern will repeat. Next time we add a "test" feature and want to clean it up, we need a way that doesn't risk production data.

**Effort:** M — design a soft-delete pattern (e.g., `orders.{id}.archivedAt = serverTimestamp()` instead of hard delete) and a `wipe-test-only` script that filters by `orders.{id}.testFixture = true` so test data is never co-mingled.

**Recommendation:** Spec this. Don't ship as a brief — it's a process-level change that needs design discussion.

---

## Compilation summary

Eight findings; mapped to the dispatch backlog like this:

| ID | Type | Destination |
| --- | --- | --- |
| P0-A retail prices estimated | Spec needed | New: `docs/superpowers/specs/tire-retail-backfill-design.md` (when ready) |
| P0-B customer history wiped | Investigation + spec | New: `docs/superpowers/specs/wipe-safety-and-customer-recovery.md` |
| P1-A Skedaddle Inc CRM lead | Manual cleanup | User does it via Firebase Console (30 sec) |
| P1-B advisor fallback unhealthy | Patch (medium) | New: patch-501 (advisor fallback resilience) |
| P1-C test crew accounts | Manual cleanup | User does it via People page actions (30 sec) |
| P2-A Wall date presets | Patch (small) | New: patch-502 (date presets) |
| P2-B widget desktop dedup | Already covered | Patch-304 (multi-user mode flag) ships it |
| P2-C Field Dispatch tab | Already covered | Patch-304 |
| P3-A wipe safety | Spec needed | New: `docs/superpowers/specs/wipe-safety-and-customer-recovery.md` (combined with P0-B) |

## Recommended next moves (in order)

1. **Manual cleanup right now** — admin deletes Skedaddle Inc CRM lead + test crew accounts. 1 minute total.
2. **Check Firestore PITR** — go to Firebase Console → Firestore Database → Backups. If PITR is enabled, customer recovery is possible. If not, enable it for the future and accept the loss this time.
3. **Add Wall date presets (patch-502)** — small, immediate UX improvement.
4. **Investigate advisor fallback (patch-501)** — find out why the primary model is failing. Likely API budget; may resolve naturally if you switch the listing advisor's model to Cursor's free `gpt-5.5-medium` or to Gemini via your cloud credits.
5. **Spec the retail backfill** — biggest data-quality issue, needs design before any code.
6. **Spec the wipe-safety pattern** — prevents this exact problem next time.
