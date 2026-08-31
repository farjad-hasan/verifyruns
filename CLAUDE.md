@AGENTS.md

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.
`AGENTS.md` (imported above) carries the coordination rules for parallel agent sessions — claims,
worktrees, staging discipline — and binds alongside everything here.

## What this is

VerifyRuns — after a no-code automation (n8n/Make/Zapier) reports a run as "successful",
VerifyRuns re-reads the destination itself and posts a PASS/FAIL verdict with a
human-readable diff. `memory/PRD.md` is the source of truth for what is implemented vs.
backlog — read it before adding features, update it after a feature deploys.

Live: API `https://verifyruns-api.farjad-developer.workers.dev`, app `https://verifyruns.pages.dev`.

Brand was renamed RunProof → VerifyRuns. The `rp-*` CSS classes and the `rp_token`
localStorage key are legacy naming, intentionally left as-is.

## Stack

- **API**: Cloudflare Worker + D1, TypeScript, single small modules in `worker/src/`.
  The old FastAPI/MongoDB backend is gone (git tag `python-backend-final`); anything
  mentioning Mongo, Fernet or pytest is stale.
- **Frontend**: React 19, CRA + craco, react-router 7, Tailwind + hand-written design
  system in `frontend/src/index.css`. Cloudflare Pages.
- **Specs**: `openspec/specs/` describes behaviour as built; work is proposed as
  `openspec/changes/<name>/` folders (see `openspec/config.yaml` for authoring rules) and
  validated with `openspec validate --all --strict`.

## Commands

Worker (`worker/`, npm):

```
npm install
npm run dev            # wrangler dev on :8787 (needs .dev.vars — copy .dev.vars.example)
npm test               # vitest inside workerd against a real D1 (migrations auto-applied)
npm run typecheck
npm run migrate:local | migrate:staging | migrate:remote
npm run deploy:staging | deploy
```

Frontend (`frontend/`, **yarn** — pinned via `packageManager`; `yarn.lock` is the one lockfile):

```
yarn install
yarn start             # craco dev server; REACT_APP_BACKEND_URL in .env
yarn build
```

## Testing

`worker/test/` is the suite: `SELF.fetch()` end-to-end tests plus pure-function engine
tests, run inside workerd with per-file isolated D1 databases. `setFetchForTests` /
`withFetch` stub every outbound fetch. Postgres connector tests need Docker pg on
`127.0.0.1:5434` and skip when absent. One known flake: `listchecks.test.ts` can hit its
5 s timeout on a cold start — rerun it alone before assuming a regression.

Engine changes require pure-function tests first (`openspec/config.yaml` rule).

## Architecture pointers

- `worker/src/index.ts` — routes table, CORS, security headers, cron + lazy tick wiring.
- `worker/src/engine.ts` — the verdict engine: deterministic, no model. Fingerprints,
  `computeVerdict` (last-30-PASS baseline, inexact-count skip rules), claim parsing.
- `worker/src/connectors.ts` — HTTP/JSON, Airtable (4,000-row page ceiling → `count_capped`),
  Postgres (read-only session, publicly-trusted TLS only on the hosted build).
- `worker/src/execute.ts` — one run: fetch → fingerprint → verdict → persist → alert routing.
- `worker/src/tick.ts` — everything time-based: heartbeats via the maintained
  `next_heartbeat_due_at` column, at-least-once queued-run drain, retries, sample expiry,
  run retention. D1 has no cross-statement transactions: durability comes from predicated
  UPDATEs and claim shapes — keep that discipline for anything concurrent.
- `worker/src/alerts.ts` — state-transition alerts, claim-then-deliver with rollback when
  every channel fails.
- `worker/src/crypto.ts` — AES-256-GCM secrets at rest, PBKDF2 passwords (iteration count
  stored per hash), HS256 JWTs carrying a `token_version` claim.
- Ownership checks return 404 (never 403) on a miss; `sanitizeCheck` is the single choke
  point that strips encrypted secrets — route any new check-returning endpoint through it.
  The public status endpoint returns a hand-built projection, never the check document.
- Frontend: `src/lib/api.js` (axios; 401 → drops token + `rp:unauthorized` event, routing
  decides), `src/lib/auth.jsx` (tri-state user), `src/lib/usePoll.js` (all polling),
  `src/components/Timeline.jsx` (the 30-square hero component).

## Design

`DESIGN.md` holds the visual brief. Dark-only, `#0A0A0A` base, emerald PASS / red FAIL;
fonts Outfit / Manrope / JetBrains Mono. Prefer the existing `rp-*` / `badge-*` /
`tl-square` classes over inventing styles. Every interactive element carries a
`data-testid` (`frontend/src/constants/testIds/` is the registry; follow the surrounding
file's convention).

## Deployment

`docs/deploy.md` is the runbook: migrate staging → smoke → migrate production → deploy
(migrations always before code). Backups, D1 Time Travel, key custody and the external
uptime monitor are documented there. `docs/self-hosting.md` carries the env-var table.
