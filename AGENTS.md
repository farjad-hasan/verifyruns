# Working in this repo (humans and agents)

Multiple Claude/agent sessions work on VerifyRuns, sometimes at the same time. On 2026-08-30
two sessions sharing this checkout collided repeatedly (a `routes.ts` change swept into another
session's commit by file-level staging; both editing one `tasks.md`; a transiently red suite).
These rules exist so that never repeats. `CLAUDE.md` is a one-line import of this file.

## The three rules

1. **One agent = one OpenSpec change, in its own worktree.**
   Planned work lives in `openspec/changes/<name>/`. Before touching code, claim a change in
   [`openspec/CLAIMS.md`](openspec/CLAIMS.md) (commit the row), then work on a branch in a
   separate worktree:

   ```bash
   git worktree add ../verifyruns-<change> -b <change>
   ```

   Never implement two changes in one branch. Merge to `main` only when the change's tests are
   green; flip the claim to `done` in the merge commit. Remove the worktree after merging
   (`git worktree remove ../verifyruns-<change>`).

2. **Stay inside your change's Impact list.**
   The proposal's `## Impact` section is the write boundary. Needing a file another open change
   owns means the changes are sequential, not parallel — check the overlap table in
   `openspec/CLAIMS.md` before claiming. Editing a file outside every list (a drive-by fix)
   gets its own commit with exact-path staging, never rides along.

3. **Stage exact paths, pull before commit, one topic per commit.**
   Never `git add -A` or `git add <dir>` in a tree another session might share. `git pull
   --ff-only` before committing. If you find someone else's uncommitted work in your tree, do
   not commit or revert it — leave it and say so.

## Conventions that already bind

- Git identity for commits: `Farjad Hasan <farjad.developer@gmail.com>` via `-c` flags or
  repo-local config — this file's directory carries an Emergent-era `.gitconfig`; ignore it.
- `openspec validate --all --strict` must pass before any push that touches `openspec/`.
- Design system: `DESIGN.md` + `PRODUCT.md` at the root are the authority (see
  `docs/design-audit-2026-08-29.md`); changing a visual token means changing `DESIGN.md` in the
  same commit. The impeccable detector's intentional exceptions live in `.impeccable/config.json`.
- Worker tests: `cd worker && npm test && npm run typecheck` (Postgres tests skip without Docker
  pg on :5434). Frontend: `cd frontend && CI=false npm run build` must compile clean.
- Deploy (only when asked): `cd worker && npm run deploy`, then build the frontend with
  `REACT_APP_BACKEND_URL=https://verifyruns-api.farjad-developer.workers.dev` and
  `npx wrangler pages deploy ../frontend/build --project-name verifyruns --branch main`.
  Worker and Pages deploy together.
- Local dev: worker `cd worker && npm run dev` (:8787, local D1); frontend must be served on
  **:3100** — the dev CORS allowlist (`worker/.dev.vars`) accepts only that origin.
