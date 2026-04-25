---
id: 305
title: Verify SinchChatMount + inline single-file "module" dirs
branch: inline-single-file-modules
depends_on: []
touches_shared:
  - src/components/analytics/MarginWeekLineChart.jsx
  - src/components/milestones/OrderCompletionMilestones.jsx
  - src/components/chat/SinchChatMount.jsx
frontend_only: true
---

# Patch 305 — Inline single-file "module" dirs

Three component dirs each contain a single non-test file:

- `src/components/analytics/MarginWeekLineChart.jsx` (consumed only by `AnalyticsPage`)
- `src/components/milestones/OrderCompletionMilestones.jsx` (mounted by `PortalChrome`)
- `src/components/chat/SinchChatMount.jsx` (audit flagged — verify it's actually mounted)

Each is a "module" with one file. Inline them into their callsites OR move them to flat `src/components/` files. Per audit recommendation: inline / flatten.

## Branch

`inline-single-file-modules`

## Scope

**Verify first:** is `SinchChatMount` actually rendered anywhere?

```sh
grep -rn "SinchChatMount" src/
```

- If 0 non-self references → it's dead. Delete the file and the directory.
- If 1+ references → it's live. Apply the same flatten/inline logic as the others.

**For each file that's still live:**

Two patterns acceptable, your call per file:
- **Inline into callsite** — paste the component definition into the file that uses it (only valid if there's exactly 1 callsite AND the file is small enough to not bloat the host)
- **Flatten into `src/components/`** — move the file to `src/components/<name>.jsx` (no subdir), update the one or two import paths

Use **flatten** for `MarginWeekLineChart` (it's a sizable chart, doesn't belong inlined) and `OrderCompletionMilestones` (mounted globally — flat is fine). Use **inline** only if a component is < 30 lines.

After moves, delete the now-empty directories.

## Tasks

- [ ] `cd` worktree, `npm ci`
- [ ] `grep -rn "SinchChatMount" src/` — confirm mounted-or-not
- [ ] If unmounted: `rm -r src/components/chat/`, no replacement
- [ ] If mounted: move the file per the pattern above
- [ ] Move `MarginWeekLineChart.jsx` to `src/components/MarginWeekLineChart.jsx` (or wherever flat lives in this repo)
- [ ] Move `OrderCompletionMilestones.jsx` similarly
- [ ] Update every importer (grep + edit)
- [ ] Delete the now-empty `analytics/` and `milestones/` directories
- [ ] Verify:
  - `npm run lint` clean
  - `npm run test` passes
  - `npm run build` clean
- [ ] Commit: `Inline single-file module dirs into callsites or flat src/components`
- [ ] Open PR

## Out of scope

- Refactoring the MarginWeekLineChart visualization
- Refactoring OrderCompletionMilestones behavior
- Splitting other multi-file components

## Validation

```
npm run lint
npm run test
npm run build
```

## PR title

`Flatten 3 single-file 'module' dirs (analytics, milestones, chat)`

Execute this brief exactly. Branch from main, run all validation commands before opening the PR, and stop after the PR is open.
