## MODIFIED Requirements

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
