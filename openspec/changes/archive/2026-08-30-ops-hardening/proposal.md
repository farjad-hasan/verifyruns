## Why

The review found three operational gaps: nothing runs the test suite except a developer's terminal, nothing outside Cloudflare would notice if the Worker or its cron stopped (the product's whole pitch is noticing exactly that for other people), and neither the API nor the Pages site sends security headers, so the SPA runs with no CSP and the JWT-in-localStorage design has no script-injection backstop.

## What Changes

- `GET /api/health`: unauthenticated, reports `{ok, tick_age_seconds, checked_at}`; 200 when the last tick is within `VR_HEALTH_MAX_TICK_AGE_SECONDS` (default 600), else 503. Age is measured *before* the request's own lazy tick runs (the tick is scheduled after the response), so a stale cron cannot hide behind the probe. `Cache-Control: no-store`.
- Every API response carries `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` and `Cache-Control: no-store`.
- `frontend/public/_headers` gives the Pages site a CSP (`default-src 'self'`; scripts self only; styles self + inline (React style props); fonts from Google; `connect-src` self + the API origin; `frame-ancestors 'none'`), HSTS, nosniff, referrer policy and `Permissions-Policy`. The API origin is a literal — a custom domain must be added there when it lands.
- `.github/workflows/ci.yml`: on push and PR, worker typecheck + tests (Postgres cases skip without a DSN, as locally) and a frontend production build.
- `.github/workflows/monitor.yml`: every 30 minutes, `curl -f` the health endpoint; a red run emails the repository owner. GitHub cron jitters by minutes and is auto-disabled after 60 days without repository activity — this is a backstop, not a pager.

## Capabilities

### Modified Capabilities
- `deployment`: health endpoint, security headers on both origins, CI and the external monitor.

## Impact

`worker/src/index.ts`, `worker/src/routes.ts`, `worker/src/env.ts`, `worker/test/health.test.ts`, `frontend/public/_headers`, `.github/workflows/*`, `docs/deploy.md`, `docs/security.md`.
