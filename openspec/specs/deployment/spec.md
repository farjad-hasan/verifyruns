# deployment Specification

## Purpose
The $0 hosting shape — Cloudflare Pages for the static frontend, a sleeping/scale-to-zero API host driven by an external tick, MongoDB Atlas M0 — and the operational contract that makes it safe: nothing depends on the API process surviving past a response.

## Requirements

### Requirement: Runs at zero cost on sleeping hosts
The frontend SHALL be deployable to Cloudflare Pages as a static build with client-side routes served by `public/_redirects` (`/* /index.html 200`) and the API origin supplied at build time by `REACT_APP_BACKEND_URL`. The API SHALL be deployable as a Cloudflare Worker (`worker/`, `wrangler deploy`) backed by a D1 database and its own cron trigger, needing nothing outside the Cloudflare account. There SHALL be exactly one API implementation, the Worker; the former Python API is retrievable only from git history (tag `python-backend-final`).

#### Scenario: Deep link on Pages
- **WHEN** a visitor opens `/checks/<id>` or `/pricing` directly on the Pages domain
- **THEN** the SPA loads and routes client-side instead of a Cloudflare 404

#### Scenario: API asleep
- **WHEN** no request has arrived for hours and a webhook arrives
- **THEN** the Worker answers within milliseconds; there is no sleeping instance, and the cron trigger has kept ticking

### Requirement: Scheduler is a Cloudflare Worker cron
The API Worker SHALL carry a `* * * * *` cron trigger whose `scheduled` handler runs the tick (missed heartbeats, queued runs, due retries, sample expiry). `POST /api/internal/tick` with `X-Tick-Secret` SHALL remain as a manual trigger for operators and tests.

#### Scenario: Deployed with wrangler
- **WHEN** `wrangler deploy` runs
- **THEN** the tick runs once per minute inside the same Worker with no external scheduler

### Requirement: Health endpoint answers for an external monitor
`GET /api/health` SHALL be unauthenticated and SHALL return `{ok: true, tick_age_seconds, checked_at}` with HTTP 200 when the last recorded tick is no older than `VR_HEALTH_MAX_TICK_AGE_SECONDS` (default 600), and `{ok: false, …}` with HTTP 503 otherwise. The age SHALL be measured before the request's own lazy tick runs, and the response SHALL be `Cache-Control: no-store`.

#### Scenario: Cron stopped
- **WHEN** no tick has been recorded for 15 minutes and a monitor requests `/api/health`
- **THEN** the response is HTTP 503 with `ok: false`, and the monitor's run fails

#### Scenario: Healthy
- **WHEN** the cron ticked within the last minute
- **THEN** the response is HTTP 200 with `ok: true` and a small `tick_age_seconds`

### Requirement: Security headers on both origins
Every API response SHALL carry `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` and `Cache-Control: no-store`. The Pages site SHALL serve a `Content-Security-Policy` that allows scripts only from its own origin, connections only to its own origin and the API origin, and no framing, plus the same transport and sniffing headers, via `frontend/public/_headers`.

#### Scenario: Injected script
- **WHEN** a script from a third-party origin is referenced by the SPA
- **THEN** the browser refuses to run it and reports a CSP violation

### Requirement: Continuous integration and an external monitor
Every push and pull request SHALL run the worker typecheck and test suite and a frontend production build on GitHub Actions. A scheduled workflow SHALL probe `/api/health` at least every 30 minutes and fail (notifying the owner) when it does not answer 200.

#### Scenario: Broken test on a branch
- **WHEN** a push carries a failing worker test
- **THEN** the CI run is red before anything is deployed
