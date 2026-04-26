---
id: 501
title: Listing Advisor — surface fallback state clearly + retry-actually-retries
branch: advisor-fallback-resilience
depends_on: []
touches_shared:
  - src/components/tires/ListingGenerator.jsx
frontend_only: true
---

# Patch 501 — Listing Advisor fallback resilience

When the Listing Advisor's primary model fails, the UI shows three confusing signals at once: a red "Narrative unavailable (retry)." error, an "ANTHROPIC FALLBACK" tag with claude-haiku-4-5, and a "35% sell probability" badge in red. The "(retry)" text isn't an interactive control — clicking it does nothing. The user can't tell whether the advisor is broken or just degraded.

This patch:
1. Replaces the static "(retry)" text with an actual retry button
2. Surfaces the fallback chain state more clearly (which model was tried, which is being used now, why)
3. Keeps the existing fallback behavior — primary failed, Haiku is the safety net — but makes it not look broken

## Branch

`advisor-fallback-resilience`

## Scope

Modify only `src/components/tires/ListingGenerator.jsx`. No backend changes, no new utilities.

## Design

### Current state (broken)

```jsx
{narrativeError ? (
  <p className="text-red-400 text-sm">Narrative unavailable (retry).</p>
) : null}
```

The "(retry)" is plain text. Confusing.

### After this patch

```jsx
{narrativeError ? (
  <div className="rounded-lg border border-amber-700/50 bg-amber-950/30 p-3" role="alert">
    <p className="text-sm font-medium text-amber-200">
      Narrative unavailable
    </p>
    <p className="mt-1 text-xs text-amber-300/80">
      The primary advisor model didn't respond. Showing fallback narrative below.
      {fallbackModelTag ? ` Using ${fallbackModelTag}.` : null}
    </p>
    <button
      type="button"
      onClick={retryAdvisorCall}
      disabled={advisorRunning}
      className="mt-2 inline-flex items-center gap-2 rounded border border-amber-700 bg-amber-950/60 px-3 py-1.5 text-xs font-medium text-amber-100 hover:bg-amber-950/80 disabled:opacity-50"
    >
      {advisorRunning ? <Spinner className="h-3 w-3" /> : null}
      Retry primary model
    </button>
  </div>
) : null}
```

The "ANTHROPIC FALLBACK" + "claude-haiku-4-5" tags also need to be more readable. Today they look like debug strings stamped on the production UI. Make them muted secondary chips with a tooltip explaining what they mean.

### Retry behavior

The `retryAdvisorCall` handler should:
- Reset the narrative error state
- Re-invoke the advisor callable for the current tire
- If it fails again, re-set the error state (no infinite retry loop)
- Show the spinner during the retry

If the advisor callable is already wrapped in a hook (likely useAdvisorSignals or similar), find the existing retry pathway. If there isn't one, add a `runAdvisor()` function that wraps the existing callable invocation with the retry-able logic.

## Tasks

- [ ] `cd` into the worktree, `npm ci`
- [ ] Read `src/components/tires/ListingGenerator.jsx` to find the advisor narrative render block (search for "Narrative unavailable")
- [ ] Replace the static error text with the structured error block per the design above
- [ ] Wire up the retry button to actually re-invoke the advisor callable
- [ ] Reduce the "ANTHROPIC FALLBACK" + model name from prominent tags to muted chips with a tooltip
- [ ] Verify lint, test, build
- [ ] Single commit: `Listing Advisor: surface fallback state clearly + actual retry button`
- [ ] Open PR

## Out of scope

- Adding new fallback providers (Gemini, OpenAI) to the advisor chain — that's a backend change, separate spec
- Changing the primary model selection
- Tweaking the sell-probability calculation

## Validation

```
npm run lint
npm run test
npm run build
```

Manual smoke: open `/tires` on desktop, select a tire, open the Listing Generator. Verify:
- If the advisor returns a real narrative, no error block appears
- If the advisor falls back, the error block shows with the muted chips and the retry button works
- Clicking retry re-invokes the advisor and either succeeds (clearing the error) or re-shows the error if it fails again

## PR title

`Listing Advisor: surface fallback state clearly + actual retry button`

Execute this brief exactly. Branch from main, run all validation commands before opening the PR, and stop after the PR is open.
