---
id: 101
title: PR template with mobile / a11y / performance checklist
branch: pr-template
depends_on: []
touches_shared: []
frontend_only: true
---

# Patch 101 — PR template

Adds `.github/pull_request_template.md` with a self-review checklist that PR authors must complete before requesting review. Captures the gaps the April UI sweep flagged: nobody was testing at 375px, nobody was running an a11y check, nobody was watching bundle size.

## Branch

`pr-template`

## Scope

**Create:**
- `.github/pull_request_template.md`

That's it. One file.

## Tasks

- [ ] Create `.github/pull_request_template.md` with the body below verbatim:

```markdown
## Summary

<!-- 1-3 sentences. Why this PR? Link the spec / plan if any. -->

## Test plan

- [ ] `npm run lint` clean
- [ ] `npm run test` passes
- [ ] `npm run build` clean
- [ ] If UI changed: tested at **375px (mobile)** and **1280px (desktop)**
- [ ] If UI changed: tested with sticky elements scrolled past (popover, sheet, modal, table head)
- [ ] If UI changed: no new console errors in dev
- [ ] If a11y impact: ran the page through axe DevTools (Chrome extension) and noted any new violations
- [ ] If touching shared chrome (top bar, bottom nav, modals, popovers): verified no regression on at least one other page

## Screenshots

<!-- Required for UI changes. Mobile + desktop side-by-side preferred. -->

## Risk

<!-- One line. What's the worst that happens if this is wrong? Who notices first? -->

## Rollout

<!-- Behind a flag? Migration step? Just merges and deploys? -->
```

## Out of scope

- Changing existing PR descriptions retroactively
- Branch protection rules (separate concern, separate patch later)
- Issue templates (separate concern)

## Validation

```
npm run lint
npm run build
```

(Neither is affected, but run them to confirm nothing else changed.)

## PR title

`Add PR template with mobile / a11y / perf checklist`

Execute this brief exactly. Branch from main, run all validation commands before opening the PR, and stop after the PR is open.
