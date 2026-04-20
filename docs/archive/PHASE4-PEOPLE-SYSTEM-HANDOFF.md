# Phase 4 — People System Handoff
> Drop this into Cursor. Implements the full invite flow, permissions model, crew tags, People portal UI, and first-login experience.
> Reference `docs/SKEDADDLE-MASTER.md` for stack, Firebase config, and env vars.

---

## Crew Tags

These are displayed in the UI instead of raw role names. Never show "admin" or "mechanic" — always show the crew tag.

| Role | Crew Tag | Access default |
|---|---|---|
| `admin` | Overwatch | Full access |
| `supplier` | Source | Orders view, no admin |
| `mechanic` | Field | Orders act, no admin |
| `dispatch` | Ground Control | Future — not built yet |
| `sales` | Scout | Future — not built yet |
| `installer` | Wrench | Future — not built yet |
| `viewer` | Spotter | Read-only, specified modules |

---

## Firestore Schema

### `users/{uid}`
```
uid: string
firstName: string
lastName: string
email: string
phone: string
role: "admin" | "supplier" | "mechanic" | "viewer"
crewTag: string                         // derived from role, stored for display
permissions: {
  tires:    "none" | "view" | "edit"
  orders:   "none" | "view" | "act"
  people:   "none" | "view" | "manage"
  crm:      "none" | "view" | "edit" | "manage"
  analytics:"none" | "view"
  revenue:  "none" | "view"
  wall:     "none" | "view"
}
inviteToken: string
inviteStatus: "active" | "expired" | "locked" | "renewed"
inviteExpiry: Firestore Timestamp
inviteDelivery: "sms" | "nfc" | "email"
inviteAccepted: boolean
accessExpiry: Firestore Timestamp | null   // null = no expiry
ghostMode: boolean                         // admin only — activity not logged
loginStreak: number
lastLoginAt: Firestore Timestamp
lastLoginIp: string
lastLoginDevice: string                    // parsed user agent e.g. "iPhone / Safari"
lastLoginLocation: string                  // rough geo from IP e.g. "Fort Collins, CO"
handshakeSeen: boolean                     // has seen first-login welcome screen
createdAt: Firestore Timestamp
```

### `inviteTokens/{token}`
```
token: string
uid: string
status: "active" | "expired" | "locked" | "renewed"
expiry: Firestore Timestamp
createdAt: Firestore Timestamp
usedAt: Firestore Timestamp | null
deliveryMethod: "sms" | "nfc" | "email"
```

### `accessLog/{id}`
```
uid: string                    // user whose permissions changed
changedBy: string              // admin uid who made the change
changedAt: Firestore Timestamp
field: string                  // e.g. "permissions.tires" or "role"
before: any
after: any
reason: string                 // optional note from admin
```

### `ghostContacts/{e164Phone}`
```
phoneNumber: string
ghostCount: number
lastGhostedAt: Firestore Timestamp
orderIds: array
repeatGhost: boolean
```

---

## Default Permissions by Role

```js
const ROLE_DEFAULTS = {
  admin: {
    tires: 'edit', orders: 'act', people: 'manage',
    crm: 'manage', analytics: 'view', revenue: 'view', wall: 'view'
  },
  supplier: {
    tires: 'view', orders: 'view', people: 'none',
    crm: 'none', analytics: 'none', revenue: 'none', wall: 'view'
  },
  mechanic: {
    tires: 'none', orders: 'act', people: 'none',
    crm: 'none', analytics: 'none', revenue: 'none', wall: 'view'
  },
  viewer: {
    tires: 'view', orders: 'view', people: 'none',
    crm: 'none', analytics: 'none', revenue: 'none', wall: 'view'
  }
};
```

Changing role in the People portal shows a confirmation: "Changing role resets permissions to defaults. Continue?" On confirm, overwrite permissions with role defaults.

---

## Auth & Route Guards

Update `ProtectedRoute` to accept a `module` and `level` prop:

```jsx
<ProtectedRoute module="tires" level="view">
  <TiresPage />
</ProtectedRoute>
```

Logic:
1. If not authenticated → redirect to `/`
2. Load `users/{uid}` from Firestore (cache in context)
3. Check `permissions[module]` meets or exceeds `level`
4. If not → redirect to `/dashboard` with a toast "Access restricted"

Access level hierarchy: `none` < `view` < `act` / `edit` < `manage`

Dashboard cards: hide cards where user has `permissions[module] === 'none'`. Show with lock icon if `view` but action buttons are disabled.

---

## People Portal — `/people`

Only accessible to users with `permissions.people === 'manage'`.

### User table columns
Name, Crew Tag, Invite status, Access expiry, Login streak, Last seen (device + location + time ago), Actions

### Per-user actions
- **Edit** — opens side panel
- **Renew invite** — extends expiry 48hrs, one click
- **Lock** — immediately sets `inviteStatus: 'locked'`
- **Ghost mode** — toggle, admin only
- **History** — shows `accessLog` entries for this user in a modal

### Create user form
Fields: First name, Last name, Email, Phone, Role (shows crew tag preview), Delivery method (SMS / NFC / email), Access expiry (optional date picker)

On create:
1. Generate unique token
2. Write `users/{uid}` stub with `inviteStatus: 'active'`, 48hr expiry
3. Write `inviteTokens/{token}`
4. Trigger invite delivery (see below)

### Permission matrix widget (side panel)

One row per module, columns for each access level. Toggle buttons — selecting one deselects others. Role shown at top with change option.

```
Module      | None | View | Edit/Act | Manage
────────────|──────|──────|──────────|───────
Tires       |  ○   |  ○   |    ●     |
Orders      |  ○   |  ○   |    ●     |
People      |  ○   |  ○   |          |   ●
CRM         |  ○   |  ○   |    ○     |   ●
Analytics   |  ○   |  ●   |          |
Revenue     |  ○   |  ●   |          |
Wall        |  ○   |  ●   |          |
```

On save: write `permissions` diff to Firestore, write entry to `accessLog/{id}`.

### Access expiry
- Optional date picker on user create and in side panel
- Scheduled Cloud Function (`checkAccessExpiry`) runs daily at midnight MT
- Queries users where `accessExpiry < now()` and `inviteStatus !== 'locked'`
- Sets `inviteStatus: 'locked'` on expired users
- Posts quiet note to `#fleet-ops`: "🔒 [Name]'s access expired and was locked."

### Timed elevated access
In the side panel, a "Temporary elevation" section. Set a module to a higher level + duration (24h / 48h / 7d). Writes the elevated permission and schedules a Cloud Function to revert it. Shows a countdown badge on the user row while active.

### Invite preview
Before sending, admin can click "Preview invite" — shows exactly what the recipient will experience: the entrance animation description, a sample generative greeting with their name, and the registration form fields. Catches mistakes before the card ships.

---

## Invite Delivery

### SMS (primary) — Twilio
```js
const body = `${firstName}. ${skedaddleinc.com/i/${token}}`;
// No explanation. No platform name. Just the link.
```

### NFC card (secondary)
Portal shows the token URL in a copyable field with a "Copy for NFC" button. Admin programs any NFC writing app with this URL. Card URL never changes — token state controls access.

### Email (tertiary) — Resend
```
Subject: [a single phrase — not a description]
Body: [one or two lines max]
      [token URL]
      [nothing else]
```
Plain text only. No HTML, no logo, no template.

---

## Token System

Route: `/i/[token]`

Server-side (Firebase Function `resolveInvite`):
1. Load `inviteTokens/{token}`
2. Check status — if expired/locked: return `{ valid: false, reason: 'inactive' }`
3. Check expiry timestamp — if past: set status to expired, return inactive
4. Return `{ valid: true, firstName, role, crewTag }`

Client renders based on response:
- Valid → entrance experience (see below)
- Invalid → blank dark screen, single line: a neutral phrase, no explanation, no branding

---

## NFC Tap Entrance Experience

Route: `/i/[token]` — client-side after token validation

### Sequence
1. Page loads → validate token via `resolveInvite` function
2. Web Vibration API: `navigator.vibrate(200)` — single sharp pulse
3. Web Audio API — generate a short tone on load:
```js
const ctx = new AudioContext();
const osc = ctx.createOscillator();
const gain = ctx.createGain();
osc.connect(gain); gain.connect(ctx.destination);
osc.frequency.value = 220;
gain.gain.setValueAtTime(0.3, ctx.currentTime);
gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
osc.start(); osc.stop(ctx.currentTime + 0.8);
```
4. Black screen, 500ms hold
5. Framer Motion: single white bolt renders center screen, tears diagonally across viewport — fast, sharp, like a crack in glass. Use `motion.div` with a diagonal clip-path animation, duration ~300ms.
6. Black overlay peels away from the crack using `AnimatePresence` — reveal dark background behind
7. "Skedaddle" fades in, clean type, centered
8. Generative greeting appears below — Anthropic API call:

```js
const response = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 60,
    system: `You write a single short greeting line for someone joining a private operations platform called Skedaddle. 
             Tone: understated, slightly cryptic, never corporate, never exclamatory. 
             Always include their first name. Imply they were expected, not recruited. 
             Never explain what Skedaddle is. Never use punctuation beyond a period or comma.
             Examples: "DJ. We've been expecting this." / "There you are, Kyle." / "The door was already open, DJ."`,
    messages: [{ role: 'user', content: `First name: ${firstName}. Role: ${crewTag}.` }]
  })
});
```

9. Single subtle CTA below — a word or an arrow, nothing more
10. CTA leads to registration form

### Registration form — step through one field at a time
1. Email input
2. 6-digit code sent via Resend to that email — entered on same page, no separate inbox trip
3. First name, last name (pre-filled from invite if available, editable)
4. Phone number
5. Set password

On complete:
1. Firebase Auth account created with email + password
2. `users/{uid}` updated: profile fields, `inviteAccepted: true`, `handshakeSeen: false`
3. `inviteTokens/{token}` marked used
4. Redirect to `/handshake` (first-login welcome screen)

---

## The Handshake Protocol

Route: `/handshake` — only accessible once, immediately after registration

One-time welcome screen. Dark, minimal. Shows:
- Their name
- Their crew tag
- A single sentence about their function in the operation — role-aware, written in the same tone as the entrance greeting

Examples:
- Mechanic/Field: "DJ. You're Field. Jobs come to you."
- Supplier/Source: "Kyle. You're Source. The line runs through you."
- Admin/Overwatch: "Alex. You're Overwatch. You see the whole board."

After 4 seconds or a tap anywhere, fades and redirects to their role-appropriate dashboard. Sets `handshakeSeen: true` on the user doc. Never shows again.

---

## Login Tracking

On every successful login, write to `users/{uid}`:
```js
lastLoginAt: Timestamp.now()
lastLoginIp: request.ip                          // from Cloud Function or client
lastLoginDevice: parseUserAgent(navigator.userAgent)  // "iPhone / Safari", "Windows / Chrome"
lastLoginLocation: // rough geo — use ip-api.com free tier or similar
loginStreak: // increment if last login was within 36hrs, else reset to 1
```

### Suspicious login detection
On login, compare `lastLoginIp` and `lastLoginDevice` to previous three logins (store as `recentLogins: array` — last 3 only). If both differ from all three previous: post to `#fleet-ops`:
```
⚠️ Unusual login — [Name] ([crewTag])
Device: [device]
Location: [location]
Time: [time]
```

### Login streak — People portal display
Show on user row as "🔥 12" if streak >= 3, plain number if < 3.

---

## Ghost Mode

Admin-only toggle per user. When `ghostMode: true`:
- User's logins do not increment `loginStreak`
- User's actions do not write to `accessLog`
- User does not appear in "last seen" displays to other users
- Still fully functional — just invisible in the audit trail

Useful for demos, testing, or when you're onboarding someone informally.

---

## Firestore Rules additions

```js
match /users/{uid} {
  allow read: if request.auth != null && request.auth.uid == uid;
  allow read: if request.auth != null && isAdmin();  // admin can read all users
  allow update: if request.auth != null && request.auth.uid == uid
    && request.resource.data.diff(resource.data).affectedKeys()
       .hasOnly(['lastLoginAt', 'lastLoginIp', 'lastLoginDevice',
                 'lastLoginLocation', 'loginStreak', 'recentLogins',
                 'handshakeSeen']);
  // All other writes via Admin SDK (Functions only)
}

match /inviteTokens/{token} {
  allow read: if true;  // token resolution is public (server validates state)
  allow write: if false; // Functions only
}

match /accessLog/{id} {
  allow read: if request.auth != null && isAdmin();
  allow write: if false; // Functions only
}

function isAdmin() {
  return get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
}
```

---

## Env Vars Needed

```
functions/.env:
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_FROM_NUMBER=...
RESEND_API_KEY=...
ANTHROPIC_API_KEY=...
```

---

## Done When

- Admin can create a user, assign role, set delivery method, hit send
- Invite arrives via SMS or email with token URL, no explanation
- Token URL opens entrance experience: vibration + tone + bolt animation + generative greeting
- Registration completes: Firebase Auth account created, Firestore user doc written
- Handshake screen shows once on first login
- Login tracking writes device, location, streak on every login
- Suspicious login fires alert to `#fleet-ops`
- People portal shows user table with permission matrix widget
- Permission changes write to `accessLog`
- Access expiry locks users automatically
- Ghost mode hides activity from audit trail
- Route guards enforce module permissions across the portal
