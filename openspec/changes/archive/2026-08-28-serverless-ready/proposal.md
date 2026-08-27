## Why

Farjad's decision 2026-08-28: run VerifyRuns at $0 — frontend on Cloudflare Pages, API on a free tier that sleeps or scales to zero. Three parts of the app assume a process that stays alive: the heartbeat ticker, check runs that continue after the webhook has answered, and the 30-second retry-before-alert sleep. On a sleeping host all three silently stop. Making the API stateless between requests removes the need for an always-on process and lets any free host run it.

## What Changes

- **Webhook runs the check inline, always.** `POST /api/hook/{secret}` returns the verdict in the same response; `?wait` is accepted for compatibility but no longer changes behaviour. **BREAKING** for anyone relying on the instant `{accepted, run_id}` reply — the reply now arrives after the destination read (seconds).
- **`POST /api/internal/tick`** — protected by `X-Tick-Secret` (`VR_TICK_SECRET`) — runs the heartbeat sweep and drains due retries. An external scheduler (cron-job.org, GitHub Actions, Cloud Scheduler) calls it every few minutes. The in-process ticker stays for local/self-hosted use behind `VR_INTERNAL_TICKER` (default on).
- **Retry-before-alert becomes retry-on-next-tick.** A fresh FAIL records `pending_retry` on the Check (`due_at`, `claimed_new`); the tick drains it. No `asyncio.sleep`.
- **Cloudflare Pages compatibility for the frontend**: SPA `_redirects`, build settings documented.
- **`render.yaml`** blueprint for the API and `docs/deploy.md` covering Cloudflare Pages + Render free + Atlas M0 + cron-job.org.

## Capabilities

### New Capabilities
- `deployment`: the $0 hosting shape and its operational contract (tick cadence, sleep/cold-start behaviour).

### Modified Capabilities
- `checks`: the webhook contract (inline verdict).
- `alerts`: retry-before-alert semantics (next tick instead of a sleep).
- `heartbeat`: ticker source (internal loop or external tick endpoint).

## Impact

`backend/server.py` (webhook, retry scheduling, tick endpoint, ticker gate), tests (`test_webhook_wait` contract, new `test_serverless`), `frontend/public/_redirects`, `render.yaml`, `docs/deploy.md`, `docs/self-hosting.md`, `docs/n8n.md`; the n8n node needs no change (it already reads the verdict when present).
