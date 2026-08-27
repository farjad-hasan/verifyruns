## Why

`serverless-ready` made the API safe on sleeping hosts at the price of three trade-offs: heartbeats and retries are only as prompt as the external tick (~5 min), a sleeping instance cold-starts, and a slow destination now means a slow webhook reply. Farjad's call 2026-08-28: minimise all three, and prefer Cloudflare's free tier over more third parties.

## What Changes

- **Lazy tick on traffic**: any API request runs the tick in the background if more than `VR_LAZY_TICK_SECONDS` (60) have passed, claimed atomically in Mongo so concurrent requests never double-run. The scheduler remains the floor for quiet periods.
- **Queued webhook**: `?wait=0` stores the run on the Check (`pending_runs`) and answers `202` at once; the next tick executes it. True fire-and-forget that survives a sleeping host. Default stays inline.
- **Fast Airtable counting**: page one is fetched in full (the sample); later pages request a single field via `fields[]`, so counting a 10,000-row base moves near-empty pages. The newest record is chosen across all pages by `createdTime` and fetched individually when it is not on page one.
- **Cloudflare Worker cron** (`deploy/cloudflare-tick-worker/`) as the recommended scheduler — every minute, in the same Cloudflare account as Pages; it also keeps Render awake. cron-job.org becomes the fallback.

## Capabilities

### New Capabilities
- (none)

### Modified Capabilities
- `heartbeat`: tick can also be driven lazily by traffic.
- `checks`: the webhook gains a queued mode.
- `connectors`: Airtable paging strategy and newest-record selection.
- `deployment`: recommended scheduler and cadence.

## Impact

`backend/server.py` (middleware, `pending_runs`, tick drain, Airtable branch), tests, `deploy/cloudflare-tick-worker/{wrangler.toml,src/index.js}`, `docs/deploy.md`, `docs/self-hosting.md`, n8n node unchanged.
