# deployment Specification

## Purpose
The $0 hosting shape — Cloudflare Pages for the static frontend, a sleeping/scale-to-zero API host driven by an external tick, MongoDB Atlas M0 — and the operational contract that makes it safe: nothing depends on the API process surviving past a response.

## Requirements

### Requirement: Runs at zero cost on sleeping hosts
The frontend SHALL be deployable to Cloudflare Pages as a static build with client-side routes served by `public/_redirects` (`/* /index.html 200`) and the API origin supplied at build time by `REACT_APP_BACKEND_URL`. The API SHALL be deployable as a Cloudflare Worker (`worker/`, `wrangler deploy`) backed by a D1 database and its own cron trigger, needing nothing outside the Cloudflare account. The Render + Atlas layout (`render.yaml`, `/api/internal/tick` driven externally) SHALL remain documented as a fallback.

#### Scenario: Deep link on Pages
- **WHEN** a visitor opens `/checks/<id>` or `/pricing` directly on the Pages domain
- **THEN** the SPA loads and routes client-side instead of a Cloudflare 404

#### Scenario: API asleep
- **WHEN** no request has arrived for hours and a webhook arrives
- **THEN** the Worker answers within milliseconds; there is no sleeping instance, and the cron trigger has kept ticking

### Requirement: Scheduler is a Cloudflare Worker cron
The API Worker SHALL carry a `* * * * *` cron trigger whose `scheduled` handler runs the tick (missed heartbeats, queued runs, due retries, sample expiry). `POST /api/internal/tick` with `X-Tick-Secret` SHALL remain for manual and fallback use. `deploy/cloudflare-tick-worker/` SHALL be documented as needed only for the Render fallback.

#### Scenario: Deployed with wrangler
- **WHEN** `wrangler deploy` runs
- **THEN** the tick runs once per minute inside the same Worker with no external scheduler
