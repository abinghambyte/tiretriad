---
id: 302
title: Add Growth Lab nav entry under Admin panel
branch: growth-lab-admin-nav
depends_on: []
touches_shared:
  - src/pages/AdminPage.jsx
frontend_only: true
---

# Patch 302 — Growth Lab nav entry under Admin

The `/growth` route exists but is intentionally hidden from the main nav — only reachable via Cmd+K. Per admin decision: keep it, but add a discoverable entry under the Admin panel.

## Branch

`growth-lab-admin-nav`

## Scope

**Modify:**
- `src/pages/AdminPage.jsx` — add a card / link / section that navigates to `/growth`

## Design

`AdminPage` is currently a single page with a few admin actions (price research callable, SMS webhook URL, AuditLogPanel). The audit also flagged it as a "grab-bag." This patch is small: add a single "Growth Lab" card with a description and a link to `/growth`.

Suggested placement: at the top of the page near the price-research section, OR as its own section with a simple `<Link>`.

```jsx
import { Link } from 'react-router-dom'
// ...

<section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 sm:p-5">
  <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-400">
    Growth Lab
  </h2>
  <p className="mt-2 text-sm text-zinc-300">
    Internal task dispatcher for routing work across model variants.
    Overwatch only.
  </p>
  <Link
    to="/growth"
    className="mt-3 inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-medium text-zinc-100 hover:border-zinc-500 hover:bg-zinc-800"
  >
    Open Growth Lab →
  </Link>
</section>
```

Match the styling of the other AdminPage sections (read AdminPage.jsx first to confirm the existing pattern).

## Out of scope

- Reorganizing AdminPage into tabs (a separate patch can do that later)
- Renaming the `/growth` route
- Auditing whether the Growth Lab callable still works

## Validation

```
npm run lint
npm run test
npm run build
```

Manual smoke: visit `/admin` as an admin user; click the new Growth Lab link; arrive at `/growth`.

## PR title

`Add Growth Lab discoverability link under Admin panel`

Execute this brief exactly. Branch from main, run all validation commands before opening the PR, and stop after the PR is open.
