# Front Range Rubber landing page

Single-file static landing for `frontrangerubber.com`. Zero dependencies, zero build step. Open `index.html` in any browser.

## Before going live

Search the file for these placeholders and swap with real values:

- `(970) 555-0100` — replace with your real callback number (or a Google Voice number routed to your cell)
- `info@frontrangerubber.com` — set up the inbox first (Cloudflare Email Routing → forward to your existing Gmail is the cheapest path; takes 5 minutes)
- `Mon - Sat, 8a - 7p MT` — adjust if you'd rather appear less always-on
- `Established 2026` — leave or drop, your call

## Deploy

Three free options, in order of friction:

1. **Cloudflare Pages**: connect this folder as a project. Auto-HTTPS, points at your Cloudflare-registered domain in two clicks.
2. **Vercel**: drop the `marketing/frontrangerubber` folder as a static project. Auto-HTTPS via DNS records you copy into Cloudflare.
3. **GitHub Pages**: enable on this repo, point to `marketing/frontrangerubber/`, configure CNAME for the apex domain.

All three are free for static sites at this traffic level. Cloudflare Pages is the smoothest if you registered the domain via Cloudflare.

## Why it looks the way it does

Boring on purpose. The buyer for this brand is a fleet manager or contractor signing a check on company expense. They trust paper-y / serif / off-white / dark-text vendor pages because they look like the regional supply houses they already buy from. Tire Syndicate is where the bold off-road energy lives — that's a different audience.

If the page looks too plain to you, that means it's working.

## Updating

Edit `index.html` directly. Push. Done. No framework, no node_modules, no deploy script.
