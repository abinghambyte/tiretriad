# Cursor handoff — [Short title]

>Worker: Field Executor (Cursor)
>Author: Portal Architect (Sonnet 4.6)
>Date: YYYY-MM-DD
>Run after: [other handoff filename, or omit]

## Goal

One paragraph. What problem this solves and why.

---

## Changes

### File: `path/to/file.js`

Describe what to find and what to change. Include code blocks for anything non-obvious.

### File: `path/to/other.js`

Same pattern.

---

## Do NOT touch

- List specific files or systems that are off-limits
- eBay files — always on hold until eBay approval
- Profit formula: profit = paymentAmount - cost (FET washes out)

---

## After changes

```bash
cd functions && npm run lint
npm run deploy
```

Fix any lint errors before deploying. No exceptions.

Confirm deploy succeeds. Test the specific thing that changed.

---

## Completion log (optional — append when done)

After implementation or verification, add a dated subsection to the bottom of **this** handoff file (or to `_handoffs/README.md` index if you prefer one global log):

- **Who:** Field Executor (Cursor) / Site Verifier / human
- **Date:** YYYY-MM-DD
- **What changed:** files + one-line summary
- **Deploy:** e.g. functions pushed / Vercel pushed / not applicable
- **Follow-ups:** anything left for ops or a later handoff

---

## Commit style guide (permanent — follow every time)

Write commits the way a developer would at the end of a long day. Short, lowercase, no buzzwords, no "feat:" or "chore:" prefixes unless already established in the repo.

**Good:**
- `bulk price refresh working`
- `fix modal all keyword detection`
- `surface slack command options`
- `drop growthLabTaskDispatch`
- `description cell two-line layout`

**Bad:**
- `feat: implement bulk price refresh with admin authorization gate and async runBulkPriceRefresh`
- `refactor: update MSPN modal to detect all keyword for catalog-wide refresh`
- `Co-Authored-By: Claude`

**Rules:**
- Under 60 characters
- Lowercase
- Imperative or descriptive — either works ("fix modal" or "modal fixed")
- No ticket numbers, no emoji, no AI attribution
- If multiple things changed, pick the most important one for the subject line
- Use the body (blank line after subject) only if the why isn't obvious

**Author:** commits push under `Alex Bingham <boydabingham@gmail.com>` — that's correct, keep it that way.
