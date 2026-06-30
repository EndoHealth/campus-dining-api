# Campus Dining API Agent Entry

Canonical cross-repo SSOT lives in:

- `../ai-voice-docs/docs/agent-entry.md`
- `../ai-voice-docs/docs/projects/campus-dining-api/00-agent-entry.md`

## Repo Basics

- Service: Hono / TypeScript
- Routes: `src/routes/`
- School coverage catalog: `src/data/top50-schools.ts`
- Provider interfaces: `src/providers/`
- Tests: `tests/`

## Commands

- Dev: `npm run dev`
- Build: `npm run build`
- Tests: `npm test`

## Rules

- Do not claim live menu support unless a provider adapter fetches and normalizes
  that school in tests.
- Keep source URLs and provider confidence visible in API responses.
- Menu freshness must be explicit; this service supports near-real-time polling,
  not POS inventory-level real time.
- Do not push unless explicitly requested.
