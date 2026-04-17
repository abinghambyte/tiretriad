# Cursor handoff — scaffold abinghambyte/workforce (standalone dispatcher)

> Worker: Field Executor (Cursor)
> Author: Portal Architect (Sonnet 4.6)
> Date: 2026-04-15

## Goal
Extract the AI Task Dispatcher out of the Skedaddle Portal into a standalone Vercel app at `abinghambyte/workforce`. The new app must run with no Firebase dependency, proxy Anthropic through a Vercel serverless function (key never client-side), and persist session handoffs under project-scoped storage keys from day one. After it's live, swap the Skedaddle Growth Lab CTA from `/dispatch` to the standalone URL and replace the in-portal `/dispatch` route with a thin redirect.

This is a foundation build for what becomes a multi-user product later — make the data shapes support that, but do not implement multi-user yet.

## Decisions already locked (do not re-litigate)
- Repo: `abinghambyte/workforce` (confirmed by Alex 2026-04-15)
- Vercel deployment, no Firebase
- API key only ever in Vercel env vars (`ANTHROPIC_API_KEY`); proxied through `/api/route`
- Project context is a data structure `{ projectId, projectName, stackSummary, rules, teamBlueprint }`, never a hardcoded string
- Session handoff storage key: `dispatcher:{projectId}:handoff` from day one
- Model Registry shared/global; Team Blueprint per-user (when multi-user ships) — for now both live as `/docs` files in the new repo
- `window.localStorage` is fine for single-user phase; structure the read/write through a `storage.js` helper so swapping to a backend later is one file
- Skedaddle `/dispatch` route becomes a thin redirect for two weeks, then deleted (`Navigate to={WORKFORCE_URL} replace`)
- Skedaddle Growth Lab CTA opens the standalone URL in a new tab (`target="_blank" rel="noopener noreferrer"`)

## Stack
- Vite + React 19 + TypeScript (yes TS — new repo, start clean)
- Tailwind CSS v4 (matches the portal — copy the exact dark theme palette and `amber-500/600` accent so it feels like the same product family)
- Vercel serverless functions (Node 22 runtime) — single function at `/api/route`
- No state library — `useState` + the storage helper is enough at this scale

## Repo structure
```
workforce/
  api/
    route.ts                  # Vercel serverless — proxies Anthropic, gates on no-auth (single-user)
  docs/
    MODEL-REGISTRY.md         # Copied verbatim from skedaddleinc repo, untouched
    TEAM-BLUEPRINT.md         # Copied verbatim, including new Antigravity handoff section
    SESSION-HANDOFF-SCHEMA.md # Copied verbatim
    PROJECT-CONTEXT-SCHEMA.md # NEW — see below
  src/
    App.tsx                   # Single page — TaskDispatcher
    main.tsx
    index.css                 # Tailwind entry
    pages/
      Dispatcher.tsx          # Port of src/pages/TaskDispatcher.jsx (drop Firebase imports)
    lib/
      anthropicClient.ts      # fetch('/api/route', { body: JSON.stringify(payload) })
      storage.ts              # readHandoff / writeHandoff / clearHandoff — keyed by projectId
      projectContext.ts       # Loads {projectId,projectName,stackSummary,rules,teamBlueprint} — bootstrap with Skedaddle as the seed project
    components/
      DispatcherPanel.tsx     # Task / Result / Generated prompt (3 cols)
      HandoffSection.tsx      # DECIDED / COMPLETED / OUTSTANDING / NEXT BRIEF
      ProjectSwitcher.tsx     # Header dropdown — only "Skedaddle Portal" for now, but built so adding projects is data, not code
  public/
    favicon.svg
  .env.example                # ANTHROPIC_API_KEY=
  .gitignore
  package.json
  tsconfig.json
  vite.config.ts
  tailwind.config.js
  postcss.config.js
  vercel.json                 # Routes /api/route → api/route.ts; sets Node 22 runtime
  README.md
  AGENTS.md                   # Same dual-agent rules style as Skedaddle, scaled down for this repo
```

## Implementation notes — by file

### `api/route.ts`
- POST only. Reject other methods with 405.
- Reads `ANTHROPIC_API_KEY` from `process.env`. If missing → 500 with `{ error: 'ANTHROPIC_API_KEY not configured' }`.
- Body shape: `{ task: string, sessionNotes?: string, modelHint?: string, projectContext: { projectId, projectName, stackSummary, rules, teamBlueprint } }`. Validate task non-empty; trim sessionNotes to 12000 chars; reject if projectContext missing or projectId blank.
- Build the system prompt by composing the static workforce roster + cost-check protocol (lift from `functions/taskDispatcher.js` ROUTING_SYSTEM_PROMPT, but parameterize the project-specific lines — replace the hardcoded Skedaddle invariants with `${projectContext.rules}` interpolation, and the workforce roster reads from `projectContext.teamBlueprint`). The Antigravity Goal/Verification steps/Success criteria/What NOT to touch format block stays static.
- Model: `'claude-sonnet-4-6'`. `max_tokens: 2000`, `temperature: 0.2`. Same `anthropic-version: '2023-06-01'` header.
- Strip JSON fences from the response (port `stripJsonFences` from taskDispatcher.js). Try `JSON.parse`. On failure return `{ error: 'Routing failed', raw: stripped }` with HTTP 200 — UI handles it.
- No auth on the API endpoint for v1 (single-user). Add a TODO comment: `// TODO: when multi-user ships, gate on a Vercel-issued session token here.`

### `src/lib/storage.ts`
```ts
export type Handoff = { decided: string; completed: string; outstanding: string; nextBrief: string }
const EMPTY: Handoff = { decided: '', completed: '', outstanding: '', nextBrief: '' }
export function handoffKey(projectId: string) { return `dispatcher:${projectId}:handoff` }
export function readHandoff(projectId: string): Handoff { /* JSON.parse with defensive defaults */ }
export function writeHandoff(projectId: string, h: Handoff): void { /* localStorage.setItem */ }
export function clearHandoff(projectId: string): void { /* localStorage.removeItem */ }
```
Always read/write through these helpers — no direct `localStorage` calls in components. This is the seam for future backend storage.

### `src/lib/projectContext.ts`
```ts
export type ProjectContext = {
  projectId: string             // 'skedaddle' for the seed project
  projectName: string           // 'Skedaddle Portal'
  stackSummary: string          // 1–2 sentence stack description
  rules: string[]               // ['profit = (paymentAmount - buyPrice ...) × qty', 'FET washes out', ...]
  teamBlueprint: WorkerEntry[]  // typed copy of TEAM-BLUEPRINT.md
}
```
Bootstrap with one project (Skedaddle) hardcoded as a TS constant for v1. Build it so `loadProject(projectId)` is a function call — when multi-user ships, that function pulls from a backend instead of the constant map.

### `src/pages/Dispatcher.tsx`
Port from `src/pages/TaskDispatcher.jsx` in the Skedaddle repo. Delta:
- Remove `httpsCallable`, `firebase/config`, `useUserProfile` — there's no auth in v1.
- Replace `dispatchCallable(payload)` with `fetch('/api/route', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({...payload, projectContext}) })`.
- Replace `HANDOFF_STORAGE_KEY = 'dispatcher:handoff'` with calls into `storage.ts` keyed by the active `projectContext.projectId`.
- Drop the `allowed` / `loading` gates — the page is always allowed in v1.
- Layout, copy, three-pane structure, Tailwind classes — unchanged. Keep the amber primary, zinc/slate dark surfaces.
- Add a header line above the panels: `<ProjectSwitcher />` showing "Project: Skedaddle Portal" with a disabled dropdown caret (placeholder for multi-project later).

### `docs/PROJECT-CONTEXT-SCHEMA.md` (new file)
Document the `ProjectContext` data shape, the 5 fields, and the convention that `rules` is a flat string array (each entry = one invariant line that must end up in the system prompt verbatim). Note that this is the canonical contract between the UI's project switcher and `/api/route`.

### `AGENTS.md`
Mirror the Skedaddle AGENTS.md style — short, prescriptive, "do this / never do that". Cover:
- API key only ever in Vercel env or `.env.local` — never check in
- All Anthropic calls go through `/api/route`, never client-side
- All storage reads/writes through `storage.ts`
- Project context is data, never hardcoded into prompt strings
- Don't add Firebase, Auth, or any user system in v1

### `vercel.json`
- `functions['api/route.ts'].runtime = 'nodejs22.x'`
- Set Project Settings → Environment Variables → `ANTHROPIC_API_KEY` (production + preview) once the repo is connected. Document this in README.

### `README.md`
Sections: What this is · Stack · Local dev · Deploy (push to main = Vercel auto-deploy) · Adding a new project (edit `projectContext.ts`) · Adding a worker to the Team Blueprint (edit docs + the typed const). One-line link to MODEL-REGISTRY and TEAM-BLUEPRINT.

## Skedaddle-portal-side patch (separate commit, after the standalone is live on Vercel)
1. **Get the production URL** (e.g. `https://workforce-abinghambyte.vercel.app` or a custom domain if Alex sets one). Treat it as `WORKFORCE_URL` constant in `src/constants/externalUrls.ts` — new file, single export.
2. **Growth Lab CTA** — `src/components/dashboard/Dashboard.jsx:307-310`:
   ```jsx
   const secondaryFooter =
     m.title === 'Growth Lab' && isOverwatch
       ? { href: WORKFORCE_URL, label: 'Launch Dispatcher', external: true }
       : undefined
   ```
   `ProjectCard.jsx` may need an `href` + `external` prop variant — open it in a new tab with `target="_blank" rel="noopener noreferrer"`. Keep the existing `to`-based version intact for other cards.
3. **`/dispatch` thin redirect** — `src/App.jsx:50-57`:
   ```jsx
   <Route path="/dispatch" element={<Navigate to={WORKFORCE_URL} replace />} />
   ```
   Note: `Navigate` only handles in-app paths. For an external URL, replace this with a tiny component:
   ```jsx
   function DispatchRedirect() {
     useEffect(() => { window.location.replace(WORKFORCE_URL) }, [])
     return null
   }
   ```
   Keep `src/pages/TaskDispatcher.jsx` in tree but unused for two weeks (so anyone who has an old session-storage handoff can manually copy it out). After 2026-04-29, delete the file and the redirect.

## Verification before declaring done
- `npm run build` clean in both repos
- `npm run lint` clean in both repos
- Manual: open the new Vercel URL → submit "Audit the Antigravity Site Verifier output format" → confirm result includes Antigravity-format `generatedPrompt`
- Manual: open Skedaddle dashboard as Overwatch → click "Launch Dispatcher" → confirm new tab opens to the workforce URL
- Manual: visit `https://skedaddleinc.com/dispatch` → confirm redirect to workforce URL

## Standing rules (do not violate)
- Do not modify any Skedaddle function except the dashboard CTA file and the `/dispatch` route swap
- Do not touch `slackSecrets.js`, order workflow, Slack integration, Firestore rules, or any auth guard other than the dispatcher route swap
- Do not run `npm run deploy:firebase` for this work — the standalone has no Firebase, and the portal-side patch is frontend-only
- Standing rule: lint + build pass before declaring done; deploy functions before pushing frontend (not relevant here, but never violate)

## Estimated effort
- Standalone scaffold: 4–6 hours of Cursor work (most of it is theme + layout port)
- Portal-side patch: 30 minutes
- Vercel env config + first deploy: 15 minutes
