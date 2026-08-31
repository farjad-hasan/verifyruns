## MODIFIED Requirements

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

### Requirement: Continuous integration and an external monitor
Every push and pull request SHALL run the worker typecheck and test suite and a frontend production build on GitHub Actions. An external uptime service, independent of the repository and the Cloudflare account's health, SHALL probe `/api/health` and the Pages origin at least every 5 minutes and alert the operator on failure; its configuration SHALL be documented in `docs/deploy.md`. The GitHub scheduled workflow MAY remain as a second opinion; its 60-day inactivity auto-disable SHALL be documented where the workflow is described.

#### Scenario: Broken test on a branch
- **WHEN** a push carries a failing worker test
- **THEN** the CI run is red before anything is deployed

#### Scenario: Worker breaks during a quiet month
- **WHEN** the repository has had no activity for 61 days and the Worker starts answering 503
- **THEN** the external service still alerts the operator within minutes

## ADDED Requirements

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
