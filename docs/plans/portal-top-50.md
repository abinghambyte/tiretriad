# Portal Top 50 Improvement Plan

Source: full UI audit 2026-04-18. Goal: professional-grade polish without expanding scope beyond 5 flagged items.

## Phase 1. Credibility sprint
- [ ] 1. Fix light mode end-to-end (audit `dark:` variants; no orphan dark surfaces under light page)
- [ ] 2. Honor `prefers-color-scheme` on first load, remember user override
- [ ] 13. Purge em dashes globally (replace with period, parenthesis, or hyphen)
- [ ] 14. Remove Firestore paths from UI (`meta/revenueStats`, `priceIntel.*`, `priceIntel.kyleConfirmed`, `pokedAt`, `pokeCount`, `assignedTo`)
- [ ] 15. Remove env var names (`GEMINI_API_KEY`, `SINCH_INBOUND_SHARED_SECRET`) from user UI
- [ ] 16. Hide/obscure the Cloud Functions webhook URL behind an Admin "Show webhook" control
- [ ] 17. Remove first-name references ("Kyle", "DJ") from non-personal copy
- [ ] 18. Rewrite "Create user + invite" description without Auth/Firestore/invite-token mentions
- [ ] 19. Strip "(SAMPLE)", "(META)", "(ESTIMATED FROM LOADED ORDERS)" suffixes
- [ ] 20. Fix pluralization ("1 orders", "1 accounts", "1 units")
- [ ] 21. Replace the dash-placeholder last-seen pattern with "Never signed in"
- [ ] 22. Replace Unicode `→` in copy with "to" or a semantic separator
- [ ] 25. Remove dev hints ("Bookmark /orders", "read only" subtitle tags)
- [ ] 48. Rewrite Revenue debug copy

## Phase 2. Structural nav
- [ ] 6. Persistent desktop top nav (Tires, CRM, People, Analytics, Ops)
- [ ] 7. Unify tab URL pattern (CRM uses both `?tab=` and `/subpath`)
- [ ] 8. Parent-aware breadcrumbs in sub-views
- [ ] 9. Remove duplicate H1 (top bar + page header)
- [ ] 10. Fix nested-link pattern on dashboard module cards
- [ ] 11. Normalize module CTA verbs
- [ ] 12. Collapse Growth Lab CTA asymmetry

## Phase 3. Tires catalog hardening
- [ ] 4. Tabular-nums / fix slashed-zero font appearance in number columns
- [ ] 33. Global MSPN/description search [SCOPE]
- [ ] 34. Collapse filter panel by default behind "Filters (N)" chip
- [ ] 35. Make every column header sortable
- [ ] 36. Replace ALL/NONE buttons with tri-state header checkbox
- [ ] 37. Column-picker with FET hidden by default [SCOPE]
- [ ] 38. Fix margin display mutation on overhead editor open
- [ ] 39. Redesign FB/OU/CL listing chips
- [ ] 40. Lift filters into sticky strip / left rail to remove double scroll
- [ ] 41. Per-view row counter inside table

## Phase 4. Module polish
- [ ] 23. Clarify "Poke customer" vs "Notify customer"
- [ ] 24. Label "Warm" dropdown as "Urgency", show options (Cold/Warm/Hot)
- [ ] 42. Fix order card action button hierarchy
- [ ] 43. Unify button style system
- [ ] 44. "Sound: on" as icon toggle
- [ ] 45. CRM pipeline column summaries (count + $) [SCOPE]
- [ ] 46. Format "28 pain 1" score tag
- [ ] 47. Pipeline summary header row
- [ ] 49. Leaderboard empty card copy
- [ ] 50. Split Ops Command into Ops (daily) and Admin (settings) [SCOPE]

## Phase 5. Dashboard + closing details
- [ ] 3. Collapse color tokens to one neutral + accent ramp
- [ ] 5. Canonical `skedaddleinc.com` vs `www.skedaddleinc.com`
- [ ] 26. Make Recent Activity order IDs clickable
- [ ] 27. Remove dash placeholders in empty activity rows
- [ ] 28. CREW ALERTS hover/tooltip explanation
- [ ] 29. KPI card accent legend or remove
- [ ] 30. Relocate Credit tracker band
- [ ] 31. Swap Catalog Size KPI for revenue/outcome KPI
- [ ] 32. Promote CATALOG HEALTH links

## Scope flags (5 allowed)
Items 33, 37, 45, 50 are [SCOPE]. One reserve slot for item 6 if persistent nav is classed as feature.

## Done criteria
- Light mode QA green in both themes
- Zero env vars / Firestore paths visible to non-admins
- Em-dash count in rendered app = 0
- Tires catalog operable without outer-page scroll
