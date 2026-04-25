---
id: 303
title: Remove isTannerPortalBlocked carve-out
branch: remove-tanner-block
depends_on: []
touches_shared:
  - src/components/people/InviteUrlToolkit.jsx
frontend_only: true
---

# Patch 303 — Remove `isTannerPortalBlocked` carve-out

Per admin decision: the Tanner-portal block is no longer relevant in 2026. Remove the carve-out.

## Branch

`remove-tanner-block`

## Scope

**Modify:**
- `src/components/people/InviteUrlToolkit.jsx` — remove the `isTannerPortalBlocked` export and any code paths that gate on it

## Tasks

- [ ] `cd` into worktree, `npm ci`
- [ ] `grep -rn "isTannerPortalBlocked\|TannerPortal\|Tanner" src/` to find every callsite
- [ ] Read `InviteUrlToolkit.jsx` to understand how the block is used
- [ ] Delete the `isTannerPortalBlocked` function definition
- [ ] Remove every callsite — if a guard is `if (isTannerPortalBlocked()) return null`, remove the guard so the wrapped UI renders unconditionally
- [ ] Remove the export
- [ ] Update or remove any tests that assert on the block
- [ ] Verify lint, test, build
- [ ] Single commit: `Remove isTannerPortalBlocked carve-out (no longer relevant)`
- [ ] Open PR

## Out of scope

- Refactoring the rest of `InviteUrlToolkit.jsx`
- Auditing any other portal-blocked state for other vendors

## Validation

```
npm run lint
npm run test
npm run build
```

## PR title

`Remove isTannerPortalBlocked carve-out`

Execute this brief exactly. Branch from main, run all validation commands before opening the PR, and stop after the PR is open.
