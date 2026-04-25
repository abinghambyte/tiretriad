---
id: 102
title: CODEOWNERS auto-routing for chrome / auth / data-model changes
branch: codeowners
depends_on: []
touches_shared: []
frontend_only: true
---

# Patch 102 — CODEOWNERS

Adds GitHub `CODEOWNERS` so changes to security-sensitive or chrome-shared files automatically request review from the admin (`@abinghambyte`). Stops critical-path changes from sneaking through without an admin look.

## Branch

`codeowners`

## Scope

**Create:**
- `.github/CODEOWNERS`

## Tasks

- [ ] Create `.github/CODEOWNERS` with the content below. Replace `@abinghambyte` with the actual GitHub handle if different (verify via `git log --format='%an <%ae>'` if unsure; the org is `abinghambyte/skedaddleinc`).

```
# CODEOWNERS for skedaddleinc/skedaddleinc
#
# Lines listed later take precedence. Each rule maps a glob to a reviewer.
# An owner is auto-requested on any PR that touches a matching file.
# https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners

# Default: admin owns everything we don't list explicitly
*                                @abinghambyte

# Security boundary — Firestore rules + functions backend
firestore.rules                  @abinghambyte
functions/                       @abinghambyte

# Auth + identity
src/firebase/                    @abinghambyte
src/hooks/useUserProfile.js      @abinghambyte
src/constants/peoplePermissions* @abinghambyte

# Shared chrome — every change here can break every page
src/components/layout/           @abinghambyte
src/components/ui/               @abinghambyte
src/index.css                    @abinghambyte

# CI + workflows + deploy config
.github/                         @abinghambyte
vercel.json                      @abinghambyte
package.json                     @abinghambyte
package-lock.json                @abinghambyte
playwright.config.ts             @abinghambyte
tailwind.config.js               @abinghambyte
vite.config.js                   @abinghambyte

# Specs and plans — admin should sign off on architectural docs
docs/superpowers/specs/          @abinghambyte
docs/superpowers/plans/          @abinghambyte
```

## Out of scope

- Branch protection rules (separate patch — requires admin to enable in GitHub settings, not via files)
- Adding additional reviewers (no other team members are on the repo yet)

## Validation

```
# Verify file is parseable by GitHub:
# Open the PR — GitHub will surface a "Owners" section in the PR sidebar if parsed correctly.
# If it shows "Code owners is invalid", the syntax is wrong.
```

## PR title

`Add CODEOWNERS for chrome / auth / backend / docs`

Execute this brief exactly. Branch from main, run all validation commands before opening the PR, and stop after the PR is open.
