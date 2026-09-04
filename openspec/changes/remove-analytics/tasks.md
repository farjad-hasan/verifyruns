## 1. Remove PostHog

- [ ] 1.1 `frontend/src/index.js`: drop the `posthog-js` import and the `posthog.init` block
- [ ] 1.2 `frontend/src/lib/auth.jsx`, `frontend/src/pages/NewCheck.jsx`: drop the import and every `posthog.*` call
- [ ] 1.3 `cd frontend && corepack yarn remove posthog-js` (updates `package.json` and `yarn.lock`)
- [ ] 1.4 `.github/workflows/deploy.yml` and `docs/deploy.md`: remove `REACT_APP_POSTHOG_KEY`

## 2. Restore the CSP

- [ ] 2.1 `frontend/public/_headers`: `script-src 'self'`; `connect-src 'self' https://verifyruns-api.farjad-developer.workers.dev`; drop the "analytics-ready" comment
- [ ] 2.2 `openspec/specs/deployment/spec.md`: delta applied at archive; `openspec validate --all --strict` green

## 3. Verify, then ship

- [ ] 3.1 `CI=true corepack yarn build` compiles; `grep -c posthog build/static/js/main.*.js` is 0
- [ ] 3.2 PR merged; deploy workflow green; live checks: bundle has no `phc_` key, the CSP response header names no third-party host, `read_network_requests` on `/` shows no request to `posthog.com` or `cloudflareinsights.com`
- [ ] 3.3 `CLAIMS.md` row flipped to `done`; change archived; worktree removed
