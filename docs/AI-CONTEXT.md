# Skedaddle Portal — AI Session Context
**Read this first in every Claude or Antigravity session.**

## What this is
Private operations portal for a northern Colorado tire resale business.
Live at skedaddleinc.com | Repo: abinghambyte/skedaddleinc | Auto-deploys to Vercel on push to main.

## Stack
- Frontend: React 18 + Vite + Tailwind → Vercel
- Backend: Firebase Cloud Functions Gen2 (Node 22) → npm run deploy:firebase
- DB: Firestore (project: skedaddle-inventory)
- Auth: Firebase Auth
- External: Slack (Rubber Signal app / #fleet-ops), Sinch (SMS), Resend (email), Anthropic API

## Crew
- Alex (Overwatch/admin): boydabingham@gmail.com — owner
- Kyle (Source/supplier): Michelin rep — charges Alex's card for tires
- DJ (Field/mechanic): road service — fulfills orders

## Deploy commands
- Frontend: git add . && git commit -m "message" && git push
- Backend: npm run deploy:firebase (from project root)
- Both: npm run deploy:firebase then git push

## Pricing model (critical — do not get this wrong)
- price field (Firestore) = Kyle's buy price per tire from CSV. Already populated for all 1,160 tires.
- fet field = Federal Excise Tax. Already in Firestore. NOT double-counted in CTS.
- cts = mountCost + deliveryCost + otherCost (overhead only)
- margin % = ((price - cts) / price) × 100
- There is NO fixed retail price — customer price set per sale in Sale Messenger
- Margin near 100% when overhead is $0 is CORRECT — it means no overhead tracked yet

## Dashboard structure (6 cards in order)
1. Skedaddle Tires → /tires (Catalog, Orders, Listing Generator)
2. Rubber CRM → /crm (Pipeline, Leads, DJ Dispatch) — NOT "Fleet CRM"
3. People Systems → /people (Crew tab + Customers tab)
4. Analytics → /analytics (Wall tab, Metrics tab, Revenue tab)
5. Growth Lab → LOCKED
6. Ops Command → BUILDOUT (tire business ops only — NOT FedEx fleet ops)

## Key docs
- docs/ROADMAP.md — full feature roadmap with all phases
- docs/SKEDADDLE-MASTER.md — canonical project spec
- docs/PHASE9-FLEET-CRM-HANDOFF.md — CRM data model

## Active work (as of April 13 2026)
- Credit limit tracker (meta/creditTracker) — Slack /charge /payment /balance commands
- Kyle price confirmation step in order workflow
- AI listing advisor (Gemini) — planned
- eBay via SellerChamp — planned

## Rules for AI sessions
- Never rename "Rubber CRM" back to "Fleet CRM"
- Never add FET to CTS — it is already in price
- Never assume retailPrice field exists — it does not
- Desktop layout must not change when adding mobile fixes — use max-sm: / sm: breakpoints
- Always run npm run lint and npm run build before declaring done
- Deploy functions before pushing frontend when both change
- firebase-functions is v7.2.5 — do not downgrade
