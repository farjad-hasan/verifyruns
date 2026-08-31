## Why

VerifyRuns can be down for hours and its operator finds out from a customer. `/api/health` reports that a tick *started* (stamped as the tick's first statement), so a tick throwing on every invocation keeps the probe green; the only external watchdog is a GitHub Actions cron that auto-disables after 60 quiet days; nothing surfaces alert-delivery failures. Beyond monitoring: `ENC_KEY` lives in a dotfile on one laptop with no backup schedule, no documented restore, and no mention anywhere of D1 Time Travel (free 30-day point-in-time restore); there is no staging environment, so every migration rehearses on production; and public status pages are indexable by Google while leaking internal check names and destination field names in diff sentences.

Production-readiness review 2026-08-31: ops C1/H1–H4, frontend H5.

## What Changes

- `/api/health` reports tick *success* (`tick_ok_age_seconds` from the `tick_last_ok_at` stamp added in `tick-run-durability`) and `alert_delivery_failures` (counter from `alert-delivery-durability`); `ok` is false when the ok-stamp is stale.
- An external uptime service (free tier: UptimeRobot or Better Stack) probes `/api/health` and the Pages origin, alerting by email — no dependency on repo activity. The GitHub monitor stays as a second opinion; its auto-disable trap is documented.
- `docs/deploy.md` gains a "Backups & restore" section: weekly `wrangler d1 export` (calendar-reminded), D1 Time Travel usage and its 30-day window, a written restore procedure rehearsed once, and key custody — `ENC_KEY`/`JWT_SECRET` in a password manager, with the consequence of each key's loss stated.
- `wrangler.toml` gains `[env.staging]` (own Worker name + D1); migrations apply to staging before prod; `docs/deploy.md` documents the order.
- `robots.txt` disallows `/status/`; the public status route sets a `noindex` meta; enabling public status gets the same confirm the disable already has.

## Capabilities

### Modified Capabilities
- `deployment`: health depth, watchdog independence, backups/custody/staging as operational contract.
- `public-status`: pages are not indexed; enabling is confirmed.

## Impact

`worker/src/routes.ts` (health), `worker/wrangler.toml`, `.github/workflows/monitor.yml` comment, `frontend/public/robots.txt`, `frontend/src/pages/PublicStatus.jsx` + `CheckDetail.jsx` (confirm), `docs/deploy.md`, `docs/self-hosting.md`, `worker/test/health.test.ts`. Depends on: `tick-run-durability` (ok-stamp), `alert-delivery-durability` (counter).
