## 1. Remove PostHog

- [x] 1.1 `frontend/src/index.js`: drop the `posthog-js` import and the `posthog.init` block
- [x] 1.2 `frontend/src/lib/auth.jsx`, `frontend/src/pages/NewCheck.jsx`: drop the import and every `posthog.*` call
- [x] 1.3 `cd frontend && corepack yarn remove posthog-js` (updates `package.json` and `yarn.lock`)
- [x] 1.4 `.github/workflows/deploy.yml` and `docs/deploy.md`: remove `REACT_APP_POSTHOG_KEY`

## 2. Restore the CSP

- [x] 2.1 `frontend/public/_headers`: `script-src 'self'`; `connect-src 'self' https://verifyruns-api.farjad-developer.workers.dev`; drop the "analytics-ready" comment
- [x] 2.2 `openspec/specs/deployment/spec.md`: delta applied at archive; `openspec validate --all --strict` green

## 3. Verify, then ship

- [x] 3.1 `CI=true corepack yarn build` compiles (2026-09-04); `grep -c 'posthog\|phc_' build/static/js/main.*.js` is 0; diff is exactly the eight files in Impact, 6 insertions / 93 deletions
- [x] 3.2 PR #13 merged 2026-09-04 (`9b37629`); deploy run 33907648093 green. Live: bundle `main.d2b69cce.js` has 0 `posthog`/`phc_` references; CSP header is `script-src 'self'; connect-src 'self' <API>`; in Edge, `window.posthog` is undefined, no resource request to any posthog host, and the Pages-injected `beacon.min.js` tag is present but its two resource-timing entries show status 0 / 0 bytes / 0 ms — blocked by the CSP before fetch
- [x] 3.3 `CLAIMS.md` row flipped to `done`; change archived; worktree removed
