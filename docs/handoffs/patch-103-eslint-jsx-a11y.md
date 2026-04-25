---
id: 103
title: eslint-plugin-jsx-a11y for static a11y checks at lint time
branch: eslint-jsx-a11y
depends_on: []
touches_shared:
  - eslint.config.js
  - package.json
frontend_only: true
---

# Patch 103 — `eslint-plugin-jsx-a11y`

Adds `eslint-plugin-jsx-a11y` to the existing ESLint config to catch static a11y issues (missing alt, bad ARIA, missing form labels) at lint time before they reach a PR. Complements the runtime axe-core scan from PR-A by catching the cheaper class of bugs faster.

## Branch

`eslint-jsx-a11y`

## Scope

**Modify:**
- `eslint.config.js` (or `.eslintrc.cjs` — read first, follow whatever's there)
- `package.json`
- `package-lock.json`

## Tasks

- [ ] **Step 1: Install the plugin**

```
npm i -D eslint-plugin-jsx-a11y
```

- [ ] **Step 2: Wire into ESLint config**

Read `eslint.config.js` first. If it uses the new flat-config format (`export default [...]`), add:

```js
import jsxA11y from 'eslint-plugin-jsx-a11y'

// Inside the array, alongside react / react-hooks plugins:
{
  files: ['**/*.{jsx,tsx}'],
  plugins: { 'jsx-a11y': jsxA11y },
  rules: {
    ...jsxA11y.configs.recommended.rules,
    // Lower these to warn while we triage; bump to error after the first cleanup PR
    'jsx-a11y/click-events-have-key-events': 'warn',
    'jsx-a11y/no-static-element-interactions': 'warn',
    'jsx-a11y/label-has-associated-control': 'warn',
  },
},
```

If the project uses legacy `.eslintrc.cjs`, add the plugin to `plugins` and extend `'plugin:jsx-a11y/recommended'` instead.

- [ ] **Step 3: Run lint and triage**

```
npm run lint
```

Expect violations. For each one:
- If trivial (5 minutes), fix it in this PR
- If non-trivial, leave the rule as `warn` (already the case for the three above) and open a follow-up issue

**Do NOT** disable rules wholesale. If you can't fix a rule in this PR, set it to `warn` and document why in a code comment above the rule entry.

- [ ] **Step 4: Lint must be 0 errors before PR opens**

```
npm run lint
```

Exit code 0 required. Warnings are acceptable.

## Out of scope

- Fixing every a11y violation the plugin reports — only the cheap ones in this PR
- TypeScript types for the plugin (it ships its own)
- Adding a separate a11y-only lint script (one lint pipeline is fine)

## Validation

```
npm run lint
npm run test
npm run build
```

All three clean.

## PR title

`Add eslint-plugin-jsx-a11y for static a11y checks`

Execute this brief exactly. Branch from main, run all validation commands before opening the PR, and stop after the PR is open.
