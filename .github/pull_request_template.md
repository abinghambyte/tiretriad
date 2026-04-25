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
