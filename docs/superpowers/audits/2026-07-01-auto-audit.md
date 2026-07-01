# Quarterly auto-audit - 2026-07-01

Auto-generated. Triage findings into follow-up issues or close the PR.


## Playwright visual + a11y

```
──────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/routes-people-crew-matches-snapshot-desktop-1280-retry1/error-context.md

    attachment #4: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/routes-people-crew-matches-snapshot-desktop-1280-retry1/trace.zip
    Usage:

        npx playwright show-trace test-results/routes-people-crew-matches-snapshot-desktop-1280-retry1/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

    Retry #2 ───────────────────────────────────────────────────────────────────────────────────────

    Error: [2mexpect([22m[31mpage[39m[2m).[22mtoHaveScreenshot[2m([22m[32mexpected[39m[2m)[22m failed

      Expected an image 1280px by 1079px, received 1280px by 905px. 20869 pixels (ratio 0.02 of all image pixels) are different.

      Snapshot: people-crew.png

    Call log:
    [2m  - Expect "toHaveScreenshot(people-crew.png)" with timeout 5000ms[22m
    [2m    - verifying given screenshot expectation[22m
    [2m  - taking page screenshot[22m
    [2m    - disabled all CSS animations[22m
    [2m  - waiting for fonts to load...[22m
    [2m  - fonts loaded[22m
    [2m  - Expected an image 1280px by 1079px, received 1280px by 905px. 20869 pixels (ratio 0.02 of all image pixels) are different.[22m
    [2m  - waiting 100ms before taking screenshot[22m
    [2m  - taking page screenshot[22m
    [2m    - disabled all CSS animations[22m
    [2m  - waiting for fonts to load...[22m
    [2m  - fonts loaded[22m
    [2m  - captured a stable screenshot[22m
    [2m  - Expected an image 1280px by 1079px, received 1280px by 905px. 20869 pixels (ratio 0.02 of all image pixels) are different.[22m


      12 |   test(`${route.name} matches snapshot`, async ({ adminPage }) => {
      13 |     await gotoAndSettle(adminPage, route.path)
    > 14 |     await expect(adminPage).toHaveScreenshot(`${route.name}.png`, { fullPage: true })
         |                             ^
      15 |   })
      16 | }
      17 |
        at /home/runner/work/tiretriad/tiretriad/tests/visual/routes.spec.ts:14:29

    attachment #1: people-crew (image/png) ─────────────────────────────────────────────────────────
    Expected: tests/visual/routes.spec.ts-snapshots/people-crew-desktop-1280-linux.png
    Received: test-results/routes-people-crew-matches-snapshot-desktop-1280-retry2/people-crew-actual.png
    Diff:     test-results/routes-people-crew-matches-snapshot-desktop-1280-retry2/people-crew-diff.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    attachment #2: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/routes-people-crew-matches-snapshot-desktop-1280-retry2/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/routes-people-crew-matches-snapshot-desktop-1280-retry2/error-context.md

  4 failed
    [mobile-375] › tests/visual/routes.spec.ts:12:3 › tires matches snapshot ───────────────────────
    [tablet-768] › tests/visual/routes.spec.ts:12:3 › tires matches snapshot ───────────────────────
    [tablet-768] › tests/visual/routes.spec.ts:12:3 › people-crew matches snapshot ─────────────────
    [desktop-1280] › tests/visual/routes.spec.ts:12:3 › people-crew matches snapshot ───────────────
  26 passed (5.8m)

[WebServer] Found 1 warning while optimizing generated CSS:
[WebServer] 
[WebServer] [2m│     &:hover {[22m
[WebServer] [2m│       @media (hover: hover) {[22m
[WebServer] [2m│[22m         background-color: var(...);
[WebServer] [2m┆[22m                               [33m[2m^--[22m Unexpected token Delim('.')[39m
[WebServer] [2m┆[22m
[WebServer] [2m│       }[22m
[WebServer] [2m│     }[22m
[WebServer] 

```


## Lighthouse (mobile preset)

### https://skedaddleinc.com/
- Performance: 92
- Accessibility: 98
- Best practices: 100
- SEO: 66

### https://skedaddleinc.com/tires
- Performance: 0
- Accessibility: 98
- Best practices: 100
- SEO: 66

### https://skedaddleinc.com/orders
- Performance: 0
- Accessibility: 98
- Best practices: 100
- SEO: 66
