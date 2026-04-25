---
id: 308
title: Small chrome cleanups (drop /settings TODO + fullPortal toggle UI)
branch: small-chrome-cleanups
depends_on: []
touches_shared:
  - src/components/layout/PortalTopBar.jsx
frontend_only: true
---

# Patch 308 — Small chrome cleanups

Two small dangling items in the layout:

1. `PortalTopBar.jsx` has a `// TODO: add Settings link here once a /settings route exists in src/App.jsx` comment for a route that has never landed and isn't planned.
2. `MobileBottomNav.jsx` reads `localStorage.getItem('skedaddle.mobile.fullPortal')` to switch between the 2-item and 7-item nav, but the avatar dropdown's "Switch to full portal" button writes the flag without giving any way to switch back. Add the inverse toggle.

## Branch

`small-chrome-cleanups`

## Scope

**Modify:**
- `src/components/layout/PortalTopBar.jsx` — remove the `// TODO: add Settings link` comment; in the avatar dropdown, add the inverse "Back to focused mobile" entry that clears the localStorage flag and reloads, but only when the flag is currently set

## Design — inverse toggle

The avatar dropdown today has:

```jsx
<button onClick={() => {
  window.localStorage.setItem('skedaddle.mobile.fullPortal', '1')
  window.location.reload()
}}>
  Switch to full portal
</button>
```

Add a paired entry that's mutually exclusive with the above:

```jsx
{(() => {
  let isFullPortal = false
  try {
    isFullPortal = window.localStorage.getItem('skedaddle.mobile.fullPortal') === '1'
  } catch {}
  return isFullPortal ? (
    <button
      type="button"
      onClick={() => {
        try { window.localStorage.removeItem('skedaddle.mobile.fullPortal') } catch {}
        window.location.reload()
      }}
      className="block w-full px-3 py-2.5 text-left text-zinc-300 hover:bg-zinc-800/80"
    >
      Back to focused mobile
    </button>
  ) : (
    <button
      type="button"
      onClick={() => {
        try { window.localStorage.setItem('skedaddle.mobile.fullPortal', '1') } catch {}
        window.location.reload()
      }}
      className="block w-full px-3 py-2.5 text-left text-zinc-300 hover:bg-zinc-800/80"
    >
      Switch to full portal
    </button>
  )
})()}
```

Or refactor cleanly by lifting the read to a `useState(() => ...)` at the component top so the IIFE isn't needed. Pick whichever feels cleaner with the existing code.

## Tasks

- [ ] `cd` worktree, `npm ci`
- [ ] Find the `// TODO: add Settings link` comment in PortalTopBar.jsx and delete the lines
- [ ] Find the existing "Switch to full portal" button and add the inverse "Back to focused mobile" option
- [ ] Use a single useState to track the flag's current value (read once on mount)
- [ ] Verify lint / test / build
- [ ] Single commit: `Small chrome cleanups: drop stale settings TODO + add full-portal inverse toggle`
- [ ] Open PR

## Out of scope

- Building a real `/settings` route
- Refactoring the avatar dropdown
- Adding additional menu items

## Validation

```
npm run lint
npm run test
npm run build
```

Manual smoke: tap avatar, see "Switch to full portal". Tap it, page reloads in full mode. Tap avatar again, see "Back to focused mobile". Tap it, page reloads back to focused mode.

## PR title

`Small chrome cleanups: drop stale settings TODO + add full-portal inverse toggle`

Execute this brief exactly. Branch from main, run all validation commands before opening the PR, and stop after the PR is open.
