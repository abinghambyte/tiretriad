# Sales advisor drawer (v1) — design

**Status:** approved 2026-05-01 (auto mode)
**Branch target:** `sales-advisor-drawer`
**Roadmap entry shipped:** *AI sales advisor drawer* (Next).

## Goal

Add a chat drawer on the Tires page that lets the operator ask Claude questions like "which slow-moving tires should I push?" or "what's a fair quote for a 4-pack of LT225/75R16?", with the catalog and recent-completed-orders summary already in context. Single conversation, session-only, buffered (no streaming) for v1.

## Non-goals

- Streaming responses. Anthropic supports SSE; v1 uses the buffered/non-streaming variant for simplicity.
- Conversation persistence. Closing the drawer or reloading discards history. Operators rarely need yesterday's conversation; if they do, they re-ask.
- Multi-thread / saved conversations. One thread, one drawer.
- Tool use. The advisor sees a static context payload; it cannot query Firestore directly.
- Per-message edit / regenerate. Future enhancement.
- Drawer on routes other than `/tires`. Tires page is where the operator is when the question is most relevant. Roll out to other routes if signal warrants.

## Architecture

```
functions/salesAdvisor.js                  NEW    Cloud Function (callable)
functions/salesAdvisor.test.mjs            NEW    handler unit tests

src/components/tires/SalesAdvisorDrawer.jsx     NEW   drawer + chat UI
src/components/tires/SalesAdvisorDrawer.test.jsx
src/components/tires/SalesAdvisorTrigger.jsx    NEW   floating action button

src/hooks/useSalesAdvisorChat.js           NEW    client hook (messages + dispatch)
src/hooks/useSalesAdvisorChat.test.js

src/utils/buildAdvisorContext.js           NEW    pure context builder
src/utils/buildAdvisorContext.test.js

src/components/tires/TiresDashboard.jsx    MODIFY mount drawer + keyboard listener
```

### `salesAdvisorChat` callable contract

```js
// Input
{
  surface: 'tires',  // future: 'dashboard' | 'crm' | 'analytics'. Selects the persona block. Defaults to 'tires' if omitted/unknown.
  messages: Array<{ role: 'user' | 'assistant', content: string }>,
  context: {
    brandAggregates: {
      total: number,
      brands: Array<{
        brand: string,
        count: number,
        avgListingMarginPct: number | null,
        avgResearchedRetail: number | null,
        offProgramCount: number,
      }>,
      missingBrands: string[],
    },
    revenueStats: {
      mtdRevenue: number,
      ytdRevenue: number,
      completedCount30d: number,
      completedCount90d: number,
    } | null,
    selectedTire: {
      mspn: string,
      brand: string,
      description: string,
      category: 'passenger' | 'lightTruck' | 'truck' | null,
      price: number,
      retailPrice: number | null,
      listingMarginPct: number | null,
    } | null,
  },
}

// Output (success)
{ reply: string, model: 'claude-haiku-4-5' | 'claude-sonnet-4-6' }

// Output (error - thrown via HttpsError)
//   - 'unauthenticated' if request.auth is missing
//   - 'permission-denied' if profile.role !== 'admin'
//   - 'resource-exhausted' if rate-limited (returns retryAfterMs in details)
//   - 'invalid-argument' if messages[] is empty or last role is 'assistant'
//   - 'internal' on Anthropic failures (after fallback attempts exhausted)
```

### Server-side flow

1. **Auth gate.** `request.auth.uid` required; `users/{uid}.role === 'admin'` (matches existing admin-only callables).
2. **Rate limit.** In-memory per-UID counter: 30 messages per rolling 60 minutes. Map `{ uid: [timestamps] }` pruned on each invocation. Best-effort — counter resets when the function instance restarts. Acceptable for v1; if scale-out becomes a concern, switch to Firestore-backed.
3. **Validate input.** `messages` non-empty; last entry's role is `'user'`; total content under 16 KB.
4. **Hydrate system prompt.** Inject the context payload into a system prompt template (see below).
5. **Call Anthropic.** Try `claude-haiku-4-5` first (cost/latency); fall back to `claude-sonnet-4-6` if haiku errors or returns an empty response. Max 1500 output tokens. Temperature 0.4 (slightly creative for sales-pitch language without hallucinating numbers).
6. **Return reply + model used.** No persistence.

### System prompt template (server-side)

The advisor's persona is parameterized by a `surface` field on the input
payload. v1 only ships the `'tires'` surface (sales-expert focus). Future
mounts on Dashboard / CRM / Analytics swap the persona block without
re-architecting the rest of the call. The default if `surface` is unknown
is the catalog-aware sales-expert prompt below.

```
{persona block, selected by surface}

You have access to the operator's catalog and recent revenue snapshot.
Your job is to give specific, numbers-backed advice. Always cite the
exact data point that backs your answer (e.g. "BFGOODRICH has 12% avg
margin vs MICHELIN's 22% — pricing is the lever").

If the operator asks something the data does not cover, say so plainly.
Never guess at SKU-level details that aren't in the context. Never invent
prices.

# Catalog (brand aggregates)
{brandAggregates as JSON}

# Recent revenue
{revenueStats as JSON, or "Not yet available."}

# Selected tire (if any)
{selectedTire as JSON, or "No tire is currently selected. Operator is asking a catalog-level question."}
```

**`surface: 'tires'` persona block (v1):**

```
You are a sales coach and pricing advisor for Skedaddle Inc, a tire
reseller in Loveland, Colorado. Your operator is on the Tires catalog
page. Treat them as a working salesperson — your job is to make their
next conversation, quote, listing, or follow-up better.

Lean into:
- Objection handling (price comparisons, brand familiarity, timing)
- Quote framing and pitch language
- Highest-margin moves given the catalog's current state
- Specific SKU / size advice when the operator gives you a target

Avoid generic small talk. Always tie advice to a number the operator
can act on (margin %, SKU count, retail vs buy gap, etc).
```

Future surfaces (`'dashboard'`, `'crm'`, `'analytics'`) will swap this
block with their own persona — e.g., on CRM the advisor becomes a
"customer-relationship coach" focused on touchpoints and retention.

### Client-side flow

1. Operator presses `?` or clicks the floating button on the Tires page → drawer opens.
2. `useSalesAdvisorChat` initializes empty messages array.
3. Operator types a question → submit → `buildAdvisorContext(tires, revenueStats, selectedTire)` runs → callable fired.
4. Pending state shows spinner + "Thinking…" placeholder bubble.
5. Reply lands → message list updates → spinner clears.
6. Errors land as system message bubbles ("rate limit reached", "advisor took too long", "advisor failed — try again").

### `buildAdvisorContext(tires, revenueStats, selectedTire)`

Pure builder, no I/O.

- `brandAggregates`: reuses `useBrandAggregates` shape. We DON'T re-import the hook (utils file should be hook-free); we extract a small selector or inline the same logic. Cleanest: re-export the same `EXPECTED_BRANDS` constant and inline a small bucket loop. Or have `useSalesAdvisorChat` call `useBrandAggregates` and pass the result through.
  - Decision: `useSalesAdvisorChat` calls `useBrandAggregates(tires, null)` and passes the result into `buildAdvisorContext` as a pre-built field. Keeps `buildAdvisorContext` pure and selector-free.
- `revenueStats`: pulled from `useDashboardSignals().revenueStats` if loaded; else `null`. The drawer's parent (TiresDashboard) doesn't currently load this — see "Data flow" below.
- `selectedTire`: when `selectedIds.size === 1`, look up the tire and serialize. Else `null`.

### Empty state (drawer body when messages.length === 0)

The opener orients the operator: "Ask me about quotes, objection handling,
high-margin moves, or follow-ups." Below that, four clickable suggestion
cards. Clicking a card populates the textarea (operator can edit before
sending). The four prompts ARE the working set for v1; iterate on them
based on what operators actually click most:

1. *"Help me handle 'I can get them cheaper online' — what's the strongest objection-handling line?"*
2. *"Draft a pitch for our highest-margin Michelin sizes that a fleet customer would care about."*
3. *"Customer wants 4 LR-E commercials for a moving fleet — what should I lead with and why?"*
4. *"What's a good 7-day follow-up message after a quote went cold?"*

These all match the `surface: 'tires'` persona — sales-coach, pitch-craft,
objection-handling. When future surfaces ship (Dashboard / CRM /
Analytics), each gets its own four-prompt set scoped to that role.

### Trigger affordances

- **Floating button** (`<SalesAdvisorTrigger>`) — bottom-right of the Tires page, brand-color tinted, "Ask the advisor" label on hover. Hidden when drawer is open.
- **Keyboard `?`** — global key listener on the Tires page. Ignored when focus is in an input/textarea/contenteditable. Toggles drawer open/closed.

### `useSalesAdvisorChat()` hook

Returns:

```js
{
  isOpen: boolean,
  open: () => void,
  close: () => void,
  toggle: () => void,
  messages: Array<{ role, content, error? }>,
  pending: boolean,
  send: (userText: string) => Promise<void>,
  clear: () => void,
}
```

`send` builds context (passed via parameters or via a context-builder callback prop), appends a user message, calls the callable, appends the assistant reply (or error message), clears `pending`. Errors are caught and rendered as system bubbles, not thrown to the caller.

## Data flow

`TiresDashboard.jsx` already has `tires` (enriched). To get `revenueStats`, the drawer reads `meta/revenueStats` once on first open via `getDoc`. Keeps the catalog page lightweight; the doc only matters when the operator opens the advisor.

`selectedTire` is computed from `selectedIds` (already in `TiresDashboard` state). When exactly one tire is selected, that tire's serialized fields land in context. When 0 or 2+, `selectedTire` is `null` and the advisor knows to answer at the catalog level.

## Edge cases

- **Drawer opened with no tires loaded yet** — empty state explains "Catalog is loading…"; the Send button stays enabled but the request will execute with `brandAggregates.total === 0` and `selectedTire === null`. Advisor will note that there's no catalog data to reason about.
- **Operator types nothing and hits Send** — Send is gated on non-empty trimmed text; button stays disabled.
- **Multi-paragraph response** — drawer body has `whitespace-pre-wrap` so newlines render. No markdown library; `**bold**` and `_italic_` would render literal. Future: drop in `react-markdown` if signal warrants.
- **Operator switches tabs (Passenger/LT/Truck) while drawer is open** — context refreshes on next Send; existing conversation history stays.
- **Rate limit hit** — server returns `resource-exhausted` with `retryAfterMs`. Client renders system bubble: "Advisor rate-limited; try again in N minutes."
- **Anthropic both models fail** — server returns `internal`. Client renders "Advisor failed; try again or open a separate session."
- **Profile not yet loaded when drawer opens** — Send is gated on `profile.role === 'admin'`; non-admins see disabled state with explanation.
- **Window blur during in-flight request** — pending state survives; reply renders when it lands.

## Testing

### `salesAdvisor.test.mjs`

- Auth gate: missing `request.auth` → throws `unauthenticated`.
- Role gate: non-admin caller → throws `permission-denied`.
- Validates `messages[]` non-empty.
- Validates last role is `'user'`.
- Total content over 16 KB → `invalid-argument`.
- Rate-limit: 31st call within hour → `resource-exhausted` with `retryAfterMs`.
- Happy path: mocked Anthropic returns text → callable returns `{ reply, model: 'claude-haiku-4-5' }`.
- Haiku failure → falls back to sonnet; returns `{ reply, model: 'claude-sonnet-4-6' }`.
- Both fail → `internal`.

### `buildAdvisorContext.test.js`

- Empty inputs → minimal context (`{brandAggregates: empty, revenueStats: null, selectedTire: null}`).
- Full inputs → fields populated correctly.
- `selectedTire` is null when 0 or 2+ tires selected; populated when exactly 1.
- `listingMarginPct` derived from `priceIntel.retailPrice` when researched; null otherwise.

### `useSalesAdvisorChat.test.js`

- `open` / `close` / `toggle` flip `isOpen`.
- `send` appends a user message, sets `pending`, calls the callable, appends the assistant reply, clears `pending`.
- Callable rejection → appends a system-error bubble; `pending` cleared.
- `clear` empties `messages` and `isOpen` state preserved.

### `SalesAdvisorDrawer.test.jsx`

- Closed → renders nothing; `<SalesAdvisorTrigger>` rendered separately when closed.
- Open → renders header, message list, textarea, send button.
- Empty state lists four sales-expert example prompts; clicking one populates the textarea (see "Empty state" below for exact copy).
- `?` keyboard toggles when focus is on `<body>`; ignored when focus is in textarea (avoids the user accidentally toggling while typing a question that contains `?`).
- Send disabled when `pending`.
- Error message bubbles render with red border.

### `TiresDashboard` integration

Single test: drawer mount + keyboard listener wired correctly (key `?` toggles drawer state).

## Risks

- **Cost overruns.** Each call burns Anthropic tokens. Rate limit + admin-only role gate caps blast radius. If usage spikes, tighten rate limit or move to Firestore-backed counter so multiple function instances share state.
- **Hallucinated numbers.** System prompt explicitly says "Never invent prices." Test with edge prompts during manual eye-check (e.g., "what's the price of MSPN 99999999?").
- **Context drift.** If the operator opens the drawer, makes catalog edits, and asks a follow-up question, the second message uses the same context payload until the next round-trip rebuilds it from props. Acceptable: every Send rebuilds context; only the in-flight request uses stale data.
- **Bundle size.** Drawer + hook + context builder ~6 KB gzipped. Tires chunk currently 40 KB / 42 cap. Tight; if it breaches, bump cap by 5 KB with a one-line note.

## Out of scope

- Streaming
- Persistence
- Multi-thread
- Tool use
- Markdown rendering
- Drawer on non-Tires routes
- Per-message edit / regenerate
