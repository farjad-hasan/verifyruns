## Why

Farjad's decision 2026-08-28: everything on Cloudflare, no card anywhere. Render's free tier now requires a card even for $0 services, and the API cannot run on Cloudflare as written — it is a long-lived Python process (FastAPI + Motor + asyncpg). Porting the API to a TypeScript Worker with D1 puts the whole product (API, database, scheduler, frontend) on one free account, with no sleeping instance and millisecond cold starts.

## What Changes

- **New `worker/`**: the API as a Cloudflare Worker (TypeScript) with the **same HTTP contract** as `backend/server.py` — the frontend and the n8n node run unchanged against it. The Python API test files are the executable spec for parity.
- **D1 replaces MongoDB.** Tables: `users`, `checks` (JSON columns for config, expectations, channels, pending work), `check_runs`, `run_samples`, `interest`, `meta`. Sample expiry is a cron sweep (D1 has no TTL).
- **Scheduler is the Worker's own cron trigger** (`* * * * *` → heartbeats, queued runs, retries, sample expiry). `deploy/cloudflare-tick-worker/` and `render.yaml` remain only as the Render fallback.
- **Crypto on WebCrypto**: secrets at rest AES-256-GCM under `ENC_KEY` (replaces Fernet — no production data exists); passwords PBKDF2-SHA256 (`VR_PBKDF2_ITERATIONS`); JWT HS256 with constant-time verify.
- **Egress policy adapts to the platform**: Workers cannot reach private networks; literal private/loopback/metadata addresses are still refused, DNS resolution is not performed. **BREAKING** relative to the old spec wording.
- **Rate limiting is best-effort per isolate** (in-memory), stated as such.
- **Airtable ceiling drops** to fit the free plan's 50 subrequests per request; counting beyond it is reported as capped.
- `backend/` stays until parity is verified; its removal is a later change.

## Capabilities

### New Capabilities
- (none)

### Modified Capabilities
- `deployment`: hosting shape (Workers + D1 + Pages + cron), no external scheduler.
- `checks`: encryption method wording.
- `connectors`: Airtable ceiling; Postgres via Workers TCP sockets.
- `data-retention`: expiry by cron sweep instead of a TTL index.
- `auth`, `egress-policy`: rate limiting and address policy as implemented on Workers.

## Impact

New directory `worker/` (wrangler config, migrations, src, vitest-pool-workers tests); `docs/deploy.md` rewritten for Workers; `frontend` unchanged except `REACT_APP_BACKEND_URL`; Atlas cluster created earlier today becomes unused (Farjad's call to delete).
