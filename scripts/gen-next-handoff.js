#!/usr/bin/env node
/**
 * gen-next-handoff.js
 *
 * Called by Cursor at the end of each handoff to automatically generate the next one.
 * Usage: node scripts/gen-next-handoff.js "summary of what was just completed"
 *
 * Requires: ANTHROPIC_API_KEY in environment (add to .env.local or set in shell)
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Load .env.local if present (keeps key out of shell history and system env)
const envLocalPath = join(ROOT, '.env.local')
if (existsSync(envLocalPath)) {
  const lines = readFileSync(envLocalPath, 'utf8').split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
    if (key && !process.env[key]) process.env[key] = val
  }
}
const ROOT = join(__dirname, '..')
const HANDOFFS_DIR = join(ROOT, '_handoffs')

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
if (!ANTHROPIC_API_KEY) {
  console.error('ERROR: ANTHROPIC_API_KEY not set. Add it to your environment or .env.local.')
  process.exit(1)
}

const completionSummary = process.argv[2] || '(no summary provided)'

// Read context files
const context = readFileSync(join(HANDOFFS_DIR, 'CONTEXT.md'), 'utf8')
const roadmap = readFileSync(join(HANDOFFS_DIR, 'ROADMAP.md'), 'utf8')

// Determine next handoff number from existing files
const existingHandoffs = readdirSync(HANDOFFS_DIR)
  .filter(f => /^\d{2}-/.test(f))
  .map(f => parseInt(f.slice(0, 2), 10))
  .sort((a, b) => a - b)

const lastCompleted = existingHandoffs.length > 0 ? Math.max(...existingHandoffs) : 5
const nextNumber = lastCompleted + 1
const paddedNumber = String(nextNumber).padStart(2, '0')

console.log(`\n🔄 Generating Handoff ${paddedNumber}...`)
console.log(`   Completion summary: ${completionSummary.slice(0, 80)}...\n`)

const systemPrompt = `You are writing a Cursor handoff file for the Skedaddle Portal — an internal ops tool for a mobile tire business. You have deep context about the codebase and the project roadmap.

Your job: given a completion summary of what was just done, generate the NEXT handoff file that Cursor should execute.

RULES FOR THE HANDOFF FILE:
1. Be extremely specific — exact file paths, exact prop names, exact function names
2. Read the CONTEXT.md to know what's already done and what's next
3. The handoff must be self-contained — Cursor should be able to execute it without asking questions
4. Include code snippets for any non-obvious implementation
5. End with a verification checklist (lint + build must be last two items)
6. The second line must be exactly: **After completing all steps and verifying the checklist, run \`node scripts/gen-next-handoff.js "[brief summary of what was done]"\` then delete this file.**
7. Never reference "dead stock" — it's been replaced with listing management
8. Keep tone terse and technical — no fluff

OUTPUT: Only the raw markdown content of the handoff file. No preamble, no explanation.`

const userPrompt = `## Just completed
${completionSummary}

## Project context
${context}

## Full roadmap
${roadmap}

Generate Handoff ${nextNumber} based on what comes next in the roadmap. The handoff number in the filename and title should be ${paddedNumber}.`

async function callClaude() {
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
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Claude API error ${response.status}: ${err}`)
  }

  const data = await response.json()
  return data.content[0].text
}

try {
  const handoffContent = await callClaude()

  // Extract slug from first heading line
  const titleMatch = handoffContent.match(/^# Handoff \d+ — (.+)/m)
  const slug = titleMatch
    ? titleMatch[1].toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '')
    : 'next'

  const filename = `${paddedNumber}-${slug}.md`
  const outputPath = join(HANDOFFS_DIR, filename)

  writeFileSync(outputPath, handoffContent, 'utf8')

  console.log(`✅ Handoff ${paddedNumber} written to _handoffs/${filename}`)
  console.log(`\nNext step: open _handoffs/${filename} in Cursor and execute it.\n`)
} catch (err) {
  console.error('Failed to generate handoff:', err.message)
  process.exit(1)
}
