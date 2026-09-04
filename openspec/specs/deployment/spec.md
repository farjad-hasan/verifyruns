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
`GET /api/health` SHALL be unauthenticated and SHALL return `{ok, tick_age_seconds, tick_ok_age_seconds, alert_delivery_failures, checked_at}` with HTTP 200 when the last *successfully completed* tick (`tick_last_ok_at`) is no older than `VR_HEALTH_MAX_TICK_AGE_SECONDS` (default 600), and `{ok: false, …}` with HTTP 503 otherwise — a tick that starts but throws SHALL NOT keep the probe green. `alert_delivery_failures` reports the persistent counter without affecting `ok`. The ages SHALL be measured before the request's own lazy tick runs, and the response SHALL be `Cache-Control: no-store`.

#### Scenario: Cron stopped
- **WHEN** no tick has been recorded for 15 minutes and a monitor requests `/api/health`
- **THEN** the response is HTTP 503 with `ok: false`, and the monitor's run fails

#### Scenario: Healthy
- **WHEN** the cron ticked to completion within the last minute
- **THEN** the response is HTTP 200 with `ok: true` and a small `tick_ok_age_seconds`

#### Scenario: Tick starts but throws
- **WHEN** every tick for the past 15 minutes has stamped its start and then thrown
- **THEN** the response is HTTP 503 with `ok: false`

### Requirement: Security headers on both origins
Every API response SHALL carry `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` and `Cache-Control: no-store`. The Pages site SHALL serve a `Content-Security-Policy` that allows scripts only from its own origin, connections only to its own origin and the API origin, styles and fonts only from its own origin, and no framing, plus the same transport and sniffing headers, via `frontend/public/_headers`. The site SHALL load no third-party analytics or tracking script, and the CSP SHALL be the enforcement: a beacon the hosting platform injects is blocked by it. The privacy policy's statement that there are no analytics trackers depends on this requirement; a change that adds any such script SHALL change this requirement, the privacy policy and the security page in the same change.

#### Scenario: Injected script
- **WHEN** a script from a third-party origin is referenced by the SPA
- **THEN** the browser refuses to run it and reports a CSP violation

#### Scenario: Platform-injected analytics beacon
- **WHEN** the hosting platform injects an analytics beacon script into the served HTML
- **THEN** the CSP blocks it and no request leaves the page to the analytics origin

#### Scenario: No third-party origin on a page load
- **WHEN** any route is loaded with an empty cache
- **THEN** every request the page makes goes to the site's own origin or the API origin

### Requirement: Continuous integration and an external monitor
Every push and pull request SHALL run the worker typecheck and test suite and a frontend production build on GitHub Actions. An external uptime service, independent of the repository and the Cloudflare account's health, SHALL probe `/api/health` and the Pages origin at least every 5 minutes and alert the operator on failure; its configuration SHALL be documented in `docs/deploy.md`. The GitHub scheduled workflow MAY remain as a second opinion; its 60-day inactivity auto-disable SHALL be documented where the workflow is described.

#### Scenario: Broken test on a branch
- **WHEN** a push carries a failing worker test
- **THEN** the CI run is red before anything is deployed

#### Scenario: Worker breaks during a quiet month
- **WHEN** the repository has had no activity for 61 days and the Worker starts answering 503
- **THEN** the external service still alerts the operator within minutes

### Requirement: Backups, key custody, and restore are written down and rehearsed
`docs/deploy.md` SHALL carry a Backups & restore section covering: a scheduled `wrangler d1 export` cadence, D1 Time Travel (what it covers, its 30-day window, the restore command), a step-by-step restore procedure that has been rehearsed at least once against a scratch database, and key custody — `ENC_KEY` and `JWT_SECRET` held in a password manager, with the consequence of losing each stated plainly (ENC_KEY loss = every stored connector credential and alert target unreadable).

#### Scenario: Laptop lost
- **WHEN** the operator's machine is unrecoverable
- **THEN** the keys are retrievable from the password manager and the documented restore procedure brings a fresh clone to a working deploy

#### Scenario: Bad migration in production
- **WHEN** a migration corrupts data
- **THEN** the runbook names Time Travel as the first response with the exact command shape

### Requirement: Staging environment rehearses every migration
`wrangler.toml` SHALL define a staging environment with its own Worker name and D1 database. Every migration SHALL be applied to staging and smoke-tested (`/api/health`, one webhook round-trip) before it is applied to production; `docs/deploy.md` SHALL document the ordered checklist.

#### Scenario: Migration that breaks on real data shape
- **WHEN** a new migration fails against staging's data
- **THEN** production has not run it and the failure is fixed offline
