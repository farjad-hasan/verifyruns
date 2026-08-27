## Context

Free hosts sleep (Render free after ~15 min idle) or freeze the moment a response is sent (Cloudflare/Vercel/Netlify functions). The API currently depends on a live process in three places: `_heartbeat_loop` (asyncio task), `BackgroundTasks` for webhook-triggered runs, and `_schedule_retry` (`asyncio.sleep(30)`). Everything else is request/response over MongoDB Atlas.

## Goals / Non-Goals

**Goals:** no correctness depends on the process surviving past the response; an external scheduler can drive all time-based behaviour; local development keeps working unchanged; the n8n node keeps working unchanged.

**Non-Goals:** porting the API to Cloudflare Workers (Python Workers are beta and Motor/asyncpg don't run there); durable queues; exact 30-second retry timing.

## Decisions

- **Inline webhook.** The destination read is a few seconds and every integrator that cares waits anyway (the node defaults to waiting). Rate limiting already bounds abuse. `?wait` stays accepted so existing URLs and the node's `?wait=30` keep working; the response shape is the wait-shape for everyone.
- **One tick function, two drivers.** `_tick(now, database)` = heartbeat sweep + retry drain. Driver A: the in-process loop when `VR_INTERNAL_TICKER=1` (default; local and self-hosted). Driver B: `POST /api/internal/tick` with `X-Tick-Secret`, for hosts where the process sleeps. Both call the same function, so the tests cover the behaviour once.
- **Retry as data.** `pending_retry = {due_at, claimed_new}` on the Check. The tick runs `execute_check(..., is_retry=True, claimed_new)` for every Check whose `due_at` has passed, then unsets the field. `VR_RETRY_DELAY_SECONDS` becomes the `due_at` offset; actual latency is delay + tick interval — documented ("about a minute locally, a few minutes on the free host").
- **Tick secret, not auth.** The endpoint compares a constant-time header value; without `VR_TICK_SECRET` set the endpoint is disabled (404) so a misconfigured host cannot be ticked by strangers. Idempotent: calling it twice in a minute is harmless (the heartbeat window rule and the `$unset` make both sweeps no-ops).
- **Frontend on Cloudflare Pages**: `public/_redirects` with `/* /index.html 200` for client-side routes; `REACT_APP_BACKEND_URL` is a Pages build variable. Nothing else changes — CRA output is static.
- **API on Render free** via `render.yaml` (Python web service, health check `/api/`, secrets marked `sync: false`). The cron ping every 5 min doubles as keep-awake.

## Risks / Trade-offs

- [Webhook latency now includes the read] → typical 1–5 s; bounded by connector timeouts (20 s HTTP, 60 s Airtable budget, 15+15 s Postgres). Render's request limit is well above.
- [Cold start after sleep ~30–50 s] → the first webhook after idle is slow; cron ping mitigates; documented.
- [Heartbeat granularity = tick interval] → "missed by up to 5 minutes"; fine for hour-scale windows.
- [Two drivers both running] → harmless (idempotent), but the guide says to set `VR_INTERNAL_TICKER=0` on the free host to avoid a pointless loop in a sleeping process.
