# Skedaddle Model Registry
Last updated: 2026-04-15
Source of truth for the AI Task Dispatcher. Update this file whenever a model is added, upgraded, or removed from the workforce. The dispatcher reads this on every open.

## Executors (Platforms)

### Google Antigravity
- Type: Agent platform
- Underlying model: Gemini 3.1 Pro (agent-wrapped)
- Inherent context: Persistent knowledge base across sessions, live browser access, terminal execution
- Strengths: Autonomous end-to-end tasks, self-verification against live site, no human-in-the-loop required
- Cost tier: High
- Active in Skedaddle: Yes

### Cursor
- Type: Agent platform
- Underlying model: Configurable (Sonnet 4.6 default)
- Inherent context: Full repo access, file tree, git history, open editor state
- Strengths: Human-in-the-loop multi-file builds, repo-aware edits, Skedaddle codebase native
- Cost tier: Subscription
- Active in Skedaddle: Yes

## Frontier Models

### Claude Opus 4.6
- Provider: Anthropic
- Context window: 1M tokens
- Inherent context: None (stateless between sessions)
- Strengths: Architecture decisions, data model design, security review, complex multi-file refactoring, PhD-level reasoning
- Cost tier: High ($15/$75 per 1M tokens)
- Active in Skedaddle: Yes — architecture sessions only

### Gemini 3.1 Pro
- Provider: Google
- Context window: 2M tokens
- Inherent context: Live web access, aggressive context caching
- Strengths: Real-time market data, eBay comps, multimodal, massive document parsing
- Cost tier: Medium ($2/$12 per 1M tokens)
- Active in Skedaddle: Yes — listing advisor primary, market intel

## Daily Drivers

### Claude Sonnet 4.6
- Provider: Anthropic
- Context window: 1M tokens (beta) — safe to load full repo plus all docs before considering Opus escalation
- Inherent context: None (stateless between sessions)
- Strengths: Iteration, Cursor handoff writing, debugging, session architecture work
- Cost tier: Low-Medium ($3/$15 per 1M tokens)
- Active in Skedaddle: Yes — default workhorse

### Gemini 3.1 Flash-Lite
- Provider: Google
- Inherent context: None persistent
- Strengths: High-volume data extraction, listing generation throughput, built for scale
- Cost tier: Very Low ($0.25/$1.50 per 1M tokens)
- Active in Skedaddle: Yes — Listing Advisor primary (replaces Haiku in this lane)

### Claude Haiku 4.5
- Provider: Anthropic
- Context window: 200K tokens
- Inherent context: None (stateless between sessions)
- Strengths: Fast, cheap, Slack copy, slash command responses, one-sentence outputs
- Cost tier: Low ($1/$5 per 1M tokens)
- Active in Skedaddle: Yes — /hype, Listing Advisor fallback when Gemini unavailable

## Reserve Roster (registered, not yet active)

### Grok 4.20
- Provider: xAI
- Model strings: `grok-4.20-multi-agent-0309` (4-agent cross-verification mode), `grok-4.20-latest` (default)
- Strengths: Real-time X/Twitter firehose, live market sentiment, 4-agent parallel cross-verification
- Cost tier: Medium
- Activate when: Real-time social pricing signals needed, or cross-verification of market data is required — use multi-agent string explicitly when that's the reason

### DeepSeek V3.2
- Strengths: General-purpose frontier reasoning at commodity cost
- Cost tier: Ultra-low ($0.14/$0.28 per 1M tokens)
- Activate when: High-volume reasoning tasks where quality-to-cost ratio matters more than specialization

### DeepSeek R1
- Strengths: Specialized deep chain-of-thought reasoning, complex math
- Cost tier: Low (higher than V3.2 — check current pricing before activating)
- Activate when: Math-heavy margin modeling, complex reasoning where quality matters more than price — do not confuse with V3.2

### Kimi K2.5
- Strengths: 1T parameters, Agent Swarm spawning up to 100 parallel sub-agents for research
- Activate when: eBay research workload grows to parallel scale

### GLM-5.1
- Strengths: Long-horizon autonomous codebase work (8+ hours)
- Activate when: Multi-day refactor tasks without human checkpoints
