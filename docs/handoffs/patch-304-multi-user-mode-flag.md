---
id: 304
title: Flag-gate aspirational multi-user features behind multiUserMode
branch: multi-user-mode-flag
depends_on: []
touches_shared:
  - src/utils/featureFlags.js
  - src/components/people/PeopleDashboard.jsx
  - src/components/people/AvailabilityBlocker.jsx
  - src/components/dashboard/CrewDirectoryWidget.jsx
  - src/utils/crmModuleTabs.js
  - src/pages/CrmPage.jsx
frontend_only: true
---

# Patch 304 — Multi-user mode flag

Several features only matter once Kyle (sourcer) and DJ (mechanic) are real users. Today the system has one human (Alex / admin), so these features render UI for non-existent activity. Per admin decision: hide them behind a `multiUserMode` flag, default `false`. When the flag is on, everything currently visible stays visible. When off (today), the empty / single-user-irrelevant UIs disappear.

## Branch

`multi-user-mode-flag`

## Scope

**Modify:**
- `src/utils/featureFlags.js` — add `multiUserMode: false` (or whatever the existing flag pattern is)
- `src/components/people/PeopleDashboard.jsx` — gate the AvailabilityBlocker render on the flag
- `src/components/dashboard/CrewDirectoryWidget.jsx` — render nothing (or null with a comment) when flag is off; ensure consumers handle the null case
- `src/utils/crmModuleTabs.js` — `canDispatch` should also require `multiUserMode` (FieldDispatch tab is mechanic-only and useless without a mechanic)
- `src/pages/CrmPage.jsx` — if FieldDispatch is the active tab and the flag is off, redirect to the Board tab

**Optionally:**
- `src/components/people/AvailabilityBlocker.jsx` — does not need to change internally; the gate is the wrapper

## Design

```js
// src/utils/featureFlags.js
export const flags = {
  // ...existing flags
  multiUserMode: false, // true once Kyle and/or DJ have active accounts
}
```

Each consumer reads the flag and short-circuits:

```jsx
import { flags } from '../../utils/featureFlags.js'

// PeopleDashboard.jsx (where AvailabilityBlocker renders):
{flags.multiUserMode ? <AvailabilityBlocker ... /> : null}

// CrewDirectoryWidget.jsx (top of component):
export function CrewDirectoryWidget(props) {
  if (!flags.multiUserMode) return null
  // ...existing render
}

// crmModuleTabs.js (where canDispatch is computed):
const canDispatch =
  flags.multiUserMode &&
  (profile?.role === 'mechanic' || profile?.role === 'admin')
```

For `CrmPage.jsx` — when `tab === 'dispatch'` and `!canDispatch`, redirect or fall through to the default (Board).

## Tasks

- [ ] `cd` worktree, `npm ci`
- [ ] Read `src/utils/featureFlags.js` to confirm the flag-export pattern
- [ ] Add `multiUserMode` flag default `false`
- [ ] Add gate to PeopleDashboard around AvailabilityBlocker
- [ ] Add early-return to CrewDirectoryWidget — verify all consumers handle null gracefully
- [ ] Update `canDispatch` in crmModuleTabs.js
- [ ] Update CrmPage's tab-fallback logic so deep-linking to `?tab=dispatch` falls back to Board when dispatch is hidden
- [ ] Verify:
  - `npm run lint` clean
  - `npm run test` passes — if existing tests assume the widget always renders, mock the flag to true in those tests
  - `npm run build` clean
- [ ] Single commit: `Gate aspirational multi-user features behind multiUserMode flag (default off)`
- [ ] Open PR

## Out of scope

- Building a UI to toggle the flag (it's a code-flip for now; flip when Kyle/DJ go live)
- Removing the gated components (they stay in code, just don't render)
- Touching unrelated flags

## Validation

```
npm run lint
npm run test
npm run build
```

Manual smoke: with flag off, `/people` shows no AvailabilityBlocker; `/dashboard` shows no CrewDirectoryWidget; `/crm` shows only Board + Leads tabs. Flip flag to true locally and verify everything reappears.

## PR title

`Gate aspirational multi-user features behind multiUserMode flag`

Execute this brief exactly. Branch from main, run all validation commands before opening the PR, and stop after the PR is open.
