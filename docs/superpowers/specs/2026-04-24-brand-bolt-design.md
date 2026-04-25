# Brand bolt theme expansion — design spec

**Goal:** Surface the purple lightning-bolt brand identity (currently only in the favicon) into the product chrome so the app feels branded, without disturbing the established meaning of amber (action) / emerald (money) / violet (CRM).

**Scope:** Cosmetic only. No data changes, no route changes, no permission changes.

## Brand palette (from favicon.svg)

| Name | Hex | Usage |
|---|---|---|
| `bolt-primary` | `#7e14ff` | Solid bolt fills, hero moments |
| `bolt-accent` | `#863bff` | Softer fill, muted states |
| `bolt-highlight` | `#ede6ff` | Light mode contrast (unused in app today, reserved) |
| `bolt-spark` | `#47bfff` | Cyan spark accent inside the glyph |

These live in `tailwind.config.js` under `theme.extend.colors.bolt.*` so they compose with opacity utilities (`bg-bolt-primary/20` etc).

Tailwind `violet-*` continues to mean "CRM / advisor / prospective" and is unchanged. The `bolt-*` tokens are a distinct layer for **brand identity**, not for status/semantics.

## Components

### 1. `<BrandBolt />` — reusable SVG glyph

Lives at `src/components/ui/BrandBolt.jsx`. Inlines a simplified flat-purple version of the favicon path (the main "S" bolt shape, no gaussian blurs — blurs are expensive in the DOM).

```jsx
<BrandBolt size={18} tone="solid" />
```

**Props:**
- `size: number` — px (default 20)
- `tone: 'solid' | 'glow' | 'muted'` — default `'solid'`
  - `solid`: fill `#7e14ff`, no filter
  - `glow`: fill `#7e14ff` + `drop-shadow(0 0 8px rgba(126,20,255,0.5))`
  - `muted`: fill `#863bff` at 45% opacity
- `className: string` — forwarded to `<svg>`
- `aria-hidden` by default. Consumers add `aria-label` + drop `aria-hidden` when the bolt is the only thing communicating identity (e.g., the top-bar mark).

Unit test: renders an `<svg>` with `data-testid="brand-bolt"` and the tone class on the root path.

### 2. Top bar brand mark

Always visible. Sits to the left of the first breadcrumb crumb inside `PortalTopBar`. On routes where `crumbs.length === 0` (the dashboard), the mark sits next to the "Skedaddle" wordmark. On deeper routes, the mark sits to the left of the first breadcrumb link.

- Size: 18px
- Tone: `solid`
- Wrapped in a `<Link to="/">` so clicking it returns to the dashboard
- `aria-label="Skedaddle — go to dashboard"` with the bolt as `aria-hidden`
- Spacing: 8px gap between mark and the breadcrumb content
- On mobile, the mark does not shrink or disappear

### 3. Dashboard empty states

The two empty-state cards on the dashboard (Recent Activity "No orders yet.", Top Sellers "No sales yet.") get a muted 28px bolt glyph centered above the text. Nothing else changes.

### 4. Auth / handshake hero

`HandshakePage` and `InvitePage` each render the word "SKEDADDLE" in tracking-wide uppercase. Add a 56px `glow` bolt stacked above the wordmark, with 16px of vertical spacing. No copy changes, no layout shift below.

### 5. Listing Advisor + prospective CTAs

The "Post it" button in the Listing Advisor section of `ListingGenerator.jsx` and the "Log prospective sale" button in `TiresDashboard.jsx` both get a 14px `solid` bolt as a leading icon inside the button, with 8px gap from the label text. Button colors and sizes are unchanged.

### 6. Last Sale "fresh sale" pulse

When `lastSale.completedAtMs` is within the last 24 hours, the Last Sale hero card on the dashboard gets:
- `ring-1 ring-violet-500/40`
- `shadow-[0_0_20px_rgba(126,20,255,0.15)]`
- A 14px `glow` bolt to the right of the dollar amount

This is purely additive — the existing emerald text color and gradient background stay. When `daysSince > 1` (which will be true 99% of the time), none of these apply; the card renders exactly as it does today.

## What stays unchanged

- Amber remains the primary interactive color (active nav, focus rings, warnings, confirms)
- Emerald remains money (revenue, margin)
- Violet (Tailwind) remains CRM/advisor/prospective — no new surfaces gain Tailwind-violet styling
- Dark-mode only (no light-mode support added)
- No animation beyond the existing activity ticker

## Accessibility

- Bolt glyph is always `aria-hidden` except when it IS the brand mark (top bar); the top bar wraps the bolt in a Link with an `aria-label`
- New violet ring on the "fresh sale" Last Sale card has AA contrast against the dark background
- `prefers-reduced-motion` is respected — the fresh-sale glow is a static box-shadow, not an animation, so no adjustment needed
- Empty-state bolts get `role="presentation"` via `aria-hidden`

## Testing

- Unit test `BrandBolt.jsx` — tone prop, size prop, default className passthrough
- Update `PortalTopBar.test.jsx` (if it exists; otherwise create) — mark is rendered and wraps a Link to `/`
- Update `TodayStrip.test.jsx` — add a test that confirms the violet ring classes appear when `daysSince <= 1` and do not appear when `daysSince > 1`
- No other test changes

## Non-goals

- No swap of amber primary buttons
- No re-skin of the activity ticker, sidebar/nav, or status pills
- No light-mode support
- No new npm dependencies
- No changes to the favicon file itself
- No new route or permission
