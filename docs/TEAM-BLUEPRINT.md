# Skedaddle Team Blueprint
Last updated: 2026-04-15
Named AI workforce instances. Each entry is a specific role with owned task types. The dispatcher matches tasks to roles — not raw model capabilities. Update when a role is added, reassigned, or an underlying model version changes.

## Active Roster

### Portal Architect
- Worker: Claude Sonnet 4.6
- Platform: Claude.ai
- Task ownership: Cursor handoff writing, session architecture, debugging, code review
- Context loaded: AI-CONTEXT.md, ROADMAP.md, session notes
- Never touch: Financial transactions, Tanner-related anything, security permission changes

### Listing Advisor
- Worker: Gemini 3.1 Flash-Lite (primary)
- Fallback: Claude Haiku 4.5 (when Gemini unavailable — same pattern as current listingAdvisor function)
- Platform: Firebase callable — listingAdvisor function
- Task ownership: AI-generated tire listings, sell probability, platform recommendations
- Context loaded: Tire schema, Skedaddle pricing model

### Market Intel
- Worker: Gemini 3.1 Pro
- Platform: Google AI Studio / Firebase callable
- Task ownership: eBay sold comps, real-time pricing research, marketplace analysis
- Context loaded: Live web

### Site Verifier
- Worker: Google Antigravity
- Platform: Antigravity IDE
- Task ownership: Autonomous deploy verification, live site audit, end-to-end builds that self-verify
- Context loaded: Persistent KB, live skedaddleinc.com access
- Use when: Cursor finishes a deploy and you want verification without manual QA

### Infrastructure Lead
- Worker: Claude Opus 4.6
- Platform: Claude.ai
- Task ownership: Data model design, security architecture, major schema changes, decisions where being wrong costs a redeploy
- Context loaded: Full AI-CONTEXT.md + ROADMAP.md + relevant schema docs on every session — Opus has no memory
- Gate: Always run cost-check before routing here

### Field Executor
- Worker: Cursor (Sonnet 4.6 default)
- Platform: Cursor IDE
- Task ownership: All actual file writes, multi-file code execution, repo-aware builds
- Context loaded: Full repo, .cursorrules, open editor state
- Note: Portal Architect writes the handoff — Field Executor executes it

## Cost-Check Protocol
Before routing to Opus or Antigravity, evaluate in order:
1. Can Sonnet handle this with a full context load? Sonnet's 1M token window fits the entire repo plus all docs. If yes → Portal Architect.
2. Needs autonomous live site verification? → Site Verifier (Antigravity)
3. Needs real-time web data or market comps? → Market Intel (Gemini Pro)
4. True architecture decision where a shortcut causes a redeploy? → Infrastructure Lead (Opus)
5. All actual file writes → Field Executor (Cursor) regardless of who designed the solution
