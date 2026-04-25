---
id: 301
title: Commit to NextToPostSurface; delete HiddenGemsSurface and listingAdvisor flag
branch: commit-advisor-mode
depends_on: []
touches_shared:
  - src/components/dashboard/Dashboard.jsx
  - src/utils/featureFlags.js
frontend_only: true
---

# Patch 301 — Commit to advisor mode

The dashboard currently swaps between `<NextToPostSurface>` and `<HiddenGemsSurface>` based on `flags.listingAdvisor`. Per admin decision: NextToPostSurface (advisor mode) is the canonical surface. HiddenGemsSurface and the flag check both come out.

## Branch

`commit-advisor-mode`

## Scope

**Modify:**
- `src/components/dashboard/Dashboard.jsx` — remove the flag check and the HiddenGemsSurface render path; render NextToPostSurface unconditionally
- `src/utils/featureFlags.js` — remove `listingAdvisor` from the flag set
- `src/components/dashboard/HiddenGemsSurface.jsx` — DELETE
- `src/components/dashboard/HiddenGemsSurface.test.jsx` (if exists) — DELETE
- Anywhere else `HiddenGemsSurface` is imported (grep first) — update or remove the imports

## Tasks

- [ ] `cd` into the worktree, `npm ci`
- [ ] `grep -rn "HiddenGemsSurface\|listingAdvisor" src/` to find every callsite
- [ ] Read `Dashboard.jsx` around the flag check to understand the swap logic
- [ ] Delete the HiddenGemsSurface file + test
- [ ] Remove the flag from `featureFlags.js`
- [ ] Update Dashboard.jsx to render `<NextToPostSurface ... />` unconditionally
- [ ] Update any other consumer of the flag
- [ ] Verify:
  - `npm run lint` clean
  - `npm run test` passes
  - `npm run build` clean
- [ ] Single commit: `Delete HiddenGemsSurface; commit to NextToPostSurface as the only listing surface`
- [ ] Open PR

## Out of scope

- Renaming NextToPostSurface (it's the canonical name now)
- Refactoring NextToPostSurface internals
- Removing other unused flags from `featureFlags.js`

## Validation

```
npm run lint
npm run test
npm run build
```

## PR title

`Delete HiddenGemsSurface; commit to NextToPostSurface as the only listing surface`

Execute this brief exactly. Branch from main, run all validation commands before opening the PR, and stop after the PR is open.
