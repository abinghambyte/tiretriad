# eBay / SellerChamp handoff (plan)

**Status:** **Deferred — not a current business priority.** Kept for future reference; [ROADMAP.md](./ROADMAP.md) Phase 6 is on hold. Marketplace / OfferUp / Craigslist remain the active channels.

**Original goal (when revived):** Extend the Listing Generator workflow so high-demand SKUs could flow into **eBay** with optional **SellerChamp** automation, without breaking today’s manual Marketplace / OfferUp / Craigslist flow.

---

## Current baseline (portal)

- [ListingGenerator.jsx](../src/components/tires/ListingGenerator.jsx) builds copy via `buildListingScript`, tracks **Facebook / OfferUp / Craigslist** posting state on the tire doc (`platformListings`), and uses the **`listingAdvisor`** callable for AI-assisted copy.
- Platforms are a fixed list; marking posted is per-platform with timestamps.

---

## Target integration shape

### 1. OAuth and accounts

- **eBay Developer Program:** REST APIs + OAuth 2.0 (user consent for selling account).
- Store **refresh tokens** and seller metadata in Firestore under a **single admin-owned integration doc** (e.g. `meta/ebayIntegration`) or **Secret Manager** for client secrets; never expose refresh tokens to the browser.
- **SellerChamp** (if used): typically its own API keys / store linkage — treat as a **backend-only** configuration mirrored in `meta/sellerChampIntegration` with the same security posture as Slack secrets.

### 2. Listing data model (Firestore)

Minimal fields to add (names illustrative — align with implementation):

| Field / doc | Purpose |
|-------------|---------|
| `tires/{mspn}.ebayListing` | `listingId`, `status` (draft \| live \| ended), `lastSyncedAt`, `sellerChampJobId` (optional) |
| `meta/ebayIntegration` | OAuth state, token refs, environment (sandbox vs production) |
| Optional `listingExports` collection | Audit log of handoffs from portal → eBay/SellerChamp |

Reuse existing tire fields for title/description seeds; **do not** introduce `retailPrice` — eBay “price” on the channel is still **per-listing** and can mirror **paymentAmount** patterns only at **order** time, not catalog.

### 3. Portal UX (phased)

1. **Phase A — Export handoff:** “Copy for eBay” + structured JSON or CSV row the user pastes into SellerChamp/eBay (no OAuth yet). Lowest risk.
2. **Phase B — OAuth + draft create:** Callable creates **draft** inventory on eBay from selected tire row + Listing Generator output.
3. **Phase C — SellerChamp:** Webhook or polling for sync status; map `sellerChampJobId` back to `tires/{mspn}.ebayListing`.

### 4. Cloud Functions

- New HTTPS callable(s): `ebayOAuthCallback` (or use hosted redirect URL), `createEbayDraftListing`, optional `syncSellerChampStatus`.
- Reuse existing secret patterns from [functions/slackSecrets.js](../functions/slackSecrets.js) — **no** raw tokens in client env.

### 5. Ops workflow

- **Kyle/Alex:** Pick priority SKUs from [ROADMAP.md](./ROADMAP.md) revenue strategy (e.g. BFG KO3 265/70R17).
- **Posting:** Listing Generator → review AI copy → confirm platform checklist → eBay draft or SellerChamp queue.
- **Support:** Slack `/stock` and catalog remain source of truth; eBay is a **sales channel**, not inventory quantity (qty still **only** from `/intake` per AGENTS.md).

### 6. Compliance and safety

- Respect eBay **API rate limits** and **category / vehicle compatibility** requirements (LT-metric tires often need fitment metadata — may require manual completion in eBay UI until fitment data is modeled).
- Sandbox first; production toggle via config doc.

---

## Dependencies

- eBay developer app approval, OAuth redirect URLs on `skedaddleinc.com` (or Firebase hosting domain).
- SellerChamp contract/API docs if that path is chosen.

---

## References

- Internal: [docs/ROADMAP.md](./ROADMAP.md) Phase 6, revenue strategy section.
- eBay: [Developer REST documentation](https://developer.ebay.com/develop/guides-v2/restful-apis/restful-apis).
