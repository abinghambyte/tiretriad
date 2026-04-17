# Cursor handoff — Price Researcher Prompt Fix + Cleanup

>Worker: Field Executor (Cursor)
>Author: Portal Architect (Sonnet 4.6)
>Date: 2026-04-16
>Run after: CURSOR-price-intel-improvements.md

## Goal

Two tasks:
1. Fix the price researcher prompt so Gemini can actually return prices instead of "not found"
2. Retire the redundant `growthLabTaskDispatch.js` function

---

## THING 1 — Fix price researcher prompt (`functions/tirePriceResearch.js`)

### Problem

`buildResearchUserPrompt` currently instructs Gemini:
> "Do not include retail or consumer prices — dealer cost only."

Dealer wholesale pricing is proprietary and not publicly available. Gemini correctly returns null/not_found for almost every tire because it can't find a defensible dealer floor price. The buy price column in the portal shows `—` for all tires as a result.

### Fix

Update `buildResearchUserPrompt` to allow Gemini to use retail pricing minus a standard dealer margin as a proxy when wholesale isn't directly findable. The goal is a useful buy-price estimate, not a perfect dealer invoice.

Replace the return value of `buildResearchUserPrompt` with:

```javascript
return [
  `You are researching the US dealer or wholesale BUY price for one catalog tire.`,
  `Catalog MSPN: ${mspn}.`,
  bits ? `Parsed / catalog fields:\n${bits}` : `Raw catalog description: ${desc || '—'}`,
  ``,
  `Priority order for your price estimate:`,
  `1. Dealer/wholesale cost if findable (e.g. from tire distributor sites, dealer forums, wholesale listings).`,
  `2. If dealer cost is not findable, use: (current US retail price) × 0.72 as a proxy for dealer cost. Standard dealer margin on tires is ~28%.`,
  `3. Use TireRack, DiscountTire, SimpleTire, Walmart, or similar for retail reference if needed.`,
  ``,
  `Return ONLY a JSON object (no markdown fences): { "price": number, "confidence": "high"|"medium"|"low", "notes": string }.`,
  `Set confidence to "high" if you found actual wholesale/dealer cost, "medium" if using retail-minus-margin proxy, "low" if very uncertain.`,
  `If you truly cannot find any price signal at all, set price to null and confidence to "low".`,
  `price should be per single tire (not a set).`,
].join('\n')
```

### Notes

- The `0.72` multiplier (28% margin) is a standard tire industry dealer margin. This gives a reasonable floor estimate when dealer pricing isn't findable.
- `confidence: "medium"` for proxy estimates is correct — the portal UI already shows amber dot for medium, green for high, red for low.
- Do not change `tryParsePriceJson`, `geminiDealerBuyWithSearch`, or `processTireResearchDoc` — prompt change only.

---

## THING 2 — Retire `growthLabTaskDispatch.js`

### Problem

`growthLabTaskDispatch.js` is a redundant legacy dispatcher that duplicates `taskDispatcher.js`. It has been superseded and should be removed.

### Steps

1. In `functions/index.js`, find and remove:
   - The `require('./growthLabTaskDispatch')` import line
   - The `growthLabTaskDispatch` onCall export (the Cloud Function registration)

2. Delete `functions/growthLabTaskDispatch.js`

3. Confirm `functions/taskDispatcher.js` is still imported and exported correctly — do not touch it.

### Verification

```bash
grep -r "growthLabTaskDispatch" functions/ --include="*.js"
```

Should return zero results after removal.

---

## After both changes

```bash
cd functions && npm run lint
```

Fix any lint errors, then:

```bash
npm run deploy:firebase
```

Confirm deploy succeeds. After deploy, test `/refreshprice 09100` in Slack — it should now return a price with `medium` confidence (retail proxy) instead of "not found".

## Do NOT touch

- `functions/taskDispatcher.js` — active dispatcher, do not modify
- Any eBay files — on hold pending eBay approval
- Any frontend files
- Profit formula, financial logic, order lifecycle
