## ADDED Requirements

### Requirement: Scheduler is a Cloudflare Worker cron
The recommended scheduler SHALL be a Cloudflare Worker (`deploy/cloudflare-tick-worker/`) with a `* * * * *` cron trigger that POSTs to `/api/internal/tick` with `X-Tick-Secret` from a Worker secret; it doubles as the keep-awake for the free API host. cron-job.org SHALL be documented as the fallback.

#### Scenario: Deployed with wrangler
- **WHEN** `wrangler deploy` runs with `TICK_URL` set and `TICK_SECRET` stored via `wrangler secret put`
- **THEN** the tick endpoint receives one request per minute and the API does not sleep
