---
id: 104
title: size-limit budgets to prevent bundle creep
branch: size-limit
depends_on: []
touches_shared:
  - package.json
frontend_only: true
---

# Patch 104 — `size-limit` budgets

Adds `size-limit` config + a CI step that fails the PR when JS bundles grow past their budget. Stops gradual bundle creep that nobody notices commit-to-commit but adds up to slow page loads over months.

## Branch

`size-limit`

## Scope

**Create:**
- `.size-limit.cjs`

**Modify:**
- `package.json`
- `package-lock.json`
- `.github/workflows/visual-tests.yml` (add a `size-limit` job — only if PR-A has merged; if not, create a standalone `.github/workflows/bundle-size.yml`)

## Tasks

- [ ] **Step 1: Install**

```
npm i -D size-limit @size-limit/file
```

- [ ] **Step 2: Create `.size-limit.cjs`**

Audit current build sizes first:

```
npm run build
ls -lh dist/assets/*.js
```

Record current sizes (gzipped) and set budgets ~10% above current to give headroom. Reasonable starting points based on the PR-122 build output:

```js
module.exports = [
  {
    name: 'main entry (initial JS)',
    path: 'dist/assets/index-*.js',
    limit: '90 KB',
  },
  {
    name: 'config chunk (vendor)',
    path: 'dist/assets/config-*.js',
    limit: '140 KB',
  },
  {
    name: 'tires page chunk',
    path: 'dist/assets/TiresPage-*.js',
    limit: '40 KB',
  },
  {
    name: 'crm page chunk',
    path: 'dist/assets/CrmPage-*.js',
    limit: '20 KB',
  },
  {
    name: 'people page chunk',
    path: 'dist/assets/PeoplePage-*.js',
    limit: '25 KB',
  },
  {
    name: 'analytics page chunk',
    path: 'dist/assets/AnalyticsPage-*.js',
    limit: '15 KB',
  },
  {
    name: 'ops page chunk',
    path: 'dist/assets/OpsPage-*.js',
    limit: '10 KB',
  },
]
```

Adjust each `limit` to be ~10% above whatever `ls -lh` reported (gzipped via size-limit's compression by default). Round up to the next sensible KB.

- [ ] **Step 3: Add npm script**

```json
"scripts": {
  ...
  "size": "size-limit"
}
```

- [ ] **Step 4: Add CI step**

If `.github/workflows/visual-tests.yml` exists (PR-A merged), append a new job:

```yaml
  size:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: npm }
      - run: npm ci
      - run: npm run build
      - run: npm run size
```

If PR-A has not merged yet, create `.github/workflows/bundle-size.yml`:

```yaml
name: Bundle size
on:
  pull_request:
    branches: [main]
  push:
    branches: [main]
jobs:
  size:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: npm }
      - run: npm ci
      - run: npm run build
      - run: npm run size
```

- [ ] **Step 5: Verify locally**

```
npm run build
npm run size
```

All limits pass. If anything's red, the budget is too tight — bump to current + 10%.

## Out of scope

- Tracking CSS bundle sizes (separate concern; CSS is small here)
- Reporting size diffs vs main on every PR (nice-to-have; do later via `andresz1/size-limit-action` if we want comments)

## Validation

```
npm run lint
npm run build
npm run size
```

All three clean.

## PR title

`Add size-limit budgets for JS bundles`

Execute this brief exactly. Branch from main, run all validation commands before opening the PR, and stop after the PR is open.
