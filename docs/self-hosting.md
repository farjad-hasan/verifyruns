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
| `VR_RETRY_DELAY_SECONDS` | no | seconds before the retry that precedes a fresh FAIL alert (30) |
| `VR_HEARTBEAT_TICK_SECONDS` | no | how often the in-process ticker looks for missed heartbeat windows (60) |
| `VR_AIRTABLE_MAX_RECORDS` | no | Airtable paging ceiling (10000) |
| `VR_AIRTABLE_FETCH_BUDGET_S` | no | total time allowed for Airtable paging (60) |
| `VR_PG_COUNT_TIMEOUT_MS` | no | Postgres `COUNT(*)` timeout before falling back to the sample length (15000) |
| `VR_PG_SAMPLE_TIMEOUT_MS` | no | Postgres sample query timeout (15000) |

Frontend: `REACT_APP_BACKEND_URL` at build time, pointing at the API origin.

## Process model

Checks run as FastAPI background tasks in the API process; the retry before a fresh FAIL alert is an `asyncio` sleep in the same process, and the heartbeat ticker is an `asyncio` loop started at startup. A restart drops in-flight runs and pending retries; heartbeats resume on the next tick. Run **one** API process, or two processes may both record a heartbeat FAIL in the same minute (harmless duplicates; alerts are still deduplicated). This is fine for small deployments; a worker/queue is on the roadmap (`openspec/changes/heartbeat-checks` carries the scheduler discussion).

## Network

The API makes outbound requests to whatever destinations users configure. On a shared or cloud host, restrict egress to public addresses until `openspec/changes/egress-lockdown` lands — today the server will happily fetch a private IP a user pastes in.

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
