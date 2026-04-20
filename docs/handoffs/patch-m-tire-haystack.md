# Patch M - Tire search haystack normalizer expansion

You are a Cursor agent shipping ONE patch from a parallel rollout. Two other patches (K, L) are in flight concurrently. Do not touch any file outside the scope below. See `docs/handoffs/README.md` for the full ownership map if needed.

## Goal

Fix the description-search format mismatch on the Tires catalog: searches for values like `X2L` or a full pasted manufacturer description do not reliably match catalog rows today. The normalizer already handles some paste formats (load-range phrases, sidewall codes, leading P on passenger metric) but misses on load-range suffix position, speed-rating isolation, and several `/BSW`-adjacent codes. Expand coverage and lock it in with a broad test battery so future pastes stop silently missing.

## Branch

`tire-haystack-v2` (cut from latest `main`).

## Context

- `src/utils/tireSearchHaystack.js` is the single source of truth. Three exports: `buildTireHaystack(tire)`, `normalizeQuery(s)`, `matchesQuery(tire, rawQuery)`. Plus the internal `stripVerbosePhrases` and `normalizeTokens` helpers.
- `src/utils/tireSearchHaystack.test.js` is the existing test suite. Add to it - do not replace.
- `parseDescription` (from `src/utils/parseTireDescription.js`) extracts size / load-index / speed-rating components. Already handles most LT-prefix and flotation cases. Do not change this file - the gap is in the normalizer, not the parser.
- `deriveTireTags` (from `src/utils/deriveTireTags.js`) computes the search tag set. Again: do not change. The gap is in how the query side normalizes.

### Known failing paste formats

The ROADMAP captured three gaps. Each must be covered by at least one test case that fails on main and passes after your change:

1. **Load-range suffix position**: `LT225/75R16 E` vs `225/75R16 LT E` vs `225/75R16E` - all three should match the same tire. The position of the `LT` and the load-range letter varies across retailers.
2. **Speed-rating isolation**: A paste like `P255/55R18 109V XL BSW` includes a speed rating `V` after a load index; the current token path can strip `V` as a short token and drop the signal. Preserve speed-rating letters.
3. **Trailing or leading cosmetic codes**: `/BSW`, `/WW`, `/RBL`, `/OWL` attached to the size via slash (not as a standalone word) - today only standalone-word forms are stripped.

There may be more. A separate `X2L` example is called out explicitly; test it against the catalog's real tread-name normalization to see whether the mismatch is in tread tokenization vs. size tokenization.

## Scope (only touch these files)

- `src/utils/tireSearchHaystack.js` - normalizer expansion
- `src/utils/tireSearchHaystack.test.js` - add a paste-format battery
- NEW: `src/utils/tireSearchHaystack.fixtures.js` - exported array of `{ name, paste, shouldMatchMspn }` test fixtures so future agents can add one-liner regression cases without touching the test harness

Do not touch the parser, the tag deriver, the catalog UI, or any Firestore schema.

## Tasks

### 1. Expand `stripVerbosePhrases`

- Treat slash-attached sidewall codes the same as standalone words: `/BSW`, `/WW`, `/RBL`, `/OWL`, `/ROWL`, `/RWL`, `/WWL`, `/SBL`, `/BLK`, `/BW`. Strip the slash + code, preserve the rest of the size. Use a non-capturing group keyed off `/` followed by the code.
- Normalize load-range position: if a standalone letter `A`-`F` appears immediately after a size expression with or without separator, move it to a predictable suffix position so the catalog haystack (which stores `lr` as its own field) matches. Concretely: a post-strip regex that collapses `225/75R16 E` or `225/75R16E` into `225/75R16 LR-E`. Be careful not to consume tread-name letters - anchor on a size-shaped token immediately preceding a single letter.

### 2. Broaden the token fallback

- In `normalizeTokens`, the current filter drops tokens under 2 chars. Keep that, but add a dedicated speed-rating carve-out: if a standalone token matches `^[A-Z]$` and the surrounding paste contains a 3-digit load index, preserve the letter as a speed-rating token (1 char). Treat `Q`-`Y` specifically so ambiguous letters are not swept up.
- Current token filter drops anything under 2 chars after stripping non-alphanumerics - so a bare `V` gets dropped. Fix: after token stripping, reintroduce any detected speed-rating letter into the token list. Keep the detection purely regex-driven - no dictionary.

### 3. Add `tireSearchHaystack.fixtures.js`

Export one array: `PASTE_MATCH_FIXTURES`. Each entry shape:

```js
{
  name: 'LT + load range, separator variants',
  tire: { description: '...', mspn: '...', lr: '...', brand: '...', tread: '...' },
  pastes: [
    'LT225/75R16 E',
    '225/75R16 LT E',
    '225/75R16E',
  ],
}
```

Use real-shaped mock tire objects (not Firestore snapshots). Cover at minimum: the three failing categories above, a BSW-prefixed desktop paste, a flotation-style size like `32X11.50R15LT`, a passenger metric with speed rating, and one regression fixture for a currently-working format so regressions stay caught.

### 4. Wire the fixtures into the test suite

In `tireSearchHaystack.test.js`, import `PASTE_MATCH_FIXTURES` and add a parameterized block:

```js
describe.each(PASTE_MATCH_FIXTURES)('paste format: $name', ({ tire, pastes }) => {
  it.each(pastes)('matches paste %s', (paste) => {
    expect(matchesQuery(tire, paste)).toBe(true)
  })
})
```

No new hand-written cases beyond what the fixtures provide - if the fixtures drift, the tests drift with them.

### 5. Preserve the existing cache contract

The WeakMap cache on `buildTireHaystack` is keyed on the tire object identity. If you add fields to the haystack string, make sure the cached output reflects them - i.e. do not cache before the new fields are appended. Ship a tiny test that confirms: the same tire object passed twice returns the same haystack string, and a tire object mutated in place (different properties) keyed as a different object identity in the test returns a fresh string.

## Out of scope

- Fuzzy / Levenshtein matching. The strategy stays substring + token-subset.
- Catalog side: do not touch how tires are stored or tagged. Only the query normalizer changes.
- UI in the search box. No debounce changes, no placeholder copy, no result count UI.
- Dictionary-based synonym matching (e.g., mapping `BLK` -> `black`). The strip list stays pattern-only.
- Tread-name canonicalization (e.g., `X2L` -> `XTrek 2 Laredo`). That is a separate, larger project.

## Validation (must all pass before PR)

```
./node_modules/.bin/vitest run src/utils/tireSearchHaystack
./node_modules/.bin/vitest run
./node_modules/.bin/eslint src/utils/tireSearchHaystack.js src/utils/tireSearchHaystack.test.js src/utils/tireSearchHaystack.fixtures.js
./node_modules/.bin/vite build
```

The first command should report at least 10 new `paste format` test cases passing. The whole-repo run must stay green.

## PR

- Title: `Tires search: expand paste normalizer coverage`
- Body: short summary listing the three gap categories closed, the fixture count added, and a "Known remaining" note for anything your probing surfaced but did not fix (so it is preserved for a follow-up). No Claude trailers, no em dashes in published text.

Execute this brief exactly. Branch from main, run all validation commands before opening the PR, and stop after the PR is open.
