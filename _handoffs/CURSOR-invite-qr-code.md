# Cursor handoff — QR code on invite URL toolkit

>Worker: Field Executor (Cursor)
>Author: Portal Architect (Sonnet 4.6)
>Date: 2026-04-17

## Problem

When an admin creates an invite on desktop, there's no way to get the invite URL to a phone without manually copying and texting it. A QR code on the invite card lets you scan it directly with the phone camera to test the invite experience or open NFC Tools to write the card.

---

## File to change

**`src/components/people/PeopleDashboard.jsx`** — `InviteUrlToolkit` component (~line 194)

---

## Fix

### Add a QR code using the free qrserver API — no new dependency needed

Use `https://api.qrserver.com/v1/create-qr-code/?data=ENCODED_URL&size=180x180&margin=2` as an `<img>` src. No npm package required.

### Show it on desktop, hide on mobile

The NFC write button already shows only on Android. The QR code is the desktop equivalent — show it when `!showHardware` (i.e. not on Android/NFC-capable device), or just always show it since it's useful in all contexts.

### Implementation

Inside `InviteUrlToolkit`, after the copy button and before the NFC section, add:

```jsx
{safeUrl ? (
  <div className="flex flex-col items-center gap-2 pt-2">
    <img
      src={`https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(safeUrl)}&size=180x180&margin=2&color=e4e4e7&bgcolor=09090b`}
      alt="Scan to open invite on phone"
      width={180}
      height={180}
      className="rounded-xl"
    />
    <p className="text-xs text-zinc-600">Scan to open on phone — or write to NFC card</p>
  </div>
) : null}
```

The `color` and `bgcolor` params match the portal's zinc dark theme (zinc-200 text on zinc-950 background).

---

## Do NOT touch

- NFC write logic
- Web NFC / NFC Tools fallback
- Registration flow
- Any other component
- eBay files — on hold

---

## After changes

```bash
npm run lint
npm run build
```

Push to main — Vercel auto-deploys. No function deploy needed.

Test: create or view an existing invite on desktop — QR code should appear below the copy button. Scan with phone camera → opens invite URL in browser.

---

## Field Executor — completion notes (2026-04-15)

### Shipped

- **`src/components/people/PeopleDashboard.jsx`** — `InviteUrlToolkit`: qrserver.com `img` (zinc `color` / `bgcolor`) below the Copy / NFC button row, **only when `!showHardware`** so Android/Web NFC users keep the NFC-first layout; desktop gets the QR without changing the horizontal button row.

### Verify

- `npm run lint` and `npm run build` passed from repo root.
