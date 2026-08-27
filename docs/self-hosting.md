# Self-hosting VerifyRuns

VerifyRuns is a single FastAPI process, a MongoDB database, and a static React build. It runs anywhere those three do.

## Environment

| Variable | Required | Purpose |
|---|---|---|
| `MONGO_URL` | yes | MongoDB connection string |
| `DB_NAME` | yes | database name |
| `JWT_SECRET` | yes | signs login tokens (7-day expiry); rotate to log everyone out |
| `FERNET_KEY` | yes | encrypts connector secrets and Slack URLs at rest — **losing it makes every stored secret unreadable** |
| `PUBLIC_APP_URL` | no | used for the "Open in VerifyRuns" link in Slack alerts |
| `CORS_ORIGINS` | no | comma-separated origins allowed to call the API (default `*`) |
| `RESEND_API_KEY` | no | enables email alert channels via [Resend](https://resend.com); without it, adding an email channel is refused with a clear message |
| `ALERT_FROM` | no | sender for email alerts, e.g. `VerifyRuns <alerts@yourdomain>` — must be a domain verified in Resend |
| `VR_ALLOW_PRIVATE_EGRESS` | no | `1` lets Checks point at private/loopback/link-local addresses (an internal database, a local dev stack). **Off by default**: destinations must resolve to public addresses, checked at save time and before every fetch |
| `VR_MAX_RESPONSE_BYTES` | no | HTTP/JSON responses are streamed and abandoned past this size (5 MB) |
| `VR_RATE_AUTH_PER_MIN` / `VR_RATE_HOOK_PER_MIN` / `VR_RATE_CREATE_PER_MIN` | no | per-minute limits for sign-up+login per client IP (120), webhook per secret (120), Check creation per user (60); excess gets HTTP 429 with `Retry-After` |
| `VR_TICK_SECRET` | on sleeping hosts | enables `POST /api/internal/tick` (header `X-Tick-Secret`) so an external scheduler can drive heartbeats and retries; unset = endpoint disabled |
| `VR_LAZY_TICK_SECONDS` | no | any API request more than this many seconds after the last tick runs one in the background (60; `0` disables) |
| `VR_INTERNAL_TICKER` | no | `1` (default) runs the tick loop inside the API process every `VR_HEARTBEAT_TICK_SECONDS`; set `0` on hosts that sleep and use the scheduler instead |
| `VR_RETRY_DELAY_SECONDS` | no | how long after a fresh FAIL the retry becomes due (30); it runs on the next tick after that |
| `VR_HEARTBEAT_TICK_SECONDS` | no | how often the in-process ticker looks for missed heartbeat windows (60) |
| `VR_AIRTABLE_MAX_RECORDS` | no | Airtable paging ceiling (10000) |
| `VR_AIRTABLE_FETCH_BUDGET_S` | no | total time allowed for Airtable paging (60) |
| `VR_PG_COUNT_TIMEOUT_MS` | no | Postgres `COUNT(*)` timeout before falling back to the sample length (15000) |
| `VR_PG_SAMPLE_TIMEOUT_MS` | no | Postgres sample query timeout (15000) |

Frontend: `REACT_APP_BACKEND_URL` at build time, pointing at the API origin.

## Process model

The API is stateless between requests (`serverless-ready`, 2026-08-28). A webhook call runs the check inside the request and returns the verdict. Everything time-based — missed heartbeats and retry-before-alert — happens in one idempotent **tick**, driven either by the in-process loop (`VR_INTERNAL_TICKER=1`, default, fine for a VM or container that stays up) or by an external scheduler calling `POST /api/internal/tick` (set `VR_TICK_SECRET`, and `VR_INTERNAL_TICKER=0` on hosts that sleep). Pending retries are stored on the Check, so a restart loses nothing. See `docs/deploy.md` for the $0 layout.

## Network

The API makes outbound requests to the destinations users configure. By default it refuses anything that resolves to a private, loopback, link-local, multicast or cloud-metadata address — at save time (a clear 400) and again before every fetch — and never follows redirects. Set `VR_ALLOW_PRIVATE_EGRESS=1` only on an instance whose network you control. Residual risk: DNS can change between the save-time check and a later fetch; the fetch-time check narrows that window but does not pin the resolved address. Rate limits are in memory, per process, and reset on restart.

## Backups

Everything lives in two MongoDB collections plus `users`: `checks` (config, encrypted secrets, expectations, webhook secret) and `check_runs` (verdicts, fingerprints). Back up the database and the `FERNET_KEY` together.

## Minimal deploy (any container host)

```bash
# backend
uvicorn server:app --host 0.0.0.0 --port 8000
# frontend
npm run build   # serve frontend/build as static files, e.g. behind the same reverse proxy
```

The hosted build for the Emergent Builder Fest used Emergent's own runner; nothing in the code depends on it (`.emergent/` is that platform's scaffolding and can be deleted on other hosts).
