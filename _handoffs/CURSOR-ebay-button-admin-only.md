# Cursor handoff — Hide eBay listing button from non-admins

>Worker: Field Executor (Cursor)
>Author: Portal Architect (Sonnet 4.6)
>Date: 2026-04-17

## Problem

The "List on eBay" button in the Listing Generator is visible to all authenticated users including crew (Kyle, DJ). The backend always returns "not implemented yet". Crew tapping this button will think the app is broken. eBay integration is on hold pending developer approval.

## Fix

Gate the eBay button behind admin role. Non-admins should not see it at all. Admins see it with a clear "Pending eBay approval" disabled state so they know it's intentional.

---

## Files to change

Find the Listing Generator / Listing Advisor component that renders the "List on eBay" button. Search for `ebay` or `eBay` or `ebayPublishListing` in `src/` to locate it.

### 1. Gate visibility on admin role

Wrap the eBay button in an admin check. The portal already has a `useAuth` hook or similar that exposes the user's role. Use it:

```jsx
{isAdmin && (
  <button
    disabled
    title="eBay integration pending approval"
    className="... opacity-40 cursor-not-allowed"
  >
    List on eBay — coming soon
  </button>
)}
```

If `isAdmin` isn't already available in the component, import it from the auth context the same way other admin-gated UI is done in the codebase (look at how `/growth` or the admin tools section gates content).

### 2. Do not change the backend

Leave `functions/ebayIntegration.js` exactly as-is. This is a frontend-only change.

---

## Do NOT touch

- `functions/ebayIntegration.js` — eBay is on hold, do not modify
- Any other Slack commands, routes, or components
- Order lifecycle, financial logic

---

## After changes

```bash
npm run lint
npm run build
```

Push to main — Vercel auto-deploys. No function deploy needed.

Verify: log in as a non-admin user (or check role logic) and confirm the eBay button is not rendered. Log in as admin and confirm it shows as disabled with the "coming soon" label.

---

## Field Executor — completion notes (2026-04-15)

### Shipped

- **`src/components/tires/ListingGenerator.jsx`** — **`useUserProfile()`**; **`profile?.role === 'admin'`** gates the eBay control. Non-admins see no eBay UI. Admins see a **disabled** button: **“List on eBay — coming soon”**, `title="eBay integration pending approval"`. Removed **`ebayPublishFn`** probe/publish paths so crew never hits a stub callable.

### Verify

- `npm run lint` and `npm run build` passed from repo root. No function changes for this handoff.
