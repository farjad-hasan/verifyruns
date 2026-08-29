## ADDED Requirements

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
