---
id: 306
title: Codemod inline button classes to BTN_PRIMARY / BTN_SECONDARY
branch: button-styles-codemod
depends_on: []
touches_shared:
  - src/components/ui/buttonStyles.js
frontend_only: true
---

# Patch 306 — Button styles codemod

`src/components/ui/buttonStyles.js` exports `BTN_PRIMARY`, `BTN_SECONDARY`, `BTN_GHOST_DESTRUCTIVE` (and possibly more) — but at least half the button callsites in pages re-declare the same Tailwind classes inline. This patch consolidates: every button that visually matches one of the existing variants imports the constant instead of inlining.

## Branch

`button-styles-codemod`

## Scope

**Read first:**
- `src/components/ui/buttonStyles.js` — note the exact class strings each constant defines

**Then survey:** `grep -rn "rounded-lg.*bg-amber\|rounded-lg.*bg-zinc" src/components/ src/pages/` and similar to find inline declarations matching the exported constants.

**Then refactor:** for each match, replace the inline `className="rounded-lg bg-amber-500 px-3 py-2 ..."` with `className={BTN_PRIMARY}` (or whichever variant matches).

Buttons that have variant-specific tweaks (extra width, custom padding, etc.) should compose: `className={\`${BTN_PRIMARY} min-h-[44px]\`}`.

**Do NOT change:** buttons whose color or shape genuinely differ from the standard variants (e.g., the violet "Run AI advisor" button, fuchsia "Log prospective" button, emerald "Fulfilled" button). These are intentionally distinct and shouldn't be forced into the primary palette.

## Tasks

- [ ] `cd` worktree, `npm ci`
- [ ] Read `src/components/ui/buttonStyles.js` and document each variant's exact class string
- [ ] `grep -rn "rounded.*bg-amber" src/` — list candidate primary buttons
- [ ] `grep -rn "rounded.*border-zinc.*hover:bg-zinc" src/` — list candidate secondary/ghost buttons
- [ ] For each match, decide: variant exact match OR variant + tweaks OR keep inline (don't force)
- [ ] Replace inline className with the constant + composed tweaks
- [ ] Verify:
  - Visual baselines may shift slightly if any constant differs from the inline string in a non-trivial way — document any shifts in PR description
  - `npm run lint` clean
  - `npm run test` passes
  - `npm run build` clean
- [ ] One commit per logical group is fine, OR a single commit:
  - `Codemod inline button classes to BTN_PRIMARY/BTN_SECONDARY constants`
- [ ] Open PR

## Out of scope

- Adding new button variants to buttonStyles.js (separate concern)
- Changing the visual design of buttons (this is a refactor, not a redesign)
- Touching the brand-specific buttons (advisor violet, prospective fuchsia, etc.)

## Validation

```
npm run lint
npm run test
npm run build
npm run test:visual
```

If `test:visual` fails on routes where buttons appeared, regenerate baselines via the workflow_dispatch and document in PR description.

## PR title

`Codemod inline button classes to BTN_PRIMARY/BTN_SECONDARY constants`

Execute this brief exactly. Branch from main, run all validation commands before opening the PR, and stop after the PR is open.
