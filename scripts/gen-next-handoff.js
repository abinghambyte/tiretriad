#!/usr/bin/env node
/**
 * gen-next-handoff.js
 *
 * Calls Claude API to generate the next handoff file based on the ROADMAP and CONTEXT.
 * Usage: node scripts/gen-next-handoff.js "summary of what was just completed"
 *
 * Requires: ANTHROPIC_API_KEY in .env.local or environment
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const HANDOFFS_DIR = join(ROOT, '_handoffs')

// Load .env.local
const envPath = join(ROOT, '.env.local')
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq === -1) continue
    const k = t.slice(0, eq).trim()
    const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
    if (k && !process.env[k]) process.env[k] = v
  }
}

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
if (!ANTHROPIC_API_KEY) {
  console.error('ERROR: ANTHROPIC_API_KEY not set. Add it to .env.local')
  process.exit(1)
}

const completionSummary = process.argv.slice(2).join(' ').trim() || '(no summary provided)'

// Read context
const context = readFileSync(join(HANDOFFS_DIR, 'CONTEXT.md'), 'utf8')
const roadmap = readFileSync(join(HANDOFFS_DIR, 'ROADMAP.md'), 'utf8')

// Next handoff number
const existing = readdirSync(HANDOFFS_DIR)
  .filter(f => /^\d{2}-/.test(f))
  .map(f => parseInt(f.slice(0, 2), 10))
const nextNumber = existing.length > 0 ? Math.max(...existing) + 1 : 7
const paddedNumber = String(nextNumber).padStart(2, '0')

console.log(`\nGenerating Handoff ${paddedNumber} via Claude API...`)

const response = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: {
    'x-api-key': ANTHROPIC_API_KEY,
    'anthropic-version': '2023-06-01',
    'content-type': 'application/json',
  },
  body: JSON.stringify({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: `You are writing a Cursor handoff file for the Tire Triad portal — an internal ops tool for a mobile tire business operated under Front Range Rubber LLC. You have deep context on the codebase and roadmap.

Given a completion summary of what was JUST DONE, generate the NEXT handoff in the roadmap sequence. Do NOT repeat the completed work — look at what comes next in CONTEXT.md.

RULES:
1. Exact file paths, exact prop names, exact function names
2. The handoff must be fully self-contained — no asking questions
3. Code snippets for non-obvious implementations
4. End with verification checklist (lint + build last)
5. Second line must be: **After completing all steps and verifying the checklist, run \`node scripts/gen-next-handoff.js "[brief summary]"\` then delete this file.**
6. Never vague — always specific
7. OUTPUT: Raw markdown only. No preamble or explanation.`,
    messages: [{
      role: 'user',
      content: `## Just completed\n${completionSummary}\n\n## Project context\n${context}\n\n## Roadmap\n${roadmap}\n\nGenerate Handoff ${nextNumber} — the next item after what was just completed.`
    }],
  }),
})

if (!response.ok) {
  const err = await response.text()
  console.error(`Claude API error ${response.status}: ${err}`)
  process.exit(1)
}

const data = await response.json()
const content = data.content[0].text

const titleMatch = content.match(/^# Handoff \d+ — (.+)/m)
const slug = titleMatch
  ? titleMatch[1].toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '').slice(0, 60)
  : 'next'

const filename = `${paddedNumber}-${slug}.md`
writeFileSync(join(HANDOFFS_DIR, filename), content, 'utf8')

console.log(`\n✅ Handoff ${paddedNumber} written to _handoffs/${filename}\n`)
