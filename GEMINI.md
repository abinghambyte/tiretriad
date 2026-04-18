# Skedaddle Portal — Antigravity (Gemini) Overrides

Inherits from AGENTS.md. Only list **Antigravity-specific** behavior here.
If a rule applies to every agent (Cursor, Claude Code, Antigravity), put it in AGENTS.md instead.

## How to read this file
- Antigravity loads GEMINI.md on every prompt and merges it over AGENTS.md.
- Cursor and Claude Code do NOT read this file — they only read AGENTS.md.
- When a rule here conflicts with AGENTS.md, this file wins (in Antigravity only).

## Active overrides
- **UI quality bar:** Prefer the Gemini screenshot walkthrough in [`docs/GEMINI-UI-WALKTHROUGH.md`](docs/GEMINI-UI-WALKTHROUGH.md) over adding unit-test harnesses for portal UI. Align substantive UI work with [`docs/UI-POLISH-VISION.md`](docs/UI-POLISH-VISION.md).

## Suggested overrides to consider adding later
- Preferred agent mode for multi-file refactors (plan-then-execute vs. inline edit)
- Specific MCPs Antigravity should prefer when multiple tools can answer the same question
- Verbosity / explanation preferences if you want Antigravity chattier or quieter than Cursor
- Build/deploy commands if you discover Antigravity misinterprets the ones in AGENTS.md
