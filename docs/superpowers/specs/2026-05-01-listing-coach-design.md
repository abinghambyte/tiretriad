# AI Listing Coach (v1) - Design

**Status:** approved 2026-05-01

## Problem

Drafting a good FB Marketplace / Craigslist listing requires:

1. Catalog lookup (which SKU is this? what's the price / FET / load range?)
2. Landed-cost math (`tireLandedBuyNumber` server-side; spec at `2026-05-01-landed-cost-design.md`)
3. Realistic retail comps (already pulled by `functions/tirePriceResearch.js` into `tire.priceIntel.retailPrice` + sources via Gemini grounded search)
4. Margin recommendation (price / 4 set / pair / single, healthy markup vs landed)
5. Audience-specific copy (commercial vs consumer reads totally differently)
6. Fitment notes (which trucks / SUVs / sedans this size sells to)
7. Seasonal / regional context (NOCO Memorial Day = camping = AT, fall = winter set prep, etc.)
8. Photo guidance (tread close-up first, sidewall stamp, qty proof; consumer = "clean garage" vibe vs commercial = "working seller" pile shot)
9. A draft listing in the right tone

Today this all happens in chat with a human (the 2026-05-01 LT285/70R17 KO2 NOCO walk-through is the canonical example). It works but it depends on someone knowing all the pieces. It doesn't scale, and edits the human makes mid-conversation ("don't mention FET", "drop B2B language", "lower-key about the eFleet account") evaporate the next time.

## Goal

A second persona on top of the existing `salesAdvisor` Cloud Function that:

- Produces output structurally identical to the 2026-05-01 KO2 walk-through (the literal anchor for the system prompt).
- Reuses the existing drawer, rate limiter (30/hr/uid), role gating, and Anthropic Haiku -> Sonnet fallback.
- Reads market comps from `tire.priceIntel.retailPrice` (already populated by `tirePriceResearch.js`); does NOT introduce new external pricing infrastructure.
- Persists user corrections as a crew-shared style guide that loads at the start of every future session.

## Architecture

### Surface

New "Listing Coach" tab on the existing salesAdvisor drawer at `src/components/tires/SalesAdvisorDrawer.jsx` (or wherever the drawer is currently mounted).

The drawer is already on the Tires page. The salesAdvisor drawer is admin-gated and rate-limited; the Listing Coach inherits both.

Tab UI: minimal. Two-tab strip at the top of the drawer. Each tab gets its own conversation thread so switching personas does not contaminate context.

### System prompt anatomy

```
You are Skedaddle's Listing Coach. Skedaddle resells brand-new tires
sourced from a Michelin eFleet program (NOT for buyer disclosure - the
account is private and never mentioned in listings or buyer DMs).

Your job: take a tire SKU + quantity + audience and produce a complete
listing kit:
  1. Pricing analysis (landed cost, recommended price, margin target)
  2. Audience confirmation if not already specified
  3. A copy-paste listing draft in a fenced code block
  4. Photo guidance bullets

Tone: see the few-shot example below. Concise, factual, no AI-isms,
no fluff.

[FEW-SHOT: 2026-05-01 LT285/70R17 KO2 NOCO Memorial Day transcript,
abbreviated to ~800 tokens, including pricing math and the final
listing draft]

[ACTIVE STYLE RULES: read from meta/listingCoachStyleGuide]
```

### Tools (Anthropic tool use)

| Tool | Inputs | Returns |
|---|---|---|
| `getTireByMspn` | `mspn: string` | tire doc fields: price, fet, lr, description, priceIntel.retailPrice, priceIntel.retailSources, salesCount, weeklyVelocity |
| `getTireBySize` | `size: string` (e.g. "LT285/70R17") | array of matching tires (multiple SKUs per size: KO2 / KO3 / different LRs) |
| `computeLandedCost` | `tire: object` | `{ landedPerTire, breakdown: { catalog, fet, wholesaleTax, tireFee }, taxRate }` |
| `getRecentSalesForSize` | `size: string`, `limit?: number = 10` | last N completed orders matching this size: `{ orderId, completedMs, paymentAmount, qty, deliveredBy }` |
| `addStyleRule` | `rule: string`, `audience: 'consumer'|'commercial'|'all'`, `reason: string` | confirmation + rule id |
| `listStyleRules` | `audience?: string` | array of active rules filtered by audience |

`addStyleRule` is the persistence mechanism. The model calls it when the user gives explicit correction phrasing ("don't mention FET", "drop B2B language", "always anchor against Discount Tire shelf"). The model surfaces the rule inline before calling so the user can veto:

> Got it - adding rule: "Never mention FET in consumer listings; the price is the price."
> Audience: consumer. This will apply to all future consumer drafts. Reply "no" to skip.
> [tool call: addStyleRule]

### Output shape

Single conversational reply per generation. Five sections in order:

1. **SKU summary** - one-line fact stack: brand / size / LR / MSPN / catalog price / FET
2. **Pricing analysis** - landed math (4 lines), recommended price + margin target, market comps from `priceIntel.retailPrice` + sources
3. **Audience suggestion** - "This looks like a [consumer/commercial] listing - proceed?" Skipped if the user specified audience in their prompt or in a prior turn. Skipped if all candidate rules tag the same audience.
4. **Listing copy** - inside a fenced code block. The frontend chat renderer adds a "Copy" button to fenced blocks (small UI tweak; see UI section).
5. **Photo guidance** - short bullet list, audience-tone-matched ("consumer / clean garage shot first" vs "commercial / pile-of-stock shot for credibility")

If the model is calling `addStyleRule`, the rule notice goes at the very end of the reply with a "[remembered for next time]" footer.

### Style guide doc

`meta/listingCoachStyleGuide`:

```js
{
  rules: [
    {
      id: 'rule_<auto-id>',
      rule: 'Never mention FET in consumer listings; the price is the price.',
      audience: 'consumer',                  // 'consumer' | 'commercial' | 'all'
      addedBy: '<uid>',
      addedAt: serverTimestamp,
      reason: 'User correction during 2026-05-01 KO2 listing draft.',
      enabled: true,
    },
    {
      id: 'rule_<auto-id>',
      rule: 'Never mention the Michelin eFleet account or B2B / dealer-program language anywhere.',
      audience: 'all',
      addedBy: '<uid>',
      addedAt: serverTimestamp,
      reason: 'Account discretion (2026-05-01).',
      enabled: true,
    },
  ],
  updatedAt: serverTimestamp,
}
```

Rules are read at the start of every session and loaded into the system prompt as a bullet list under "ACTIVE STYLE RULES". The model is told these are non-negotiable instructions from the user.

Filtering at read time: when the audience is known (e.g. user said "this is for consumer FB"), only `audience === 'all' || audience === 'consumer'` rules are loaded. When audience is unknown at session start, all rules are loaded; once audience confirms, the model is reminded which rules apply.

### Admin surface

`/admin/listing-coach-rules` page:

- Table: rule text, audience tag, addedBy (resolved to displayName), addedAt, reason, enabled toggle, delete.
- "Add rule" button for manual seeding (admin can preload rules without going through chat).
- Admin-only route, gated like other `/admin/*` pages.

The admin page is the pressure-release valve. If the model adds a bad rule, admin removes it directly. If the same correction keeps coming up but the model isn't catching it, admin adds a rule manually.

### Audience inference

Default suggestion logic in the system prompt:

- `LR-G` or `LR-H` or `R22.5` or `R19.5` or `R24.5` -> commercial
- LT-prefix passenger/light-truck or AT/MT tread -> consumer
- Mixed (e.g. LT285/70R17 LR-E that buyers from both groups search for) -> ask the user

Model phrases the inference: "Looks like a consumer listing (LT285/70R17 KO2 - typical Tacoma/4Runner/Wrangler size). Proceed with consumer tone, or override?" If the user already said "for FB Marketplace" or "for commercial fleet" earlier in the conversation, skip the question.

### Quantity input

Parsed from user prompt. Examples:

- "Draft a listing for 4 of these LT285/70R17 KO2s" -> qty=4
- "Draft a listing for the 8 XLGD drives I have" -> qty=8
- "Draft a listing" with no qty -> ask once: "How many do you have?"

No `tire.stock` field is added in v1. Inventory tracking is a separate concern (and a separate roadmap item if we ever need it).

### Pricing calc

Per generation, the model computes:

- `landedPerTire = tireLandedBuyNumber(tire, payoutCfg.taxes)` (via `computeLandedCost` tool)
- `landedSet = qty * landedPerTire`
- For target margin M (default 25% consumer, 20% commercial):
  - `recommendedPrice = landedSet / (1 - M) / qty` (per-tire)
  - `setPrice = qty * recommendedPrice`
- Market comps from `tire.priceIntel.retailPrice` and the high/low spread from `tire.priceIntel.retailSources`

Output explicitly shows the math (matches today's walk-through pattern). If margin lands below floor, model flags it: "At $X/tire this set comes in at Y% margin, below the 20% target. Hold at $A/tire for full margin or compress to $B/tire if storage is binding."

### Photo guidance

Audience-conditional templates:

**Consumer:**
1. Tread close-up, frame-filling, no other tires in view
2. Sidewall close-up showing brand + size + LR + tread name
3. Stack-of-N proof of qty
4. DOT date code in focus on at least one tire
5. (Optional) fitment shot - tire on the matching truck/SUV

**Commercial:**
1. Tread close-up
2. Sidewall close-up with size + LR
3. Pile-of-stock or aisle shot for credibility
4. DOT date code
5. (Optional) photo of the new label / dealer sticker if it's there

Model tailors based on audience and on whether the user mentioned anything about photos. If user already shared photos in the chat, model picks which ones work and which to retake (today's walk-through caught the used-tire photo and rejected it).

## Files

**New:**
- `functions/listingAdvisor.js` - Cloud Function callable, mirrors `salesAdvisor.js` pattern with the new persona + tool registry
- `functions/listingAdvisor.test.mjs`
- `functions/listingCoachStyleGuide.js` - pure helpers + tool implementations: `addStyleRule`, `listStyleRules`, `toggleStyleRule`, `removeStyleRule`
- `functions/listingCoachStyleGuide.test.mjs`
- `src/hooks/useListingCoach.js` - mirrors `useSalesAdvisor`
- `src/components/tires/ListingCoachTab.jsx` - drawer tab content
- `src/components/tires/ListingCoachTab.test.jsx`
- `src/pages/AdminListingCoachRulesPage.jsx`
- `src/components/admin/ListingCoachRulesPanel.jsx`
- `src/components/admin/ListingCoachRulesPanel.test.jsx`

**Modified:**
- The existing salesAdvisor drawer component - add a 2-tab strip (Sales Coach / Listing Coach) and route conversations accordingly
- `functions/index.js` - register `listingAdvisor` callable
- `src/App.jsx` - mount `/admin/listing-coach-rules` route

## Tools the model has, in detail

```js
// getTireByMspn
{
  mspn: 'M1234',
  description: 'LT285/70R17 KO2 LRC',
  brand: 'BFGoodrich',
  lr: 'C',
  price: 247.00,
  fet: 0,
  priceIntel: {
    retailPrice: 385.00,
    retailSources: [
      { url: 'https://...', site: 'TireRack', price: 379.99 },
      { url: 'https://...', site: 'SimpleTire', price: 365.00 },
      { url: 'https://...', site: 'DiscountTire', price: 425.00 },
    ],
    activeBuyPrice: null,
    lastResearchedAt: <timestamp>,
    confidence: 'high',
  },
  salesCount: 12,
  weeklyVelocity: 1.5,
}

// computeLandedCost
{
  landedPerTire: 266.86,
  breakdown: {
    catalog: 247.00,
    fet: 0,
    wholesaleTax: 17.86,    // catalog * 0.0723
    tireFee: 2.00,
  },
  taxRate: 0.0723,
}

// getRecentSalesForSize
[
  { orderId: 'O1', completedMs: ..., paymentAmount: 1540, qty: 4, deliveredBy: 'dj' },
  { orderId: 'O2', completedMs: ..., paymentAmount: 770, qty: 2, deliveredBy: null },
  ...
]

// addStyleRule
inputs: { rule, audience, reason }
returns: { id: 'rule_abc123', ok: true }

// listStyleRules
inputs: { audience? }
returns: [{ id, rule, audience, addedBy, addedAt }]
```

## Few-shot anchor

The 2026-05-01 LT285/70R17 KO2 walk-through transcript is abbreviated and inserted into the system prompt. Roughly 800 tokens, structured as a "user message -> coach reply" pair. Captures:

- Catalog lookup (`getTireByMspn(81501)` returning $247 / FET 0)
- Landed math (4 × 266.86 = 1067.44)
- Recommended $385/tire = $1,540 set, 30.7% margin
- Comps: TireRack $380, Discount Tire $400+, online $350-390
- Audience: consumer (Memorial Day NOCO, Tacoma/4Runner/Wrangler fitment)
- Photo notes: tread close-up first, sidewall stamp, stack-of-4, DOT code
- Listing copy block (the actual one we drafted, post user-corrections)
- Memory: rule about not mentioning FET / B2B / eFleet account

The system prompt explicitly tells the model "this is the SHAPE of every reply. Match this depth and tone."

## Failure modes

- **Tire not found** (bad MSPN, missing from catalog): model surfaces "Couldn't find MSPN X. Want to search by size?" and offers `getTireBySize`.
- **Stale or missing retail data** (`priceIntel.retailPrice` is null or last-researched > 30 days): model warns "Market comps for this SKU are stale. Recommend running retail research first - link to /tires/{mspn}." Coach still drafts a listing with the disclaimer that price is best-effort.
- **Margin below floor**: model flags inline, doesn't refuse to draft. User decides.
- **Rule conflict** (user adds "always anchor against TireRack" then later adds "never anchor against TireRack"): model surfaces the conflict and asks which to keep. Doesn't silently overwrite.
- **Rate limit** (30/hr/uid): inherits from salesAdvisor; same toast as today.
- **Anthropic API down**: inherits Haiku -> Sonnet fallback; if both fail, the drawer shows the existing salesAdvisor error UI.

## Testing plan

- `listingCoachStyleGuide.js`: addStyleRule (happy + duplicate detection by exact rule string), listStyleRules with audience filter, toggleStyleRule, removeStyleRule
- `listingAdvisor.js`: tool dispatch unit-tested without hitting Anthropic; mock the model response and assert tool calls fire correctly; happy-path integration test with a fixture tire
- `useListingCoach`: chat state, tab switching keeps conversations isolated
- `ListingCoachTab.jsx`: rendering, copy-button on fenced code blocks, conversation persistence across drawer open/close within a session
- `ListingCoachRulesPanel.jsx`: renders rules, toggle / delete fire callables, audience filter
- Manual smoke after ship: walk through the LT285/70R17 KO2 scenario again from scratch, see if the output matches today's quality. Then introduce a correction ("drop FET mention"), see the rule get added, start a new session, confirm the rule is loaded.

## Verification

1. `npm run lint` clean
2. `npm run test` green; new tests cover style guide + advisor + drawer + admin panel
3. `npm run build` clean; bundle delta on the Tires page is small (drawer tab is mostly markup; new logic is server-side)
4. Manual smoke: end-to-end in dev. Style rule gets persisted and loaded.
5. Admin panel: visible only when `users/{uid}.role === 'admin'`. Toggle / delete round-trip correctly.
6. Eyeball the system-prompt token count after appending the few-shot anchor + active rules. Should stay under 4k tokens (Haiku context budget concern is moot at 200k, but cost is real). If over 4k for some reason (lots of accumulated rules), trim the few-shot.

## Out of scope (deferred)

- Per-user rule overrides (Q5 B / C from brainstorm)
- Implicit edit detection / diffing user-edited drafts (only explicit phrasing in v1)
- Inventory awareness via `tire.stock` field
- Side-panel artifact / multi-draft view (Q4 B from brainstorm)
- Direct integration with FB Marketplace API (post-listing automation)
- Cross-rule conflict auto-resolution (v1 just surfaces conflicts and asks)
- Per-region or per-season seasonal context library (model uses its own knowledge for now; if NOCO context drift becomes a problem, we can seed a `meta/seasonalContext` doc)
