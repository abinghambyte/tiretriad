# Antigravity brief — live audit of /dispatch + taskDispatcher callable

> Worker: Site Verifier (Antigravity)
> Author: Portal Architect (Sonnet 4.6)
> Date: 2026-04-15

## Goal
Verify the AI Task Dispatcher Cursor just shipped is fully wired in production at skedaddleinc.com — the `/dispatch` route loads for the Overwatch user, the `taskDispatcher` Firebase callable returns valid JSON, and no existing portal route or function regressed.

## Verification steps
1. Open `https://skedaddleinc.com` and sign in as `boydabingham@gmail.com` (Overwatch / admin role).
2. From the dashboard, locate the **Growth Lab** card. Confirm the secondary CTA reads exactly `Launch Dispatcher` and the primary CTA reads `Open Lab`.
3. Click `Launch Dispatcher`. Confirm the URL becomes `https://skedaddleinc.com/dispatch` and the page renders three panels titled `Task`, `Routing result`, `Generated prompt`. Confirm a `Session handoff` section is visible below with four textareas labeled `DECIDED`, `COMPLETED`, `OUTSTANDING`, `NEXT SESSION BRIEF`.
4. In the `Description` textarea, paste exactly: `Write a Cursor brief to add a Saved Searches feature to the Tires catalog page.` Leave `Session notes` blank. Leave `Model hint` on `Let dispatcher decide`.
5. Click `Route Task`. Wait for the routing result to render (skeleton dismisses).
6. Read the routing result panel. Capture: `Assigned worker`, `Model`, `Platform`, `Cost check` badge text, and the first 200 chars of `Generated prompt`.
7. Open browser DevTools → Network → find the `taskDispatcher` callable POST → confirm status `200`, response body has top-level fields `assignedWorker`, `modelVersion`, `platform`, `rationale`, `costCheckResult`, `costCheckNote`, `contextToLoad`, `generatedPrompt`. Confirm `modelVersion` string is `claude-sonnet-4-6`.
8. Click `Copy` on the Generated prompt panel. Confirm the button text changes to `Copied ✓` for ~2s.
9. In the `Session handoff` section, type `test decided` into DECIDED, refresh the page, confirm the value persists (this verifies localStorage write under key `dispatcher:handoff`).
10. Click `Clear Handoff`, accept the confirm, confirm all four fields empty.
11. Sign out. Sign in as a non-admin user (any Field/Source/Spotter account if available; otherwise skip — note skip in report). Confirm the Growth Lab card is **not visible** on the dashboard. Attempt to navigate to `https://skedaddleinc.com/dispatch` directly — confirm `ProtectedRoute requireAdmin` blocks access (redirect or "not available" message).
12. Sign back in as Overwatch. Smoke-test that other live routes still work: load `/tires`, `/orders`, `/crm`, `/people`, `/analytics`, `/ops`, `/growth`. Each should render its main panel without console errors.

## Success criteria
- `Launch Dispatcher` CTA is present on Growth Lab card for the Overwatch user (step 2).
- `/dispatch` renders with all three panels and the four-field handoff section (step 3).
- `taskDispatcher` callable returns HTTP 200 with all eight expected JSON fields populated, and `modelVersion === "claude-sonnet-4-6"` (step 7).
- Generated prompt is non-empty and readable as a Cursor handoff (step 6).
- `Copied ✓` feedback fires (step 8).
- Handoff persists across reload and clears on demand (steps 9–10).
- Non-admin cannot see the Growth Lab card and cannot reach `/dispatch` (step 11).
- All seven other primary routes (`/tires`, `/orders`, `/crm`, `/people`, `/analytics`, `/ops`, `/growth`) load without console errors (step 12).

A run is "passed" only when every criterion is satisfied. No partial passes.

## What NOT to touch
- Do not submit any tasks that would create real orders, customer messages, or Slack posts. The dispatcher only routes — it does not write to Firestore — but if any other UI is opened during this run, treat all forms as read-only.
- Do not touch `/orders`, the Slack integration, Firestore rules, `slackSecrets.js`, or any function other than `taskDispatcher`.
- Do not modify any code, configuration, or environment variables. This is a verification-only run.
- Do not run `npm run deploy:firebase`, `git push`, or any deploy command.
- If a step requires modifying anything on this list, stop and report — do not proceed.

## Report format
Return findings as: `PASS` or `FAIL` per success criterion, with screenshots for any FAIL and the exact JSON response body from step 7 verbatim.

---

## Verifier / Field Executor — completion notes (2026-04-17)

**Not executed in repo by Cursor** — brief is **verification-only** (no code changes, no deploy). When someone runs the checklist against `https://skedaddleinc.com`, append below:

- Date:
- Overall PASS / FAIL:
- Step 7 JSON snippet (redact if needed):
- Any regressions observed:
